"use client";

// The workflow editor (ported from geiger-events): Builder tab with list + canvas views over the same steps, and a Settings tab.

import { useState } from "react";
import { toast } from "sonner";
import { LayoutList, Loader2, Network, Pause, Play, SquarePen, Trash2, Zap } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@geiger/ui";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EditorHeader } from "@/components/internal/shared/editor_shell";
import { EditorSectionHeader, Field, SegmentedTabs } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";

import { WORKFLOW_STATUS_MAP, formatDateTime } from "./constants";
import { catalogEntry, defaultConfig, stepCountLabel } from "./workflow_catalog";
import { TriggerSelect, WorkflowStepList } from "./step_list";
import { WorkflowCanvas } from "./canvas/workflow_canvas";

const SETTINGS_NAV = [
  {
    group: null,
    items: [
      { key: "general", label: "General", icon: SquarePen, desc: "Workflow name and description." },
      { key: "trigger", label: "Trigger", icon: Zap, desc: "What starts this workflow." },
    ],
  },
  {
    group: "Danger zone",
    items: [
      {
        key: "danger",
        label: "Delete",
        icon: Trash2,
        desc: "Permanently remove this workflow and all its steps.",
      },
    ],
  },
];
const SETTINGS_ITEMS = SETTINGS_NAV.flatMap((g) => g.items);

const VIEW_TABS = [
  { value: "list", label: "List", icon: LayoutList },
  { value: "canvas", label: "Canvas", icon: Network },
];

// Key-order-insensitive step fingerprint; React Flow re-emits on measure/select, which must not count as an edit.
const stepKey = (s) =>
  JSON.stringify([
    s.id,
    s.kind,
    s.type,
    Math.round(s.position?.x ?? 0),
    Math.round(s.position?.y ?? 0),
    Object.entries(s.config || {}).sort(([a], [b]) => a.localeCompare(b)),
  ]);
const sameSteps = (a = [], b = []) =>
  a.length === b.length && a.every((s, i) => stepKey(s) === stepKey(b[i]));

