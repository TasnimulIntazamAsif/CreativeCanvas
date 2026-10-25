import type { EditorCore } from "../core";
import {
  AI_TOOL_DEFINITIONS,
  executeAiTool,
  getAvailableEffectTypes,
} from "./ai-tools";
import { buildTimelineSnapshot } from "./timeline-snapshot";

// Tool-calling loop for "edit my video with a prompt". The host supplies
// `chatCompletion`, which sends an OpenAI-compatible chat completions body to
// whichever provider the user configured and resolves to the raw response.
// All edits made during one run collapse into a single undo step.

const MAX_TOOL_ROUNDS = 12;

export type AiChatCompletion = (body: Record<string, unknown>) => Promise<unknown>;

export interface AiEditProgress {
  /** Tool currently running, e.g. "add_text". */
  toolName: string;
  round: number;
}

export interface AiEditResult {
  /** The model's final message to the user. */
  message: string;
  /** Number of tool calls that changed or read the timeline. */
  toolCallCount: number;
  /** Number of tool calls that failed (reported back to the model). */
  failedToolCallCount: number;
}

export async function runAiEdit({
  editor,
  prompt,
  model,
  chatCompletion,
  onProgress,
  signal,
}: {
  editor: EditorCore;
  prompt: string;
  model: string;
  chatCompletion: AiChatCompletion;
  onProgress?: (progress: AiEditProgress) => void;
  signal?: AbortSignal;
}): Promise<AiEditResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: `Current timeline:\n${JSON.stringify(buildTimelineSnapshot({ editor }))}\n\nRequest: ${prompt}`,
    },
  ];

  const historyStart = editor.command.getHistoryLength();
  let toolCallCount = 0;
  let failedToolCallCount = 0;

  try {
    for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
      throwIfAborted(signal);
      const response = await chatCompletion({
        model,
        messages,
        tools: AI_TOOL_DEFINITIONS,
        tool_choice: "auto",
      });
      throwIfAborted(signal);

      const assistant = readAssistantMessage(response);
      messages.push(assistant);

      const toolCalls = assistant.tool_calls ?? [];
      if (toolCalls.length === 0) {
        return {
          message: assistant.content?.trim() || "Done.",
          toolCallCount,
          failedToolCallCount,
        };
      }

      // Every tool call gets a matching tool message, including failures, so
      // the model can see what went wrong and correct itself.
      for (const call of toolCalls) {
        onProgress?.({ toolName: call.function.name, round });
        toolCallCount++;
        let content: string;
        try {
          content = executeAiTool({
            editor,
            name: call.function.name,
            args: parseArguments(call.function.arguments),
          });
        } catch (error) {
          failedToolCallCount++;
          content = `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
        messages.push({ role: "tool", tool_call_id: call.id, content });
      }
    }

    return {
      message: "Stopped after too many steps. Some edits may be incomplete.",
      toolCallCount,
      failedToolCallCount,
    };
  } finally {
    editor.command.collapseHistorySince({ startLength: historyStart });
  }
}

function buildSystemPrompt(): string {
  const effects = getAvailableEffectTypes();
  return [
    "You edit a video project in a timeline-based video editor by calling tools.",
    "The user's request comes with a JSON snapshot of the timeline. Times are in seconds.",
    "Use the exact track_id, element_id and media_id values from the snapshot; never invent ids.",
    "Canvas positions are pixels from the canvas center; positive Y is downward. Keep text inside the canvas.",
    effects.length > 0
      ? `Available effect types: ${effects.join(", ")}.`
      : "No effects are available.",
    "Make the edits the user asked for and nothing else. If a request can't be done with the tools (for example, it needs media that isn't imported), say so briefly instead of guessing.",
    "When you are finished, reply with one or two short sentences describing what you changed, in the same language the user wrote in.",
  ].join("\n");
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function readAssistantMessage(response: unknown): Extract<ChatMessage, { role: "assistant" }> {
  const choice = (response as { choices?: Array<{ message?: unknown }> })?.choices?.[0];
  const message = choice?.message as
    | { content?: string | null; tool_calls?: ToolCall[] }
    | undefined;
  if (!message) {
    throw new Error("The model returned an empty response.");
  }
  return {
    role: "assistant",
    content: message.content ?? null,
    tool_calls: message.tool_calls?.length ? message.tool_calls : undefined,
  };
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw new Error("Tool arguments were not valid JSON.");
  }
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException("The AI edit was cancelled.", "AbortError");
  }
}
