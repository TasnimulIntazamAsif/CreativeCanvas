import { invoke } from "@tauri-apps/api/core";
import { LlmProvider } from "./LlmProvider";

/**
 * Sends an OpenAI-compatible chat completions request through Rust, which
 * attaches the stored API key for `provider`. Resolves to the provider's raw
 * JSON response; rejects with an Error carrying the provider/command message.
 */
export const LlmChatCompletion = async (
  provider: LlmProvider,
  body: unknown,
): Promise<unknown> => {
  try {
    const result = (await invoke("llm_chat_completion_command", {
      request: { provider, body },
    })) as { payload?: { body: unknown } };
    return result.payload?.body;
  } catch (error) {
    const message =
      (error as { error_message?: string })?.error_message ??
      (error instanceof Error ? error.message : String(error));
    throw new Error(message);
  }
};
