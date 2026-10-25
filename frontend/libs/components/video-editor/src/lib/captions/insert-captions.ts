import type { EditorCore } from "../core";
import type { ParamValues } from "../params";
import { buildTextElement } from "../timeline/element-utils";
import { mediaTimeFromSeconds } from "../wasm";
import type { Caption } from "./caption-builder";

// Places captions on a dedicated text track as ordinary text elements, so
// they can be edited, restyled and moved like any other text. One call is a
// single undo step.

export type CaptionStyleId = "classic" | "boxed" | "highlight" | "minimal";

interface CaptionStyle {
  label: string;
  params: ParamValues;
}

export const CAPTION_STYLES: Record<CaptionStyleId, CaptionStyle> = {
  classic: {
    label: "Classic",
    params: { fontSize: 11, color: "#ffffff", fontWeight: "bold", fontFamily: "Arial" },
  },
  boxed: {
    label: "Boxed",
    params: {
      fontSize: 10,
      color: "#ffffff",
      fontWeight: "bold",
      fontFamily: "Arial",
      "background.enabled": true,
      "background.color": "#000000",
    },
  },
  highlight: {
    label: "Highlight",
    params: { fontSize: 12, color: "#ffe14d", fontWeight: "bold", fontFamily: "Arial" },
  },
  minimal: {
    label: "Minimal",
    params: { fontSize: 9, color: "#ffffff", fontWeight: "normal", fontFamily: "Arial" },
  },
};

export type CaptionPosition = "bottom" | "middle" | "top";

/** Vertical offset from canvas center, as a fraction of canvas height. */
const POSITION_OFFSETS: Record<CaptionPosition, number> = {
  bottom: 0.36,
  middle: 0,
  top: -0.36,
};

/**
 * Inserts `captions` and returns the caption track id. When `replaceTrackId`
 * points at an existing track, its elements are removed first and the track
 * is reused (regenerating captions doesn't stack tracks).
 */
export function insertCaptions({
  editor,
  captions,
  style,
  position,
  replaceTrackId,
}: {
  editor: EditorCore;
  captions: Caption[];
  style: CaptionStyleId;
  position: CaptionPosition;
  replaceTrackId?: string | null;
}): string {
  const historyStart = editor.command.getHistoryLength();
  try {
    const trackId = prepareTrack({ editor, replaceTrackId });
    const canvasHeight = editor.project.getActive()?.settings.canvasSize.height ?? 1080;
    const positionY = Math.round(canvasHeight * POSITION_OFFSETS[position]);

    for (const caption of captions) {
      const element = buildTextElement({
        raw: {
          name: caption.text.slice(0, 40),
          duration: mediaTimeFromSeconds({
            seconds: caption.endSeconds - caption.startSeconds,
          }),
          params: {
            ...CAPTION_STYLES[style].params,
            content: caption.text,
            textAlign: "center",
            "transform.positionX": 0,
            "transform.positionY": positionY,
          },
        },
        startTime: mediaTimeFromSeconds({ seconds: caption.startSeconds }),
      });
      editor.timeline.insertElement({
        element,
        placement: { mode: "explicit", trackId },
      });
    }
    return trackId;
  } finally {
    editor.command.collapseHistorySince({ startLength: historyStart });
  }
}

/** True when `trackId` still exists in the active scene. */
export function captionTrackExists({
  editor,
  trackId,
}: {
  editor: EditorCore;
  trackId: string | null | undefined;
}): boolean {
  return !!trackId && !!editor.timeline.getTrackById({ trackId });
}

function prepareTrack({
  editor,
  replaceTrackId,
}: {
  editor: EditorCore;
  replaceTrackId?: string | null;
}): string {
  const existing = replaceTrackId ? editor.timeline.getTrackById({ trackId: replaceTrackId }) : null;
  if (existing && existing.type === "text") {
    if (existing.elements.length > 0) {
      editor.timeline.deleteElements({
        elements: existing.elements.map((element) => ({
          trackId: existing.id,
          elementId: element.id,
        })),
      });
    }
    return existing.id;
  }
  return editor.timeline.addTrack({ type: "text", index: 0 });
}
