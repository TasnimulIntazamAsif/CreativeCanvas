import type { EditorCore } from "../core";
import type { TimelineElement, TimelineTrack } from "../timeline/types";
import { mediaTimeToSeconds, type MediaTime } from "../wasm";

// Compact, JSON-friendly view of the editor state that the LLM reads before
// choosing tools. Times are seconds (rounded) and every track/element carries
// the id the tools expect, so the model can reference things precisely.

export interface TimelineSnapshot {
  canvas: { width: number; height: number };
  fps: number | null;
  duration_seconds: number;
  playhead_seconds: number;
  media_assets: SnapshotMediaAsset[];
  tracks: SnapshotTrack[];
}

interface SnapshotMediaAsset {
  media_id: string;
  name: string;
  type: string;
  duration_seconds?: number;
}

interface SnapshotTrack {
  track_id: string;
  role: "main" | "overlay" | "audio";
  type: TimelineTrack["type"];
  muted?: boolean;
  hidden?: boolean;
  elements: SnapshotElement[];
}

interface SnapshotElement {
  element_id: string;
  type: TimelineElement["type"];
  name: string;
  start_seconds: number;
  duration_seconds: number;
  media_id?: string;
  params: TimelineElement["params"];
}

export function buildTimelineSnapshot({
  editor,
}: {
  editor: EditorCore;
}): TimelineSnapshot {
  const project = editor.project.getActive();
  const scene = editor.scenes.getActiveSceneOrNull();
  const fps = project?.settings.fps;

  const tracks: SnapshotTrack[] = [];
  if (scene) {
    tracks.push(toSnapshotTrack({ track: scene.tracks.main, role: "main" }));
    for (const track of scene.tracks.overlay) {
      tracks.push(toSnapshotTrack({ track, role: "overlay" }));
    }
    for (const track of scene.tracks.audio) {
      tracks.push(toSnapshotTrack({ track, role: "audio" }));
    }
  }

  return {
    canvas: project?.settings.canvasSize ?? { width: 1920, height: 1080 },
    fps: fps ? fps.numerator / fps.denominator : null,
    duration_seconds: toSeconds(editor.timeline.getTotalDuration()),
    playhead_seconds: toSeconds(editor.playback.getCurrentTime()),
    media_assets: editor.media.getAssets().map((asset) => ({
      media_id: asset.id,
      name: asset.name,
      type: asset.type,
      duration_seconds:
        asset.duration != null ? round(asset.duration) : undefined,
    })),
    tracks,
  };
}

function toSnapshotTrack({
  track,
  role,
}: {
  track: TimelineTrack;
  role: SnapshotTrack["role"];
}): SnapshotTrack {
  return {
    track_id: track.id,
    role,
    type: track.type,
    muted: "muted" in track ? track.muted : undefined,
    hidden: "hidden" in track ? track.hidden : undefined,
    elements: track.elements.map((element) => ({
      element_id: element.id,
      type: element.type,
      name: element.name,
      start_seconds: toSeconds(element.startTime),
      duration_seconds: toSeconds(element.duration),
      media_id: "mediaId" in element ? element.mediaId : undefined,
      params: element.params,
    })),
  };
}

function toSeconds(time: MediaTime): number {
  return round(mediaTimeToSeconds({ time }));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
