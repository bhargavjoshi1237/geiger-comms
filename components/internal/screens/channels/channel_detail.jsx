"use client";

// Channel editor (spec §5.1): edits are optimistic and debounce-persist, roll back on a failed save, and never save while a required field is blank.

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, MessagesSquare } from "lucide-react";

import { EditorShell } from "@/components/internal/shared/editor_shell";
import { Button } from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { updateChannel } from "@/lib/supabase/channels";
import {
  CHANNEL_STATUS_MAP,
  configOf,
  formatDate,
  isSimulated,
  missingRequired,
} from "./constants";
import { NAV_GROUPS, SECTIONS } from "./channel_sections";
import { SimulatedBadge } from "./simulated_badge";

const SAVE_DEBOUNCE_MS = 600;

const OUTLINE_ACTION =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

// Status-flip toast; simulated channels say so rather than claim a real connection.
export function statusToast(status, simulated) {
  const label = status === "connected" ? "Marked as connected" : "Marked as disconnected";
  return simulated
    ? toast.success(label, { description: "Simulated — nothing is received from or sent to the provider." })
    : toast.success(label);
}

// The parent keys this by channel id, so switching channels remounts with fresh state.
export function ChannelDetailScreen({
  channel,
  meta,
  conversationCount,
  conversationsHref,
  onBack,
  onUpdate,
  onDelete,
}) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();
  const [form, setForm] = useState(channel);
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);
  const pending = useRef(null); // merged patch not yet persisted
  const lastSaved = useRef(channel); // rollback target: what the DB last confirmed

  const missing = missingRequired(meta, form);

  // Persist the accumulated patch; success lifts the saved row to the list, failure reverts to the last saved row.
  async function flush() {
    const patch = pending.current;
    pending.current = null;
    if (!patch) return;
    const saved = await updateChannel(channel.id, patch);
    if (saved) {
      lastSaved.current = saved;
      onUpdate?.(saved);
      setForm((f) => ({ ...f, simulated: saved.simulated })); // the data layer owns the §1.1 flag
      if (!pending.current) setSaving(false);
      return;
    }
    clearTimeout(timer.current);
    pending.current = null;
    setForm(lastSaved.current);
    setSaving(false);
    toast.error("Couldn't save changes — reverted to the last saved version");
  }

  // Leaving with a debounce in flight saves it now, unless a required field is blank.
  const flushOnLeave = useEffectEvent(() => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    if (missingRequired(meta, form).length) {
      pending.current = null;
      toast.error("Unsaved changes discarded — required fields were empty");
      return;
    }
    void flush();
  });

  useEffect(() => () => flushOnLeave(), []);

  if (!channel) return null;

  const config = configOf(meta, form);

  // Fold a patch into the local view model and debounce the save; a blank required field holds it.
  const persist = (patch, next) => {
    setForm(next);
    pending.current = { ...pending.current, ...patch };
    clearTimeout(timer.current);
    if (missingRequired(meta, next).length) {
      setSaving(false);
      return;
    }
    setSaving(true);
    timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  };

  const handleName = (name) => persist({ name }, { ...form, name });

  const handleConfig = (nextConfig) =>
    persist({ config: nextConfig }, { ...form, ...nextConfig });

  // Status is a deliberate switch, not typing — write it straight through.
  const handleStatus = async (status) => {
    const previous = form.status;
    setForm((f) => ({ ...f, status }));
    const saved = await updateChannel(channel.id, { status });
    if (!saved) {
      setForm((f) => ({ ...f, status: previous }));
      toast.error("Couldn't update the connection");
      return;
    }
    lastSaved.current = saved;
    onUpdate?.(saved);
    statusToast(status, isSimulated(form));
  };

  const ActiveSection = SECTIONS[active] || SECTIONS.overview;

  let saveState = null;
  if (missing.length) {
    saveState = (
      <span className="text-xs text-red-400">Not saved — fill in the required fields</span>
    );
  } else if (saving) {
    saveState = (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Saving…
      </span>
    );
  }

  return (
    <EditorShell
      back={{ label: meta.label, onClick: onBack }}
      title={form.name || "Untitled channel"}
      status={form.status}
      statusMap={CHANNEL_STATUS_MAP}
      meta={
        [
          meta.summary(form) || "Not configured",
          conversationCount ? `${conversationCount} conversations` : null,
          formatDate(form.createdAt) ? `Added ${formatDate(form.createdAt)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      }
      badges={
        isSimulated(form) || saveState ? (
          <>
            <SimulatedBadge channel={form} />
            {saveState}
          </>
        ) : null
      }
      actions={
        <>
          {conversationsHref ? (
            <Button asChild variant="outline" className={OUTLINE_ACTION}>
              <Link href={conversationsHref} scroll={false}>
                <MessagesSquare className="h-4 w-4" /> View conversations
              </Link>
            </Button>
          ) : null}
          <Button
            variant="outline"
            className={OUTLINE_ACTION}
            onClick={() => setActive("advanced")}
          >
            Manage connection
          </Button>
        </>
      }
      nav={NAV_GROUPS}
      subject={form}
      active={active}
      onActiveChange={setActive}
    >
      <ActiveSection
        channel={form}
        meta={meta}
        config={config}
        errors={missing}
        conversationCount={conversationCount}
        conversationsHref={conversationsHref}
        onName={handleName}
        onConfig={handleConfig}
        onStatus={handleStatus}
        onDelete={() => onDelete?.(form)}
      />
    </EditorShell>
  );
}

export default ChannelDetailScreen;
