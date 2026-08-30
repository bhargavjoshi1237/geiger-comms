"use client";

// How much of the catalog a role reaches.

import { ALL_PERMISSION_KEYS } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { grantedCount, isOwnerRole } from "./utils";

export function CoverageBar({ role, className }) {
  const owner = isOwnerRole(role);
  const total = ALL_PERMISSION_KEYS.length;
  const granted = owner ? total : grantedCount(role);
  const pct = total ? Math.round((granted / total) * 100) : 0;

  return (
    <div className={cn("w-[150px] space-y-1.5", className)}>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-text-secondary">
        {owner ? "Every permission" : `${granted} of ${total} · ${pct}%`}
      </p>
    </div>
  );
}
