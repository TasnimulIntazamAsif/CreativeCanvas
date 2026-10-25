import type { EditorCore } from "../core";
import { effectsRegistry } from "../effects";
import type { ParamValues } from "../params";
import {
  buildElementFromMedia,
  buildTextElement,
} from "../timeline/element-utils";
import type { TimelineElement, TimelineTrack } from "../timeline/types";
import { mediaTimeFromSeconds, mediaTimeToSeconds, ZERO_MEDIA_TIME } from "../wasm";
import { buildTimelineSnapshot } from "./timeline-snapshot";

// Tools the LLM can call to edit the video editor timeline. Definitions use
// the OpenAI-compatible function-calling format (shared by OpenAI, Gemini and
// DeepSeek). Every mutating tool goes through TimelineManager, so each edit is
// a regular undoable command.

const DEFAULT_IMAGE_DURATION_SECONDS = 5;

export interface AiToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = [
  tool({
    name: "get_timeline",
    description:
      "Return the current timeline: canvas size, media assets, tracks and elements with their ids, times and params. Call this after edits if you need fresh ids.",
    properties: {},
  }),
  tool({
    name: "add_text",
    description:
      "Add a text element (title, caption, label) to a text track. Position is in canvas pixels from the canvas center; positive Y is downward.",
    properties: {
      content: { type: "string", description: "The text to show." },
      start_seconds: { type: "number" },
      duration_seconds: { type: "number" },
      font_size: { type: "number", description: "Font size, scaled to canvas height. 15 (default) is a large title; captions/subtitles look right around 9-12; max 300." },
      color: { type: "string", description: "CSS hex color, e.g. #ffffff." },
      font_weight: { type: "string", enum: ["normal", "bold"] },
      font_family: { type: "string", description: "e.g. Arial, Inter, Georgia." },
      text_align: { type: "string", enum: ["left", "center", "right"] },
      position_x: { type: "number" },
      position_y: { type: "number" },
      background_color: {
        type: "string",
        description: "Optional CSS hex color for a box behind the text.",
      },
    },
    required: ["content", "start_seconds", "duration_seconds"],
  }),
  tool({
    name: "add_media",
    description:
      "Place an imported media asset (video, image or audio) on the timeline. Use media_id from get_timeline.media_assets.",
    properties: {
      media_id: { type: "string" },
      start_seconds: { type: "number" },
      duration_seconds: {
        type: "number",
        description: "Optional. Images default to 5s; videos and audio default to their full length.",
      },
    },
    required: ["media_id", "start_seconds"],
  }),
  tool({
    name: "update_element",
    description:
      "Change an element's timing and/or params. Param keys include: content, fontSize, fontFamily, color, fontWeight, textAlign, background.enabled, background.color, transform.positionX, transform.positionY, transform.scaleX, transform.scaleY, transform.rotate, opacity (0-1), volume (dB), muted.",
    properties: {
      element_id: { type: "string" },
      start_seconds: { type: "number" },
      duration_seconds: { type: "number" },
      params: {
        type: "object",
        description: "Map of param key to new value, e.g. {\"color\": \"#ff0000\", \"opacity\": 0.5}.",
        additionalProperties: true,
      },
    },
    required: ["element_id"],
  }),
  tool({
    name: "split_element",
    description: "Split an element at a time on the timeline. keep=left/right removes the other side.",
    properties: {
      element_id: { type: "string" },
      at_seconds: { type: "number" },
      keep: { type: "string", enum: ["both", "left", "right"] },
    },
    required: ["element_id", "at_seconds"],
  }),
  tool({
    name: "delete_elements",
    description: "Delete elements from the timeline.",
    properties: {
      element_ids: { type: "array", items: { type: "string" } },
    },
    required: ["element_ids"],
  }),
  tool({
    name: "duplicate_elements",
    description: "Duplicate elements (the copies are placed right after the originals).",
    properties: {
      element_ids: { type: "array", items: { type: "string" } },
    },
    required: ["element_ids"],
  }),
  tool({
    name: "add_effect",
    description: "Add a visual effect to a video, image, text or graphic element.",
    properties: {
      element_id: { type: "string" },
      effect_type: {
        type: "string",
        description: "Effect type id. Call get_timeline first if unsure; available types are listed in the system prompt.",
      },
    },
    required: ["element_id", "effect_type"],
  }),
  tool({
    name: "set_track_state",
    description: "Mute/unmute or hide/show a whole track.",
    properties: {
      track_id: { type: "string" },
      muted: { type: "boolean" },
      hidden: { type: "boolean" },
    },
    required: ["track_id"],
  }),
  tool({
    name: "seek",
    description: "Move the playhead to a time so the user sees that moment in the preview.",
    properties: {
      seconds: { type: "number" },
    },
    required: ["seconds"],
  }),
];

export function getAvailableEffectTypes(): string[] {
  return effectsRegistry.getAll().map((definition) => definition.type);
}

/**
 * Runs one tool call and returns a short text result for the model. Throws
 * with a readable message when the call is invalid, so the caller can report
 * it back as a tool error.
 */
