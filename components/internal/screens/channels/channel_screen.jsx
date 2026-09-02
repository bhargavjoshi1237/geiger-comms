"use client";

// The shared Channels list screen (channels spec §5.1), one per kind. Follows
// the suite list pattern: header + connect, KPI bar, toolbar filters, a
// DataTable of connections and pagination. Selecting a row opens the channel in
// the URL (?channel=<id>) and swaps to the full-page editor — configuration
// never happens inline on the list.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Pencil, PlugZap, Trash2, Unplug } from "lucide-react";
import {
  ActionMenu,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  countConversationsByChannel,
  createChannel,
  listChannelsByKind,
  softDeleteChannel,
  updateChannel,
} from "@/lib/supabase/channels";
import { getUser } from "@/lib/supabase/user";
import {
  CHANNEL_KIND_META,
  CHANNEL_STATUS_FILTER_OPTIONS,
  CHANNEL_STATUS_MAP,
  formatDate,
} from "./constants";
import { ConnectDialog } from "./connect_dialog";
import { ChannelDetailScreen } from "./channel_detail";

export function ChannelScreen({ kind }) {
  const meta = CHANNEL_KIND_META[kind];
  const { channelId, openChannel, closeChannel } = useWorkspaceUrl();

  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    listChannelsByKind({ kind }).then((rows) => {
      if (!alive) return;
      setChannels(rows ?? []);
      setLoading(false);
    });
    countConversationsByChannel({}).then((map) => alive && setCounts(map || {}));
    return () => {
      alive = false;
    };
  }, [kind]);

  const selected = useMemo(
    () => (channelId ? channels.find((c) => c.id === channelId) || null : null),
    [channelId, channels],
  );

  const filtered = useMemo(
    () =>
      channels.filter((c) => {
        if (status !== "all" && c.status !== status) return false;
        if (
          search &&
          !`${c.name} ${meta.summary(c)}`.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [channels, search, status, meta],
  );

  const pager = usePagination(filtered, { resetKey: `${search}|${status}` });

  const stats = useMemo(() => {
    const connected = channels.filter((c) => c.status === "connected").length;
    const errored = channels.filter((c) => c.status === "error").length;
    const conversations = channels.reduce((n, c) => n + (counts[c.id] || 0), 0);
    return [
      {
        label: "Connections",
        value: String(channels.length),
        footer: `${connected} connected`,
      },
      {
        label: "Conversations",
        value: conversations.toLocaleString("en-US"),
        footer: `Across all ${meta.label.toLowerCase()} channels`,
      },
      { label: "Needs attention", value: String(errored), footer: "In an error state" },
      {
        label: "Configured",
        value: String(channels.filter((c) => meta.summary(c)).length),
        footer: "With settings filled in",
      },
    ];
  }, [channels, counts, meta]);

  async function handleConnect({ name, config }) {
    const optimisticId = crypto.randomUUID();
    const user = await getUser();
    const optimistic = {
      id: optimisticId,
      kind,
      name,
      status: "disconnected",
      simulated: true,
      createdAt: new Date().toISOString(),
      ...(config || {}),
    };
    setChannels((prev) => [...prev, optimistic]);
    const created = await createChannel({
      id: optimisticId,
      kind,
      name,
      config: config || {},
      createdBy: user?.id ?? null,
    });
    if (!created) {
      setChannels((prev) => prev.filter((c) => c.id !== optimisticId));
      toast.error(`Couldn't create the ${meta.label.toLowerCase()} channel`);
      return;
    }
    setChannels((prev) => prev.map((c) => (c.id === created.id ? created : c)));
    toast.success(`${meta.label} channel created`);
    openChannel(created.id);
  }

  // The editor lifts every edit back up so the list and the open row agree.
  const handleUpdate = (updated) =>
    setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

  async function handleToggleStatus(channel) {
    const next = channel.status === "connected" ? "disconnected" : "connected";
    setChannels((prev) =>
      prev.map((c) => (c.id === channel.id ? { ...c, status: next } : c)),
    );
    const saved = await updateChannel(channel.id, { status: next });
    if (!saved) {
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? channel : c)));
      toast.error("Couldn't update the connection");
      return;
    }
    toast.success(next === "connected" ? "Connected" : "Disconnected");
  }

  async function handleDuplicate(channel) {
    const optimisticId = crypto.randomUUID();
    const user = await getUser();
    const copy = {
      ...channel,
      id: optimisticId,
      name: `${channel.name} (copy)`,
      status: "disconnected",
      createdAt: new Date().toISOString(),
    };
    setChannels((prev) => [...prev, copy]);
    const created = await createChannel({
      id: optimisticId,
      kind,
      name: copy.name,
      config: Object.fromEntries(
        meta.fields.map((f) => [f.key, channel[f.key]]).filter(([, v]) => v !== undefined),
      ),
      createdBy: user?.id ?? null,
    });
    if (!created) {
      setChannels((prev) => prev.filter((c) => c.id !== optimisticId));
      toast.error("Couldn't duplicate the channel");
      return;
    }
    setChannels((prev) => prev.map((c) => (c.id === created.id ? created : c)));
    toast.success(`Duplicated "${channel.name}".`);
  }

  async function handleDelete(channel) {
    setDeleteTarget(null);
    const previous = channels;
    setChannels((prev) => prev.filter((c) => c.id !== channel.id));
    if (channelId === channel.id) closeChannel();
    const ok = await softDeleteChannel(channel.id);
    if (!ok) {
      setChannels(previous);
      toast.error("Couldn't delete the channel");
      return;
    }
    toast.success(`Deleted "${channel.name}".`);
  }

  const columns = [
    {
      key: "name",
      header: meta.label,
      render: (c) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{c.name}</span>
          <span className="text-xs text-text-secondary">
            {meta.summary(c) || "Not configured"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <div className="flex items-center gap-2">
          <StatusPill status={c.status} map={CHANNEL_STATUS_MAP} />
          {c.simulated === false ? null : (
            <span className="rounded-full border border-border bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Simulated
            </span>
          )}
        </div>
      ),
    },
    {
      key: "conversations",
      header: "Conversations",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (c) => (counts[c.id] || 0).toLocaleString("en-US"),
    },
    {
      key: "created",
      header: "Added",
      render: (c) => (
        <span className="text-sm text-text-secondary">
          {formatDate(c.createdAt) || "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (c) => (
        <ActionMenu
          label={`Actions for ${c.name}`}
          items={[
            { icon: Pencil, label: "Edit", onSelect: () => openChannel(c.id) },
            {
              icon: c.status === "connected" ? Unplug : PlugZap,
              label: c.status === "connected" ? "Disconnect" : "Connect",
              onSelect: () => handleToggleStatus(c),
            },
            { icon: Copy, label: "Duplicate", onSelect: () => handleDuplicate(c) },
            { separator: true },
            {
              icon: Trash2,
              label: "Delete",
              variant: "destructive",
              onSelect: () => setDeleteTarget(c),
            },
          ]}
        />
      ),
    },
  ];

  // Confirmation lives outside the list/editor branch so the editor's danger
  // zone gets the same dialog the row action does.
  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete channel</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>
            ? Existing conversations keep their history, but nothing new will route in.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={() => handleDelete(deleteTarget)}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (selected) {
    return (
      <>
        <ChannelDetailScreen
          channel={selected}
          meta={meta}
          conversationCount={counts[selected.id] || 0}
          onBack={closeChannel}
          onUpdate={handleUpdate}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const connectButton = (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={() => setConnectOpen(true)}
    >
      <PlugZap className="h-4 w-4" /> Connect {meta.label}
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader title={meta.label} description={meta.blurb} actions={connectButton} />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown
            value={status}
            onValueChange={setStatus}
            options={CHANNEL_STATUS_FILTER_OPTIONS}
            height="h-9"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={`Search ${meta.label.toLowerCase()} channels…`}
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-6 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading {meta.label} channels…
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(c) => c.id}
            onRowClick={(c) => openChannel(c.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={meta.icon}
                  title={
                    channels.length
                      ? "No channels match your filters"
                      : `No ${meta.label.toLowerCase()} channels yet`
                  }
                  description={
                    channels.length
                      ? "Try clearing the search or status filter."
                      : "Connect one to start configuring it."
                  }
                  action={connectButton}
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="channels" />
        </div>
      )}

      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        meta={meta}
        requiredField={meta.fields.find((f) => f.required)}
        onConnect={handleConnect}
      />

      {deleteDialog}
    </MainScreenWrapper>
  );
}
