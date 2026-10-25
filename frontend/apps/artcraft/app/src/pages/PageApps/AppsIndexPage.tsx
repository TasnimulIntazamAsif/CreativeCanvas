import { ArrowRightIcon, ArrowUpRightIcon, SparklesIcon } from "lucide-react";
import { DynamicIcon } from "@storyteller/icons";
import { twMerge } from "tailwind-merge";
import {
  useGenerateApps,
  useEditApps,
  getAppCardPalette,
  getBadgeStyles,
  goToApp,
  type FullAppItem,
} from "~/config/appMenu";
import { HomeSidebar, useSidebarCollapsed } from "./HomeSidebar";

// The first few "Create" apps get the large featured treatment in the hero row.
const FEATURED_APP_COUNT = 3;

// The app palettes use pastel *-300 glyphs tuned for dark surfaces; darken
// them on the light theme so icons and badges keep their contrast.
const LIGHT_THEME_DEEPEN = "[.theme-light_&]:brightness-[0.6] [.theme-light_&]:saturate-[1.6]";

export const AppsIndexPage = () => {
  const generateApps = useGenerateApps();
  const editApps = useEditApps();
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed();

  const featuredApps = generateApps.slice(0, FEATURED_APP_COUNT);
  const categories = [
    {
      title: "Create",
      description: "Generate new images, video, audio, and 3D from a prompt or reference.",
      apps: sortAvailableFirst(generateApps.slice(FEATURED_APP_COUNT)),
    },
    {
      title: "Edit",
      description: "Refine, extract, and clean up the media you already have.",
      apps: sortAvailableFirst(editApps),
    },
  ];

  return (
    // The scroll container spans the full window width so its scrollbar sits
    // flush against the right edge; horizontal padding lives on the inner
    // wrapper instead.
    <div
      className={twMerge(
        "fixed inset-0 overflow-y-auto bg-ui-background pt-[56px] text-base-fg transition-[padding] duration-200",
        sidebarCollapsed ? "pl-16" : "pl-60",
      )}
    >
      <HomeSidebar collapsed={sidebarCollapsed} onToggleCollapsed={toggleSidebar} />
      <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
        <Hero />

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          {featuredApps.map((app) => (
            <FeaturedAppCard key={app.id} app={app} />
          ))}
        </section>

        {categories.map((category) => (
          <section key={category.title} className="mt-14">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-2 border-b border-ui-border pb-4">
              <div>
                <h2 className="font-display text-xl tracking-tight text-ui-ink sm:text-2xl">
                  {category.title}
                </h2>
                <p className="mt-1 text-sm text-base-fg/60">{category.description}</p>
              </div>
              <span className="hud-label text-base-fg/50">
                {category.apps.length} tools
              </span>
            </div>
            <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {category.apps.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
};

function Hero() {
  return (
    <header className="relative overflow-hidden rounded-[3px] border border-ui-border bg-ui-panel px-6 py-10 sm:px-10 sm:py-14">
      {/* Decorative grid + glow; purely visual. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse at top right, black 20%, transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ui-accent-ink [.theme-light_&]:text-primary-600">
            <SparklesIcon className="h-3 w-3" />
            AI creative studio
          </span>
        </div>

        <p className="mt-5 font-display text-4xl font-bold tracking-tight text-ui-ink sm:text-6xl">
          Creative<span className="text-ui-accent-ink [.theme-light_&]:text-primary-600">Canvas</span>
        </p>
        <h1 className="mt-3 max-w-2xl text-lg leading-snug text-base-fg/80 sm:text-2xl">
          What will you <span className="text-ui-accent-ink [.theme-light_&]:text-primary-600">craft</span> today?
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-base-fg/60 sm:text-base">
          Compose in 2D, stage scenes in 3D, and generate images, video, and audio
          with the models that fit your work.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={() => goToApp("IMAGE")}
            className="inline-flex items-center gap-2 rounded-[3px] bg-base-fg px-4 py-2.5 text-sm font-semibold text-ui-background transition-colors hover:bg-base-fg/85"
          >
            Start creating
            <ArrowRightIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => goToApp("3D")}
            className="inline-flex items-center gap-2 rounded-[3px] border border-base-fg/20 px-4 py-2.5 text-sm font-semibold text-ui-ink transition-colors hover:border-base-fg/50 hover:bg-base-fg/5"
          >
            Open 3D stage
          </button>
        </div>
      </div>
    </header>
  );
}

function FeaturedAppCard({ app }: { app: FullAppItem }) {
  const palette = getAppCardPalette(app.id);
  const enabled = !!app.action;

  return (
    <button
      onClick={() => goToApp(app.action)}
      disabled={!enabled}
      className={twMerge(
        "group relative flex min-h-[180px] flex-col justify-between overflow-hidden rounded-[3px] border border-ui-border bg-base-fg/[0.03] p-6 text-left transition-all duration-200 focus-visible:border-primary",
        enabled
          ? twMerge("cursor-pointer hover:-translate-y-0.5", palette.hoverStyle)
          : "cursor-default opacity-60",
      )}
    >
      <div className="flex w-full items-start justify-between">
        <div
          className={twMerge(
            "flex h-12 w-12 items-center justify-center rounded-[3px] border",
            palette.iconBg,
            palette.iconColor,
            LIGHT_THEME_DEEPEN,
          )}
        >
          <DynamicIcon icon={app.icon} className="text-xl" />
        </div>
        {enabled && (
          <ArrowUpRightIcon className="h-5 w-5 text-base-fg/30 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-base-fg" />
        )}
      </div>
      <div className="mt-8">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold tracking-tight text-ui-ink">
            {app.label}
          </h3>
          <AppBadge badge={app.badge} />
        </div>
        <p className="mt-1 text-sm leading-relaxed text-base-fg/60">
          {app.description}
        </p>
      </div>
    </button>
  );
}

function AppCard({ app }: { app: FullAppItem }) {
  const palette = getAppCardPalette(app.id);
  const enabled = !!app.action;

  return (
    <button
      onClick={() => goToApp(app.action)}
      disabled={!enabled}
      className={twMerge(
        "group relative flex h-full items-start gap-4 rounded-[3px] border border-ui-border bg-base-fg/[0.03] p-4 text-left transition-colors duration-150 focus-visible:border-primary",
        enabled ? twMerge("cursor-pointer", palette.hoverStyle) : "cursor-default opacity-50",
      )}
    >
      <div
        className={twMerge(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] border",
          palette.iconBg,
          palette.iconColor,
          LIGHT_THEME_DEEPEN,
          !enabled && "grayscale",
        )}
      >
        <DynamicIcon icon={app.icon} className="text-base" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold tracking-tight text-ui-ink">
            {app.label}
          </h3>
          <AppBadge badge={app.badge} />
        </div>
        <p className="mt-1 text-sm leading-relaxed text-base-fg/60">
          {app.description}
        </p>
      </div>
      {enabled && (
        <ArrowRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-base-fg/0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-base-fg/70" />
      )}
    </button>
  );
}

function AppBadge({ badge }: { badge?: FullAppItem["badge"] }) {
  if (!badge) return null;
  return (
    <span
      className={twMerge(
        "shrink-0 rounded-[2px] border px-1.5 py-0.5 font-mono text-[9px] font-medium leading-none tracking-wider",
        getBadgeStyles(badge),
        LIGHT_THEME_DEEPEN,
      )}
    >
      {badge}
    </span>
  );
}

// "Coming soon" tools (no action) sink to the end of each section.
function sortAvailableFirst(apps: FullAppItem[]): FullAppItem[] {
  return [...apps].sort((a, b) => Number(!a.action) - Number(!b.action));
}