export function executeAiTool({
  editor,
  name,
  args,
}: {
  editor: EditorCore;
  name: string;
  args: Record<string, unknown>;
}): string {
  switch (name) {
    case "get_timeline":
      return JSON.stringify(buildTimelineSnapshot({ editor }));
    case "add_text":
      return addText({ editor, args });
    case "add_media":
      return addMedia({ editor, args });
    case "update_element":
      return updateElement({ editor, args });
    case "split_element":
      return splitElement({ editor, args });
    case "delete_elements": {
      const refs = requireElementRefs({ editor, ids: args.element_ids });
      editor.timeline.deleteElements({ elements: refs });
      return `Deleted ${refs.length} element(s).`;
    }
    case "duplicate_elements": {
      const refs = requireElementRefs({ editor, ids: args.element_ids });
      const copies = editor.timeline.duplicateElements({ elements: refs });
      return `Duplicated. New element ids: ${copies.map((c) => c.elementId).join(", ")}`;
    }
    case "add_effect":
      return addEffect({ editor, args });
    case "set_track_state":
      return setTrackState({ editor, args });
    case "seek": {
      const seconds = requireNumber(args.seconds, "seconds");
      editor.playback.seek({ time: mediaTimeFromSeconds({ seconds: Math.max(0, seconds) }) });
      return `Playhead moved to ${seconds}s.`;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function addText({
  editor,
  args,
}: {
  editor: EditorCore;
  args: Record<string, unknown>;
}): string {
  const content = requireString(args.content, "content");
  const params: ParamValues = { content };
  setIfPresent(params, "fontSize", optionalNumber(args.font_size));
  setIfPresent(params, "color", optionalString(args.color));
  setIfPresent(params, "fontWeight", optionalString(args.font_weight));
  setIfPresent(params, "fontFamily", optionalString(args.font_family));
  setIfPresent(params, "textAlign", optionalString(args.text_align));
  setIfPresent(params, "transform.positionX", optionalNumber(args.position_x));
  setIfPresent(params, "transform.positionY", optionalNumber(args.position_y));
  const backgroundColor = optionalString(args.background_color);
  if (backgroundColor) {
    params["background.enabled"] = true;
    params["background.color"] = backgroundColor;
  }

  const element = buildTextElement({
    raw: {
      name: content.slice(0, 40),
      duration: secondsToTime(requireNumber(args.duration_seconds, "duration_seconds")),
      params,
    },
    startTime: secondsToTime(requireNumber(args.start_seconds, "start_seconds")),
  });

  const newId = insertAndFindNewId({
    editor,
    insert: () =>
      editor.timeline.insertElement({
        element,
        placement: { mode: "auto", trackType: "text" },
      }),
  });
  return `Added text element ${newId}.`;
}

function addMedia({
  editor,
  args,
}: {
  editor: EditorCore;
  args: Record<string, unknown>;
}): string {
  const mediaId = requireString(args.media_id, "media_id");
  const asset = editor.media.getAssets().find((a) => a.id === mediaId);
  if (!asset) {
    throw new Error(`No media asset with id ${mediaId}. Use media_id from get_timeline.`);
  }

  const requestedSeconds = optionalNumber(args.duration_seconds);
  const sourceSeconds = asset.duration ?? DEFAULT_IMAGE_DURATION_SECONDS;
  const insertSeconds =
    asset.type === "image" ? (requestedSeconds ?? DEFAULT_IMAGE_DURATION_SECONDS) : sourceSeconds;

  const element = buildElementFromMedia({
    mediaId: asset.id,
    mediaType: asset.type,
    name: asset.name,
    duration: secondsToTime(insertSeconds),
    startTime: secondsToTime(requireNumber(args.start_seconds, "start_seconds")),
  });

  const newId = insertAndFindNewId({
    editor,
    insert: () =>
      editor.timeline.insertElement({
        element,
        placement: {
          mode: "auto",
          trackType: asset.type === "audio" ? "audio" : "video",
        },
      }),
  });

  // Videos/audio are inserted at full length; trim the tail for a shorter clip.
  if (
    asset.type !== "image" &&
    requestedSeconds != null &&
    requestedSeconds > 0 &&
    requestedSeconds < sourceSeconds
  ) {
    editor.timeline.updateElementTrim({
      elementId: newId,
      trimStart: ZERO_MEDIA_TIME,
      trimEnd: secondsToTime(sourceSeconds - requestedSeconds),
      duration: secondsToTime(requestedSeconds),
    });
  }
  return `Added ${asset.type} element ${newId}.`;
}

function updateElement({
  editor,
  args,
}: {
  editor: EditorCore;
  args: Record<string, unknown>;
}): string {
  const elementId = requireString(args.element_id, "element_id");
  const { track, element } = requireElement({ editor, elementId });

  const patch: Partial<TimelineElement> = {};
  const startSeconds = optionalNumber(args.start_seconds);
  const durationSeconds = optionalNumber(args.duration_seconds);
  if (startSeconds != null) patch.startTime = secondsToTime(Math.max(0, startSeconds));
  if (durationSeconds != null) patch.duration = secondsToTime(durationSeconds);
  if (args.params && typeof args.params === "object") {
    patch.params = args.params as ParamValues;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("Nothing to update: pass start_seconds, duration_seconds or params.");
  }

  editor.timeline.updateElements({
    updates: [{ trackId: track.id, elementId: element.id, patch }],
  });
  return `Updated element ${element.id}.`;
}

function splitElement({
  editor,
  args,
}: {
  editor: EditorCore;
  args: Record<string, unknown>;
}): string {
  const elementId = requireString(args.element_id, "element_id");
  const { track, element } = requireElement({ editor, elementId });
  const atSeconds = requireNumber(args.at_seconds, "at_seconds");
  const start = mediaTimeToSeconds({ time: element.startTime });
  const end = start + mediaTimeToSeconds({ time: element.duration });
  if (atSeconds <= start || atSeconds >= end) {
    throw new Error(`at_seconds must be inside the element (${start}s - ${end}s).`);
  }

  const keep = optionalString(args.keep);
  const retainSide = keep === "left" || keep === "right" ? keep : "both";
  const rightSide = editor.timeline.splitElements({
    elements: [{ trackId: track.id, elementId: element.id }],
    splitTime: secondsToTime(atSeconds),
    retainSide,
  });
  const rightIds = rightSide.map((r) => r.elementId).join(", ");
  return rightIds ? `Split done. Right-side element id(s): ${rightIds}.` : "Split done.";
}

function addEffect({
  editor,
  args,
}: {
  editor: EditorCore;
  args: Record<string, unknown>;
}): string {
  const elementId = requireString(args.element_id, "element_id");
  const effectType = requireString(args.effect_type, "effect_type");
  if (!effectsRegistry.has(effectType)) {
    throw new Error(
      `Unknown effect_type "${effectType}". Available: ${getAvailableEffectTypes().join(", ")}.`,
    );
  }
  const { track, element } = requireElement({ editor, elementId });
  const effectId = editor.timeline.addClipEffect({
    trackId: track.id,
    elementId: element.id,
    effectType,
  });
  if (!effectId) {
    throw new Error(`Effects cannot be added to ${element.type} elements.`);
  }
  return `Added ${effectType} effect ${effectId}.`;
}

function setTrackState({
  editor,
  args,
}: {
  editor: EditorCore;
  args: Record<string, unknown>;
}): string {
  const trackId = requireString(args.track_id, "track_id");
  const track = editor.timeline.getTrackById({ trackId });
  if (!track) throw new Error(`No track with id ${trackId}.`);

  const muted = args.muted;
  const hidden = args.hidden;
  if (typeof muted === "boolean" && "muted" in track && track.muted !== muted) {
    editor.timeline.toggleTrackMute({ trackId });
  }
  if (typeof hidden === "boolean" && "hidden" in track && track.hidden !== hidden) {
    editor.timeline.toggleTrackVisibility({ trackId });
  }
  return `Track ${trackId} updated.`;
}

// Runs an insert and returns the id of the element it created by diffing the
// element ids before and after (InsertElementCommand doesn't expose it).
function insertAndFindNewId({
  editor,
  insert,
}: {
  editor: EditorCore;
  insert: () => void;
}): string {
  const before = new Set(listElements({ editor }).map(({ element }) => element.id));
  insert();
  const created = listElements({ editor }).find(({ element }) => !before.has(element.id));
  if (!created) {
    throw new Error("The element could not be placed on the timeline.");
  }
  return created.element.id;
}

function requireElementRefs({
  editor,
  ids,
}: {
  editor: EditorCore;
  ids: unknown;
}): { trackId: string; elementId: string }[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("element_ids must be a non-empty array.");
  }
  return ids.map((id) => {
    const { track, element } = requireElement({ editor, elementId: String(id) });
    return { trackId: track.id, elementId: element.id };
  });
}

function requireElement({
  editor,
  elementId,
}: {
  editor: EditorCore;
  elementId: string;
}): { track: TimelineTrack; element: TimelineElement } {
  const found = listElements({ editor }).find(({ element }) => element.id === elementId);
  if (!found) {
    throw new Error(`No element with id ${elementId}. Call get_timeline for current ids.`);
  }
  return found;
}

function listElements({
  editor,
}: {
  editor: EditorCore;
}): { track: TimelineTrack; element: TimelineElement }[] {
  const scene = editor.scenes.getActiveSceneOrNull();
  if (!scene) return [];
  const tracks: TimelineTrack[] = [
    scene.tracks.main,
    ...scene.tracks.overlay,
    ...scene.tracks.audio,
  ];
  return tracks.flatMap((track) =>
    (track.elements as TimelineElement[]).map((element) => ({ track, element })),
  );
}

function tool({
  name,
  description,
  properties,
  required = [],
}: {
  name: string;
  description: string;
  properties: Record<string, unknown>;
  required?: string[];
}): AiToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

function setIfPresent(params: ParamValues, key: string, value: string | number | undefined) {
  if (value !== undefined) params[key] = value;
}

function secondsToTime(seconds: number) {
  return mediaTimeFromSeconds({ seconds: Math.max(0, seconds) });
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) {
    throw new Error(`${field} must be a number.`);
  }
  return num;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) ? num : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
