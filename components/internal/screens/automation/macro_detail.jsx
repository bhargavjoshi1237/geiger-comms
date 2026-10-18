"use client";

// Macro editor: suite editor frame over the reply, its actions and who can use it. Edits are local until Save, which lifts optimistically to the Macros list and rolls back on failure.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  ListChecks,
  Loader2,
  MessageSquareText,
  Plus,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import {
  EmptyState,
  Field,
  SectionCard,
} from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { updateMacro } from "@/lib/supabase/macros";
import { listTeammates } from "@/lib/supabase/teammates";
import { listTags } from "@/lib/supabase/tags";
import { cn } from "@/lib/utils";
import { TICKET_STATE_OPTIONS } from "../inbox/constants";
import {
  MACRO_ACTION_CATALOG,
  MACRO_SCOPE_MAP,
  MACRO_SNOOZE_OPTIONS,
  PRIORITY_OPTIONS,
  formatDate,
  renderMacroPreview,
} from "./constants";
import { MACRO_SCOPE_OPTIONS, MacroBodyField } from "./macro_dialog";

const NAV = [
  {
    group: "Macro",
    items: [
      {
        key: "reply",
        label: "Reply",
        icon: MessageSquareText,
        desc: "The text that goes into the composer. Variables fill in from the conversation.",
      },
      {
        key: "actions",
        label: "Actions",
        icon: ListChecks,
        desc: "What else happens when a teammate uses this macro, in order.",
      },
      {
        key: "availability",
        label: "Availability",
        icon: Users,
        desc: "Who can see and use this macro.",
      },
    ],
  },
  {
    group: "Advanced",
    items: [
      {
        key: "danger",
        label: "Danger zone",
        icon: ShieldAlert,
        desc: "Destructive actions for this macro.",
      },
    ],
  },
];
const SECTION_KEYS = new Set(NAV.flatMap((g) => g.items.map((i) => i.key)));

// Catalog `field` → the config key it writes, its static options, and its starting value.
const FIELD_CONFIG = {
  teammate: { key: "teammateId", placeholder: "Choose a teammate" },
  tag: { key: "tag", placeholder: "Choose a tag" },
  priority: { key: "priority", options: PRIORITY_OPTIONS, initial: "Urgent" },
  snooze: { key: "snooze", options: MACRO_SNOOZE_OPTIONS, initial: "1h" },
  ticketState: { key: "state", options: TICKET_STATE_OPTIONS, initial: "in_progress" },
};

// Tag actions may repeat (add two tags); everything else makes sense once.
const REPEATABLE = new Set(["tag.add", "tag.remove"]);

const catalogFor = (key) => MACRO_ACTION_CATALOG.find((c) => c.key === key) || null;

function newAction(key) {
  const entry = catalogFor(key);
  const field = entry?.field ? FIELD_CONFIG[entry.field] : null;
  return field ? { action: key, [field.key]: field.initial ?? "" } : { action: key };
}

// The label of the first action still missing its required value, or null when all are complete.
function firstIncomplete(actions) {
  for (const a of actions) {
    const entry = catalogFor(a.action);
    const field = entry?.field ? FIELD_CONFIG[entry.field] : null;
    if (field && !a[field.key]) return entry.label;
  }
  return null;
}

const snapshot = (m) => ({
  name: m?.name ?? "",
  body: m?.body ?? "",
  scope: m?.scope ?? "team",
  actions: Array.isArray(m?.actions) ? m.actions : [],
});

