"use client";

// Segments — saved audiences over the people directory. Opens with the
// generate-in-seconds prompt (plain language → rules), then the suite list
// pattern: KPI bar, sort/search toolbar, a DataTable and pagination.
// Selecting a row swaps to the segment editor with a live people preview.
// Custom segments persist to localStorage per project (no segments table yet).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Tags,
  Trash2,
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
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  Field,
  ScreenHeader,
  SearchInput,
  StatsBar,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "../overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  DEFAULT_SEGMENTS,
  SEGMENT_FIELDS,
  SEGMENT_OPERATORS,
  formatDateTime,
  personMatchesSegment,
  ruleSummary,
} from "./constants";
import { useCustomers } from "./use_customers";
import { SegmentDetailScreen } from "./segment_detail";

const STORE_KEY = (projectId) => `comms:segments:${projectId || "default"}`;

export function loadStoredSegments(projectId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeSegments(projectId, rows) {
  try {
    window.localStorage.setItem(STORE_KEY(projectId), JSON.stringify(rows));
  } catch {
    // storage full or blocked — the in-memory list still works
  }
}

// Very small natural-language pass: "vip in new york", "trial at lumen",
// "unsubscribed", "new customers" → a first rule draft the editor can refine.
export function promptToRules(prompt, people) {
  const text = (prompt || "").toLowerCase();
  const rules = [];
  const lifecycles = ["vip", "trial", "customer", "lead", "churned"];
  for (const l of lifecycles) {
    if (text.includes(l)) {
      rules.push({ field: "lifecycle", operator: "is", value: l });
      break;
    }
  }
  if (text.includes("unsub") || text.includes("opt.out") || text.includes("opt out")) {
    rules.push({ field: "emailOpt", operator: "is", value: "out" });
  }
  if (text.includes("new") || text.includes("this week") || text.includes("recent")) {
    rules.push({ field: "created", operator: "within_days", value: "7" });
  }
  const companies = [...new Set((people || []).map((p) => p.company).filter(Boolean))];
  for (const c of companies) {
    if (c && text.includes(c.toLowerCase())) {
      rules.push({ field: "company", operator: "is", value: c });
      break;
    }
  }
  const tags = new Set();
  for (const p of people || []) {
    for (const t of p.tags || []) {
      tags.add(typeof t === "string" ? t : t.name);
    }
  }
  for (const t of tags) {
    if (t && text.includes(String(t).toLowerCase())) {
      rules.push({ field: "tag", operator: "is", value: t });
      break;
    }
  }
  if (rules.length === 0) {
    const m = text.match(/in\s+([a-z\s]+)/);
    if (m?.[1]) {
      rules.push({ field: "location", operator: "contains", value: m[1].trim() });
    }
  }
  return rules;
}

const SORT_OPTIONS = [
  { value: "recent", label: "Recent (descending)" },
  { value: "name", label: "Name (A–Z)" },
  { value: "size", label: "Largest first" },
];

const EMPTY_RULE = { field: "lifecycle", operator: "is", value: "" };

export function SegmentsScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { segmentId, openSegment, closeSegment } = useWorkspaceUrl();
  const { people, loading } = useCustomers();

  // ScreenArea remounts per project, so a lazy initializer reads the right
  // store exactly once — no syncing effect needed.
  const [custom, setCustom] = useState(() => loadStoredSegments(projectId));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [prompt, setPrompt] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", rules: [{ ...EMPTY_RULE }] });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const persistCustom = (rows) => {
    setCustom(rows);
    storeSegments(projectId, rows);
  };

  const segments = useMemo(
    () => [...DEFAULT_SEGMENTS, ...custom],
    [custom],
  );

  const counts = useMemo(() => {
    const map = new Map();
    for (const s of segments) {
      const match = people.filter((p) => personMatchesSegment(p, s));
      map.set(s.id, { active: match.length, total: match.length });
    }
    return map;
  }, [segments, people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = segments.filter((s) => {
      if (q && !`${s.name} ${s.description}`.toLowerCase().includes(q))
        return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size")
        return (counts.get(b.id)?.total || 0) - (counts.get(a.id)?.total || 0);
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }, [segments, search, sort, counts]);

  const pager = usePagination(filtered, { resetKey: `${search}|${sort}` });

  const stats = useMemo(() => {
    const total = people.length;
    const covered = new Set();
    for (const s of segments) {
      for (const p of people) {
        if (personMatchesSegment(p, s)) covered.add(p.id);
      }
    }
    return [
      { label: "Segments", value: String(segments.length), footer: `${custom.length} custom` },
      {
        label: "People covered",
        value: `${covered.size.toLocaleString("en-US")}`,
        footer: `of ${total.toLocaleString("en-US")} contacts`,
      },
      {
        label: "Largest",
        value: (() => {
          const top = [...counts.entries()].sort((a, b) => b[1].total - a[1].total)[0];
          return top ? String(top[1].total) : "0";
        })(),
        footer: "contacts in one segment",
      },
      { label: "Custom", value: String(custom.length), footer: "Built in this workspace" },
    ];
  }, [segments, people, counts, custom.length]);

  function openCreate(rules, name) {
    setDraft({ name: name || "", rules: rules?.length ? rules : [{ ...EMPTY_RULE }] });
    setCreateOpen(true);
  }

  function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Describe the audience first.");
      return;
    }
    const rules = promptToRules(prompt, people);
    if (rules.length === 0) {
      toast.error("Couldn't read that — try “VIPs in New York”.");
      return;
    }
    openCreate(rules, prompt.trim().slice(0, 48));
    setPrompt("");
  }

  function handleCreate() {
    if (!draft.name.trim()) {
      toast.error("Give the segment a name.");
      return;
    }
    const now = new Date().toISOString();
    const segment = {
      id: crypto.randomUUID(),
      name: draft.name.trim(),
      description:
        draft.rules.map(ruleSummary).join(" · ") || "Custom audience.",
      rules: draft.rules.filter((r) => r.field && r.value),
      builtIn: false,
      createdAt: now,
      updatedAt: now,
    };
    persistCustom([...custom, segment]);
    setCreateOpen(false);
    toast.success("Segment created");
    openSegment(segment.id);
  }

  const handleUpdate = (updated) => {
    if (updated.builtIn) return;
    persistCustom(custom.map((s) => (s.id === updated.id ? updated : s)));
  };

  function handleDuplicate(segment) {
    const now = new Date().toISOString();
    const copy = {
      ...segment,
      id: crypto.randomUUID(),
      name: `${segment.name} copy`,
      builtIn: false,
      createdAt: now,
      updatedAt: now,
    };
    persistCustom([...custom, copy]);
    toast.success("Segment duplicated");
  }

  function handleDelete(segment) {
    setDeleteTarget(null);
    if (segment.builtIn) {
      toast.error("Built-in segments can't be deleted.");
      return;
    }
    persistCustom(custom.filter((s) => s.id !== segment.id));
    if (segmentId === segment.id) closeSegment();
    toast.success(`Deleted “${segment.name}”.`);
  }

  const selected = useMemo(() => {
    if (!segmentId) return null;
    const found =
      segments.find((s) => s.id === segmentId) ||
      DEFAULT_SEGMENTS.find((s) => s.id === segmentId);
    return found || null;
  }, [segmentId, segments]);

  const columns = [
    {
      key: "name",
      header: "Segment",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          <p className="truncate text-xs text-text-secondary">
            {row.description || row.rules.map(ruleSummary).join(" · ")}
          </p>
        </div>
      ),
    },
    {
      key: "active",
      header: "Active",
      render: (row) => (
        <span className="text-sm font-medium tabular-nums text-foreground">
          {(counts.get(row.id)?.active || 0).toLocaleString("en-US")}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      render: (row) => (
        <span className="text-sm tabular-nums text-text-secondary">
          {(counts.get(row.id)?.total || 0).toLocaleString("en-US")}
        </span>
      ),
    },
    {
      key: "refreshed",
      header: "Last refreshed",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatDateTime(row.updatedAt)}
        </span>
      ),
    },
    {
      key: "edited",
      header: "Last edited",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatDateTime(row.updatedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-24 text-right",
      render: (row) => (
        <span
          className="inline-flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            onClick={() => openSegment(row.id)}
          >
            Edit
          </Button>
          <ActionMenu
            label={`Actions for ${row.name}`}
            items={[
              { icon: Pencil, label: "Edit", onSelect: () => openSegment(row.id) },
              {
                icon: Copy,
                label: "Duplicate",
                onSelect: () => handleDuplicate(row),
              },
              { separator: true },
              {
                icon: Trash2,
                label: "Delete",
                variant: "destructive",
                onSelect: () => setDeleteTarget(row),
              },
            ]}
          />
        </span>
      ),
    },
  ];

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete segment</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
            People are untouched — only the saved audience goes away.
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
        <SegmentDetailScreen
          segment={selected}
          people={people}
          onBack={closeSegment}
          onUpdate={handleUpdate}
          onDelete={setDeleteTarget}
          onDuplicate={handleDuplicate}
        />
        {deleteDialog}
      </>
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Segments"
        description="Saved audiences over the people directory — the targeting behind campaigns and reports."
      />

      {/* Generate hero */}
      <div className="rounded-2xl border border-border bg-gradient-to-b from-violet-400/10 to-transparent px-6 py-8 text-center">
        <h2 className="bg-gradient-to-r from-indigo-300 to-violet-400 bg-clip-text text-2xl font-semibold tracking-tight text-transparent md:text-3xl">
          Generate a segment in seconds
        </h2>
        <div className="mx-auto mt-4 flex max-w-2xl items-center gap-2 rounded-xl border border-border bg-surface-card px-4 py-2.5 text-left shadow-sm">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            placeholder="Tell us how you would like to segment your audience"
            className="h-8 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-text-tertiary"
          />
          <button
            type="button"
            onClick={handleGenerate}
            aria-label="Generate segment"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-400 text-white transition-colors hover:bg-indigo-300"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="mt-3 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200"
        >
          Start from scratch instead
        </button>
      </div>

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 text-sm text-text-secondary">
            <Sparkles className="h-3.5 w-3.5 text-violet-300" />
            What&apos;s the quality of my contact field data?
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FilterDropdown
            value={sort}
            onValueChange={setSort}
            options={SORT_OPTIONS}
            height="h-9"
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search"
            className="w-full sm:w-56"
          />
        </div>
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-6 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading segments…
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(row) => row.id}
            onRowClick={(row) => openSegment(row.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Tags}
                  title="No segments match"
                  description="Try clearing the search."
                  action={
                    <Button
                      variant="outline"
                      className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                      onClick={() => setSearch("")}
                    >
                      Clear search
                    </Button>
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="segments" />
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New segment</DialogTitle>
            <DialogDescription>
              A saved audience: everyone matching every rule below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name" htmlFor="segment-draft-name">
              <Input
                id="segment-draft-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="VIPs in New York"
              />
            </Field>
            <div className="space-y-2">
              {draft.rules.map((rule, i) => (
                <RuleRow
                  key={i}
                  rule={rule}
                  onChange={(next) =>
                    setDraft((d) => ({
                      ...d,
                      rules: d.rules.map((r, j) => (j === i ? next : r)),
                    }))
                  }
                  onRemove={() =>
                    setDraft((d) => ({
                      ...d,
                      rules: d.rules.filter((_, j) => j !== i),
                    }))
                  }
                />
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                onClick={() =>
                  setDraft((d) => ({ ...d, rules: [...d.rules, { ...EMPTY_RULE }] }))
                }
              >
                <Plus className="h-4 w-4" /> Add rule
              </Button>
            </div>
            <p className="text-xs text-text-tertiary">
              {people.filter((p) =>
                (draft.rules.filter((r) => r.field && r.value).length
                  ? draft.rules
                      .filter((r) => r.field && r.value)
                      .every((r) =>
                        personMatchesSegment(p, { rules: [r] }),
                      )
                  : true),
              ).length}{" "}
              people match right now.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={!draft.name.trim()}
            >
              Create segment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export function RuleRow({ rule, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={rule.field}
        onChange={(e) => onChange({ ...rule, field: e.target.value })}
        className="h-9 flex-1 rounded-md border border-border bg-surface-card px-2 text-xs text-foreground outline-none"
      >
        {SEGMENT_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        value={rule.operator}
        onChange={(e) => onChange({ ...rule, operator: e.target.value })}
        className="h-9 w-32 rounded-md border border-border bg-surface-card px-2 text-xs text-foreground outline-none"
      >
        {SEGMENT_OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Input
        value={rule.value}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
        placeholder="Value…"
        className="h-9 flex-1"
      />
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="text-text-tertiary transition-colors hover:text-red-300"
          aria-label="Remove rule"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export default SegmentsScreen;
