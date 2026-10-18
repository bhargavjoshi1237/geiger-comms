"use client";

// Non-functional Messenger preview (spec §5.1) reflecting launcherColor, greeting and position; a mock, not an embed.

import { cn } from "@geiger/ui";
import { BrandMark } from "@/components/widget/widget_primitives";

// The widget's own defaults (lib/widget/apps.js) — customer data, not app theme colours.
const DEFAULT_LAUNCHER = "#ffffff";
const GLYPH_ON_LIGHT = "#161616";
const GLYPH_ON_DARK = "#ffffff";

// Same contrast rule as the loader, so the preview shows the glyph colour visitors get.
function readableOn(hex) {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return GLYPH_ON_LIGHT;
  const l =
    (0.2126 * parseInt(full.slice(0, 2), 16) +
      0.7152 * parseInt(full.slice(2, 4), 16) +
      0.0722 * parseInt(full.slice(4, 6), 16)) /
    255;
  return l > 0.6 ? GLYPH_ON_LIGHT : GLYPH_ON_DARK;
}

export function MessengerPreview({ config = {} }) {
  const left = (config.position || "right") === "left";
  const launcherColor = config.launcherColor || DEFAULT_LAUNCHER;
  return (
    <div
      className="relative h-56 overflow-hidden rounded-xl border border-border bg-surface-card"
      aria-label="Messenger preview"
    >
      <div className="absolute inset-x-4 top-4 rounded-xl border border-border bg-background p-3">
        <p className="text-xs text-foreground">{config.greeting || "Hi there 👋 How can we help?"}</p>
        {config.officeHoursNote ? (
          <p className="mt-2 line-clamp-2 text-[10px] text-muted-foreground">{config.officeHoursNote}</p>
        ) : null}
      </div>
      <div
        className={cn("absolute bottom-4 flex items-center gap-1", left ? "left-4" : "right-4")}
      >
        <span className="pointer-events-none -mt-8 mr-1 h-5 min-w-5 rounded-full bg-notification-dot px-1.5 text-center text-[10px] font-semibold leading-5 text-primary-foreground">
          1
        </span>
        <span
          className="flex size-11 items-center justify-center rounded-full shadow-lg"
          style={{ backgroundColor: launcherColor, color: readableOn(launcherColor) }}
        >
          <BrandMark size={20} />
        </span>
      </div>
    </div>
  );
}
