"use client";

// The channel editor (channels spec §5.1): the suite editor frame — back link,
// title, status, right-hand section nav — over the per-kind config. Edits are
// optimistic and persist on a short debounce; the list screen owns the rows and
// receives every change through onUpdate.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EditorShell } from "@/components/internal/shared/editor_shell";
import { Button } from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { updateChannel } from "@/lib/supabase/channels";
import { CHANNEL_STATUS_MAP, configOf, formatDate } from "./constants";
import { NAV_GROUPS, SECTIONS } from "./channel_sections";

const SAVE_DEBOUNCE_MS = 600;

export function ChannelDetailScreen({
  channel,
  meta,
  conversationCount,
  onBack,
  onUpdate,
  onDelete,
}) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();
  const [form, setForm] = useState(channel);
  const [seedId, setSeedId] = useState(channel?.id);
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);

  // Re-seed when the editor swaps to a different channel (the events pattern —
  // adjusting state during render beats an effect that fires after a paint).
  if (channel && channel.id !== seedId) {
    setSeedId(channel.id);
    setForm(channel);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!channel) return null;

  const config = configOf(meta, form);

  // Fold a patch into the local view model, then persist it after the debounce.
  const persist = (patch, next) => {
    setForm(next);
    onUpdate?.(next);
    clearTimeout(timer.current);
    setSaving(true);
    timer.current = setTimeout(async () => {
      const saved = await updateChannel(channel.id, patch);
      setSaving(false);
      if (!saved) toast.error("Couldn't save changes");
    }, SAVE_DEBOUNCE_MS);
  };

  const handleName = (name) => persist({ name }, { ...form, name });

  const handleConfig = (nextConfig) =>
    persist({ config: nextConfig }, { ...form, ...nextConfig });

  // Status is a deliberate switch, not typing — write it straight through.
  const handleStatus = async (status) => {
    const previous = form;
    const next = { ...form, status };
    setForm(next);
    onUpdate?.(next);
    const saved = await updateChannel(channel.id, { status });
    if (!saved) {
      setForm(previous);
      onUpdate?.(previous);
      toast.error("Couldn't update the connection");
      return;
    }
    toast.success(status === "connected" ? "Connected" : "Disconnected");
  };

  const ActiveSection = SECTIONS[active] || SECTIONS.overview;

  return (
    <EditorShell
      back={{ label: meta.label, onClick: onBack }}
      title={form.name}
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
        saving ? (
          <span className="text-xs text-text-secondary">Saving…</span>
        ) : null
      }
      actions={
        <Button
          variant="outline"
          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
          onClick={() => setActive("advanced")}
        >
          Manage connection
        </Button>
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
        conversationCount={conversationCount}
        onName={handleName}
        onConfig={handleConfig}
        onStatus={handleStatus}
        onDelete={() => onDelete?.(form)}
      />
    </EditorShell>
  );
}

export default ChannelDetailScreen;
