// Helpers for telling the desktop app (Tauri runtime present) from a plain
// browser tab, and for turning a failed key/LLM call into a readable message.

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function describeAiError(error: unknown, fallback: string): string {
  const message =
    (error as { error_message?: string })?.error_message ??
    (error instanceof Error ? error.message : typeof error === "string" ? error : "");
  return message ? `${fallback} ${message}` : fallback;
}
