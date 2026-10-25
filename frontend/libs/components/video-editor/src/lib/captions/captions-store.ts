import { create } from "zustand";
import type { Caption } from "./caption-builder";
import type { CaptionPosition, CaptionStyleId } from "./insert-captions";

// Captions panel state. Lives for the editor session so switching panel tabs
// keeps the generated captions and the track they were placed on.

interface CaptionsState {
  captions: Caption[];
  /** Text track holding the captions on the timeline, if placed. */
  trackId: string | null;
  /** True when captions/style changed since they were last placed. */
  dirty: boolean;
  language: string;
  maxWords: number;
  style: CaptionStyleId;
  position: CaptionPosition;
  setCaptions: (captions: Caption[], trackId: string | null) => void;
  updateCaptionText: (id: string, text: string) => void;
  removeCaption: (id: string) => void;
  markPlaced: (trackId: string) => void;
  setLanguage: (language: string) => void;
  setMaxWords: (maxWords: number) => void;
  setStyle: (style: CaptionStyleId) => void;
  setPosition: (position: CaptionPosition) => void;
  clear: () => void;
}

export const useCaptionsStore = create<CaptionsState>()((set) => ({
  captions: [],
  trackId: null,
  dirty: false,
  language: "",
  maxWords: 6,
  style: "boxed",
  position: "bottom",
  setCaptions: (captions, trackId) => set({ captions, trackId, dirty: false }),
  updateCaptionText: (id, text) =>
    set((state) => ({
      captions: state.captions.map((c) => (c.id === id ? { ...c, text } : c)),
      dirty: true,
    })),
  removeCaption: (id) =>
    set((state) => ({ captions: state.captions.filter((c) => c.id !== id), dirty: true })),
  markPlaced: (trackId) => set({ trackId, dirty: false }),
  setLanguage: (language) => set({ language }),
  setMaxWords: (maxWords) => set({ maxWords }),
  setStyle: (style) => set((state) => ({ style, dirty: state.captions.length > 0 })),
  setPosition: (position) =>
    set((state) => ({ position, dirty: state.captions.length > 0 })),
  clear: () => set({ captions: [], trackId: null, dirty: false }),
}));
