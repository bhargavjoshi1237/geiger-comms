"use client";

// The linear step-list builder. `steps` is canonical; steps[0] is the trigger. Edits flow up through onChange so the builder can persist.

import { Fragment } from "react";
import { ArrowDown, MoveDown, MoveUp, Plus, Trash2, Zap } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@geiger/ui";

import { cn } from "@/lib/utils";
import {
  TRIGGER_CATALOG,
  CONDITION_CATALOG,
  ACTION_CATALOG,
  catalogEntry,
  defaultConfig,
  fieldOptions,
  groupByGroup,
} from "./workflow_catalog";

const newStepId = () => `step_${crypto.randomUUID()}`;

// Selects sized from the shared input-box tokens so a select and an input in one row are the same height.
const SELECT_AS_INPUT =
  "!h-auto !rounded-[var(--input-box-radius)] !px-[var(--input-box-padding-x)] !py-[var(--input-box-padding-y)] leading-5";

// One config control, rendered from a catalog field descriptor.
function FieldControl({ field, value, onChange }) {
  if (field.type === "select") {
    return (
      <Select value={value || field.default} onValueChange={onChange}>
        <SelectTrigger className={SELECT_AS_INPUT}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fieldOptions(field).map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "textarea") {
    // Fixed height + no resize keeps neighbouring step cards even.
    return (
      <Textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.label}
        className="h-[84px] min-h-0 resize-none"
      />
    );
  }
  return (
    <Input
      type={field.type === "number" ? "number" : "text"}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.label}
    />
  );
}

// Inline config grid; a textarea or a lone field takes the full row so no card is left half-empty.
function FieldGrid({ entry, config, onChange, className }) {
  if (!entry?.fields?.length) return null;
  return (
    <div className={cn("mt-3 grid gap-3 sm:grid-cols-2", className)}>
      {entry.fields.map((field) => (
        <div
          key={field.key}
          className={cn(
            "space-y-1.5",
            (field.type === "textarea" || entry.fields.length === 1) && "sm:col-span-2",
          )}
        >
          <label className="text-xs font-medium text-text-secondary">{field.label}</label>
          <FieldControl
            field={field}
            value={config?.[field.key]}
            onChange={(v) => onChange(field.key, v)}
          />
        </div>
      ))}
    </div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-1.5" aria-hidden>
      <ArrowDown className="h-4 w-4 text-text-tertiary" />
    </div>
  );
}

// Trigger picker grouped like the catalog (Conversations / Time-based / Tickets).
export function TriggerSelect({ value, onChange, className }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Choose a trigger" />
      </SelectTrigger>
      <SelectContent>
        {groupByGroup(TRIGGER_CATALOG).map((group) => (
          <SelectGroup key={group.group}>
            <SelectLabel className="text-text-tertiary">{group.group}</SelectLabel>
            {group.items.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddStepMenu({ onAdd }) {
  const actionGroups = groupByGroup(ACTION_CATALOG);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full border-dashed border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> Add step
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="max-h-80 w-64 overflow-y-auto border-border bg-surface-card shadow-xl"
      >
        <DropdownMenuLabel className="text-text-tertiary">Conditions</DropdownMenuLabel>
        {CONDITION_CATALOG.map((c) => {
          const Icon = c.icon;
          return (
            <DropdownMenuItem
              key={c.key}
              className="cursor-pointer gap-2 text-muted-foreground focus:bg-surface-hover focus:text-foreground"
              onClick={() => onAdd("condition", c.key)}
            >
              <Icon className="h-4 w-4" /> {c.label}
            </DropdownMenuItem>
          );
        })}
        {actionGroups.map((group) => (
          <Fragment key={group.group}>
            <DropdownMenuSeparator className="bg-surface-strong" />
            <DropdownMenuLabel className="text-text-tertiary">{group.group}</DropdownMenuLabel>
            {group.items.map((a) => {
              const Icon = a.icon;
              return (
                <DropdownMenuItem
                  key={a.key}
                  className="cursor-pointer gap-2 text-muted-foreground focus:bg-surface-hover focus:text-foreground"
                  onClick={() => onAdd("action", a.key)}
                >
                  <Icon className="h-4 w-4" /> {a.label}
                </DropdownMenuItem>
              );
            })}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkflowStepList({ steps, onChange }) {
  const list = Array.isArray(steps) ? steps : [];
  const triggerStep = list[0];
  const rest = list.slice(1);
  const triggerEntry = catalogEntry(triggerStep?.type);
  const TriggerIcon = triggerEntry?.icon || Zap;

  // A new trigger type starts from its own defaults rather than the old trigger's config.
  const setTriggerType = (type) => {
    const next = [...list];
    next[0] = { ...next[0], type, config: defaultConfig(catalogEntry(type)) };
    onChange(next);
  };

  const setStepConfig = (index, key, value) => {
    const next = [...list];
    const step = next[index];
    next[index] = { ...step, config: { ...step.config, [key]: value } };
    onChange(next);
  };

  const addStep = (kind, type) => {
    const step = {
      id: newStepId(),
      kind,
      type,
      config: defaultConfig(catalogEntry(type)),
      position: { x: 0, y: list.length * 150 },
    };
    onChange([...list, step]);
  };

  const removeStep = (index) => onChange(list.filter((_, i) => i !== index));

  const moveStep = (index, dir) => {
    const target = index + dir;
    if (target < 1 || target >= list.length) return; // keep trigger at [0]
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-xl border border-border bg-surface-subtle p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <TriggerIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              When this happens
            </p>
            <TriggerSelect
              value={triggerStep?.type}
              onChange={setTriggerType}
              className="mt-1 h-9 border-0 bg-transparent px-0 text-sm font-medium text-foreground shadow-none focus:ring-0"
            />
          </div>
        </div>
        <FieldGrid
          entry={triggerEntry}
          config={triggerStep?.config}
          onChange={(key, v) => setStepConfig(0, key, v)}
          className="pl-12"
        />
      </div>

      {rest.map((step, i) => {
        const index = i + 1;
        const entry = catalogEntry(step.type);
        const Icon = entry?.icon || Zap;
        const isCondition = step.kind === "condition";
        return (
          <Fragment key={step.id}>
            <Connector />
            <div className="rounded-xl border border-border bg-surface-subtle p-4">
              <div className="flex items-start gap-3">
                <div
                  className={
                    isCondition
                      ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                  }
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                    {isCondition ? "Only continue if" : "Then do this"}
                  </p>
                  <p className="text-sm font-medium text-foreground">{entry?.label || step.type}</p>
                  {!entry?.fields?.length && entry?.description ? (
                    <p className="mt-0.5 text-xs text-text-secondary">{entry.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-text-tertiary hover:bg-surface-active hover:text-foreground"
                    aria-label="Move up"
                    disabled={index === 1}
                    onClick={() => moveStep(index, -1)}
                  >
                    <MoveUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-text-tertiary hover:bg-surface-active hover:text-foreground"
                    aria-label="Move down"
                    disabled={index === list.length - 1}
                    onClick={() => moveStep(index, 1)}
                  >
                    <MoveDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300 dark:hover:text-red-300"
                    aria-label="Remove step"
                    onClick={() => removeStep(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <FieldGrid
                entry={entry}
                config={step.config}
                onChange={(key, v) => setStepConfig(index, key, v)}
                className="pl-12"
              />
            </div>
          </Fragment>
        );
      })}

      <Connector />
      <AddStepMenu onAdd={addStep} />
    </div>
  );
}

export default WorkflowStepList;
