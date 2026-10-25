use serde_derive::{Deserialize, Serialize};

use crate::core::providers::credentials::provider_credential_key::ProviderCredentialKey;

/// LLM providers that speak the OpenAI-compatible `/chat/completions` API
/// (including tool calling), so one request shape serves all of them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LlmProvider {
  Openai,
  Gemini,
  Deepseek,
}

impl LlmProvider {
  pub fn credential_key(&self) -> ProviderCredentialKey {
    match self {
      Self::Openai => ProviderCredentialKey::OpenaiApiKey,
      Self::Gemini => ProviderCredentialKey::GeminiApiKey,
      Self::Deepseek => ProviderCredentialKey::DeepseekApiKey,
    }
  }

  pub fn chat_completions_url(&self) -> &'static str {
    match self {
      Self::Openai => "https://api.openai.com/v1/chat/completions",
      // Gemini's OpenAI-compatibility endpoint.
      Self::Gemini => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      Self::Deepseek => "https://api.deepseek.com/chat/completions",
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn deserializes_snake_case_names() {
    let provider: LlmProvider = serde_json::from_str("\"deepseek\"").unwrap();
    assert_eq!(provider, LlmProvider::Deepseek);
    let provider: LlmProvider = serde_json::from_str("\"openai\"").unwrap();
    assert_eq!(provider, LlmProvider::Openai);
  }

  #[test]
  fn maps_each_provider_to_its_own_credential() {
    assert_eq!(LlmProvider::Openai.credential_key(), ProviderCredentialKey::OpenaiApiKey);
    assert_eq!(LlmProvider::Gemini.credential_key(), ProviderCredentialKey::GeminiApiKey);
    assert_eq!(LlmProvider::Deepseek.credential_key(), ProviderCredentialKey::DeepseekApiKey);
  }
}
