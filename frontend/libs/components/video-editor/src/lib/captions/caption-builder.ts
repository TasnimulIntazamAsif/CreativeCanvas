import type { TranscriptionSegment } from "../adapters/transcription";

// Turns transcript segments (often a full sentence or more) into short,
// readable captions: at most `maxWords` words each, with time split across
// the pieces in proportion to their length, then snapped to whole frames so
// consecutive captions never overlap on the timeline.

const MIN_CAPTION_FRAMES = 3;

export interface Caption {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export function buildCaptions({
  segments,
  maxWords,
  fps,
}: {
  segments: TranscriptionSegment[];
  maxWords: number;
  fps: number;
}): Caption[] {
  const pieces = segments
    .filter((segment) => segment.text.trim().length > 0 && segment.end > segment.start)
    .sort((a, b) => a.start - b.start)
    .flatMap((segment) => splitSegment({ segment, maxWords }));
  return snapToFrames({ pieces, fps });
}

function splitSegment({
  segment,
  maxWords,
}: {
  segment: TranscriptionSegment;
  maxWords: number;
}): TranscriptionSegment[] {
  const words = segment.text.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return [{ ...segment, text: words.join(" ") }];
  }

  const groups: string[] = [];
  const groupCount = Math.ceil(words.length / maxWords);
  // Even group sizes read better than a long run plus a one-word tail.
  const size = Math.ceil(words.length / groupCount);
  for (let i = 0; i < words.length; i += size) {
    groups.push(words.slice(i, i + size).join(" "));
  }

  const totalChars = groups.reduce((sum, text) => sum + text.length, 0);
  const duration = segment.end - segment.start;
  let cursor = segment.start;
  return groups.map((text, index) => {
    const isLast = index === groups.length - 1;
    const end = isLast ? segment.end : cursor + (duration * text.length) / totalChars;
    const piece = { start: cursor, end, text };
    cursor = end;
    return piece;
  });
}

function snapToFrames({
  pieces,
  fps,
}: {
  pieces: TranscriptionSegment[];
  fps: number;
}): Caption[] {
  const captions: Caption[] = [];
  let previousEndFrame = 0;

  pieces.forEach((piece, index) => {
    const startFrame = Math.max(previousEndFrame, Math.round(piece.start * fps));
    const nextStartFrame =
      index + 1 < pieces.length ? Math.round(pieces[index + 1].start * fps) : Infinity;
    let endFrame = Math.min(Math.round(piece.end * fps), nextStartFrame);
    if (endFrame - startFrame < MIN_CAPTION_FRAMES) {
      endFrame = Math.min(startFrame + MIN_CAPTION_FRAMES, Math.max(nextStartFrame, startFrame + 1));
    }
    if (endFrame <= startFrame) return;

    captions.push({
      id: `caption-${index}-${startFrame}`,
      startSeconds: startFrame / fps,
      endSeconds: endFrame / fps,
      text: piece.text,
    });
    previousEndFrame = endFrame;
  });

  return captions;
}
