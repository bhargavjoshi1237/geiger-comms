"use client";

// Settings → AI Providers (knowledge-base-and-ai-providers spec §6): the workspace's own model providers, the default
// models, per-feature switches with daily limits, and usage. Comms ships no platform key — nothing here calls one.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Cpu, Eye, KeyRound, Layers, Lock, MessageSquare, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import { DataTable, EmptyState, ScreenHeader, SectionCard, StatsBar, StatusPill } from "@/components/internal/shared/screen_kit";
import { Notice } from "@/components/internal/shared/notice";
import { CAPABILITY_LABELS, hasCapability, providerKindLabel } from "@/lib/ai/provider_kinds";
import { PROVIDER_STATUS_MAP, formatRelativeTime } from "./constants";
import { useAiProviders } from "./ai/use_ai_providers";
import { ProviderDialog } from "./ai/provider_dialog";
import { DefaultModelsCard } from "./ai/default_models_card";
import { AiFeaturesCard } from "./ai/ai_features_card";
import { DataSharingDialog } from "./ai/data_sharing_dialog";
import { UsageCard } from "./ai/usage_card";

const PRIMARY = "bg-primary text-primary-foreground hover:bg-primary/90";

function KeyCell({ row }) {
  if (row.keyLast4) return <span className="font-mono text-xs text-text-secondary">•••• {row.keyLast4}</span>;
  if (row.hasKey) return <span className="text-xs text-text-secondary">Key saved</span>;
  return <span className="text-xs text-text-tertiary">No key</span>;
}

