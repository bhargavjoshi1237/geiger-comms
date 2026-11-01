"use client";

// Workflow Templates: a curated starter gallery. "Use template" creates a real draft workflow and opens it in the Workflows builder.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, LayoutTemplate, Loader2, Zap } from "lucide-react";
import { Badge, Button } from "@geiger/ui";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { EmptyState, ScreenHeader, SearchInput, Toolbar } from "@/components/internal/shared/screen_kit";
import { Gated } from "@/components/internal/shared/gated";
import { Notice } from "@/components/internal/shared/notice";
import FilterDropdown from "../overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { createWorkflow } from "@/lib/supabase/workflows";
import { getUser } from "@/lib/supabase/user";
import { unavailableReason } from "@/lib/workflows/availability";

import { MANAGE_PERMISSION, NEEDS_MANAGE_WORKFLOWS } from "./constants";
import {
  WORKFLOW_TEMPLATES,
  WORKFLOW_TEMPLATE_CATEGORY_MAP,
  WORKFLOW_TEMPLATE_CATEGORY_OPTIONS,
  catalogEntry,
  stepCountLabel,
} from "./workflow_catalog";

// Materialize a template's config-only steps into real steps (ids + canvas positions).
function instantiateSteps(templateSteps) {
  return (templateSteps || []).map((s, i) => ({
    id: `step_${crypto.randomUUID()}`,
    kind: s.kind,
    type: s.type,
    config: { ...(s.config || {}) },
    position: { x: 0, y: i * 150 },
  }));
}

export function WorkflowTemplatesScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { openWorkflowInTab } = useWorkspaceUrl();
  // Using a template creates a workflow, which needs comms.settings.manage.
  const canManage = useCan(MANAGE_PERMISSION);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [usingId, setUsingId] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return WORKFLOW_TEMPLATES.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      const trigger = catalogEntry(t.trigger)?.label || "";
      return `${t.name} ${t.description} ${trigger}`.toLowerCase().includes(q);
    });
  }, [search, category]);

  // Awaits the insert so the Workflows screen's fetch already sees the new row.
  async function handleUse(template) {
    if (usingId) return;
    setUsingId(template.id);
    const user = await getUser();
    const saved = await createWorkflow({
      id: crypto.randomUUID(),
      name: template.name,
      description: template.description,
      status: "draft",
      steps: instantiateSteps(template.steps),
      graph: {},
      createdBy: user?.id ?? null,
      projectId: projectId ?? null,
    });
    setUsingId(null);
    if (!saved) {
      toast.error("Couldn't create a workflow from this template.");
      return;
    }
    toast.success(`Created "${template.name}" as a draft.`);
    openWorkflowInTab(saved.id, "Workflows");
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Workflow Templates"
        description="Start from a proven automation. Each template becomes a draft workflow you can adjust in the builder before setting it live."
      />

      {canManage ? null : (
        <Notice>You can browse these templates. Using one needs the Manage settings permission.</Notice>
      )}

      <Toolbar>
        <FilterDropdown
          value={category}
          onValueChange={setCategory}
          options={WORKFLOW_TEMPLATE_CATEGORY_OPTIONS}
          height="h-9"
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search templates…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={LayoutTemplate}
            title="No templates match your filters"
            description="Try clearing the search or picking a different category."
            action={
              <Button
                variant="outline"
                className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const trigger = catalogEntry(t.trigger);
            const Icon = trigger?.icon || Zap;
            const cat = WORKFLOW_TEMPLATE_CATEGORY_MAP[t.category];
            const busy = usingId === t.id;
            const skipped = t.steps.map((s) => s.kind === "action" && unavailableReason(s.type)).find(Boolean);
            return (
              <div
                key={t.id}
                className="group flex flex-col rounded-xl border border-border bg-surface-subtle p-5 transition-colors hover:border-border-strong"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <Badge variant={cat?.variant || "neutral"}>{cat?.label || t.category}</Badge>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{t.name}</h3>
                <p className="mt-1 flex-1 text-sm text-text-secondary">{t.description}</p>
                {skipped ? (
                  <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                    One step is skipped when it runs. {skipped}
                  </p>
                ) : null}
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
                  <span className="truncate text-xs text-text-tertiary">
                    When {trigger?.label || "—"} · {stepCountLabel(t.steps)}
                  </span>
                  <Gated reason={canManage ? null : NEEDS_MANAGE_WORKFLOWS}>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canManage || Boolean(usingId)}
                      className="shrink-0 text-muted-foreground hover:bg-surface-active hover:text-foreground"
                      onClick={() => void handleUse(t)}
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…
                        </>
                      ) : (
                        <>
                          Use template <ArrowUpRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </Button>
                  </Gated>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </MainScreenWrapper>
  );
}

export default WorkflowTemplatesScreen;
