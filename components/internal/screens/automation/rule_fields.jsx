"use client";

// Form controls shared by the Automation editors (routing rules, SLA policies, macros): multi-value chips, a duration input, reorder buttons and an inline notice.

import { useState } from "react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from "@geiger/ui";
import { cn } from "@/lib/utils";
import { DURATION_UNITS, joinMinutes, splitMinutes } from "./constants";

// Multi-select as toggle chips. Nothing selected means "any", which `anyLabel` says out loud.
export function ChipMultiSelect({ options, value, onChange, anyLabel, ariaLabel, disabled }) {
  const selected = Array.isArray(value) ? value : [];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="multiple"
        variant="outline"
        size="sm"
        spacing={2}
        value={selected}
        onValueChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="flex-wrap"
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            className="border-border bg-surface-card text-xs text-muted-foreground data-[state=on]:border-border-strong data-[state=on]:bg-surface-active data-[state=on]:text-foreground"
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {anyLabel && selected.length === 0 ? (
        <span className="text-xs text-text-tertiary">{anyLabel}</span>
      ) : null}
    </div>
  );
}

// Minutes in, minutes out; the unit is local state so it survives an empty amount. Empty amount → null.
export function DurationField({ id, value, onChange, placeholder = "—", disabled }) {
  const [unit, setUnit] = useState(() => splitMinutes(value).unit);
  const factor = DURATION_UNITS.find((u) => u.value === unit)?.factor ?? 1;
  const n = Number(value);
  const amount = value == null || !n ? "" : String(+(n / factor).toFixed(2));
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        min={1}
        inputMode="numeric"
        value={amount}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(joinMinutes(e.target.value, unit))}
        className="w-24"
      />
      <Select
        value={unit}
        disabled={disabled}
        onValueChange={(next) => {
          setUnit(next);
          onChange(joinMinutes(amount, next));
        }}
      >
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DURATION_UNITS.map((u) => (
            <SelectItem key={u.value} value={u.value}>
              {u.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Up / down for ordered lists (routing rules and SLA policies apply top to bottom).
export function OrderButtons({ onUp, onDown, disableUp, disableDown, label = "item" }) {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-text-tertiary hover:bg-surface-active hover:text-foreground"
        aria-label={`Move ${label} up`}
        disabled={disableUp}
        onClick={(e) => {
          e.stopPropagation();
          onUp();
        }}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-text-tertiary hover:bg-surface-active hover:text-foreground"
        aria-label={`Move ${label} down`}
        disabled={disableDown}
        onClick={(e) => {
          e.stopPropagation();
          onDown();
        }}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// A quiet bordered notice for "how this behaves today" caveats above a list.
export function InlineNotice({ title, children, className }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border bg-surface-subtle px-4 py-3",
        className,
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
      <div className="min-w-0 text-sm">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        <div className="text-text-secondary">{children}</div>
      </div>
    </div>
  );
}
