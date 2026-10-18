"use client";

// Saved-view editor (inbox spec §6): suite editor frame over the view's fields; typed edits persist on a debounce and lift to the Views list via onUpdate.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";

import { EditorShell } from "@/components/internal/shared/editor_shell";
import { Button } from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { updateView } from "@/lib/supabase/views";
import {
  NAV_GROUPS,
  SECTIONS,
  VIEW_SHARED_MAP,
  cleanFilter,
  filterSummary,
  ownerLabel,
  sharedKey,
  sortLabel,
} from "./view_sections";

const SAVE_DEBOUNCE_MS = 600;

export function ViewDetailScreen({
  view,
  lookups,
  count,
  onBack,
  onUpdate,
  onDelete,
  onApply,
}) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();
  const [form, setForm] = useState(view);
  const [seedId, setSeedId] = useState(view?.id);
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);
  const pending = useRef(null); // { id, patch } awaiting the debounce

  // Re-seed when the editor swaps to a different view (adjusting state during render beats a post-paint effect).
  if (view && view.id !== seedId) {
    setSeedId(view.id);
    setForm(view);
  }

  // Leaving the editor mid-debounce flushes the pending patch instead of dropping it.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const batch = pending.current;
      pending.current = null;
      if (batch) {
        void updateView(batch.id, batch.patch).then(
          (saved) => saved || toast.error("Couldn't save changes"),
        );
      }
    },
    [],
  );

  if (!view) return null;

  // Fold a patch into the local view model; pending patches accumulate so a quick name-then-filter edit saves both.
  const persist = (patch, next) => {
    setForm(next);
    onUpdate?.(next);
    clearTimeout(timer.current);
    const prior = pending.current?.id === view.id ? pending.current.patch : {};
    pending.current = { id: view.id, patch: { ...prior, ...patch } };
    setSaving(true);
    timer.current = setTimeout(async () => {
      const batch = pending.current;
      pending.current = null;
      if (!batch) return;
      const saved = await updateView(batch.id, batch.patch);
      setSaving(false);
      if (!saved) toast.error("Couldn't save changes");
    }, SAVE_DEBOUNCE_MS);
  };

  const handleName = (name) => persist({ name }, { ...form, name });
  const handleSort = (sort) => persist({ sort }, { ...form, sort });
  // The local model keeps the raw search text while typing; storage gets the cleaned filter.
  const handleFilter = (filter) =>
    persist({ filter: cleanFilter(filter) }, { ...form, filter });

  // Sharing is a deliberate switch, not typing — write it straight through.
  const handleShared = async (shared) => {
    const previous = form;
    const next = { ...form, shared };
    setForm(next);
    onUpdate?.(next);
    const saved = await updateView(view.id, { shared });
    if (!saved) {
      setForm(previous);
      onUpdate?.(previous);
      toast.error("Couldn't update sharing.");
      return;
    }
    toast.success(shared ? "Shared with the team" : "Sharing off");
  };

  const ActiveSection = SECTIONS[active] || SECTIONS.overview;
  const matching =
    typeof count === "number"
      ? `${count} matching conversation${count === 1 ? "" : "s"}`
      : null;

  return (
    <EditorShell
      back={{ label: "Views", onClick: onBack }}
      title={form.name}
      status={sharedKey(form)}
      statusMap={VIEW_SHARED_MAP}
      meta={[
        filterSummary(form.filter, lookups),
        matching,
        sortLabel(form.sort),
        `Owned by ${ownerLabel(form, lookups)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
      badges={saving ? <span className="text-xs text-text-secondary">Saving…</span> : null}
      actions={
        <Button
          variant="outline"
          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
          onClick={() => onApply?.(form)}
        >
          <Play className="h-4 w-4" /> Apply view
        </Button>
      }
      nav={NAV_GROUPS}
      subject={form}
      active={active}
      onActiveChange={setActive}
    >
      <ActiveSection
        view={form}
        lookups={lookups}
        count={count}
        onName={handleName}
        onSort={handleSort}
        onFilter={handleFilter}
        onShared={handleShared}
        onDelete={() => onDelete?.(form)}
      />
    </EditorShell>
  );
}

export default ViewDetailScreen;
