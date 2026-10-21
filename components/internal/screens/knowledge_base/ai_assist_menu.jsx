"use client";

// The editor header's AI menu (KB spec §9.6). Every item opens the suggestion dialog; nothing applies silently.
// Translate lives in the Translations section instead, so a translation can never overwrite the source.

import { Sparkles } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { AiUnavailableNotice } from "@/components/internal/shared/ai_unavailable";
import { featureAvailability } from "@/lib/ai/features";
import { ASSIST_LABELS } from "./ai_suggestion_dialog";

const OUTLINE = "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";
const ITEM = "cursor-pointer";

export function AiAssistMenu({ status, loading, bodyEmpty, onRun }) {
  const off = loading || !featureAvailability(status, "articleAssist").available;
  const item = (action, options) => (
    <DropdownMenuItem className={ITEM} disabled={off} onSelect={() => onRun(action, options)}>
      {ASSIST_LABELS[action]}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={OUTLINE}>
          <Sparkles className="h-4 w-4" /> AI
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 border-border bg-surface-subtle">
        {off && !loading ? (
          <>
            <div className="px-2 py-1.5">
              <AiUnavailableNotice status={status} feature="articleAssist" compact />
            </div>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {bodyEmpty ? item("draft") : null}
        {item("improve")}
        {item("shorten")}
        {item("expand")}
        {item("fix")}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={ITEM} disabled={off}>
            Change tone
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="border-border bg-surface-subtle">
            <DropdownMenuItem className={ITEM} onSelect={() => onRun("tone", { tone: "friendly" })}>
              Friendly
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onSelect={() => onRun("tone", { tone: "formal" })}>
              Formal
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {item("description")}
        {item("titles")}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AiAssistMenu;
