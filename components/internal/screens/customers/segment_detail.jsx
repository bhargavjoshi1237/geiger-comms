"use client";

// The segment editor (?segment=<id>): rule builder with a live SQL-counted preview of unsaved rules; built-ins are read-only.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ListFilter, Loader2, Plus, RefreshCw, Save, Trash2, Users } from "lucide-react";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import {
  Avatar,
  AvatarFallback,
  Button,
  Input,
  LogoLoading,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  Field,
  SectionCard,
  StatGrid,
} from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { countSegments, listSegmentContacts } from "@/lib/supabase/segments";
import {
  LIFECYCLE_MAP,
  SEGMENT_OPERATOR_LABELS,
  SUBSCRIPTION_OPTIONS,
  blankRule,
  completeRules,
  formatDateTime,
  formatRelativeTime,
  initialsOf,
  ruleSummary,
} from "./constants";

const NAV = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: ListFilter,
        desc: "The rules behind this audience and who matches right now.",
      },
      {
        key: "people",
        label: "People",
        icon: Users,
        desc: "Everyone currently in this segment.",
      },
    ],
  },
];

const PAGE = 100;

// Debounced server-side count (+ optional first page) for a rule set.
export function useSegmentPreview({ projectId, rules, limit = 0, version = 0 }) {
  const key = JSON.stringify([completeRules(rules), limit, version, projectId]);
  const [state, setState] = useState({ key: null, count: null, people: [] });
  useEffect(() => {
    let alive = true;
    const [parsed, size, , project] = JSON.parse(key);
    const timer = setTimeout(async () => {
      const [counts, people] = await Promise.all([
        countSegments({ projectId: project, sets: { preview: parsed } }),
        size ? listSegmentContacts({ projectId: project, rules: parsed, limit: size }) : Promise.resolve([]),
      ]);
      if (alive) setState({ key, count: counts ? counts.preview : null, people: people ?? [] });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key]);
  return { loading: state.key !== key, count: state.count, people: state.people };
}

// Everyone matching the saved rules, a page at a time.
function useSegmentMembers({ projectId, rules, version }) {
  const key = JSON.stringify([completeRules(rules), version]);
  const [state, setState] = useState({ key: null, rows: [], done: false, failed: false });
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    let alive = true;
    const [parsed] = JSON.parse(key);
    listSegmentContacts({ projectId, rules: parsed, limit: PAGE }).then((rows) => {
      if (!alive) return;
      setState({ key, rows: rows ?? [], done: !rows || rows.length < PAGE, failed: rows === null });
    });
    return () => {
      alive = false;
    };
  }, [key, projectId]);

  async function loadMore() {
    setLoadingMore(true);
    const [parsed] = JSON.parse(key);
    const rows = await listSegmentContacts({ projectId, rules: parsed, limit: PAGE, offset: state.rows.length });
    setLoadingMore(false);
    if (!rows) {
      toast.error("Couldn't load more people.");
      return;
    }
    setState((s) => (s.key === key ? { ...s, rows: [...s.rows, ...rows], done: rows.length < PAGE } : s));
  }

  return { loading: state.key !== key, ...state, loadingMore, loadMore };
}

