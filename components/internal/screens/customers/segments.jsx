"use client";

// Segments: saved audiences counted in SQL, a plain-language rule drafter, and a one-time rescue of segments older builds kept in localStorage.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Copy,
  Loader2,
  Pencil,
  RefreshCw,
  Tags,
  Trash2,
  UploadCloud,
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
import { getUser } from "@/lib/supabase/user";
import { listAttributes } from "@/lib/supabase/customers";
import { listCompanies } from "@/lib/supabase/companies";
import { listTags } from "@/lib/supabase/tags";
import {
  countSegments,
  createSegment,
  listSegments,
  softDeleteSegment,
  updateSegment,
} from "@/lib/supabase/segments";
import {
  DEFAULT_SEGMENTS,
  LIFECYCLE_MAP,
  blankRule,
  completeRules,
  formatDateTime,
  restoreRow,
  rulesSummary,
  segmentFields,
} from "./constants";
import {
  RulesEditor,
  SegmentDetailScreen,
  useSegmentPreview,
} from "./segment_detail";

// Where an older build kept custom segments, per project and per browser.
const LEGACY_KEY = (projectId) => `comms:segments:${projectId || "default"}`;

function readLegacySegments(projectId) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEGACY_KEY(projectId)) || "[]");
    return Array.isArray(parsed) ? parsed.filter((s) => s && s.name) : [];
  } catch {
    return [];
  }
}

function writeLegacySegments(projectId, rows) {
  try {
    if (rows.length) window.localStorage.setItem(LEGACY_KEY(projectId), JSON.stringify(rows));
    else window.localStorage.removeItem(LEGACY_KEY(projectId));
  } catch {
    // storage blocked — nothing to clean up
  }
}

// Keyword pass over a plain-language prompt ("trial customers at lumen") into a first rule draft.
function promptToRules(prompt, vocabulary) {
  const text = (prompt || "").toLowerCase();
  const rules = [];
  const stage = Object.keys(LIFECYCLE_MAP).find((l) => text.includes(l));
  if (stage) rules.push({ field: "lifecycle", operator: "is", value: stage });
  if (text.includes("unsub") || text.includes("opt out") || text.includes("opted out")) {
    rules.push({ field: "emailOpt", operator: "is", value: "out" });
  }
  if (text.includes("new") || text.includes("this week") || text.includes("recent")) {
    rules.push({ field: "created", operator: "within_days", value: "7" });
  }
  const company = vocabulary.companies.find((c) => text.includes(c.toLowerCase()));
  if (company) rules.push({ field: "company", operator: "is", value: company });
  const tag = vocabulary.tags.find((t) => text.includes(t.toLowerCase()));
  if (tag) rules.push({ field: "tag", operator: "is", value: tag });
  if (rules.length === 0) {
    const place = text.match(/\bin\s+([a-z\s]+)/);
    if (place?.[1]) rules.push({ field: "location", operator: "contains", value: place[1].trim() });
  }
  return rules;
}

const SORT_OPTIONS = [
  { value: "recent", label: "Recently edited" },
  { value: "name", label: "Name (A–Z)" },
  { value: "size", label: "Largest first" },
];

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const setsOf = (segments) =>
  Object.fromEntries(segments.map((s) => [s.id, completeRules(s.rules)]));

