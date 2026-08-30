"use client";

// Non-functional visual preview of the Messenger widget (channels spec §5.1).
// Reflects launcherColor, greeting and position; it is a mock, not an embed.

import { MessageCircle } from "lucide-react";
import { cn } from "@geiger/ui";

export function MessengerPreview({ config = {} }) {
  const left = (config.position || "right") === "left";
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
        <span className="pointer-events-none -mt-8 mr-1 h-6 min-w-5 rounded-full bg-red-500/20 px-1.5 text-center text-[10px] font-bold leading-6 text-red-400">
          1
        </span>
        <span
          className="flex size-11 items-center justify-center rounded-full shadow-lg"
          style={{ backgroundColor: config.launcherColor || "#6366f1" }}
        >
          <MessageCircle className="size-5 text-white" />
        </span>
      </div>
    </div>
  );
}
