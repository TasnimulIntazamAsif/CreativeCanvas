import {
  ClearLlmApiKey,
  GetLlmKeyStatus,
  LlmChatCompletion,
  LlmProvider,
  LlmTranscribeAudio,
  SetLlmApiKey,
  type LlmKeyStatus,
} from "@storyteller/tauri-api";
import { isDesktopApp } from "./describeAiError";

// One entry point for API keys and chat requests that works in both hosts:
// - Desktop app: keys live in the Rust credential store and Rust makes the
//   request, so the key never reaches the webview.
// - Browser tab on the dev server: there is no Rust, so the key is kept in
//   this browser's localStorage and requests go through the Vite dev proxy
//   (`/__llm/<provider>`, see vite.config.ts) to avoid CORS.

const BROWSER_KEY_PREFIX = "cc-llm-api-key:";
const DEV_PROXY_PREFIX = "/__llm";
const REDACTED_KEY_VISIBLE_CHARS = 6;

export async function saveLlmApiKey(provider: LlmProvider, apiKey: string): Promise<void> {
  if (isDesktopApp()) return SetLlmApiKey(provider, apiKey);
  localStorage.setItem(BROWSER_KEY_PREFIX + provider, apiKey.trim());
}

export async function clearLlmApiKey(provider: LlmProvider): Promise<void> {
  if (isDesktopApp()) return ClearLlmApiKey(provider);
  localStorage.removeItem(BROWSER_KEY_PREFIX + provider);
}

export async function getLlmKeyStatus(provider: LlmProvider): Promise<LlmKeyStatus> {
  if (isDesktopApp()) return GetLlmKeyStatus(provider);
  const key = readBrowserKey(provider);
  return key
    ? { hasKey: true, maybeKeyStart: `${key.slice(0, REDACTED_KEY_VISIBLE_CHARS)}***` }
    : { hasKey: false };
}

export async function llmChatCompletion(
  provider: LlmProvider,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (isDesktopApp()) return LlmChatCompletion(provider, body);

  const key = readBrowserKey(provider);
  if (!key) throw new Error("No API key is set for this provider. Add it in AI settings.");

  let response: Response;
  try {
    response = await fetch(`${DEV_PROXY_PREFIX}/${provider}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Could not reach the provider: ${(error as Error).message}`);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Provider returned ${response.status}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The provider response was not valid JSON.");
  }
}

/**
 * Transcribes audio with OpenAI Whisper (`verbose_json`, segment timestamps)
 * using the OpenAI key from AI settings. Resolves to the raw response body.
 */
export async function whisperTranscribe({
  audio,
  language,
}: {
  audio: Blob;
  language?: string;
}): Promise<unknown> {
  const filename = "timeline-audio.wav";
  if (isDesktopApp()) {
    return LlmTranscribeAudio({
      audioBase64: await blobToBase64(audio),
      filename,
      mimeType: audio.type || "audio/wav",
      language,
    });
  }

  const key = readBrowserKey(LlmProvider.OpenAI);
  if (!key) {
    throw new Error("Captions use OpenAI Whisper. Add an OpenAI API key in AI settings.");
  }
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (language) form.append("language", language);

  let response: Response;
  try {
    response = await fetch(`${DEV_PROXY_PREFIX}/${LlmProvider.OpenAI}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch (error) {
    throw new Error(`Could not reach OpenAI: ${(error as Error).message}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI returned ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

/** True when keys are stored in this browser rather than by the desktop app. */
export function usesBrowserKeyStorage(): boolean {
  return !isDesktopApp();
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function readBrowserKey(provider: LlmProvider): string | null {
  try {
    return localStorage.getItem(BROWSER_KEY_PREFIX + provider) || null;
  } catch {
    return null;
  }
}
