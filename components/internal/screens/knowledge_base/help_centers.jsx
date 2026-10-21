"use client";

// Help Centers (KB spec §10.2). Comms serves no help-center website yet (§10.1): the default center's live state,
// visibility, collections and placements drive the Messenger's Help space; everything else shows in Preview only.

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  EyeOff,
  Pencil,
  Plus,
  Radio,
  RotateCw,
  Star,
  Trash2,
} from "lucide-react";
import {
  ActionMenu,
  Badge,
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
  DataTable,
  EmptyState,
  ScreenHeader,
  StatsBar,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { Notice } from "@/components/internal/shared/notice";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  HELP_CENTER_STATUS_MAP,
  NEEDS_PUBLISH,
  VISIBILITY_MAP,
  formatRelative,
  localeLabel,
} from "./constants";
import { useHelpCenters } from "./use_help_centers";
import { HelpCenterDetailScreen } from "./help_center_detail";
import { NewHelpCenterDialog } from "./new_help_center_dialog";
import { Gated } from "@/components/internal/shared/gated";

const OUTLINE_ACTION =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

export function HelpCentersScreen() {
  const hc = useHelpCenters();
  const { centerId, openCenter, closeCenter } = useWorkspaceUrl();
  const [creating, setCreating] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const open = centerId ? hc.centers.find((c) => c.id === centerId) ?? null : null;

  const stats = useMemo(() => {
    const locales = new Set(hc.centers.flatMap((c) => c.locales));
    const inMessenger = hc.sources.filter((a) => a.visibleInMessenger).length;
    return [
      { label: "Help centers", value: String(hc.centers.length), footer: "Website not served yet" },
      { label: "Live", value: String(hc.centers.filter((c) => c.isLive).length), footer: "Set live in each center" },
      { label: "Articles in the Messenger", value: String(inMessenger), footer: "From your default help center" },
      { label: "Languages", value: String(locales.size), footer: "Across all help centers" },
    ];
  }, [hc.centers, hc.sources]);

  function startCreate() {
    setDialogKey((k) => k + 1);
    setCreating(true);
  }

  async function confirmDelete() {
    const center = deleteTarget;
    setDeleteTarget(null);
    if (centerId === center.id) closeCenter();
    await hc.removeCenter(center);
  }

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(next) => !next && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete help center</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{deleteTarget?.name || "this help center"}</span>?
            Its collections are deleted and its articles are removed from this help center. The articles themselves
            are kept.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (open) {
    return (
      <>
        <HelpCenterDetailScreen key={open.id} center={open} hc={hc} onBack={closeCenter} onDelete={setDeleteTarget} />
        {deleteDialog}
      </>
    );
  }

  const newButton = (
    <Gated reason={hc.canPublish ? null : NEEDS_PUBLISH}>
      <Button
        className="bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={!hc.canPublish}
        onClick={startCreate}
      >
        <Plus className="h-4 w-4" /> New help center
      </Button>
    </Gated>
  );

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (center) => (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{center.name || "Untitled help center"}</span>
            {center.isDefault ? <Badge variant="info">Default</Badge> : null}
            <Badge variant="neutral">Website not served</Badge>
          </div>
          <span className="font-mono text-xs text-text-secondary">{center.domain || center.slug || "—"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (center) => (
        <StatusPill status={center.isLive ? "live" : "not_live"} map={HELP_CENTER_STATUS_MAP} />
      ),
    },
    {
      key: "visibility",
      header: "Visibility",
      render: (center) => <StatusPill status={center.visibility} map={VISIBILITY_MAP} />,
    },
    {
      key: "brand",
      header: "Brand",
      render: (center) => (
        <span className="text-sm text-text-secondary">{hc.brandsById[center.brandId]?.name || "—"}</span>
      ),
    },
    {
      key: "languages",
      header: "Languages",
      render: (center) => (
        <div className="flex flex-wrap gap-1">
          {center.locales.map((l) => (
            <Badge key={l} variant="neutral" title={localeLabel(l)}>
              {l}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "articles",
      header: "Articles",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (center) => hc.statsOf(center).published.toLocaleString("en-US"),
    },
    {
      key: "collections",
      header: "Collections",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (center) => hc.statsOf(center).collections.toLocaleString("en-US"),
    },
    {
      key: "updated",
      header: "Updated",
      render: (center) => <span className="text-sm text-text-secondary">{formatRelative(center.updatedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (center) => (
        <ActionMenu
          label={`Actions for ${center.name || "help center"}`}
          items={[
            { icon: Pencil, label: hc.canPublish ? "Edit" : "View", onSelect: () => openCenter(center.id) },
            !center.isDefault && {
              icon: Star,
              label: "Set as default",
              disabled: !hc.canPublish,
              onSelect: () => hc.setDefault(center),
            },
            {
              icon: center.isLive ? EyeOff : Radio,
              label: center.isLive ? "Set not live" : "Set live",
              disabled: !hc.canPublish,
              onSelect: () => hc.setLive(center, !center.isLive),
            },
            { separator: true },
            {
              icon: Trash2,
              label: center.isDefault ? "Delete (make another default first)" : "Delete",
              variant: "destructive",
              disabled: center.isDefault || !hc.canPublish,
              onSelect: () => setDeleteTarget(center),
            },
          ]}
        />
      ),
    },
  ];

  let body;
  if (hc.loading) {
    body = (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
        <LogoLoading size={48} aria-label="Loading help centers" />
      </div>
    );
  } else if (hc.loadFailed) {
    body = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't Load Help Centers"
          description="Check your connection and try again."
          action={
            <Button variant="outline" className={OUTLINE_ACTION} onClick={hc.retry}>
              <RotateCw className="h-4 w-4" /> Retry
            </Button>
          }
        />
      </div>
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        data={hc.centers}
        getRowKey={(center) => center.id}
        onRowClick={(center) => openCenter(center.id)}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            <EmptyState
              icon={BookOpen}
              title="No Help Centers Yet"
              description="A help center groups your articles into collections for the Messenger's Help space."
              action={newButton}
            />
          </div>
        }
      />
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Help Centers"
        description="Organize published articles into collections. Articles in your default help center appear in the Messenger's Help space while it is live and public."
        actions={newButton}
      />

      {!hc.canPublish && !hc.loading ? (
        <Notice>You can see these help centers. Changing them needs the Publish articles permission.</Notice>
      ) : null}

      <StatsBar stats={stats} />

      {body}

      <NewHelpCenterDialog
        key={dialogKey}
        open={creating}
        onOpenChange={setCreating}
        centers={hc.centers}
        brands={hc.brands}
        onCreate={hc.createCenter}
      />

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default HelpCentersScreen;