export function SegmentsScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { segmentId, openSegment, closeSegment } = useWorkspaceUrl();

  const [saved, setSaved] = useState([]);
  const [failed, setFailed] = useState(false);
  const [counts, setCounts] = useState(null);
  const [attributes, setAttributes] = useState([]);
  const [vocabulary, setVocabulary] = useState({ companies: [], tags: [] });
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  // ScreenArea remounts per project, so the lazy initializer reads the right key.
  const [legacy, setLegacy] = useState(() => readLegacySegments(projectId));
  const [importingLegacy, setImportingLegacy] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [prompt, setPrompt] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", rules: [] });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fields = useMemo(() => segmentFields(attributes), [attributes]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listSegments({ projectId }),
      listAttributes({ projectId }),
      listCompanies({ projectId }),
      listTags({ projectId }),
    ]).then(async ([rows, attrs, companyRows, tagRows]) => {
      const nextCounts = rows
        ? await countSegments({ projectId, sets: setsOf([...DEFAULT_SEGMENTS, ...rows]) })
        : null;
      if (!alive) return;
      setSaved(rows ?? []);
      setFailed(rows === null);
      setCounts(nextCounts);
      setAttributes(attrs ?? []);
      setVocabulary({
        companies: (companyRows || []).map((c) => c.name).filter(Boolean),
        tags: (tagRows || []).map((t) => t.name).filter(Boolean),
      });
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, version]);

  const reload = () => {
    setLoading(true);
    setVersion((v) => v + 1);
  };

  async function recount(segments) {
    const next = await countSegments({ projectId, sets: setsOf(segments) });
    if (next) setCounts((prev) => ({ ...(prev || {}), ...next }));
  }

  const segments = useMemo(() => [...DEFAULT_SEGMENTS, ...saved], [saved]);
  const countOf = (id) => (counts && id in counts ? counts[id] : null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = segments.filter(
      (s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q),
    );
    return [...rows].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return (counts?.[b.id] ?? -1) - (counts?.[a.id] ?? -1);
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  }, [segments, search, sort, counts]);

  const pager = usePagination(filtered, { resetKey: `${search}|${sort}` });

  const stats = useMemo(() => {
    const sized = segments
      .filter((s) => s.id !== "builtin-all" && counts?.[s.id] !== undefined)
      .sort((a, b) => counts[b.id] - counts[a.id]);
    const people = counts?.["builtin-all"];
    return [
      { label: "Segments", value: String(segments.length), footer: `${DEFAULT_SEGMENTS.length} built-in` },
      {
        label: "People",
        value: people === undefined ? "—" : people.toLocaleString("en-US"),
        footer: "In this workspace",
      },
      {
        label: "Largest",
        value: sized[0] ? counts[sized[0].id].toLocaleString("en-US") : "—",
        footer: sized[0] ? sized[0].name : "No counts yet",
      },
      { label: "Saved", value: String(saved.length), footer: "Built by your team" },
    ];
  }, [segments, saved.length, counts]);

  // Only counts while the dialog is open (no project = no request).
  const draftPreview = useSegmentPreview({ projectId: createOpen ? projectId : null, rules: draft.rules });

  function openCreate(rules, name) {
    setDraft({ name: name || "", description: "", rules: rules?.length ? rules : [blankRule(fields)] });
    setCreateOpen(true);
  }

  function handleGenerate() {
    if (!prompt.trim()) {
      toast.error("Describe the audience first.");
      return;
    }
    const rules = promptToRules(prompt, vocabulary);
    if (rules.length === 0) {
      toast.error("Couldn't read that — try “trial customers” or “unsubscribed”.");
      return;
    }
    openCreate(rules, prompt.trim().slice(0, 48));
    setPrompt("");
  }

  async function persistNew(input) {
    const now = new Date().toISOString();
    const optimistic = { ...input, id: crypto.randomUUID(), builtIn: false, createdAt: now, updatedAt: now };
    setSaved((prev) => [optimistic, ...prev]);
    const user = await getUser();
    const created = await createSegment({ ...optimistic, projectId, createdBy: user?.id ?? null });
    if (!created) {
      setSaved((prev) => prev.filter((s) => s.id !== optimistic.id));
      return null;
    }
    setSaved((prev) => prev.map((s) => (s.id === created.id ? created : s)));
    void recount([created]);
    return created;
  }

  async function handleCreate() {
    if (!draft.name.trim()) {
      toast.error("Give the segment a name.");
      return;
    }
    setCreateOpen(false);
    const created = await persistNew({
      name: draft.name.trim(),
      description: draft.description.trim(),
      rules: completeRules(draft.rules),
    });
    if (!created) {
      toast.error("Couldn't create the segment.");
      return;
    }
    toast.success("Segment created");
    openSegment(created.id);
  }

  async function handleUpdate(segment, patch) {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, segment[k]]));
    setSaved((prev) => prev.map((s) => (s.id === segment.id ? { ...s, ...patch } : s)));
    const next = await updateSegment(segment.id, patch);
    if (!next) {
      setSaved((prev) => prev.map((s) => (s.id === segment.id ? { ...s, ...before } : s)));
      toast.error("Couldn't save the segment.");
      return false;
    }
    setSaved((prev) => prev.map((s) => (s.id === next.id ? next : s)));
    void recount([next]);
    return true;
  }

  async function handleDuplicate(segment) {
    const copy = await persistNew({
      name: `${segment.name} copy`,
      description: segment.description,
      rules: completeRules(segment.rules),
    });
    if (!copy) {
      toast.error("Couldn't duplicate the segment.");
      return;
    }
    toast.success("Segment duplicated");
    openSegment(copy.id);
  }

  async function handleDelete(segment) {
    setDeleteTarget(null);
    const index = saved.findIndex((s) => s.id === segment.id);
    setSaved((prev) => prev.filter((s) => s.id !== segment.id));
    if (segmentId === segment.id) closeSegment();
    const ok = await softDeleteSegment(segment.id);
    if (!ok) {
      setSaved((prev) => restoreRow(prev, segment, index));
      toast.error("Couldn't delete the segment.");
      return;
    }
    toast.success(`Deleted “${segment.name}”.`);
  }

  async function handleSaveLegacy() {
    setImportingLegacy(true);
    const left = [];
    for (const segment of legacy) {
      const created = await persistNew({
        name: String(segment.name).trim() || "Untitled segment",
        description: "",
        rules: completeRules(Array.isArray(segment.rules) ? segment.rules : []),
      });
      if (!created) left.push(segment);
    }
    writeLegacySegments(projectId, left);
    setLegacy(left);
    setImportingLegacy(false);
    if (left.length) toast.error(`Saved ${legacy.length - left.length} of ${legacy.length} — try again for the rest.`);
    else toast.success(`Saved ${legacy.length} segment${legacy.length === 1 ? "" : "s"} to the workspace.`);
  }

  function handleDiscardLegacy() {
    setDiscardOpen(false);
    writeLegacySegments(projectId, []);
    setLegacy([]);
    toast.success("Removed the segments saved in this browser.");
  }

  const selected = useMemo(
    () => (segmentId ? segments.find((s) => s.id === segmentId) || null : null),
    [segmentId, segments],
  );

  const columns = [
    {
      key: "name",
      header: "Segment",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          <p className="truncate text-xs text-text-secondary">
            {row.description || rulesSummary(row.rules, fields)}
          </p>
        </div>
      ),
    },
    {
      key: "people",
      header: "People",
      render: (row) => (
        <span className="text-sm font-medium tabular-nums text-foreground">
          {countOf(row.id) === null ? "—" : countOf(row.id).toLocaleString("en-US")}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <span className="text-sm text-text-secondary">{row.builtIn ? "Built-in" : "Saved"}</span>
      ),
    },
    {
      key: "edited",
      header: "Last edited",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {row.updatedAt ? formatDateTime(row.updatedAt) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12 text-right",
      render: (row) => (
        <ActionMenu
          label={`Actions for ${row.name}`}
          items={[
            { icon: Pencil, label: row.builtIn ? "Open" : "Edit", onSelect: () => openSegment(row.id) },
            { icon: Copy, label: "Duplicate", onSelect: () => void handleDuplicate(row) },
            !row.builtIn && { separator: true },
            !row.builtIn && {
              icon: Trash2,
              label: "Delete",
              variant: "destructive",
              onSelect: () => setDeleteTarget(row),
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
          projectId={projectId}
          fields={fields}
          onBack={closeSegment}
          onSave={(patch) => handleUpdate(selected, patch)}
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

      <div className="rounded-2xl border border-border bg-gradient-to-b from-violet-400/10 to-transparent px-6 py-8 text-center">
        <h2 className="bg-gradient-to-r from-indigo-300 to-violet-400 bg-clip-text text-2xl font-semibold tracking-tight text-transparent md:text-3xl">
          Describe an audience
        </h2>
        <div className="mx-auto mt-4 flex max-w-2xl items-center gap-2 rounded-xl border border-border bg-surface-card px-4 py-2.5 text-left shadow-sm">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            placeholder="e.g. trial customers at Acme, or unsubscribed"
            aria-label="Describe an audience"
            className="h-8 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-text-tertiary"
          />
          <button
            type="button"
            onClick={handleGenerate}
            disabled={failed}
            aria-label="Draft segment rules"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-400 text-white transition-colors hover:bg-indigo-300 disabled:opacity-50"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          disabled={failed}
          className="mt-3 text-sm font-medium text-indigo-300 transition-colors hover:text-indigo-200 disabled:opacity-50"
        >
          Start from scratch instead
        </button>
      </div>

      {!loading && !failed && legacy.length ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {legacy.length} segment{legacy.length === 1 ? " is" : "s are"} saved only in this browser
            </p>
            <p className="truncate text-sm text-text-secondary">
              {legacy.map((s) => s.name).join(", ")} — save them so the whole team sees them.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" onClick={() => setDiscardOpen(true)} disabled={importingLegacy}>
              Discard
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={importingLegacy}
              onClick={() => void handleSaveLegacy()}
            >
              {importingLegacy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              Save to workspace
            </Button>
          </div>
        </div>
      ) : null}

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown
            value={sort}
            onValueChange={setSort}
            options={SORT_OPTIONS}
            height="h-9"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search segments…"
          className="w-full sm:w-56"
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading segments" />
        </div>
      ) : failed ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Tags}
            title="Couldn't load segments"
            description="Saved segments aren't available right now. Try again."
            action={
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={reload}>
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
            }
          />
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
                  description="Try a different search."
                  action={
                    <Button variant="outline" className={OUTLINE_BUTTON} onClick={() => setSearch("")}>
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New segment</DialogTitle>
            <DialogDescription>
              A saved audience: everyone matching every rule below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="segment-draft-name">
                <Input
                  id="segment-draft-name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Trials in New York"
                />
              </Field>
              <Field label="Description" htmlFor="segment-draft-description">
                <Input
                  id="segment-draft-description"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Optional"
                />
              </Field>
            </div>
            <RulesEditor
              rules={draft.rules}
              fields={fields}
              onChange={(rules) => setDraft((d) => ({ ...d, rules }))}
            />
            <p className="text-xs text-text-tertiary">
              {draftPreview.loading
                ? "Counting…"
                : draftPreview.count === null
                  ? "Couldn't count matches right now."
                  : `${draftPreview.count.toLocaleString("en-US")} ${draftPreview.count === 1 ? "person matches" : "people match"} right now.`}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => void handleCreate()}
              disabled={!draft.name.trim()}
            >
              Create segment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard browser-only segments</DialogTitle>
            <DialogDescription>
              {legacy.length} segment{legacy.length === 1 ? "" : "s"} will be removed from this
              browser. Nothing in the workspace changes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-red-500/90 text-white hover:bg-red-500" onClick={handleDiscardLegacy}>
              <Trash2 className="h-4 w-4" /> Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default SegmentsScreen;
