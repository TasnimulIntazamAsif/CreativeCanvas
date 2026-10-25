use std::time::Duration;

use log::{error, info, warn};
use reqwest::Client;
use serde_derive::{Deserialize, Serialize};
use tauri::State;

use crate::core::commands::llm::llm_provider::LlmProvider;
use crate::core::commands::response::shorthand::ResponseOrErrorMessage;
use crate::core::commands::response::success_response_wrapper::SerializeMarker;
use crate::core::providers::credentials::payload::provider_credential_payload::ProviderCredentialPayload;
use crate::core::providers::credentials::provider_credential_loading_cache::ProviderCredentialLoadingCache;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);

/// Max characters of a provider error body echoed back to the frontend.
const MAX_ERROR_BODY_CHARS: usize = 500;

#[derive(Deserialize)]
pub struct LlmChatCompletionRequest {
  pub provider: LlmProvider,
  /// An OpenAI-compatible chat completions request body (model, messages,
  /// tools, ...). Passed through unchanged; the API key is added here so it
  /// never reaches the webview.
  pub body: serde_json::Value,
}

#[derive(Serialize)]
pub struct LlmChatCompletionResponse {
  pub body: serde_json::Value,
}

impl SerializeMarker for LlmChatCompletionResponse {}

#[tauri::command]
pub async fn llm_chat_completion_command(
  request: LlmChatCompletionRequest,
  credential_cache: State<'_, ProviderCredentialLoadingCache>,
) -> ResponseOrErrorMessage<LlmChatCompletionResponse> {
  info!("llm_chat_completion_command called for provider: {:?}", request.provider);

  let maybe_payload = credential_cache
    .get_credentials(request.provider.credential_key())
    .map_err(|err| {
      error!("Failed to load LLM API key: {:?}", err);
      "Failed to load the API key"
    })?;

  let api_key = match maybe_payload {
    Some(ProviderCredentialPayload::ApiKey(data)) if !data.as_str().is_empty() => data,
    _ => return Err("No API key is set for this provider. Add it in AI settings.".into()),
  };

  let client = Client::builder()
    .timeout(REQUEST_TIMEOUT)
    .build()
    .map_err(|err| {
      error!("Failed to build HTTP client: {:?}", err);
      "Failed to build HTTP client"
    })?;

  let response = client
    .post(request.provider.chat_completions_url())
    .bearer_auth(api_key.as_str())
    .json(&request.body)
    .send()
    .await
    .map_err(|err| {
      warn!("LLM request failed: {:?}", err);
      format!("Could not reach the provider: {}", err)
    })?;

  let status = response.status();
  let text = response.text().await.map_err(|err| {
    warn!("Failed to read LLM response: {:?}", err);
    "Failed to read the provider response"
  })?;

  if !status.is_success() {
    warn!("LLM provider returned {}: {}", status, text);
    let snippet: String = text.chars().take(MAX_ERROR_BODY_CHARS).collect();
    return Err(format!("Provider returned {}: {}", status, snippet).into());
  }

  let body: serde_json::Value = serde_json::from_str(&text).map_err(|err| {
    warn!("LLM response was not JSON: {:?}", err);
    "The provider response was not valid JSON"
  })?;

  Ok(LlmChatCompletionResponse { body }.into())
}
