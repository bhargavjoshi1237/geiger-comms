"use client";

// Workflows (ported from geiger-events All Workflows): KPI bar, status/trigger filters and search over comms.workflows. Row click opens the builder (?workflow=<id>).

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  LayoutTemplate,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  Workflow as WorkflowIcon,
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
  Input,
  LogoLoading,
} from "@geiger/ui";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ListPagination, usePagination } from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  Field,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import { Gated } from "@/components/internal/shared/gated";
import { Notice } from "@/components/internal/shared/notice";
import FilterDropdown from "../overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  createWorkflow,
  listWorkflows,
  softDeleteWorkflow,
  updateWorkflow,
} from "@/lib/supabase/workflows";
import { getUser } from "@/lib/supabase/user";

import {
  MANAGE_PERMISSION,
  NEEDS_MANAGE_WORKFLOWS,
  WORKFLOW_STATUS_FILTER_OPTIONS,
  WORKFLOW_STATUS_MAP,
  formatDate,
  formatDateTime,
} from "./constants";
import {
  TRIGGER_FILTER_OPTIONS,
  catalogEntry,
  defaultConfig,
  stepCountLabel,
} from "./workflow_catalog";
import { TriggerSelect } from "./step_list";
import { WorkflowBuilderScreen } from "./workflow_builder";

const EMPTY_DRAFT = { name: "", trigger: "created" };

const newStepId = () => `step_${crypto.randomUUID()}`;

