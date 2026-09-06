"use client";

// The segment editor: back link, match count, section nav over the rule
// builder and the live people preview. Custom edits persist to localStorage;
// built-in segments are read-only beyond duplication.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, ListFilter, Play, RefreshCw, Users } from "lucide-react";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { Avatar, AvatarFallback, Button, Input } from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  Field,
  SectionCard,
  StatGrid,
} from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  formatDateTime,
  formatRelativeTime,
  initialsOf,
  personMatchesSegment,
  ruleSummary,
} from "./constants";
import { RuleRow } from "./segments";

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

export function SegmentDetailScreen({
  segment,
  people,
  onBack,
  onUpdate,
  onDelete,
  onDuplicate,
}) {
  const [active, setActive] = useState("overview");
  const [name, setName] = useState(segment.name);
  const [rules, setRules] = useState(segment.rules || []);
  const [seedId, setSeedId] = useState(segment.id);
  const [refreshedAt, setRefreshedAt] = useState(segment.updatedAt);
  const { openPerson } = useWorkspaceUrl();

  const matched = useMemo(
    () => (people || []).filter((p) => personMatchesSegment(p, segment)),
    [people, segment],
  );

  const liveMatched = useMemo(() => {
    const effective = { ...segment, name, rules };
    return (people || []).filter((p) => personMatchesSegment(p, effective));
  }, [people, segment, name, rules]);

  // Re-seed when the editor swaps to another segment — adjusting state during
  // render beats an effect that fires after a wasted paint.
  if (segment && segment.id !== seedId) {
    setSeedId(segment.id);
    setName(segment.name);
    setRules(segment.rules || []);
    setRefreshedAt(segment.updatedAt);
  }

  if (!segment) return null;

  const dirty =
    name !== segment.name ||
    JSON.stringify(rules) !== JSON.stringify(segment.rules || []);

  function handleSave() {
    if (segment.builtIn) {
      toast.error("Duplicate a built-in segment to edit it.");
      return;
    }
    if (!name.trim()) {
      toast.error("Give the segment a name.");
      return;
    }
    onUpdate?.({
      ...segment,
      name: name.trim(),
      description: rules.map(ruleSummary).join(" · ") || "Custom audience.",
      rules: rules.filter((r) => r.field && r.value),
      updatedAt: new Date().toISOString(),
    });
    toast.success("Segment saved");
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
            <p className="truncate text-xs text-text-secondary">
              {[row.email, row.company].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "company",
      header: "Company",
      render: (row) => (
        <span className="text-sm text-text-secondary">{row.company || "—"}</span>
      ),
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

  return (
    <EditorShell
      back={{ label: "Segments", onClick: onBack }}
      title={segment.name}
      meta={[
        `${matched.length} contact${matched.length === 1 ? "" : "s"}`,
        segment.builtIn ? "Built-in" : "Custom",
        refreshedAt ? `Refreshed ${formatDateTime(refreshedAt)}` : null,
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
            onClick={() => {
              setRefreshedAt(new Date().toISOString());
              toast.success("Segment refreshed");
            }}
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
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!dirty}
              onClick={handleSave}
            >
              <Play className="h-4 w-4" /> Save
            </Button>
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
              { label: "Matching", value: String(liveMatched.length) },
              {
                label: "Rules",
                value: String(rules.filter((r) => r.field && r.value).length),
              },
              {
                label: "Refreshed",
                value: formatRelativeTime(refreshedAt),
              },
              { label: "Type", value: segment.builtIn ? "Built-in" : "Custom" },
            ]}
          />
          <SectionCard
            title="Definition"
            description={
              segment.builtIn
                ? "Built-in segments are read-only — duplicate to remix them."
                : "Everyone matching every rule below. Saves automatically on save."
            }
          >
            <Field label="Name" htmlFor="segment-name">
              <Input
                id="segment-name"
                value={name}
                disabled={segment.builtIn}
                onChange={(e) => setName(e.target.value)}
                className="h-9 sm:max-w-sm"
              />
            </Field>
            <div className="mt-4 space-y-2">
              {rules.length === 0 ? (
                <p className="text-sm text-text-tertiary">
                  No rules — this segment matches everyone.
                </p>
              ) : (
                rules.map((rule, i) =>
                  segment.builtIn ? (
                    <p
                      key={i}
                      className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-text-secondary"
                    >
                      {ruleSummary(rule)}
                    </p>
                  ) : (
                    <RuleRow
                      key={i}
                      rule={rule}
                      onChange={(next) =>
                        setRules((prev) => prev.map((r, j) => (j === i ? next : r)))
                      }
                      onRemove={() =>
                        setRules((prev) => prev.filter((_, j) => j !== i))
                      }
                    />
                  ),
                )
              )}
              {!segment.builtIn ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                  onClick={() =>
                    setRules((prev) => [
                      ...prev,
                      { field: "lifecycle", operator: "is", value: "" },
                    ])
                  }
                >
                  Add rule
                </Button>
              ) : null}
            </div>
            {!segment.builtIn && dirty ? (
              <div className="mt-4 flex justify-end">
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={handleSave}
                >
                  Save changes
                </Button>
              </div>
            ) : null}
          </SectionCard>
          <SectionCard
            title={`Preview (${liveMatched.length})`}
            description="Updates live as the rules change."
            bodyPadding={liveMatched.length > 0}
          >
            {liveMatched.length ? (
              <DataTable
                columns={columns}
                data={liveMatched.slice(0, 8)}
                getRowKey={(row) => row.id}
                onRowClick={(row) => openPerson(row.id)}
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
          title={`People (${matched.length})`}
          bodyPadding={matched.length > 0}
        >
          {matched.length ? (
            <DataTable
              columns={columns}
              data={matched}
              getRowKey={(row) => row.id}
              onRowClick={(row) => openPerson(row.id)}
            />
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
