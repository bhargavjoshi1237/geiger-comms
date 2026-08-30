"use client";

// The shared Channels screen (channels spec §5.1): header + connect, one card
// list per configured channel with status/simulated badges and row actions,
// the declarative config form for the selected channel, and — for Messenger
// only — the widget preview and the Install section (messenger-widget §12).
// Config keys are flat on the channel view model; edits persist through
// updateChannel({ config }) on a short debounce.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, PlugZap, Trash2 } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { SecondaryScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  EmptyState,
  ScreenHeader,
  SectionCard,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import {
  countConversationsByChannel,
  createChannel,
  listChannelsByKind,
  softDeleteChannel,
  updateChannel,
} from "@/lib/supabase/channels";
import { getUser } from "@/lib/supabase/user";
import { CHANNEL_KIND_META, CHANNEL_STATUS_MAP } from "./constants";
import { ChannelConfigForm } from "./channel_config_form";
import { ConnectDialog } from "./connect_dialog";
import { InstallSection } from "./install_section";
import { MessengerPreview } from "./messenger_preview";

const SAVE_DEBOUNCE_MS = 600;

export function ChannelScreen({ kind }) {
  const meta = CHANNEL_KIND_META[kind];
  const isMessenger = kind === "messenger";

  const [channels, setChannels] = useState(null);
  const [counts, setCounts] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    listChannelsByKind({ kind }).then((rows) => {
      if (!active) return;
      setChannels(rows ?? []);
      setSelectedId((current) => current ?? rows?.[0]?.id ?? null);
    });
    countConversationsByChannel({}).then((map) => active && setCounts(map || {}));
    return () => {
      active = false;
    };
  }, [kind]);

  const selected = useMemo(
    () => channels?.find((c) => c.id === selectedId) ?? null,
    [channels, selectedId],
  );

  async function handleConnect({ name }) {
    const optimisticId = crypto.randomUUID();
    const user = await getUser();
    const optimistic = {
      id: optimisticId,
      kind,
      name,
      status: "disconnected",
      simulated: true,
      createdAt: new Date().toISOString(),
    };
    setChannels((prev) => [...(prev ?? []), optimistic]);
    setSelectedId(optimisticId);
    const created = await createChannel({
      id: optimisticId,
      kind,
      name,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      setChannels((prev) => (prev ?? []).filter((c) => c.id !== optimisticId));
      toast.error(`Couldn't create the ${meta.label.toLowerCase()} channel`);
      return;
    }
    setChannels((prev) => (prev ?? []).map((c) => (c.id === created.id ? created : c)));
    setSelectedId(created.id);
    toast.success(`${meta.label} channel created`);
  }

  const handleSaved = useCallback(
    (saved) => {
      setSaving(false);
      if (!saved) {
        toast.error("Couldn't save changes");
        return;
      }
      // normalizeChannel spreads config/metadata flat; fold the saved keys in.
      setChannels((prev) =>
        (prev ?? []).map((c) =>
          c.id === saved.id
            ? { ...c, ...(saved.config || {}), ...(saved.metadata || {}), name: saved.name }
            : c,
        ),
      );
    },
    [],
  );

  async function handleToggleStatus(channel) {
    const nextStatus = channel.status === "connected" ? "disconnected" : "connected";
    setChannels((prev) =>
      (prev ?? []).map((c) => (c.id === channel.id ? { ...c, status: nextStatus } : c)),
    );
    const saved = await updateChannel(channel.id, { status: nextStatus });
    if (!saved) {
      setChannels((prev) => (prev ?? []).map((c) => (c.id === channel.id ? channel : c)));
      toast.error("Couldn't update the connection");
      return;
    }
    toast.success(nextStatus === "connected" ? "Connected" : "Disconnected");
  }

  async function handleDelete(channel) {
    const previous = channels;
    setChannels((prev) => (prev ?? []).filter((c) => c.id !== channel.id));
    if (selectedId === channel.id) setSelectedId(null);
    const ok = await softDeleteChannel(channel.id);
    if (!ok) {
      setChannels(previous);
      toast.error("Couldn't delete the channel");
      return;
    }
    toast.success("Channel deleted");
  }

  const requiredField = meta.fields.find((f) => f.required);

  return (
    <SecondaryScreenWrapper>
      <ScreenHeader
        title={meta.label}
        description={meta.blurb}
        actions={
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setConnectOpen(true)}>
            <PlugZap className="size-3.5" /> Connect {meta.label}
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {channels === null ? (
          <SectionCard title="Connections">
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          </SectionCard>
        ) : channels.length === 0 ? (
          <SectionCard title="Connections">
            <EmptyState
              title={`No ${meta.label.toLowerCase()} channels yet`}
              description="Connect one to start configuring it."
              action={
                <Button type="button" size="sm" onClick={() => setConnectOpen(true)}>
                  Connect {meta.label}
                </Button>
              }
              className="py-10"
            />
          </SectionCard>
        ) : (
          <>
            <SectionCard title="Connections">
              <div className="divide-y divide-border">
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(channel.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedId(channel.id)}
                    className="flex cursor-pointer items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`truncate text-sm font-medium ${selectedId === channel.id ? "" : "opacity-90"}`}>
                          {channel.name}
                        </p>
                        <StatusPill status={channel.status} map={CHANNEL_STATUS_MAP} />
                        {channel.simulated ? (
                          <span className="rounded-full border border-border bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Simulated
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {meta.summary(channel) || "Not configured"}
                        {counts[channel.id] ? ` · ${counts[channel.id]} conversations` : ""}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${channel.name} actions`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => void handleToggleStatus(channel)}>
                          {channel.status === "connected" ? "Disconnect" : "Connect"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => void handleDelete(channel)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </SectionCard>

            {selected?.createdAt ? (
              <ConfigPanel
                key={selected.id}
                channel={selected}
                meta={meta}
                isMessenger={isMessenger}
                saving={saving}
                onSavingChange={setSaving}
                onSaved={handleSaved}
              />
            ) : null}

            {isMessenger && selected?.createdAt ? <InstallSection channel={selected} /> : null}
          </>
        )}
      </div>

      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        meta={meta}
        requiredField={requiredField}
        onConnect={handleConnect}
      />
    </SecondaryScreenWrapper>
  );
}

// Owns the editable draft for one selected channel; keyed by channel id so a
// different selection re-initialises without an effect.
function ConfigPanel({ channel, meta, isMessenger, saving, onSavingChange, onSaved }) {
  const [draft, setDraft] = useState(() => ({ ...channel }));
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(nextConfig) {
    setDraft((prev) => ({ ...prev, ...nextConfig }));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      onSavingChange(true);
      const saved = await updateChannel(channel.id, { config: nextConfig });
      onSaved(saved);
    }, SAVE_DEBOUNCE_MS);
  }

  return (
    <SectionCard title="Configuration" description={saving ? "Saving…" : "Changes save automatically."}>
      <ChannelConfigForm meta={meta} config={draft} onChange={onChange} />
      {isMessenger ? <MessengerPreview config={draft} /> : null}
    </SectionCard>
  );
}
