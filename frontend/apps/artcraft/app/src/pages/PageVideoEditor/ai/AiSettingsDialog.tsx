import { useEffect, useState } from "react";
import { CheckIcon, EyeIcon, EyeOffIcon, KeyRoundIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { Modal } from "@storyteller/ui-modal";
import type { LlmKeyStatus } from "@storyteller/tauri-api";
import { LLM_PROVIDER_OPTIONS, useAiSettings } from "./aiSettings";
import { describeAiError } from "./describeAiError";
import {
  clearLlmApiKey,
  getLlmKeyStatus,
  saveLlmApiKey,
  usesBrowserKeyStorage,
} from "./llmClient";

export const AiSettingsDialog = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const provider = useAiSettings((s) => s.provider);
  const models = useAiSettings((s) => s.models);
  const setProvider = useAiSettings((s) => s.setProvider);
  const setModel = useAiSettings((s) => s.setModel);

  const option = LLM_PROVIDER_OPTIONS.find((o) => o.id === provider)!;
  const [keyStatus, setKeyStatus] = useState<LlmKeyStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setKeyInput("");
    setError(null);
    setKeyStatus(null);
    getLlmKeyStatus(provider)
      .then((status) => active && setKeyStatus(status))
      .catch(() => active && setKeyStatus({ hasKey: false }));
    return () => {
      active = false;
    };
  }, [isOpen, provider]);

  const saveKey = async () => {
    const key = keyInput.trim();
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      await saveLlmApiKey(provider, key);
      setKeyStatus(await getLlmKeyStatus(provider));
      setKeyInput("");
    } catch (err) {
      setError(describeAiError(err, "Could not save the key."));
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearLlmApiKey(provider);
      setKeyStatus({ hasKey: false });
    } catch (err) {
      setError(describeAiError(err, "Could not remove the key."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI model settings" className="max-w-md">
      <div className="space-y-5 text-sm text-base-fg">
        <section>
          <Label>Provider</Label>
          <div className="grid grid-cols-3 gap-2">
            {LLM_PROVIDER_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setProvider(o.id)}
                aria-pressed={o.id === provider}
                className={twMerge(
                  "flex h-9 items-center justify-center gap-1.5 rounded-[3px] border text-sm font-medium transition-colors",
                  o.id === provider
                    ? "border-primary bg-primary/15 text-base-fg"
                    : "border-base-fg/15 text-base-fg/70 hover:border-base-fg/30 hover:bg-base-fg/5",
                )}
              >
                {o.id === provider && <CheckIcon className="h-3.5 w-3.5" />}
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <Label htmlFor="ai-model">Model</Label>
          <input
            id="ai-model"
            value={models[provider]}
            onChange={(e) => setModel(provider, e.target.value)}
            placeholder={option.defaultModel}
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-xs text-base-fg/50">
            Any {option.label} chat model that supports tool calling. Default: {option.defaultModel}
          </p>
        </section>

        <section>
          <Label htmlFor="ai-key">{option.label} API key</Label>
          {keyStatus?.hasKey && (
            <div className="mb-2 flex items-center justify-between rounded-[3px] border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5">
                <KeyRoundIcon className="h-3.5 w-3.5" />
                Saved{keyStatus.maybeKeyStart ? `: ${keyStatus.maybeKeyStart}` : ""}
              </span>
              <button
                type="button"
                onClick={removeKey}
                disabled={busy}
                className="font-medium text-red-400 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                id="ai-key"
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveKey()}
                placeholder={keyStatus?.hasKey ? "Replace key…" : option.keyHint}
                autoComplete="off"
                spellCheck={false}
                className={twMerge(INPUT_CLASS, "pr-9")}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? "Hide key" : "Show key"}
                className="absolute inset-y-0 right-2 flex items-center text-base-fg/50 hover:text-base-fg"
              >
                {showKey ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={saveKey}
              disabled={busy || !keyInput.trim()}
              className="h-9 rounded-[3px] bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
            >
              Save
            </button>
          </div>
          <p className="mt-1 text-xs text-base-fg/50">
            {usesBrowserKeyStorage()
              ? "Browser mode: saved in this browser only. Use the desktop app for safer storage."
              : "Stored on this computer by the app, never in the browser view."}
          </p>
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </section>
      </div>
    </Modal>
  );
};

const INPUT_CLASS =
  "h-9 w-full rounded-[3px] border border-base-fg/15 bg-base-fg/5 px-3 text-sm text-base-fg outline-none placeholder:text-base-fg/40 focus:border-primary";

const Label = ({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-base-fg/60">
    {children}
  </label>
);
