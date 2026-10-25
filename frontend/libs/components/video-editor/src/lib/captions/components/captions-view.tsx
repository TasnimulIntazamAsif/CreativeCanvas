import { useRef, useState } from "react";
import { PanelView } from "../../panels/assets/views/base-panel";
import { useEditor } from "../../editor/use-editor";
import { useEditorAdapters } from "../../EditorProvider";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { cn } from "../../utils/ui";
import { mediaTimeFromSeconds } from "../../wasm";
import { useCaptionsStore } from "../captions-store";
import { generateCaptions, type CaptionGenerationStage } from "../generate-captions";
import {
  CAPTION_STYLES,
  captionTrackExists,
  insertCaptions,
  type CaptionPosition,
  type CaptionStyleId,
} from "../insert-captions";

// Captions tab: transcribe the timeline audio, place the result as text
// elements on a captions track, then fix wording or restyle and re-apply.

const AUTO_LANGUAGE = "auto";

const LANGUAGES: { value: string; label: string }[] = [
  { value: AUTO_LANGUAGE, label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "bn", label: "Bangla" },
  { value: "hi", label: "Hindi" },
  { value: "ur", label: "Urdu" },
  { value: "ar", label: "Arabic" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

const WORD_LIMITS = [3, 4, 6, 8, 12];

const POSITIONS: { value: CaptionPosition; label: string }[] = [
  { value: "bottom", label: "Bottom" },
  { value: "middle", label: "Middle" },
  { value: "top", label: "Top" },
];

export function CaptionsView() {
  const editor = useEditor();
  const { transcription, toast } = useEditorAdapters();
  const store = useCaptionsStore();
  const [stage, setStage] = useState<CaptionGenerationStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  if (!transcription) {
    return (
      <PanelView title="Captions">
        <p className="text-muted-foreground p-2 text-sm">
          Captions need a speech-to-text service, which isn't set up in this app.
        </p>
      </PanelView>
    );
  }

  const place = (captions = store.captions) => {
    const trackId = insertCaptions({
      editor,
      captions,
      style: store.style,
      position: store.position,
      replaceTrackId: captionTrackExists({ editor, trackId: store.trackId })
        ? store.trackId
        : null,
    });
    store.markPlaced(trackId);
    return trackId;
  };

  const generate = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setError(null);
    try {
      const { captions } = await generateCaptions({
        editor,
        transcription,
        language: store.language && store.language !== AUTO_LANGUAGE ? store.language : undefined,
        maxWords: store.maxWords,
        onStage: setStage,
        signal: abort.signal,
      });
      if (captions.length === 0) {
        setError("No speech was found in the timeline audio.");
        return;
      }
      store.setCaptions(captions, store.trackId);
      place(captions);
      toast.success(`Added ${captions.length} captions to the timeline.`);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Caption generation failed.");
      }
    } finally {
      abortRef.current = null;
      setStage(null);
    }
  };

  const busy = stage !== null;
  const hasCaptions = store.captions.length > 0;

  return (
    <PanelView title="Captions" contentClassName="space-y-4 pb-4">
      <section className="space-y-3 px-1">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Language">
            <Select
              value={store.language || AUTO_LANGUAGE}
              onValueChange={store.setLanguage}
              disabled={busy}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((language) => (
                  <SelectItem key={language.value} value={language.value}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Words per caption">
            <Select
              value={String(store.maxWords)}
              onValueChange={(value) => store.setMaxWords(Number(value))}
              disabled={busy}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORD_LIMITS.map((limit) => (
                  <SelectItem key={limit} value={String(limit)}>
                    Up to {limit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Style">
          <ChipGroup
            options={(Object.keys(CAPTION_STYLES) as CaptionStyleId[]).map((id) => ({
              value: id,
              label: CAPTION_STYLES[id].label,
            }))}
            value={store.style}
            onChange={store.setStyle}
          />
        </Field>
        <Field label="Position">
          <ChipGroup options={POSITIONS} value={store.position} onChange={store.setPosition} />
        </Field>

        {busy ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs">{describeStage(stage)}</p>
            <Button variant="outline" className="w-full" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={generate}>
            {hasCaptions ? "Regenerate captions" : "Generate captions"}
          </Button>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </section>

      {hasCaptions && (
        <section className="space-y-2 border-t border-ui-panel-border px-1 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {store.captions.length} captions
            </span>
            <Button
              size="sm"
              variant={store.dirty ? "default" : "outline"}
              disabled={busy || (!store.dirty && captionTrackExists({ editor, trackId: store.trackId }))}
              onClick={() => {
                place();
                toast.success("Captions updated on the timeline.");
              }}
            >
              {captionTrackExists({ editor, trackId: store.trackId }) ? "Apply changes" : "Add to timeline"}
            </Button>
          </div>
          <ul className="space-y-1.5">
            {store.captions.map((caption) => (
              <li
                key={caption.id}
                className="group rounded-md border border-ui-panel-border bg-white/[0.02] p-2"
              >
                <div className="mb-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      editor.playback.seek({
                        time: mediaTimeFromSeconds({ seconds: caption.startSeconds }),
                      })
                    }
                    className="font-mono text-[10px] text-[#74aaff] hover:underline"
                    title="Jump to this caption"
                  >
                    {formatTime(caption.startSeconds)} – {formatTime(caption.endSeconds)}
                  </button>
                  <button
                    type="button"
                    onClick={() => store.removeCaption(caption.id)}
                    className="text-muted-foreground text-[10px] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={caption.text}
                  onChange={(e) => store.updateCaptionText(caption.id, e.target.value)}
                  // Keep editor shortcuts (space = play, delete…) from firing while typing.
                  onKeyDown={(e) => e.stopPropagation()}
                  rows={Math.max(1, Math.ceil(caption.text.length / 34))}
                  className="w-full resize-none bg-transparent text-sm leading-snug outline-none"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </PanelView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          className={cn(
            "h-7 rounded-md border px-2.5 text-xs transition-colors",
            option.value === value
              ? "border-[#2d81ff] bg-[#2d81ff]/15 text-foreground"
              : "border-ui-panel-border text-muted-foreground hover:bg-accent",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function describeStage(stage: CaptionGenerationStage | null): string {
  if (!stage) return "";
  if (stage.stage === "extracting") return "Preparing the timeline audio…";
  return stage.chunkCount > 1
    ? `Transcribing part ${stage.chunk} of ${stage.chunkCount}…`
    : "Transcribing speech…";
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${rest}`;
}
