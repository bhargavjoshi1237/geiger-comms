"use client";

// Shared Channels list screen (spec §5.1), one per kind; selecting a row opens it in the URL (?channel=<id>) and swaps to the editor.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Copy,
  MessagesSquare,
  Pencil,
  PlugZap,
  RotateCw,
  Trash2,
  Unplug,
} from "lucide-react";
import {
  ActionMenu,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LogoLoading,
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
import { useOptionalProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { tabToSlug } from "@/lib/workspace/tabs";
import {
  countConversationsByChannel,
  createChannel,
  isSimulatedKind,
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
  isSimulated,
} from "./constants";
import { ConnectDialog } from "./connect_dialog";
import { ChannelDetailScreen, statusToast } from "./channel_detail";
import { SimulatedBadge } from "./simulated_badge";

// All Conversations reads ?channel=<id> as its channel filter (Inbox contract); same path schema as useWorkspaceUrl.
const CONVERSATIONS_TAB = "All Conversations";

function conversationsHref(projectId, channelId) {
  if (!projectId || !channelId) return null;
  return `/project/${projectId}/${tabToSlug(CONVERSATIONS_TAB)}?channel=${encodeURIComponent(channelId)}`;
}

export function ChannelScreen({ kind }) {
  const meta = CHANNEL_KIND_META[kind];
  // A live kind starts connected (disconnecting stops its widget or its email replies); simulated kinds start disconnected.
  const initialStatus = isSimulatedKind(kind) ? "disconnected" : "connected";
  const router = useRouter();
  const { projectId } = useOptionalProject() ?? {};
  const { channelId, openChannel, closeChannel } = useWorkspaceUrl();

  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [counts, setCounts] = useState({});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // null from the data layer is a failed read (error state); [] is a genuinely empty kind.
  useEffect(() => {
    let alive = true;
    listChannelsByKind({ projectId, kind }).then((rows) => {
      if (!alive) return;
      setChannels(rows ?? []);
      setLoadFailed(rows === null);
      setLoading(false);
    });
    countConversationsByChannel({ projectId }).then((map) => alive && setCounts(map || {}));
    return () => {
      alive = false;
    };
  }, [kind, projectId, reloadKey]);

  function retry() {
    setLoading(true);
    setLoadFailed(false);
    setReloadKey((k) => k + 1);
  }

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
        footer: `${connected} marked connected`,
      },
      {
        label: "Conversations",
        value: conversations.toLocaleString("en-US"),
        footer: `Linked to ${meta.label.toLowerCase()} channels`,
      },
      { label: "Needs attention", value: String(errored), footer: "In an error state" },
      {
        label: "Configured",
        value: String(channels.filter((c) => meta.summary(c)).length),
        footer: "With settings filled in",
      },
    ];
  }, [channels, counts, meta]);

  const viewConversations = (channel) => {
    const href = conversationsHref(projectId, channel.id);
    if (href) router.push(href, { scroll: false });
  };

  // Resolves true once persisted so the connect dialog can close; false keeps it open.
  async function handleConnect({ name, config }) {
    const optimisticId = crypto.randomUUID();
    const user = await getUser();
    const optimistic = {
      id: optimisticId,
      kind,
      name,
      status: initialStatus,
      projectId: projectId ?? null,
      createdAt: new Date().toISOString(),
      ...(config || {}),
      simulated: isSimulatedKind(kind),
    };
    setChannels((prev) => [...prev, optimistic]);
    const created = await createChannel({
      id: optimisticId,
      kind,
      name,
      status: initialStatus,
      config: config || {},
      projectId: projectId ?? null,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      setChannels((prev) => prev.filter((c) => c.id !== optimisticId));
      toast.error(`Couldn't create the ${meta.label.toLowerCase()} channel`);
      return false;
    }
    setChannels((prev) => prev.map((c) => (c.id === created.id ? created : c)));
    toast.success(`${meta.label} channel created`);
    openChannel(created.id);
    return true;
  }

  // The editor lifts every persisted edit back up so the list and the open row agree.
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
    statusToast(next, isSimulated(channel));
  }

  async function handleDuplicate(channel) {
    const optimisticId = crypto.randomUUID();
    const user = await getUser();
    const copy = {
      ...channel,
      id: optimisticId,
      name: `${channel.name} (copy)`,
      status: initialStatus,
      createdAt: new Date().toISOString(),
    };
    setChannels((prev) => [...prev, copy]);
    const created = await createChannel({
      id: optimisticId,
      kind,
      name: copy.name,
      status: initialStatus,
      config: Object.fromEntries(
        meta.fields.map((f) => [f.key, channel[f.key]]).filter(([, v]) => v !== undefined),
      ),
      projectId: projectId ?? null,
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
          <SimulatedBadge channel={c} />
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
            projectId && {
              icon: MessagesSquare,
              label: "View conversations",
              onSelect: () => viewConversations(c),
            },
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

  // Lives outside the list/editor branch so the editor's danger zone gets the same confirmation.
  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete channel</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>
            ? Existing conversations keep their history.
            {meta.deleteNote ? ` ${meta.deleteNote}` : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => handleDelete(deleteTarget)}>
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
          key={selected.id}
          channel={selected}
          meta={meta}
          conversationCount={counts[selected.id] || 0}
          conversationsHref={conversationsHref(projectId, selected.id)}
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

  let body;
  if (loading) {
    body = (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
        <LogoLoading size={48} aria-label={`Loading ${meta.label} channels`} />
      </div>
    );
  } else if (loadFailed) {
    body = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={AlertTriangle}
          title={`Couldn't load ${meta.label.toLowerCase()} channels`}
          description="Check your connection and try again."
          action={
            <Button
              variant="outline"
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={retry}
            >
              <RotateCw className="h-4 w-4" /> Retry
            </Button>
          }
        />
      </div>
    );
  } else {
    body = (
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
    );
  }

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

      {body}

      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        meta={meta}
        simulated={isSimulatedKind(kind)}
        requiredFields={meta.fields.filter((f) => f.required)}
        onConnect={handleConnect}
      />

      {deleteDialog}
    </MainScreenWrapper>
  );
}
