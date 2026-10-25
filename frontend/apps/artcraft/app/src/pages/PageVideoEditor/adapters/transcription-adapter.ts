import type {
  TranscriptionAdapter,
  TranscriptionSegment,
} from "@storyteller/ui-video-editor";
import { whisperTranscribe } from "../ai/llmClient";

// Captions panel speech-to-text, backed by OpenAI Whisper. Works in the
// desktop app (request made by Rust) and in a browser tab on the dev server.

interface WhisperVerboseResponse {
  language?: string;
  segments?: { start: number; end: number; text: string }[];
}

export const whisperTranscriptionAdapter: TranscriptionAdapter = {
  async transcribe({ audio, language }) {
    const body = (await whisperTranscribe({ audio, language })) as WhisperVerboseResponse;
    const segments: TranscriptionSegment[] = (body?.segments ?? []).map((segment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text.trim(),
    }));
    return { segments, language: body?.language };
  },
};