export function AiProvidersScreen() {
  const ai = useAiProviders();
  const { providers, status, usage, canManage } = ai;
  const [dialog, setDialog] = useState(null); // { mode: create | edit | rotate | view, provider }
  const [consentOpen, setConsentOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const stats = useMemo(() => {
    const connected = providers.filter((p) => p.status === "ok").length;
    const requests = usage?.totals?.requests ?? 0;
    const errors = usage?.totals?.errors ?? 0;
    return [
      { label: "Connected", value: String(connected), footer: `of ${providers.length} ${providers.length === 1 ? "provider" : "providers"}` },
      { label: "Chat model", value: status?.chat?.model || "—", footer: status?.chat?.model ? status.chat.providerName : "Not set" },
      { label: "Requests (30 days)", value: requests.toLocaleString("en-US") },
      { label: "Error rate (30 days)", value: requests ? `${((errors / requests) * 100).toFixed(1)}%` : "0%" },
    ];
  }, [providers, status, usage]);

  const closeDialog = (open) => {
    if (!open) setDialog(null);
  };

  // Opens consent here: the dialog's own close calls the closeDialog it captured before this save, which can't see new state.
  const submitProvider = async (payload, { retested }) => {
    const res =
      dialog.mode === "create"
        ? await ai.connect(payload)
        : await ai.save(dialog.provider.id, payload, { retested: dialog.mode === "rotate" || retested });
    if (res.ok && res.needsConsent) {
      setDialog(null);
      setConsentOpen(true);
    }
    return res.ok;
  };

  const makeDefault = async (row, capability) => {
    const res = await ai.makeDefault(row, capability);
    if (res.needsConsent) setConsentOpen(true);
  };

  const confirmConsent = async () => {
    const res = await ai.saveSettings({ acknowledgeDataSharing: true });
    if (res.ok) toast.success("Data sharing confirmed");
    return res.ok;
  };

  const confirmDelete = () => {
    const row = deleteTarget;
    setDeleteTarget(null);
    void ai.remove(row);
  };

  const connectButton = canManage ? (
    <Button className={PRIMARY} onClick={() => setDialog({ mode: "create", provider: null })}>
      <Plus className="h-4 w-4" /> Connect provider
    </Button>
  ) : null;

  const columns = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{row.name}</span>
          <span className="text-xs text-text-secondary">{providerKindLabel(row.provider, row.preset)}</span>
        </div>
      ),
    },
    {
      key: "capabilities",
      header: "Capabilities",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.capabilities.map((c) => (
            <Badge key={c} variant="neutral">
              {CAPABILITY_LABELS[c]}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: "key", header: "Key", render: (row) => <KeyCell row={row} /> },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill status={row.status} map={PROVIDER_STATUS_MAP} />
          {row.status === "error" && row.lastError?.message ? (
            <span className="line-clamp-2 max-w-56 text-xs text-red-400">{row.lastError.message}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "models",
      header: "Chat models",
      render: (row) =>
        row.models.length ? (
          <div className="flex max-w-xs flex-wrap items-center gap-1">
            {row.models.slice(0, 3).map((m) => (
              <Badge key={m} variant="neutral">
                {m}
              </Badge>
            ))}
            {row.models.length > 3 ? <span className="text-xs text-text-tertiary">+{row.models.length - 3}</span> : null}
          </div>
        ) : (
          <span className="text-xs text-text-tertiary">—</span>
        ),
    },
    {
      key: "usedFor",
      header: "Used for",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {status?.chat?.providerId === row.id ? <Badge variant="info">Default chat</Badge> : null}
          {status?.embed?.providerId === row.id ? <Badge variant="purple">Default embeddings</Badge> : null}
        </div>
      ),
    },
    {
      key: "requests",
      header: "Requests (30d)",
      align: "right",
      render: (row) => <span className="tabular-nums text-text-secondary">{(row.usage30d?.requests ?? 0).toLocaleString("en-US")}</span>,
    },
    {
      key: "lastChecked",
      header: "Last checked",
      render: (row) => <span className="text-xs text-text-secondary">{formatRelativeTime(row.lastCheckedAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => {
        const testing = ai.testingId === row.id;
        const items = canManage
          ? [
              { icon: RefreshCw, label: testing ? "Testing…" : "Test connection", onSelect: () => ai.test(row), disabled: testing, spin: testing },
              { icon: Pencil, label: "Edit", onSelect: () => setDialog({ mode: "edit", provider: row }) },
              { icon: KeyRound, label: "Rotate key", onSelect: () => setDialog({ mode: "rotate", provider: row }) },
              hasCapability(row, "chat") && status?.chat?.providerId !== row.id && {
                icon: MessageSquare,
                label: "Use for chat",
                onSelect: () => makeDefault(row, "chat"),
              },
              hasCapability(row, "embed") && status?.embed?.providerId !== row.id && {
                icon: Layers,
                label: "Use for embeddings",
                onSelect: () => makeDefault(row, "embed"),
              },
              { separator: true },
              { icon: Trash2, label: "Delete", variant: "destructive", onSelect: () => setDeleteTarget(row) },
            ]
          : [{ icon: Eye, label: "View details", onSelect: () => setDialog({ mode: "view", provider: row }) }];
        return <ActionMenu label={`Actions for ${row.name}`} items={items} />;
      },
    },
  ];

  let content;
  if (!ai.canView) {
    content = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState icon={Lock} title="No Access To AI Providers" description="You don't have access to AI Providers — ask a workspace admin." />
      </div>
    );
  } else if (ai.loading) {
    content = (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
        <LogoLoading size={48} aria-label="Loading providers" />
      </div>
    );
  } else if (ai.failed) {
    content = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't Load Providers"
          description="Something went wrong reading this workspace's AI providers."
          action={
            <Button variant="outline" className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground" onClick={ai.retry}>
              Retry
            </Button>
          }
        />
      </div>
    );
  } else if (!providers.length) {
    content = (
      <div className="rounded-xl border border-border bg-surface-subtle">
        <EmptyState
          icon={Cpu}
          title="No AI Providers Yet"
          description={`Connect OpenAI, Anthropic, Google or any OpenAI-compatible endpoint to turn on AI drafting, translation and knowledge-gap clustering.${canManage ? "" : " Ask a workspace admin to connect one."}`}
          action={connectButton}
        />
      </div>
    );
  } else {
    content = (
      <>
        <StatsBar stats={stats} />
        <SectionCard title="Providers" bodyPadding={false}>
          <DataTable columns={columns} data={providers} getRowKey={(row) => row.id} className="rounded-none border-0" />
        </SectionCard>
        <DefaultModelsCard
          status={status}
          providers={providers}
          canManage={canManage}
          saveSettings={ai.saveSettings}
          detectDims={ai.detectDims}
          reindexing={ai.reindexing}
          onReindex={ai.reindex}
          onNeedsConsent={() => setConsentOpen(true)}
        />
        <AiFeaturesCard status={status} canManage={canManage} saveSettings={ai.saveSettings} onReviewConsent={() => setConsentOpen(true)} />
        <UsageCard usage={usage} loading={ai.usageLoading} />
      </>
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="AI Providers"
        description="Connect your own model providers. Comms calls them with your keys — your vendor bills you directly. Keys are encrypted in Supabase Vault and only the last four characters are ever shown."
        actions={ai.canView && !ai.loading ? connectButton : null}
      />

      {ai.canView && !canManage ? (
        <Notice>You can see these providers. Connecting or changing them needs the Manage settings permission.</Notice>
      ) : null}

      {content}

      <ProviderDialog
        open={Boolean(dialog)}
        mode={dialog?.mode}
        provider={dialog?.provider}
        localProvidersAllowed={Boolean(status?.localProvidersAllowed)}
        onOpenChange={closeDialog}
        onSubmit={submitProvider}
        onFetchModels={ai.fetchModels}
      />

      <DataSharingDialog
        open={consentOpen}
        providerName={status?.chat?.providerName || status?.embed?.providerName}
        onOpenChange={setConsentOpen}
        onConfirm={confirmConsent}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              Features using it as a default turn off until you choose another provider, and its key is erased from Vault.
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
    </MainScreenWrapper>
  );
}

export default AiProvidersScreen;