function CreateWorkflowDialog({ open, onOpenChange, onCreate }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const trigger = catalogEntry(draft.trigger);

  const submit = () => {
    if (!draft.name.trim()) {
      toast.error("Give your workflow a name first.");
      return;
    }
    onCreate(draft);
    setDraft(EMPTY_DRAFT);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-background">
        <DialogHeader>
          <DialogTitle>Create workflow</DialogTitle>
          <DialogDescription>
            Pick what starts it — you&apos;ll add conditions and actions in the builder.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-4"
        >
          <Field label="Workflow name" htmlFor="wf-create-name">
            <Input
              id="wf-create-name"
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. Escalate urgent conversations"
            />
          </Field>
          <Field label="Trigger" hint={trigger?.description}>
            <TriggerSelect value={draft.trigger} onChange={set("trigger")} />
          </Field>
        </form>

        <DialogFooter>
          <Button
            variant="ghost"
            className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={submit}>
            Create workflow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkflowsScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { workflowId, openWorkflow, closeWorkflow, setTab } = useWorkspaceUrl();
  // Advisory: RLS refuses workflow writes without comms.settings.manage, so the controls say why up front.
  const canManage = useCan(MANAGE_PERMISSION);

  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [trigger, setTrigger] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    let alive = true;
    listWorkflows({ projectId }).then((rows) => {
      if (!alive) return;
      setWorkflows(rows ?? []);
      setLoading(false);
      if (rows === null) toast.error("Couldn't load workflows.");
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const selected = useMemo(
    () => (workflowId ? workflows.find((w) => w.id === workflowId) || null : null),
    [workflowId, workflows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workflows.filter((w) => {
      if (status !== "all" && w.status !== status) return false;
      if (trigger !== "all" && w.trigger !== trigger) return false;
      if (q) {
        const t = catalogEntry(w.trigger)?.label || "";
        if (!`${w.name} ${w.description} ${t}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [workflows, search, status, trigger]);

  const pager = usePagination(filtered, { resetKey: `${search}|${status}|${trigger}` });

  const stats = useMemo(() => {
    const live = workflows.filter((w) => w.status === "live").length;
    const paused = workflows.filter((w) => w.status === "paused").length;
    const drafts = workflows.filter((w) => w.status === "draft").length;
    const runs = workflows.reduce((s, w) => s + (w.runCount || 0), 0);
    return [
      { label: "Workflows", value: String(workflows.length), footer: `${live} live` },
      { label: "Live", value: String(live), footer: paused ? `${paused} paused` : "Listening for triggers" },
      { label: "Total runs", value: runs.toLocaleString("en-US"), footer: "Across all workflows" },
      { label: "Drafts", value: String(drafts), footer: "Not live yet" },
    ];
  }, [workflows]);

  // Optimistic create shared by "Create" and "Duplicate"; rolls back if the insert fails.
  async function insertWorkflow(workflow, successMessage) {
    setWorkflows((prev) => [workflow, ...prev]);
    const saved = await createWorkflow(workflow);
    if (!saved) {
      setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));
      toast.error("Couldn't save the workflow.");
      return null;
    }
    setWorkflows((prev) => prev.map((w) => (w.id === saved.id ? saved : w)));
    toast.success(successMessage);
    return saved;
  }

  async function handleCreate(draft) {
    const user = await getUser();
    const name = draft.name.trim();
    const workflow = {
      id: crypto.randomUUID(),
      name,
      description: "",
      status: "draft",
      trigger: draft.trigger,
      steps: [
        {
          id: newStepId(),
          kind: "trigger",
          type: draft.trigger,
          config: defaultConfig(catalogEntry(draft.trigger)),
          position: { x: 0, y: 0 },
        },
      ],
      graph: {},
      runCount: 0,
      lastRunAt: null,
      createdBy: user?.id ?? null,
      projectId: projectId ?? null,
    };
    const saved = await insertWorkflow(workflow, `"${name}" created as a draft.`);
    if (saved) openWorkflow(saved.id);
  }

  async function handleDuplicate(workflow) {
    const user = await getUser();
    await insertWorkflow(
      {
        ...workflow,
        id: crypto.randomUUID(),
        name: `${workflow.name} (copy)`,
        status: "draft",
        runCount: 0,
        lastRunAt: null,
        createdBy: user?.id ?? null,
        projectId: projectId ?? null,
      },
      `Duplicated "${workflow.name}".`,
    );
  }

  // The builder awaits this; true keeps its edits, false means the write failed and the list rolled back.
  async function handleUpdate(updated) {
    const previous = workflows;
    setWorkflows((prev) => prev.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)));
    const saved = await updateWorkflow(updated.id, {
      name: updated.name,
      description: updated.description,
      status: updated.status,
      steps: updated.steps,
      graph: updated.graph,
    });
    if (!saved) {
      setWorkflows(previous);
      toast.error("Couldn't save your changes.");
      return false;
    }
    setWorkflows((prev) => prev.map((w) => (w.id === saved.id ? saved : w)));
    return true;
  }

  async function handleToggleStatus(workflow) {
    const next = workflow.status === "live" ? "paused" : "live";
    const previous = workflows;
    setWorkflows((prev) => prev.map((w) => (w.id === workflow.id ? { ...w, status: next } : w)));
    const saved = await updateWorkflow(workflow.id, { status: next });
    if (!saved) {
      setWorkflows(previous);
      toast.error("Couldn't update the workflow status.");
      return;
    }
    toast.success(next === "live" ? `"${workflow.name}" is live.` : `"${workflow.name}" paused.`);
  }

  async function handleDelete(workflow) {
    setDeleteTarget(null);
    const previous = workflows;
    setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));
    if (workflowId === workflow.id) closeWorkflow();
    const ok = await softDeleteWorkflow(workflow.id);
    if (!ok) {
      setWorkflows(previous);
      toast.error("Couldn't delete the workflow.");
      return;
    }
    toast.success(`Deleted "${workflow.name}".`);
  }

  const columns = [
    {
      key: "name",
      header: "Workflow",
      render: (w) => (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium text-foreground">{w.name}</span>
          <span className="truncate text-xs text-text-secondary">
            When {catalogEntry(w.trigger)?.label || "—"} · {stepCountLabel(w.steps)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (w) => <StatusPill status={w.status} map={WORKFLOW_STATUS_MAP} />,
    },
    {
      key: "runs",
      header: "Runs",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (w) => (w.runCount || 0).toLocaleString("en-US"),
    },
    {
      key: "lastRun",
      header: "Last run",
      className: "text-text-secondary",
      render: (w) => (w.lastRunAt ? formatDateTime(w.lastRunAt) : "Never"),
    },
    {
      key: "updated",
      header: "Updated",
      className: "text-text-secondary",
      render: (w) => formatDate(w.updatedAt),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (w) => (
        <ActionMenu
          label={`Actions for ${w.name}`}
          items={[
            { icon: Pencil, label: canManage ? "Edit" : "View", onSelect: () => openWorkflow(w.id) },
            {
              icon: w.status === "live" ? Pause : Play,
              label: w.status === "live" ? "Pause" : "Set live",
              disabled: !canManage,
              onSelect: () => void handleToggleStatus(w),
            },
            { icon: Copy, label: "Duplicate", disabled: !canManage, onSelect: () => void handleDuplicate(w) },
            { separator: true },
            {
              icon: Trash2,
              label: "Delete",
              variant: "destructive",
              disabled: !canManage,
              onSelect: () => setDeleteTarget(w),
            },
          ]}
        />
      ),
    },
  ];

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete workflow</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>? It stops
            running immediately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={() => void handleDelete(deleteTarget)}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (selected) {
    return (
      <WorkflowBuilderScreen
        workflow={selected}
        readOnly={!canManage}
        onBack={closeWorkflow}
        onUpdate={handleUpdate}
        onDelete={(w) => void handleDelete(w)}
      />
    );
  }

  const createButton = (
    <Gated reason={canManage ? null : NEEDS_MANAGE_WORKFLOWS}>
      <Button
        className="bg-primary text-primary-foreground hover:bg-primary/90"
        disabled={!canManage}
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="h-4 w-4" /> Create workflow
      </Button>
    </Gated>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Workflows"
        description="Automate what happens when something happens — a new conversation, a reply, a tag, a quiet customer. Chain conditions and actions in a visual builder."
        actions={
          <>
            <Button
              variant="outline"
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={() => setTab("Workflow Templates")}
            >
              <LayoutTemplate className="h-4 w-4" /> Templates
            </Button>
            {createButton}
          </>
        }
      />

      {!canManage && !loading ? (
        <Notice>You can see these workflows. Changing them needs the Manage settings permission.</Notice>
      ) : null}

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            value={status}
            onValueChange={setStatus}
            options={WORKFLOW_STATUS_FILTER_OPTIONS}
            height="h-9"
          />
          <FilterDropdown
            value={trigger}
            onValueChange={setTrigger}
            options={TRIGGER_FILTER_OPTIONS}
            height="h-9"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search workflows…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading workflows" />
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(w) => w.id}
            onRowClick={(w) => openWorkflow(w.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={WorkflowIcon}
                  title={workflows.length ? "No workflows match your filters" : "No workflows yet"}
                  description={
                    workflows.length
                      ? "Try clearing the search or filters."
                      : "Create your first automation, or start from a template — e.g. auto-assign every new conversation."
                  }
                  action={
                    workflows.length ? (
                      <Button
                        variant="outline"
                        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={() => {
                          setSearch("");
                          setStatus("all");
                          setTrigger("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      createButton
                    )
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="workflows" />
        </div>
      )}

      <CreateWorkflowDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default WorkflowsScreen;
