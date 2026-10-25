import type { TranscriptionAdapter, TranscriptionSegment } from "../adapters/transcription";
import type { EditorCore } from "../core";
import { buildCaptions, type Caption } from "./caption-builder";
import { buildTimelineAudioChunks } from "./timeline-audio";

// Generate-captions pipeline: render the timeline audio, transcribe it chunk
// by chunk through the host's TranscriptionAdapter, then build short,
// frame-aligned captions in timeline time.

const DEFAULT_FPS = 30;

export type CaptionGenerationStage =
  | { stage: "extracting" }
  | { stage: "transcribing"; chunk: number; chunkCount: number };

export class NoAudioError extends Error {
  constructor() {
    super("The timeline has no audio to transcribe. Add a video with sound or an audio clip.");
    this.name = "NoAudioError";
  }
}

export async function generateCaptions({
  editor,
  transcription,
  language,
  maxWords,
  onStage,
  signal,
}: {
  editor: EditorCore;
  transcription: TranscriptionAdapter;
  language?: string;
  maxWords: number;
  onStage?: (stage: CaptionGenerationStage) => void;
  signal?: AbortSignal;
}): Promise<{ captions: Caption[]; language?: string }> {
  onStage?.({ stage: "extracting" });
  const chunks = await buildTimelineAudioChunks({ editor });
  if (!chunks || chunks.length === 0) throw new NoAudioError();

  const segments: TranscriptionSegment[] = [];
  let detectedLanguage: string | undefined;
  for (const [index, chunk] of chunks.entries()) {
    throwIfAborted(signal);
    onStage?.({ stage: "transcribing", chunk: index + 1, chunkCount: chunks.length });
    const result = await transcription.transcribe({ audio: chunk.audio, language });
    detectedLanguage ??= result.language;
    for (const segment of result.segments) {
      segments.push({
        start: segment.start + chunk.offsetSeconds,
        end: Math.min(segment.end, chunk.durationSeconds) + chunk.offsetSeconds,
        text: segment.text,
      });
    }
  }
  throwIfAborted(signal);

  const fpsSetting = editor.project.getActive()?.settings.fps;
  const fps = fpsSetting ? fpsSetting.numerator / fpsSetting.denominator : DEFAULT_FPS;
  return { captions: buildCaptions({ segments, maxWords, fps }), language: detectedLanguage };
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException("Caption generation was cancelled.", "AbortError");
  }
}
