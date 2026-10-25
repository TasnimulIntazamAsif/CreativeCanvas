use std::time::Duration;

use base64::prelude::BASE64_STANDARD;
use base64::Engine;
use log::{error, info, warn};
use reqwest::multipart::{Form, Part};
use reqwest::Client;
use serde_derive::{Deserialize, Serialize};
use tauri::State;

use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::payload::provider_credential_payload::ProviderCredentialPayload;
use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;

const TRANSCRIPTIONS_URL: &str = "https://api.openai.com/v1/audio/transcriptions";

/// `whisper-1` is the OpenAI transcription model that returns segment timestamps.
const DEFAULT_MODEL: &str = "whisper-1";

const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);

/// Max characters of a provider error body echoed back to the frontend.
const MAX_ERROR_BODY_CHARS: usize = 500;

#[derive(Deserialize)]
pub struct LlmTranscribeAudioRequest {
  /// Base64-encoded audio file (the video editor sends 16 kHz mono WAV).
  pub audio_base64: String,
  pub filename: String,
  pub mime_type: String,
  /// ISO-639-1 code such as "en" or "bn"; omitted to auto-detect.
  pub maybe_language: Option<String>,
  pub maybe_model: Option<String>,
}

#[derive(Serialize)]
pub struct LlmTranscribeAudioResponse {
  /// OpenAI `verbose_json` transcription (text, language, segments[]).
  pub body: serde_json::Value,
}

impl SerializeMarker for LlmTranscribeAudioResponse {}

#[tauri::command]
pub async fn llm_transcribe_audio_command(
  request: LlmTranscribeAudioRequest,
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<LlmTranscribeAudioResponse> {
  info!("llm_transcribe_audio_command called ({} base64 chars)", request.audio_base64.len());

  let maybe_payload = credential_cache
    .get_credentials(ProviderCredentialKey::OpenaiApiKey)
    .map_err(|err| {
      error!("Failed to load OpenAI API key: {:?}", err);
      "Failed to load the OpenAI API key"
    })?;

  let api_key = match maybe_payload {
    Some(ProviderCredentialPayload::ApiKey(data)) if !data.as_str().is_empty() => data,
    _ => return Err("Captions use OpenAI Whisper. Add an OpenAI API key in AI settings.".into()),
  };

  let audio_bytes = BASE64_STANDARD.decode(request.audio_base64.as_bytes()).map_err(|err| {
    warn!("Invalid base64 audio: {:?}", err);
    "The audio data was not valid base64"
  })?;

  let file_part = Part::bytes(audio_bytes)
    .file_name(request.filename)
    .mime_str(&request.mime_type)
    .map_err(|_| "Invalid audio MIME type")?;

  let model = request.maybe_model.unwrap_or_else(|| DEFAULT_MODEL.to_string());
  let mut form = Form::new()
    .part("file", file_part)
    .text("model", model)
    .text("response_format", "verbose_json")
    .text("timestamp_granularities[]", "segment");
  if let Some(language) = request.maybe_language.filter(|lang| !lang.is_empty()) {
    form = form.text("language", language);
  }

  let client = Client::builder()
    .timeout(REQUEST_TIMEOUT)
    .build()
    .map_err(|err| {
      error!("Failed to build HTTP client: {:?}", err);
      "Failed to build HTTP client"
    })?;

  let response = client
    .post(TRANSCRIPTIONS_URL)
    .bearer_auth(api_key.as_str())
    .multipart(form)
    .send()
    .await
    .map_err(|err| {
      warn!("Transcription request failed: {:?}", err);
      format!("Could not reach OpenAI: {}", err)
    })?;

  let status = response.status();
  let text = response.text().await.map_err(|err| {
    warn!("Failed to read transcription response: {:?}", err);
    "Failed to read the transcription response"
  })?;

  if !status.is_success() {
    warn!("OpenAI transcription returned {}: {}", status, text);
    let snippet: String = text.chars().take(MAX_ERROR_BODY_CHARS).collect();
    return Err(format!("OpenAI returned {}: {}", status, snippet).into());
  }

  let body: serde_json::Value = serde_json::from_str(&text).map_err(|err| {
    warn!("Transcription response was not JSON: {:?}", err);
    "The transcription response was not valid JSON"
  })?;

  Ok(LlmTranscribeAudioResponse { body }.into())
}
