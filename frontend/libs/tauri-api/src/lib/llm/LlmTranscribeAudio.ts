import { invoke } from "@tauri-apps/api/core";

/**
 * Transcribes audio with OpenAI Whisper through Rust, which attaches the
 * stored OpenAI API key. Resolves to OpenAI's `verbose_json` response
 * (text, language, segments with start/end seconds).
 */
export const LlmTranscribeAudio = async ({
  audioBase64,
  filename,
  mimeType,
  language,
  model,
}: {
  audioBase64: string;
  filename: string;
  mimeType: string;
  language?: string;
  model?: string;
}): Promise<unknown> => {
  try {
    const result = (await invoke("llm_transcribe_audio_command", {
      request: {
        audio_base64: audioBase64,
        filename,
        mime_type: mimeType,
        maybe_language: language || null,
        maybe_model: model || null,
      },
    })) as { payload?: { body: unknown } };
    return result.payload?.body;
  } catch (error) {
    const message =
      (error as { error_message?: string })?.error_message ??
      (error instanceof Error ? error.message : String(error));
    throw new Error(message);
  }
};
