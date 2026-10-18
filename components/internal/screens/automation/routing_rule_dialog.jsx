"use client";

// Create + edit dialog for one routing rule: name, conditions, strategy, who it assigns to, enabled.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import { ChipMultiSelect } from "./rule_fields";
import {
  AVAILABILITY_MAP,
  CHANNEL_OPTIONS,
  PRIORITY_OPTIONS,
  ROUTING_STRATEGY_MAP,
} from "./constants";

// Radix Select can't hold an empty value, so "everyone" is a sentinel.
const ALL_TEAMMATES = "__all";

function draftFrom(rule) {
  return {
    name: rule?.name ?? "",
    channel: rule?.match?.channel ?? [],
    priority: rule?.match?.priority ?? [],
    tags: rule?.match?.tags ?? [],
    strategy: rule?.strategy ?? "round_robin",
    teamId: rule?.teamId ?? null,
    fallbackAssigneeId: rule?.fallbackAssigneeId ?? null,
    enabled: rule?.enabled ?? true,
  };
}

// `rule` null → create. `onSave(draft)` resolves truthy when the dialog may close.
export function RoutingRuleDialog({
  open,
  rule,
  teams,
  teammates,
  tagNames,
  onCancel,
  onSave,
}) {
  const [draft, setDraft] = useState(() => draftFrom(rule));
  const [seed, setSeed] = useState({ open, id: rule?.id ?? null });
  const [busy, setBusy] = useState(false);

  // Re-seed whenever the dialog opens or switches to another rule.
  if (open !== seed.open || (rule?.id ?? null) !== seed.id) {
    setSeed({ open, id: rule?.id ?? null });
    if (open) setDraft(draftFrom(rule));
  }

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const isDirect = draft.strategy === "direct";
  const tagOptions = [...new Set([...(tagNames || []), ...draft.tags])].map(
    (t) => ({ value: t, label: `#${t}` }),
  );
  const canSave =
    draft.name.trim() && (!isDirect || draft.fallbackAssigneeId) && !busy;

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    const ok = await onSave({
      name: draft.name.trim(),
      match: { channel: draft.channel, priority: draft.priority, tags: draft.tags },
      strategy: draft.strategy,
      teamId: isDirect ? null : draft.teamId,
      fallbackAssigneeId: isDirect ? draft.fallbackAssigneeId : null,
      enabled: draft.enabled,
    });
    setBusy(false);
    if (ok) onCancel();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit routing rule" : "New routing rule"}</DialogTitle>
          <DialogDescription>
            Which conversations this rule catches, and who they go to.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Rule name" htmlFor="routing-rule-name">
            <Input
              id="routing-rule-name"
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. Email round-robin"
            />
          </Field>

          <Field label="Channel" hint="Leave all off to match every channel.">
            <ChipMultiSelect
              options={CHANNEL_OPTIONS}
              value={draft.channel}
              onChange={set("channel")}
              anyLabel="Any channel"
              ariaLabel="Channels"
            />
          </Field>

          <Field label="Priority">
            <ChipMultiSelect
              options={PRIORITY_OPTIONS}
              value={draft.priority}
              onChange={set("priority")}
              anyLabel="Any priority"
              ariaLabel="Priorities"
            />
          </Field>

          <Field label="Tags">
            {tagOptions.length ? (
              <ChipMultiSelect
                options={tagOptions}
                value={draft.tags}
                onChange={set("tags")}
                anyLabel="Any tags"
                ariaLabel="Tags"
              />
            ) : (
              <p className="text-xs text-text-tertiary">
                No tags in this project yet.
              </p>
            )}
          </Field>

          <Field label="Strategy">
            <div role="radiogroup" aria-label="Strategy" className="grid gap-2 sm:grid-cols-3">
              {Object.entries(ROUTING_STRATEGY_MAP).map(([value, s]) => {
                const active = draft.strategy === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set("strategy")(value)}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                      active
                        ? "border-border-strong bg-surface-active"
                        : "border-border bg-surface-card hover:bg-surface-hover",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className={cn("h-1.5 w-1.5 rounded-full", s.dotClass)} />
                      {s.label}
                    </span>
                    <span className="text-xs text-text-secondary">{s.description}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          {isDirect ? (
            <Field label="Teammate" htmlFor="routing-rule-teammate">
              <Select
                value={draft.fallbackAssigneeId ?? ""}
                onValueChange={set("fallbackAssigneeId")}
              >
                <SelectTrigger id="routing-rule-teammate">
                  <SelectValue placeholder="Choose a teammate" />
                </SelectTrigger>
                <SelectContent>
                  {(teammates || []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            AVAILABILITY_MAP[t.availability]?.dotClass ?? "bg-[#737373]",
                          )}
                        />
                        {t.name || t.email || "Teammate"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field
              label="Team"
              htmlFor="routing-rule-team"
              hint="Only available members of this team are in the rotation."
            >
              <Select
                value={draft.teamId ?? ALL_TEAMMATES}
                onValueChange={(v) => set("teamId")(v === ALL_TEAMMATES ? null : v)}
              >
                <SelectTrigger id="routing-rule-team">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TEAMMATES}>All available teammates</SelectItem>
                  {(teams || []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name || "Untitled team"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-card px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-foreground">Enabled</p>
              <p className="text-xs text-text-secondary">
                Disabled rules keep their place but are skipped.
              </p>
            </div>
            <Switch
              checked={draft.enabled}
              onCheckedChange={set("enabled")}
              aria-label="Enabled"
            />
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!canSave}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {rule ? "Save rule" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RoutingRuleDialog;
