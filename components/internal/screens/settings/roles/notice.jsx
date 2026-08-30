"use client";

import { Info } from "lucide-react";

export function Notice({ icon: Icon = Info, children }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-card px-3.5 py-2.5 text-xs leading-relaxed text-text-secondary">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
      <p>{children}</p>
    </div>
  );
}
