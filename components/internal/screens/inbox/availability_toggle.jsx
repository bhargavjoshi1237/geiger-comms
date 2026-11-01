"use client";

// The signed-in teammate's availability, which auto-assignment reads: offline gets nothing new, away only during office hours.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { cn } from "@/lib/utils";
import { useOptionalProject } from "@/context/project-context";
import { getCurrentTeammate, setAvailability } from "@/lib/supabase/teammates";
import { AVAILABILITY_MAP } from "../automation/constants";

const DESCRIPTIONS = {
  available: "Gets new conversations",
  away: "Gets new conversations only during your office hours",
  offline: "Gets no new conversations",
};

export function AvailabilityToggle({ className }) {
  const { projectId } = useOptionalProject() ?? {};
  const [me, setMe] = useState(null);

  useEffect(() => {
    let alive = true;
    getCurrentTeammate({ projectId }).then((row) => {
      if (alive) setMe(row);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (!me) return null;
  const current = AVAILABILITY_MAP[me.availability] ? me.availability : "available";

  async function choose(next) {
    if (next === current) return;
    const previous = me;
    setMe({ ...me, availability: next });
    const saved = await setAvailability(me.id, next);
    if (!saved) {
      setMe(previous);
      toast.error("Couldn't change your availability.");
      return;
    }
    toast.success(`You're ${AVAILABILITY_MAP[next].label.toLowerCase()}.`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground", className)}
          aria-label={`Availability: ${AVAILABILITY_MAP[current].label}`}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", AVAILABILITY_MAP[current].dotClass)} />
          {AVAILABILITY_MAP[current].label}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 border-border bg-surface-subtle">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Your availability
        </DropdownMenuLabel>
        {Object.entries(AVAILABILITY_MAP).map(([value, a]) => (
          <DropdownMenuItem key={value} className="items-start gap-2 text-xs" onClick={() => void choose(value)}>
            <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", a.dotClass)} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-foreground">{a.label}</span>
              <span className="block text-text-secondary">{DESCRIPTIONS[value]}</span>
            </span>
            {value === current ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AvailabilityToggle;
