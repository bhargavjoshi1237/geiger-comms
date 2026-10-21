"use client";

// The thread header's SLA countdown; re-read whenever status, assignee, priority or first response changes (the trigger restarts it).

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { getConversationSla } from "@/lib/supabase/sla_policies";
import { formatMinutes } from "../automation/constants";

const TONE = {
  ok: "bg-surface-strong text-muted-foreground",
  warn: "bg-amber-400/10 text-amber-300",
  late: "bg-red-400/10 text-red-300",
};

export function SlaTimer({ conversation, className }) {
  const [loaded, setLoaded] = useState({ id: null, sla: null });
  const [now, setNow] = useState(() => Date.now());

  const id = conversation?.id;
  const status = conversation?.status;
  useEffect(() => {
    let alive = true;
    if (!id) return undefined;
    getConversationSla(id).then((sla) => {
      if (alive) setLoaded({ id, sla });
    });
    return () => {
      alive = false;
    };
  }, [id, status, conversation?.assigneeId, conversation?.priority, conversation?.firstResponseAt]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Never show the previous conversation's clock while the next one loads.
  const sla = loaded.id === id ? loaded.sla : null;
  if (!sla || sla.state === "none" || status === "Closed") return null;

  const firstPending = !sla.firstResponseAt && !conversation?.firstResponseAt && sla.firstResponseDueAt;
  const target = firstPending
    ? { label: "First response", due: Date.parse(sla.firstResponseDueAt) }
    : sla.resolutionDueAt
      ? { label: "Resolution", due: Date.parse(sla.resolutionDueAt) }
      : null;
  if (!target || !Number.isFinite(target.due)) return null;

  const mins = Math.round((target.due - now) / 60_000);
  const paused = sla.state === "paused";
  const late = !paused && (sla.state === "breached" || mins <= 0);
  const text = paused
    ? "SLA paused"
    : late
      ? `${target.label} overdue${mins < 0 ? ` ${formatMinutes(-mins)}` : ""}`
      : `${target.label} in ${formatMinutes(Math.max(mins, 1))}`;
  const tone = paused ? TONE.ok : late ? TONE.late : sla.state === "approaching" ? TONE.warn : TONE.ok;
  const dueLabel = new Date(target.due).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium",
        tone,
        className,
      )}
      title={`${sla.policyName || "SLA"} · ${target.label} due ${dueLabel}${paused ? " (paused while snoozed)" : ""}`}
    >
      <Timer className="size-[11px]" strokeWidth={2.4} />
      {text}
    </span>
  );
}

export default SlaTimer;
