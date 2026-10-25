import type { EditorCore } from "../core";
import { createAudioContext, createTimelineAudioBuffer } from "../media/audio";

// Renders the active scene's audio mix (every audible clip, already placed in
// timeline time) to 16 kHz mono WAV chunks small enough for speech-to-text
// upload limits. Each chunk carries its offset so transcript timestamps map
// straight back onto the timeline.

const TRANSCRIPTION_SAMPLE_RATE = 16_000;

/** 10 min of 16-bit 16 kHz mono WAV is ~19 MB, under Whisper's 25 MB cap. */
const MAX_CHUNK_SECONDS = 600;

export interface TimelineAudioChunk {
  audio: Blob;
  offsetSeconds: number;
  durationSeconds: number;
}

/** Returns null when the timeline has no audible clips. */
export async function buildTimelineAudioChunks({
  editor,
}: {
  editor: EditorCore;
}): Promise<TimelineAudioChunk[] | null> {
  const scene = editor.scenes.getActiveSceneOrNull();
  const duration = editor.timeline.getTotalDuration();
  if (!scene || duration <= 0) return null;

  const audioContext = createAudioContext({ sampleRate: TRANSCRIPTION_SAMPLE_RATE });
  try {
    const buffer = await createTimelineAudioBuffer({
      tracks: scene.tracks,
      mediaAssets: editor.media.getAssets(),
      duration,
      sampleRate: TRANSCRIPTION_SAMPLE_RATE,
      audioContext,
    });
    if (!buffer) return null;

    const mono = mixToMono(buffer);
    if (isSilent(mono)) return null;

    const samplesPerChunk = MAX_CHUNK_SECONDS * buffer.sampleRate;
    const chunks: TimelineAudioChunk[] = [];
    for (let start = 0; start < mono.length; start += samplesPerChunk) {
      const slice = mono.subarray(start, Math.min(start + samplesPerChunk, mono.length));
      chunks.push({
        audio: encodeWav({ samples: slice, sampleRate: buffer.sampleRate }),
        offsetSeconds: start / buffer.sampleRate,
        durationSeconds: slice.length / buffer.sampleRate,
      });
    }
    return chunks;
  } finally {
    void audioContext.close().catch(() => {});
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  const channels = buffer.numberOfChannels;
  for (let channel = 0; channel < channels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      mono[i] += data[i] / channels;
    }
  }
  return mono;
}

function isSilent(samples: Float32Array): boolean {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > 1e-4) return false;
  }
  return true;
}

// 16-bit PCM WAV (RIFF) encoder.
export function encodeWav({
  samples,
  sampleRate,
}: {
  samples: Float32Array;
  sampleRate: number;
}): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const view = new DataView(new ArrayBuffer(44 + dataSize));

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
