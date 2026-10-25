import { useRef, useState } from "react";
import { ArrowUpIcon, Loader2Icon, Settings2Icon, SparklesIcon, SquareIcon } from "lucide-react";
import { EditorCore, runAiEdit } from "@storyteller/ui-video-editor";
import { toast } from "@storyteller/ui-toaster";
import { AiSettingsDialog } from "./AiSettingsDialog";
import { getProviderLabel, useAiSettings } from "./aiSettings";
import { getLlmKeyStatus, llmChatCompletion } from "./llmClient";

// Prompt box in the video editor header: the user describes an edit, the
// configured LLM (OpenAI / Gemini / DeepSeek) calls timeline tools, and the
// result lands as one undoable step.

export const AiCommandBar = () => {
  const provider = useAiSettings((s) => s.provider);
  const model = useAiSettings((s) => s.models[s.provider]);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    const text = prompt.trim();
    if (!text || running) return;

    const keyStatus = await getLlmKeyStatus(provider).catch(() => ({ hasKey: false }));
    if (!keyStatus.hasKey) {
      toast.error(`Add your ${getProviderLabel(provider)} API key first.`);
      setSettingsOpen(true);
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;
    setRunning(true);
    setStatus("Thinking…");
    try {
      const result = await runAiEdit({
        editor: EditorCore.getInstance(),
        prompt: text,
        model: model.trim(),
        chatCompletion: (body) => llmChatCompletion(provider, body),
        onProgress: ({ toolName }) => setStatus(describeTool(toolName)),
        signal: abort.signal,
      });
      setPrompt("");
      if (result.toolCallCount > 0) {
        toast.success(`${result.message} (Ctrl+Z to undo)`);
      } else {
        toast(result.message);
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        toast.error(error instanceof Error ? error.message : "AI edit failed.");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setStatus(null);
    }
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex h-9 w-full max-w-2xl items-center gap-1 rounded-md border border-white/15 bg-white/[0.04] pl-3 pr-1 transition-colors focus-within:border-[#2d81ff]"
      >
        <SparklesIcon className="h-4 w-4 shrink-0 text-[#74aaff]" />
        <input
          value={running && status ? status : prompt}
          onChange={(e) => setPrompt(e.target.value)}
          // Keep editor shortcuts (space = play, S = split…) from firing while typing.
          onKeyDown={(e) => e.stopPropagation()}
          readOnly={running}
          placeholder="Ask AI to edit… e.g. “Add a bold title ‘Summer Trip’ for the first 3 seconds”"
          aria-label="AI edit command"
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-white/40 read-only:text-white/60"
        />
        <span className="hidden shrink-0 rounded px-1.5 font-mono text-[10px] uppercase tracking-wider text-white/40 lg:block">
          {getProviderLabel(provider)}
        </span>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="AI model settings"
          title="AI model settings"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Settings2Icon className="h-4 w-4" />
        </button>
        {running ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop"
            title="Stop"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <span className="relative flex items-center justify-center">
              <Loader2Icon className="absolute h-6 w-6 animate-spin text-[#74aaff]" />
              <SquareIcon className="h-2.5 w-2.5 fill-current" />
            </span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!prompt.trim()}
            aria-label="Run AI edit"
            title="Run (Enter)"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#2d81ff] text-white transition-colors hover:bg-[#1b63f5] disabled:bg-white/10 disabled:text-white/40"
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
        )}
      </form>
      <AiSettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
};

const TOOL_LABELS: Record<string, string> = {
  get_timeline: "Reading the timeline…",
  add_text: "Adding text…",
  add_media: "Placing media…",
  update_element: "Updating an element…",
  split_element: "Splitting a clip…",
  delete_elements: "Deleting elements…",
  duplicate_elements: "Duplicating elements…",
  add_effect: "Adding an effect…",
  set_track_state: "Updating a track…",
  set_canvas_size: "Resizing the canvas…",
  set_background: "Changing the background…",
  set_frame_rate: "Changing the frame rate…",
  seek: "Moving the playhead…",
};

function describeTool(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "Editing…";
}
