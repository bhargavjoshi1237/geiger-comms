"use client";

// Shared Reports toolbar: date range (presets or picked days) plus channel / team / teammate filters, and the query every report section loads with.

import { useEffect, useMemo, useState } from "react";
import { addDays } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button, DatePicker, Popover, PopoverContent, PopoverTrigger } from "@geiger/ui";
import { Toolbar } from "@/components/internal/shared/screen_kit";
import FilterDropdown from "@/components/internal/shared/filter_dropdown";
import { listTeammates } from "@/lib/supabase/teammates";
import { listGroups } from "@/lib/supabase/team";
import { ALL, CHANNEL_OPTIONS, RANGE_OPTIONS, customRange, formatRange, presetRange } from "./constants";

// geiger-ui's DatePicker only styles a single selection; these paint the picked span.
const RANGE_CLASSNAMES = {
  range_start: "rounded-l-md bg-surface-active [&>button]:bg-primary [&>button]:text-primary-foreground",
  range_end: "rounded-r-md bg-surface-active [&>button]:bg-primary [&>button]:text-primary-foreground",
  range_middle: "bg-surface-active [&>button]:rounded-none",
};

export function useReportFilters(projectId) {
  const [rangeKey, setRangeKey] = useState("30");
  const [range, setRange] = useState(() => presetRange(30));
  const [channel, setChannel] = useState(ALL);
  const [teamId, setTeamId] = useState(ALL);
  const [teammateId, setTeammateId] = useState(ALL);
  const [teammates, setTeammates] = useState([]);
  const [teams, setTeams] = useState([]);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    Promise.all([listTeammates({ projectId }), listGroups(projectId)]).then(([mates, groups]) => {
      if (!alive) return;
      setTeammates(mates ?? []);
      setTeams(groups ?? []);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const query = useMemo(() => {
    if (!projectId) return null;
    const filter = {};
    if (channel !== ALL) filter.channel = channel;
    if (teamId !== ALL) filter.teamId = teamId;
    if (teammateId !== ALL) filter.teammateId = teammateId;
    return {
      projectId,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      filter,
    };
  }, [projectId, range, channel, teamId, teammateId]);

  // Switching to "custom" keeps the current window until days are picked.
  function selectRange(value) {
    setRangeKey(value);
    if (value !== "custom") setRange(presetRange(Number(value)));
  }

  return {
    query,
    range,
    rangeKey,
    selectRange,
    applyCustomRange: (picked) => setRange(customRange(picked)),
    channel,
    setChannel,
    teamId,
    setTeamId,
    teammateId,
    setTeammateId,
    teammates,
    teams,
    filtersActive: channel !== ALL || teamId !== ALL || teammateId !== ALL,
    clearFilters: () => {
      setChannel(ALL);
      setTeamId(ALL);
      setTeammateId(ALL);
    },
  };
}

function CustomRangeButton({ range, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [today, setToday] = useState(null);

  function handleOpenChange(next) {
    if (next) {
      setDraft({ from: range.from, to: addDays(range.to, -1) });
      setToday(new Date());
    }
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 rounded-lg border-border bg-surface-card px-3 text-xs font-medium text-foreground hover:bg-surface-subtle"
        >
          <CalendarDays className="h-3.5 w-3.5 text-text-secondary" />
          {formatRange(range)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <DatePicker
          mode="range"
          numberOfMonths={2}
          selected={draft}
          onSelect={setDraft}
          defaultMonth={draft?.from}
          disabled={today ? { after: today } : undefined}
          classNames={RANGE_CLASSNAMES}
        />
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!draft?.from || !draft?.to}
            onClick={() => {
              onApply(draft);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ReportToolbar({ filters }) {
  const teammateOptions = useMemo(
    () => [
      { value: ALL, label: "All teammates" },
      ...filters.teammates.map((t) => ({ value: t.id, label: t.name || t.email || "Teammate" })),
    ],
    [filters.teammates],
  );
  const teamOptions = useMemo(
    () => [
      { value: ALL, label: "All teams" },
      ...filters.teams.map((g) => ({ value: g.id, label: g.name || "Untitled team" })),
    ],
    [filters.teams],
  );

  return (
    <Toolbar>
      <div className="flex items-center gap-2">
        <FilterDropdown value={filters.rangeKey} onValueChange={filters.selectRange} options={RANGE_OPTIONS} />
        {filters.rangeKey === "custom" ? (
          <CustomRangeButton range={filters.range} onApply={filters.applyCustomRange} />
        ) : null}
        <FilterDropdown value={filters.channel} onValueChange={filters.setChannel} options={CHANNEL_OPTIONS} />
        {filters.teams.length ? (
          <FilterDropdown value={filters.teamId} onValueChange={filters.setTeamId} options={teamOptions} />
        ) : null}
        <FilterDropdown value={filters.teammateId} onValueChange={filters.setTeammateId} options={teammateOptions} />
      </div>
      {filters.filtersActive ? (
        <Button
          variant="ghost"
          className="text-muted-foreground hover:bg-surface-active hover:text-foreground"
          onClick={filters.clearFilters}
        >
          Clear filters
        </Button>
      ) : null}
    </Toolbar>
  );
}
