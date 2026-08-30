"use client";

// Shared card shell + header row every Overview widget renders inside.

import { Card, CardContent } from "@geiger/ui";
import { cn } from "@/lib/utils";

export function WidgetShell({ children, className, contentClassName }) {
  return (
    <Card
      className={cn(
        "bg-surface-subtle border-border text-foreground rounded-xl py-0 gap-0 overflow-hidden h-full",
        className,
      )}
    >
      <CardContent className={cn("p-4 h-full", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function WidgetHeader({ title, subtitle, action }) {
  return (
    <div className="flex w-full items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
