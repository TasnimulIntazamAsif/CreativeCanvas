import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { BoxIcon, BoxesIcon, CircleHelpIcon, FilmIcon, FolderIcon, FolderOpenIcon, GlobeIcon, GraduationCapIcon, HouseIcon, ImageIcon, ImagesIcon, LayoutGridIcon, MusicIcon, NewspaperIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PencilIcon, ScanIcon, VideoIcon, WandSparklesIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { DiscordIcon } from "@storyteller/icons";
import { OpenUrl } from "@storyteller/tauri-api";
import {
  galleryModalRequestedTab,
  galleryModalVisibleDuringDrag,
  galleryModalVisibleViewMode,
} from "@storyteller/ui-gallery-modal";
import { gtagEvent } from "@storyteller/google-analytics";
import { getBadgeStyles, goToApp, type AppId, type FullAppItem } from "~/config/appMenu";

const COLLAPSED_STORAGE_KEY = "cc-home-sidebar-collapsed";

export const SIDEBAR_EXPANDED_WIDTH = "w-60";
export const SIDEBAR_COLLAPSED_WIDTH = "w-16";

const DISCORD_URL = "https://discord.gg/75svZP2Vje";

type SidebarItem = {
  label: string;
  icon: LucideIcon | typeof DiscordIcon;
  badge?: FullAppItem["badge"];
  onSelect: () => void;
};

type SidebarSection = {
  title: string;
  items: SidebarItem[];
};

const SECTIONS: SidebarSection[] = [
  {
    title: "Create",
    items: [
      appItem("Image", ImageIcon, "IMAGE"),
      appItem("Video", VideoIcon, "VIDEO"),
      appItem("Audio", MusicIcon, "AUDIO"),
      appItem("3D Object", BoxIcon, "IMAGE_TO_3D_OBJECT"),
      appItem("3D World", GlobeIcon, "IMAGE_TO_3D_WORLD"),
    ],
  },
  {
    title: "Studio",
    items: [
      appItem("Edit Image", PencilIcon, "2D"),
      appItem("Edit 3D", BoxesIcon, "3D"),
      appItem("Edit Video", FilmIcon, "VIDEO_EDITOR", "BETA"),
      appItem("BG Change", WandSparklesIcon, "BACKGROUND_CHANGE"),
      appItem("Moodboard", ScanIcon, "MOODBOARD", "BETA"),
      appItem("Frame Extract", ImagesIcon, "VIDEO_FRAME_EXTRACTOR", "NEW"),
    ],
  },
  {
    title: "Assets",
    items: [
      { label: "Library", icon: LayoutGridIcon, onSelect: () => openLibrary(null) },
      { label: "Unfoldered", icon: FolderOpenIcon, onSelect: () => openLibrary("unsorted") },
      { label: "Folders", icon: FolderIcon, onSelect: () => openLibrary("folders") },
    ],
  },
  {
    title: "Resources",
    items: [
      linkItem("Tutorials", GraduationCapIcon, "https://getartcraft.com/tutorials"),
      linkItem("News", NewspaperIcon, "https://getartcraft.com/news"),
      linkItem("FAQ", CircleHelpIcon, "https://getartcraft.com/faq"),
    ],
  },
  {
    title: "Support",
    items: [linkItem("Join Discord", DiscordIcon, DISCORD_URL)],
  },
];

export const HomeSidebar = ({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) => {
  return (
    <aside
      className={twMerge(
        "fixed bottom-0 left-0 top-[56px] z-40 flex flex-col border-r border-ui-border bg-ui-panel transition-[width] duration-200",
        collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
      )}
      aria-label="Home navigation"
    >
      <div
        className={twMerge(
          "flex h-14 shrink-0 items-center px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <span className="font-display text-lg font-bold tracking-tight text-ui-ink">
            Creative<span className="text-ui-accent-ink [.theme-light_&]:text-primary-600">Canvas</span>
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 items-center justify-center rounded-[3px] text-base-fg/60 transition-colors hover:bg-base-fg/10 hover:text-base-fg"
        >
          {collapsed ? (
            <PanelLeftOpenIcon className="h-4 w-4" />
          ) : (
            <PanelLeftCloseIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <NavButton
          item={{ label: "Home", icon: HouseIcon, onSelect: () => {} }}
          active
          collapsed={collapsed}
        />

        {SECTIONS.map((section) => (
          <div key={section.title} className="mt-5">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-ui-border" />
            ) : (
              <p className="hud-label mb-1.5 px-2 text-[10px] text-base-fg/50">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.label}>
                  <NavButton item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
};

export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Persisting is a convenience only.
      }
      return next;
    });
  };
  return [collapsed, toggle];
}

function NavButton({
  item,
  active = false,
  collapsed,
}: {
  item: SidebarItem;
  active?: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={item.onSelect}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={twMerge(
        "relative flex h-9 w-full items-center gap-3 rounded-[3px] px-2 text-left text-sm transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-base-fg/10 font-semibold text-ui-ink"
          : "text-base-fg/70 hover:bg-base-fg/5 hover:text-base-fg",
      )}
    >
      {active && (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && (
            <span
              className={twMerge(
                "shrink-0 rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] font-medium leading-none tracking-wider",
                getBadgeStyles(item.badge),
                "[.theme-light_&]:brightness-[0.6] [.theme-light_&]:saturate-[1.6]",
              )}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}

function appItem(
  label: string,
  icon: LucideIcon,
  action: AppId,
  badge?: FullAppItem["badge"],
): SidebarItem {
  return {
    label,
    icon,
    badge,
    onSelect: () => {
      gtagEvent("home_sidebar_select", { target: action });
      goToApp(action);
    },
  };
}

function linkItem(
  label: string,
  icon: SidebarItem["icon"],
  url: string,
): SidebarItem {
  return {
    label,
    icon,
    onSelect: () => {
      gtagEvent("home_sidebar_select", { target: label });
      // Tauri opens the system browser; fall back for plain-browser dev.
      OpenUrl(url).catch(() => window.open(url, "_blank", "noopener"));
    },
  };
}

function openLibrary(tab: "unsorted" | "folders" | null) {
  gtagEvent("open_gallery_modal", { tab: "home_sidebar" });
  galleryModalRequestedTab.value = tab;
  galleryModalVisibleViewMode.value = true;
  galleryModalVisibleDuringDrag.value = true;
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
