"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@geiger/ui";

// Wraps a disabled control so its reason still shows on hover and focus (disabled buttons get no pointer events).
export function Gated({ reason, children }) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