export function WorkflowBuilderScreen({ workflow, onBack, onUpdate, onDelete }) {
  const [form, setForm] = useState(workflow);
  const [view, setView] = useState("canvas");
  const [activeTab, setActiveTab] = useState("builder");
  const [activeSetting, setActiveSetting] = useState("general");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Re-seed when a different workflow opens (render-time reset, not an effect).
  const [seedId, setSeedId] = useState(workflow?.id);
  if (workflow && workflow.id !== seedId) {
    setSeedId(workflow.id);
    setForm(workflow);
    setView("canvas");
    setActiveTab("builder");
    setActiveSetting("general");
    setDirty(false);
  }

  if (!workflow) return null;

  const patch = (partial) => {
    setForm((f) => ({ ...f, ...partial }));
    setDirty(true);
  };

  const handleStepsChange = (steps) => patch({ steps, trigger: steps[0]?.type || form.trigger });

  const handleCanvasChange = ({ steps, graph }) => {
    const changed = !sameSteps(steps, form.steps);
    setForm((f) => ({ ...f, steps, graph, trigger: steps[0]?.type || f.trigger }));
    if (changed) setDirty(true);
  };

  // Changing the trigger resets its config to the new trigger's defaults.
  const setTriggerType = (type) => {
    const steps = [...(form.steps || [])];
    if (steps[0]) steps[0] = { ...steps[0], type, config: defaultConfig(catalogEntry(type)) };
    patch({ steps, trigger: type });
  };

  // A failed save keeps the user's edits; a failed status change puts the old status back.
  async function persist(next, successMessage, { revertStatus } = {}) {
    const previousStatus = form.status;
    setForm(next);
    setSaving(true);
    const ok = await onUpdate?.(next);
    setSaving(false);
    if (ok) {
      setDirty(false);
      toast.success(successMessage);
    } else if (revertStatus) {
      setForm((f) => ({ ...f, status: previousStatus }));
    }
  }

  // Name and trigger are the two things the database won't accept missing.
  function validate() {
    if (!form.name.trim()) {
      toast.error("Give the workflow a name first.");
      return false;
    }
    if (form.steps?.[0]?.kind !== "trigger") {
      toast.error("This workflow has no trigger — add one before saving.");
      return false;
    }
    return true;
  }

  const save = () => {
    if (!validate()) return;
    void persist({ ...form, name: form.name.trim() }, "Workflow saved.");
  };

  // Going live saves the current steps with the new status in one write.
  const toggleStatus = () => {
    if (!validate()) return;
    const status = form.status === "live" ? "paused" : "live";
    void persist(
      { ...form, name: form.name.trim(), status },
      status === "live" ? "Workflow is live." : "Workflow paused.",
      { revertStatus: true },
    );
  };

  const isLive = form.status === "live";
  const trigger = catalogEntry(form.trigger);
  const activeItem = SETTINGS_ITEMS.find((i) => i.key === activeSetting);

  return (
    <MainScreenWrapper>
      <EditorHeader
        back={{ label: "All workflows", onClick: onBack }}
        title={form.name || "Untitled workflow"}
        status={form.status}
        statusMap={WORKFLOW_STATUS_MAP}
        meta={`When ${trigger?.label || "—"} · ${stepCountLabel(form.steps)}${
          form.lastRunAt ? ` · Last ran ${formatDateTime(form.lastRunAt)}` : ""
        }`}
        actions={
          <>
            <Button
              variant="outline"
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={toggleStatus}
              disabled={saving}
            >
              {isLive ? (
                <>
                  <Pause className="h-4 w-4" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Set live
                </>
              )}
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={save}
              disabled={saving || !dirty}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          {activeTab === "builder" ? (
            <SegmentedTabs tabs={VIEW_TABS} value={view} onChange={setView} />
          ) : null}
        </div>

        <TabsContent value="builder" className="mt-2">
          {view === "list" ? (
            <WorkflowStepList steps={form.steps} onChange={handleStepsChange} />
          ) : (
            <WorkflowCanvas
              steps={form.steps}
              graph={form.graph}
              active={isLive}
              onChange={handleCanvasChange}
            />
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_220px]">
            <div className="order-2 min-w-0 lg:order-1">
              <EditorSectionHeader
                className="mb-5"
                title={activeItem?.label}
                description={activeItem?.desc}
              />

              {activeSetting === "general" && (
                <div className="grid gap-4">
                  <Field label="Workflow name" htmlFor="wf-name">
                    <Input
                      id="wf-name"
                      value={form.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </Field>
                  <Field label="Description" htmlFor="wf-desc">
                    <Textarea
                      id="wf-desc"
                      value={form.description || ""}
                      onChange={(e) => patch({ description: e.target.value })}
                      placeholder="What does this workflow do?"
                      rows={3}
                    />
                  </Field>
                </div>
              )}

              {activeSetting === "trigger" && (
                <div className="grid gap-4">
                  <Field
                    label="Trigger"
                    hint={trigger?.description || "The event that starts this workflow."}
                  >
                    <TriggerSelect value={form.trigger} onChange={setTriggerType} />
                  </Field>
                  <p className="text-xs text-text-tertiary">
                    Trigger options (like which tag or how long to wait) are set on the trigger
                    card in the builder.
                  </p>
                </div>
              )}

              {activeSetting === "danger" && (
                <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                  <div>
                    <p className="text-sm font-medium text-foreground">Delete this workflow</p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      It stops running immediately. Past runs stay in Run History.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="shrink-0 border-red-500/30 bg-transparent text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300 dark:hover:text-red-300"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              )}
            </div>

            <aside className="order-1 lg:order-2">
              <nav className="space-y-5 lg:sticky lg:top-0">
                {SETTINGS_NAV.map((group, gi) => (
                  <div key={group.group || `g${gi}`}>
                    {group.group ? (
                      <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                        {group.group}
                      </p>
                    ) : null}
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isItemActive = activeSetting === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setActiveSetting(item.key)}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                              isItemActive
                                ? "bg-surface-card font-medium text-foreground"
                                : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isItemActive ? "text-foreground" : "text-text-secondary",
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{form.name}</span>? This action
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500/90 text-white hover:bg-red-500"
              onClick={() => {
                setDeleteOpen(false);
                onDelete?.(form);
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default WorkflowBuilderScreen;