function RuleValue({ field, value, onChange }) {
  const select = (options, placeholder) => (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger size="sm" className="sm:flex-1" aria-label={`${field.label} value`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (field.input === "lifecycle") {
    return select(
      Object.entries(LIFECYCLE_MAP).map(([v, meta]) => ({ value: v, label: meta.label })),
      "Choose a stage",
    );
  }
  if (field.input === "subscription") return select(SUBSCRIPTION_OPTIONS, "Choose");
  if (field.input === "boolean") {
    return select(
      [
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ],
      "Choose",
    );
  }
  if (field.input === "options") {
    return select((field.options || []).map((o) => ({ value: o, label: o })), "Choose");
  }
  if (field.input === "days") {
    return (
      <span className="flex items-center gap-2 sm:flex-1">
        <Input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="7"
          className="h-8 w-24"
          aria-label="Days"
        />
        <span className="text-xs text-text-secondary">days</span>
      </span>
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value…"
      className="h-8 sm:flex-1"
      aria-label={`${field.label} value`}
    />
  );
}

function RuleRow({ rule, fields, onChange, onRemove }) {
  const field = fields.find((f) => f.value === rule.field);
  const remove = (
    <button
      type="button"
      onClick={onRemove}
      className="self-end text-text-tertiary transition-colors hover:text-red-300 sm:self-center"
      aria-label="Remove rule"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
  if (!field) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary">
        {ruleSummary(rule, fields)} — this attribute no longer exists
        {remove}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={field.value}
        onValueChange={(v) => {
          const next = fields.find((f) => f.value === v);
          onChange({ field: v, operator: next.operators[0], value: "" });
        }}
      >
        <SelectTrigger size="sm" className="sm:w-44" aria-label="Rule field">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.value} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {field.operators.length > 1 ? (
        <Select value={rule.operator} onValueChange={(v) => onChange({ ...rule, operator: v })}>
          <SelectTrigger size="sm" className="sm:w-32" aria-label="Rule operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.operators.map((op) => (
              <SelectItem key={op} value={op}>
                {SEGMENT_OPERATOR_LABELS[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="text-xs text-text-secondary sm:w-32">
          {SEGMENT_OPERATOR_LABELS[field.operators[0]]}
        </span>
      )}
      <RuleValue field={field} value={rule.value} onChange={(value) => onChange({ ...rule, value })} />
      {remove}
    </div>
  );
}

export function RulesEditor({ rules, fields, onChange }) {
  return (
    <div className="space-y-2">
      {rules.length === 0 ? (
        <p className="text-sm text-text-tertiary">No rules — this segment matches everyone.</p>
      ) : (
        rules.map((rule, i) => (
          <RuleRow
            key={i}
            rule={rule}
            fields={fields}
            onChange={(next) => onChange(rules.map((r, j) => (j === i ? next : r)))}
            onRemove={() => onChange(rules.filter((_, j) => j !== i))}
          />
        ))
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
        onClick={() => onChange([...rules, blankRule(fields)])}
      >
        <Plus className="h-4 w-4" /> Add rule
      </Button>
    </div>
  );
}

const columns = [
  {
    key: "person",
    header: "Person",
    render: (row) => (
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-surface-card text-xs text-text-secondary">
            {initialsOf(row.name, row.email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          <p className="truncate text-xs text-text-secondary">{row.email || "No email"}</p>
        </div>
      </div>
    ),
  },
  {
    key: "company",
    header: "Company",
    render: (row) => <span className="text-sm text-text-secondary">{row.company || "—"}</span>,
  },
  {
    key: "seen",
    header: "Last seen",
    render: (row) => (
      <span className="whitespace-nowrap text-sm text-text-secondary">
        {formatRelativeTime(row.updatedAt)}
      </span>
    ),
  },
];

export function SegmentDetailScreen({
  segment,
  projectId,
  fields,
  onBack,
  onSave,
  onDelete,
  onDuplicate,
}) {
  const [active, setActive] = useState("overview");
  const [name, setName] = useState(segment.name);
  const [description, setDescription] = useState(segment.description);
  const [rules, setRules] = useState(segment.rules || []);
  const [seed, setSeed] = useState(`${segment.id}|${segment.updatedAt}`);
  const [version, setVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const { openPersonInTab } = useWorkspaceUrl();

  // Re-seed on another segment or a newly saved version; a failed save keeps updatedAt, so unsaved edits survive.
  if (`${segment.id}|${segment.updatedAt}` !== seed) {
    setSeed(`${segment.id}|${segment.updatedAt}`);
    setName(segment.name);
    setDescription(segment.description);
    setRules(segment.rules || []);
  }

  const saved = useSegmentPreview({ projectId, rules: segment.rules, version });
  const preview = useSegmentPreview({ projectId, rules, limit: 8, version });
  const members = useSegmentMembers({ projectId, rules: segment.rules, version });

  const dirty =
    name !== segment.name ||
    description !== segment.description ||
    JSON.stringify(rules) !== JSON.stringify(segment.rules || []);

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Give the segment a name.");
      return;
    }
    setSaving(true);
    const ok = await onSave({ name: name.trim(), description: description.trim(), rules: completeRules(rules) });
    setSaving(false);
    if (ok) toast.success("Segment saved");
  }

  const openPerson = (row) => openPersonInTab(row.id, "People");
  const countLabel = saved.count === null ? "—" : saved.count.toLocaleString("en-US");

  return (
    <EditorShell
      back={{ label: "Segments", onClick: onBack }}
      title={segment.name}
      meta={[
        saved.loading ? "Counting…" : `${countLabel} ${saved.count === 1 ? "person" : "people"}`,
        segment.builtIn ? "Built-in" : "Saved",
        segment.updatedAt ? `Edited ${formatDateTime(segment.updatedAt)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      badges={
        dirty && !segment.builtIn ? (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
            Unsaved changes
          </span>
        ) : null
      }
      actions={
        <>
          <Button
            variant="outline"
            className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            onClick={() => setVersion((v) => v + 1)}
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button
            variant="outline"
            className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            onClick={() => onDuplicate?.(segment)}
          >
            <Copy className="h-4 w-4" /> Duplicate
          </Button>
          {!segment.builtIn ? (
            <>
              <Button
                variant="outline"
                className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                onClick={() => onDelete?.(segment)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={!dirty || saving}
                onClick={() => void handleSave()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </>
          ) : null}
        </>
      }
      nav={NAV}
      subject={segment}
      active={active}
      onActiveChange={setActive}
    >
      {active === "overview" ? (
        <div className="space-y-6">
          <StatGrid
            stats={[
              { label: "Matching now", value: saved.loading ? "…" : countLabel },
              {
                label: dirty ? "With your edits" : "Rules",
                value: dirty
                  ? preview.loading
                    ? "…"
                    : preview.count === null
                      ? "—"
                      : preview.count.toLocaleString("en-US")
                  : String(completeRules(segment.rules).length),
              },
              { label: "Last edited", value: segment.updatedAt ? formatRelativeTime(segment.updatedAt) : "—" },
              { label: "Type", value: segment.builtIn ? "Built-in" : "Saved" },
            ]}
          />
          <SectionCard
            title="Definition"
            description={
              segment.builtIn
                ? "Built-in segments are read-only — duplicate one to change it."
                : "People who match every rule below."
            }
          >
            {segment.builtIn ? (
              <div className="space-y-2">
                {completeRules(segment.rules).length === 0 ? (
                  <p className="text-sm text-text-tertiary">No rules — matches everyone.</p>
                ) : (
                  completeRules(segment.rules).map((rule, i) => (
                    <p
                      key={i}
                      className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary"
                    >
                      {ruleSummary(rule, fields)}
                    </p>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" htmlFor="segment-name">
                    <Input
                      id="segment-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9"
                    />
                  </Field>
                  <Field label="Description" htmlFor="segment-description">
                    <Input
                      id="segment-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Who this audience is for"
                      className="h-9"
                    />
                  </Field>
                </div>
                <RulesEditor rules={rules} fields={fields} onChange={setRules} />
              </div>
            )}
          </SectionCard>
          <SectionCard
            title={`Preview${preview.loading || preview.count === null ? "" : ` (${preview.count.toLocaleString("en-US")})`}`}
            description="The newest matches for the rules as they stand, unsaved edits included."
            bodyPadding={preview.loading || preview.people.length === 0}
          >
            {preview.loading ? (
              <span className="inline-flex items-center gap-2 text-sm text-text-tertiary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting…
              </span>
            ) : preview.count === null ? (
              <EmptyState
                icon={Users}
                title="Couldn't evaluate these rules"
                description="The segment service didn't respond. Try Refresh."
              />
            ) : preview.people.length ? (
              <DataTable
                columns={columns}
                data={preview.people}
                getRowKey={(row) => row.id}
                onRowClick={openPerson}
              />
            ) : (
              <EmptyState
                icon={Users}
                title="Nobody matches yet"
                description="Loosen a rule to widen the audience."
              />
            )}
          </SectionCard>
        </div>
      ) : null}

      {active === "people" ? (
        <SectionCard
          title={`People (${countLabel})`}
          bodyPadding={members.loading || members.rows.length === 0}
        >
          {members.loading ? (
            <div className="flex justify-center py-10">
              <LogoLoading size={40} aria-label="Loading people" />
            </div>
          ) : members.failed ? (
            <EmptyState
              icon={Users}
              title="Couldn't load this segment"
              description="The segment service didn't respond. Try Refresh."
            />
          ) : members.rows.length ? (
            <div>
              <DataTable
                columns={columns}
                data={members.rows}
                getRowKey={(row) => row.id}
                onRowClick={openPerson}
              />
              {!members.done ? (
                <div className="flex justify-center p-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                    disabled={members.loadingMore}
                    onClick={() => void members.loadMore()}
                  >
                    {members.loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Load more
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="Nobody matches yet"
              description="Loosen a rule to widen the audience."
            />
          )}
        </SectionCard>
      ) : null}
    </EditorShell>
  );
}

export default SegmentDetailScreen;
