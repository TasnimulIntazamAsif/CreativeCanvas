// Optional slot for a host-provided speech-to-text service, used by the
// Captions panel. When this adapter is null/absent, the panel explains that
// captions aren't available in this host instead of offering to generate.

export interface TranscriptionSegment {
  /** Seconds from the start of the submitted audio. */
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  /** Detected or requested language, if the service reports one. */
  language?: string;
}

export interface TranscriptionAdapter {
  /**
   * Transcribes one audio file. `language` is an ISO-639-1 code ("en",
   * "bn", ...) or undefined to auto-detect.
   */
  transcribe(opts: { audio: Blob; language?: string }): Promise<TranscriptionResult>;
}
