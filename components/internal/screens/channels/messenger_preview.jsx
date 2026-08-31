"use client";

// Non-functional visual preview of the Messenger widget (channels spec §5.1).
// Reflects launcherColor, greeting and position; it is a mock, not an embed.

import { cn } from "@geiger/ui";
import { BrandBubble } from "@/components/widget/widget_primitives";

// Same rule the loader applies, so the preview shows the glyph colour the
// visitor will actually get for a given launcherColor.
function readableOn(hex) {
  const h = String(hex || "").replace("#", "");
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#161616";
  const l =
    (0.2126 * parseInt(full.slice(0, 2), 16) +
      0.7152 * parseInt(full.slice(2, 4), 16) +
      0.0722 * parseInt(full.slice(4, 6), 16)) /
    255;
  return l > 0.6 ? "#161616" : "#ffffff";
}

export function MessengerPreview({ config = {} }) {
  const left = (config.position || "right") === "left";
  const launcherColor = config.launcherColor || "#ffffff";
  return (
    <div
      className={cn(
        "relative h-56 overflow-hidden rounded-xl border border-border bg-surface-card",
        left ? "" : "",
      )}
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
        <span className="pointer-events-none -mt-8 mr-1 h-5 min-w-5 rounded-full bg-blue-500 px-1.5 text-center text-[10px] font-semibold leading-5 text-white">
          1
        </span>
        <span
          className="flex size-11 items-center justify-center rounded-full shadow-lg"
          style={{ backgroundColor: launcherColor, color: readableOn(launcherColor) }}
        >
          <BrandBubble size={22} />
        </span>
      </div>
    </div>
  );
}
