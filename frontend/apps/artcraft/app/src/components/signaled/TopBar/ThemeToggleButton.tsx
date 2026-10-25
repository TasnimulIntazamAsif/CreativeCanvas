import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@storyteller/ui-button";
import { Tooltip } from "@storyteller/ui-tooltip";
import { gtagEvent } from "@storyteller/google-analytics";

// Same storage key and `theme-*` root classes as the Appearance settings pane,
// so this quick toggle and the full theme picker stay in sync.
const THEME_STORAGE_KEY = "st-theme";
const LIGHT_THEME = "light";
const DARK_THEME = "gray";

export const ThemeToggleButton = () => {
  const [isLight, setIsLight] = useState(readIsLight);

  // Follow theme changes made elsewhere (e.g. the settings modal).
  // The stored theme is applied by a parent effect, which runs after this
  // component's first render, so re-read once on mount as well.
  useEffect(() => {
    setIsLight(readIsLight());
    const observer = new MutationObserver(() => setIsLight(readIsLight()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const next = readIsLight() ? DARK_THEME : LIGHT_THEME;
    applyTheme(next);
    gtagEvent("toggle_theme", { theme: next });
  };

  const label = isLight ? "Switch to dark mode" : "Switch to light mode";

  return (
    <Tooltip content={label} position="bottom" delay={300}>
      <Button
        aria-label={label}
        variant="secondary"
        icon={isLight ? MoonIcon : SunIcon}
        iconClassName="h-4 w-4 shrink-0"
        className="h-8 w-8 border-base-fg/15 bg-transparent p-0 text-base-fg/80 hover:border-base-fg/30 hover:bg-base-fg/10"
        onClick={toggle}
      />
    </Tooltip>
  );
};

function readIsLight(): boolean {
  return document.documentElement.classList.contains(`theme-${LIGHT_THEME}`);
}

function applyTheme(theme: string) {
  const root = document.documentElement;
  const toRemove: string[] = [];
  root.classList.forEach((c) => {
    if (c.startsWith("theme-")) toRemove.push(c);
  });
  toRemove.forEach((c) => root.classList.remove(c));
  root.classList.add(`theme-${theme}`);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
