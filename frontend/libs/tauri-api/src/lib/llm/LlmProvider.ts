import { invoke } from "@tauri-apps/api/core";

// LLM providers backed by the Rust `llm_chat_completion_command`. All of them
// speak the OpenAI-compatible chat completions API (with tool calling).
export enum LlmProvider {
  OpenAI = "openai",
  Gemini = "gemini",
  DeepSeek = "deepseek",
}

// Credential keys in the Rust provider store (`ProviderCredentialKey`).
const CREDENTIAL_KEYS: Record<LlmProvider, string> = {
  [LlmProvider.OpenAI]: "openai_api_key",
  [LlmProvider.Gemini]: "gemini_api_key",
  [LlmProvider.DeepSeek]: "deepseek_api_key",
};

interface ProviderListEntry {
  provider_credential: string;
  has_credentials: boolean;
  maybe_details?: { maybe_key_start?: string | null } | null;
}

export interface LlmKeyStatus {
  hasKey: boolean;
  /** Redacted start of the key, e.g. "sk-abc***", for display only. */
  maybeKeyStart?: string;
}

export const SetLlmApiKey = async (
  provider: LlmProvider,
  apiKey: string,
): Promise<void> => {
  await invoke("provider_set_api_key_command", {
    request: { provider_credential: CREDENTIAL_KEYS[provider], api_key: apiKey },
  });
};

export const ClearLlmApiKey = async (provider: LlmProvider): Promise<void> => {
  await invoke("provider_clear_command", {
    request: { provider_credential: CREDENTIAL_KEYS[provider] },
  });
};

export const GetLlmKeyStatus = async (
  provider: LlmProvider,
): Promise<LlmKeyStatus> => {
  const result = (await invoke("provider_list_command")) as {
    payload?: { providers: ProviderListEntry[] };
  };
  const entry = result.payload?.providers.find(
    (p) => p.provider_credential === CREDENTIAL_KEYS[provider],
  );
  return {
    hasKey: !!entry?.has_credentials,
    maybeKeyStart: entry?.maybe_details?.maybe_key_start ?? undefined,
  };
};