function ActionControl({ action, entry, teammates, tags, onChange }) {
  const field = entry?.field ? FIELD_CONFIG[entry.field] : null;
  if (!field) return null;
  const value = action[field.key] || "";

  let options = field.options;
  if (entry.field === "teammate") {
    options = teammates.map((t) => ({ value: t.id, label: t.name || t.email || "Teammate" }));
    // Keep a saved teammate selectable even if they've since left the workspace.
    if (value && !options.some((o) => o.value === value)) {
      options = [{ value, label: action.teammateName || "Former teammate" }, ...options];
    }
  } else if (entry.field === "tag") {
    options = tags.map((t) => ({ value: t.name, label: t.name }));
    if (value && !options.some((o) => o.value === value)) {
      options = [{ value, label: value }, ...options];
    }
  }

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const patch = { [field.key]: next };
        if (entry.field === "teammate") {
          patch.teammateName = options.find((o) => o.value === next)?.label ?? "";
        }
        onChange(patch);
      }}
    >
      <SelectTrigger className="h-9 w-full sm:w-56">
        <SelectValue placeholder={field.placeholder ?? "Choose…"} />
      </SelectTrigger>
      <SelectContent>
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-text-tertiary">
            {entry.field === "tag" ? "No tags in this workspace yet" : "No teammates yet"}
          </div>
        ) : (
          options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function AddActionMenu({ actions, onAdd }) {
  const used = new Set(actions.map((a) => a.action));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add action
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 border-border bg-surface-subtle">
        {MACRO_ACTION_CATALOG.map((c) => (
          <DropdownMenuItem
            key={c.key}
            disabled={used.has(c.key) && !REPEATABLE.has(c.key)}
            className="cursor-pointer flex-col items-start gap-0.5 focus:bg-surface-hover"
            onSelect={() => onAdd(c.key)}
          >
            <span className="text-sm text-foreground">{c.label}</span>
            <span className="text-xs text-text-secondary">{c.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MacroDetailScreen({
  macro,
  projectId,
  userId,
  onBack,
  onUpdate,
  onDuplicate,
  onDelete,
}) {
  const { section, setSection } = useWorkspaceUrl();
  const [form, setForm] = useState(() => snapshot(macro));
  const [seedId, setSeedId] = useState(macro?.id);
  const [saving, setSaving] = useState(false);
  const [teammates, setTeammates] = useState([]);
  const [tags, setTags] = useState([]);

  // Re-seed when the editor swaps to another macro (adjusting state during render beats a post-paint effect).
  if (macro && macro.id !== seedId) {
    setSeedId(macro.id);
    setForm(snapshot(macro));
  }

  useEffect(() => {
    let alive = true;
    Promise.all([listTeammates({ projectId }), listTags({ projectId })]).then(
      ([mates, tagRows]) => {
        if (!alive) return;
        setTeammates(mates ?? []);
        setTags(tagRows ?? []);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(snapshot(macro)),
    [form, macro],
  );

  if (!macro) return null;

  const active = SECTION_KEYS.has(section) ? section : "reply";
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setAction = (index, patch) =>
    set({ actions: form.actions.map((a, i) => (i === index ? { ...a, ...patch } : a)) });

  const ownedByOther = Boolean(macro.createdBy) && macro.createdBy !== userId;
  // Without a signed-in owner a private macro would be invisible to everyone.
  const privateLocked = ownedByOther || !userId;

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Give the macro a name.");
      setSection("reply");
      return;
    }
    const missing = firstIncomplete(form.actions);
    if (missing) {
      toast.error(`Finish setting up "${missing}" or remove it.`);
      setSection("actions");
      return;
    }
    const patch = { name: form.name.trim(), body: form.body, scope: form.scope, actions: form.actions };
    // Claiming an unowned macro as private makes you its owner, so it stays visible to you.
    if (form.scope === "personal" && !macro.createdBy && userId) patch.createdBy = userId;
    const previous = macro;
    setSaving(true);
    onUpdate?.({ ...macro, ...patch, updatedAt: new Date().toISOString() });
    const saved = await updateMacro(macro.id, patch);
    setSaving(false);
    if (!saved) {
      onUpdate?.(previous);
      toast.error("Couldn't save the macro.");
      return;
    }
    onUpdate?.(saved);
    setForm(snapshot(saved));
    toast.success("Macro saved");
  }

  const uses = macro.usageCount || 0;
  const meta = [
    `Used ${uses.toLocaleString("en-US")} time${uses === 1 ? "" : "s"}`,
    macro.updatedAt ? `Updated ${formatDate(macro.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <EditorShell
      back={{ label: "All macros", onClick: onBack }}
      title={form.name.trim() || macro.name || "Untitled macro"}
      status={form.scope}
      statusMap={MACRO_SCOPE_MAP}
      meta={meta}
      badges={
        dirty ? (
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
            onClick={() => onDuplicate?.(macro)}
          >
            <Copy className="h-4 w-4" /> Duplicate
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!dirty || saving}
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
      nav={NAV}
      subject={macro}
      active={active}
      onActiveChange={setSection}
    >
      {active === "reply" ? (
        <div className="space-y-6">
          <SectionCard title="Reply" description="Saved with the Save button above.">
            <div className="grid gap-4">
              <Field label="Name" htmlFor="macro-name" hint="How teammates find it in a list.">
                <Input
                  id="macro-name"
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Refund approved"
                  className="h-9 sm:max-w-sm"
                />
              </Field>
              <Field label="Reply text" htmlFor="macro-body">
                <MacroBodyField
                  id="macro-body"
                  value={form.body}
                  onChange={(body) => set({ body })}
                  rows={7}
                />
              </Field>
            </div>
          </SectionCard>
          <SectionCard title="Preview" description="Variables shown with sample values.">
            {form.body.trim() ? (
              <div className="max-w-xl whitespace-pre-wrap rounded-xl rounded-br-sm border border-border bg-surface-card px-4 py-3 text-sm text-foreground">
                {renderMacroPreview(form.body)}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">Write a reply to preview it.</p>
            )}
          </SectionCard>
        </div>
      ) : null}

      {active === "actions" ? (
        <SectionCard
          title={`Actions (${form.actions.length})`}
          description="Run in this order after the reply is inserted."
          action={
            <AddActionMenu
              actions={form.actions}
              onAdd={(key) => set({ actions: [...form.actions, newAction(key)] })}
            />
          }
        >
          {form.actions.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Reply only"
              description="Add an action to assign, tag, snooze or close the conversation in the same click."
              className="py-8"
            />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface-subtle">
              {form.actions.map((action, i) => {
                const entry = catalogFor(action.action);
                return (
                  <div
                    key={`${action.action}-${i}`}
                    className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-card text-xs tabular-nums text-text-secondary">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {entry?.label || action.action}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {entry?.description || "Unknown action — remove it to save."}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <ActionControl
                        action={action}
                        entry={entry}
                        teammates={teammates}
                        tags={tags}
                        onChange={(patch) => setAction(i, patch)}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${entry?.label || "action"}`}
                        className="text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                        onClick={() =>
                          set({ actions: form.actions.filter((_, j) => j !== i) })
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      ) : null}

      {active === "availability" ? (
        <SectionCard
          title="Who can use it"
          description={
            ownedByOther
              ? "A teammate created this macro, so only they can make it private."
              : !userId
                ? "Sign in to keep a macro private to you."
                : "Private macros stay out of everyone else's list."
          }
        >
          <RadioGroup
            value={form.scope}
            onValueChange={(scope) => set({ scope })}
            className="grid gap-3 sm:grid-cols-2"
          >
            {MACRO_SCOPE_OPTIONS.map((o) => {
              const disabled = o.value === "personal" && privateLocked;
              return (
                <Label
                  key={o.value}
                  htmlFor={`macro-scope-${o.value}`}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border bg-surface-card p-3 font-normal transition-colors",
                    form.scope === o.value
                      ? "border-border-strong"
                      : "border-border hover:bg-surface-hover",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <RadioGroupItem
                    id={`macro-scope-${o.value}`}
                    value={o.value}
                    disabled={disabled}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{o.label}</span>
                    <span className="block text-xs text-text-secondary">{o.hint}</span>
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        </SectionCard>
      ) : null}

      {active === "danger" ? (
        <SectionCard
          title="Danger zone"
          description="Deleting removes this macro for everyone. Replies already sent with it stay in their conversations."
        >
          <Button
            type="button"
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={() => onDelete?.(macro)}
          >
            <Trash2 className="h-4 w-4" /> Delete macro
          </Button>
        </SectionCard>
      ) : null}
    </EditorShell>
  );
}

export default MacroDetailScreen;
