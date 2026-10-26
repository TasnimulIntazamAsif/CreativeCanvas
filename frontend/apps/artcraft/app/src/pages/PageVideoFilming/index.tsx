import type { LucideIcon } from "lucide-react";
import {
  BookOpenIcon,
  DownloadIcon,
  FilmIcon,
  GaugeIcon,
  Github,
  LayersIcon,
  MessagesSquareIcon,
  MonitorIcon,
  MusicIcon,
  PaletteIcon,
  ScissorsIcon,
  Share2Icon,
  SparklesIcon,
  TerminalIcon,
  TypeIcon,
} from "lucide-react";

// VIDEO_FILMING — a showcase section for FilmCraft, the ArtCraft team's
// open-source, pure-Rust professional non-linear video editor
// (github.com/storytold/filmcraft). The content here mirrors the repo's
// own description of its workspaces and capabilities; this is a landing /
// overview page, not an embedded editor. The real editor ships as the
// FilmCraft desktop app and as a WebAssembly build.

const FILMCRAFT_URL = "https://getartcraft.com/apps/filmcraft";
const FILMCRAFT_REPO = "https://github.com/storytold/filmcraft";
const ARTCRAFT_APPS_URL = "https://getartcraft.com/apps";
const DISCORD_URL = "https://discord.gg/artcraft";

interface Workspace {
  icon: LucideIcon;
  title: string;
  description: string;
}

// Drawn from the FilmCraft README's workspace and feature sections.
const WORKSPACES: Workspace[] = [
  {
    icon: ScissorsIcon,
    title: "Edit",
    description:
      "A timeline you already know: Source and Program monitors, bins, a multi-track timeline, three-point editing, and ripple, roll, slip, slide and razor trims. Every edit runs on exact integer time, so cuts never drift.",
  },
  {
    icon: PaletteIcon,
    title: "Color",
    description:
      "A complete color grading panel, in the order a colourist works — with a waveform, vectorscope and a GPU compositor that grades in linear light.",
  },
  {
    icon: SparklesIcon,
    title: "Effects & Motion",
    description:
      "Over 90 video effects across 16 categories plus around 30 transitions — blurs, keys, distortions and more — all keyframeable with Effect Controls.",
  },
  {
    icon: MusicIcon,
    title: "Audio",
    description:
      "Broadcast-standard loudness metering (ITU-R BS.1770 / EBU R128) with momentary, short-term, integrated and true-peak readings, next to a full mix.",
  },
  {
    icon: TypeIcon,
    title: "Titles & Captions",
    description:
      "A real text engine: OpenType shaping with kerning, ligatures and bidirectional text, drawn in linear light and sharp at any scale or rotation.",
  },
  {
    icon: GaugeIcon,
    title: "Formats & Codecs",
    description:
      "No FFmpeg inside. The H.264, HEVC, ProRes, AAC and Opus codecs are FilmCraft's own Rust code, written from the public specs and tested frame by frame.",
  },
  {
    icon: DownloadIcon,
    title: "Export",
    description:
      "H.264 MP4 with AAC from its own encoders — a 6-second 960×540 render takes about 1.3 seconds and decodes in ffmpeg without a single warning.",
  },
  {
    icon: Share2Icon,
    title: "Interchange",
    description:
      "Move timelines between FilmCraft and every other editor, so it drops into an existing post-production pipeline instead of replacing it.",
  },
  {
    icon: TerminalIcon,
    title: "Built for Agents",
    description:
      "Every menu item, button, slider and drag is a command with an id and typed parameters — 650+ engine commands an AI agent can drive as precisely as you.",
  },
];

export function PageVideoFilming() {
  return (
    <div className="h-full w-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <HeroSection />
        <WorkspacesSection />
        <EverywhereSection />
        <FooterNote />
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <header className="mb-12">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-xl border border-purple-400/40 bg-purple-500/20">
          <FilmIcon className="size-6 text-purple-300" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">FilmCraft</h1>
          <p className="text-sm text-foreground/60">
            Video filming &amp; editing · by the ArtCraft team
          </p>
        </div>
      </div>

      <p className="max-w-3xl text-lg text-foreground/80">
        An open-source, professional non-linear video editor — editing, color
        and sound — built in pure Rust. Native on macOS, Windows and Linux, and
        in the browser via WebAssembly.
      </p>
      {/* color tokens: this page uses the always-dark app chrome (bg-background)
          paired with text-foreground, which stays light in both themes. */}

      <div className="mt-5 flex flex-wrap gap-2">
        {["Pure Rust", "Open source (MIT / Apache-2.0)", "GPU compositor", "Exact integer time"].map(
          (tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-foreground/70"
            >
              {tag}
            </span>
          ),
        )}
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <a
          href={FILMCRAFT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
        >
          <DownloadIcon className="size-4" />
          Get FilmCraft
        </a>
        <a
          href={FILMCRAFT_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition-colors hover:border-white/30 hover:bg-white/10"
        >
          <Github className="size-4" />
          View on GitHub
        </a>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium transition-colors hover:border-white/30 hover:bg-white/10"
        >
          <MessagesSquareIcon className="size-4" />
          Join Discord
        </a>
      </div>
    </header>
  );
}

function WorkspacesSection() {
  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center gap-2">
        <LayersIcon className="size-5 text-purple-300" />
        <h2 className="text-xl font-semibold">Workspaces &amp; capabilities</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WORKSPACES.map((ws) => (
          <WorkspaceCard key={ws.title} workspace={ws} />
        ))}
      </div>
    </section>
  );
}

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const Icon = workspace.icon;
  return (
    <div className="rounded-xl border border-ui-panel-border bg-ui-controls/40 p-5 transition-colors hover:border-purple-400/40 hover:bg-purple-500/5">
      <span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-purple-400/30 bg-purple-500/15">
        <Icon className="size-5 text-purple-300" />
      </span>
      <h3 className="mb-1.5 font-medium">{workspace.title}</h3>
      <p className="text-sm leading-relaxed text-foreground/60">
        {workspace.description}
      </p>
    </div>
  );
}

function EverywhereSection() {
  return (
    <section className="mb-12 rounded-xl border border-ui-panel-border bg-ui-controls/30 p-6">
      <div className="mb-3 flex items-center gap-2">
        <MonitorIcon className="size-5 text-purple-300" />
        <h2 className="text-xl font-semibold">Everywhere</h2>
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-foreground/70">
        Native on macOS, Windows and Linux with a native menu bar, and in the
        browser via WebAssembly — the same engine from the bitstream up. Saves
        are atomic, auto-save keeps a rolling set of versions, and a
        crash-recovery journal brings back unsaved changes after a crash or
        power cut.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={`${FILMCRAFT_REPO}#documentation`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-purple-300 hover:text-purple-200"
        >
          <BookOpenIcon className="size-4" />
          Documentation
        </a>
        <a
          href={ARTCRAFT_APPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-purple-300 hover:text-purple-200"
        >
          <SparklesIcon className="size-4" />
          All Crafting Apps
        </a>
      </div>
    </section>
  );
}

function FooterNote() {
  return (
    <p className="pb-6 text-xs text-foreground/40">
      FilmCraft is one of the Crafting Apps — free, open-source creative tools
      from the ArtCraft team, dual-licensed under MIT or Apache-2.0.
    </p>
  );
}

export default PageVideoFilming;
