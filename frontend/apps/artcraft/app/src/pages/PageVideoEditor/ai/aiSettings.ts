import { create } from "zustand";
import { LlmProvider } from "@storyteller/tauri-api";

// Non-secret AI settings for the video editor's command bar. API keys never
// live here: they are stored by Rust in the provider credential store.

const STORAGE_KEY = "cc-video-editor-ai-settings";

export const LLM_PROVIDER_OPTIONS: {
  id: LlmProvider;
  label: string;
  defaultModel: string;
  keyHint: string;
}[] = [
  { id: LlmProvider.OpenAI, label: "OpenAI", defaultModel: "gpt-4.1-mini", keyHint: "sk-..." },
  { id: LlmProvider.Gemini, label: "Gemini", defaultModel: "gemini-2.5-flash", keyHint: "AIza..." },
  { id: LlmProvider.DeepSeek, label: "DeepSeek", defaultModel: "deepseek-chat", keyHint: "sk-..." },
];

interface AiSettingsState {
  provider: LlmProvider;
  /** Model name per provider, so switching back keeps the user's choice. */
  models: Record<LlmProvider, string>;
  setProvider: (provider: LlmProvider) => void;
  setModel: (provider: LlmProvider, model: string) => void;
}

export const useAiSettings = create<AiSettingsState>()((set) => ({
  ...loadSettings(),
  setProvider: (provider) =>
    set((state) => persist({ ...state, provider })),
  setModel: (provider, model) =>
    set((state) => persist({ ...state, models: { ...state.models, [provider]: model } })),
}));

export function getProviderLabel(provider: LlmProvider): string {
  return LLM_PROVIDER_OPTIONS.find((option) => option.id === provider)?.label ?? provider;
}

function defaultModels(): Record<LlmProvider, string> {
  return Object.fromEntries(
    LLM_PROVIDER_OPTIONS.map((option) => [option.id, option.defaultModel]),
  ) as Record<LlmProvider, string>;
}

function loadSettings(): Pick<AiSettingsState, "provider" | "models"> {
  const fallback = { provider: LlmProvider.OpenAI, models: defaultModels() };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<AiSettingsState>;
    const provider = LLM_PROVIDER_OPTIONS.some((o) => o.id === parsed.provider)
      ? (parsed.provider as LlmProvider)
      : fallback.provider;
    return { provider, models: { ...fallback.models, ...(parsed.models ?? {}) } };
  } catch {
    return fallback;
  }
}

function persist<T extends Pick<AiSettingsState, "provider" | "models">>(state: T): T {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ provider: state.provider, models: state.models }),
    );
  } catch {
    // Settings still apply for this session.
  }
  return state;
}
