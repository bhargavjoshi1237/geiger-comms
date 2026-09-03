"use client";

// The saved-view editor (inbox spec §6): the suite editor frame — back link,
// title, sharing pill, right-hand section nav — over the view's own fields.
// Edits are optimistic and persist on a short debounce; the Views list owns the
// rows and receives every change through onUpdate.

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
  filterSummary,
  formatDate,
  sharedKey,
  sortLabel,
} from "./view_sections";

const SAVE_DEBOUNCE_MS = 600;

export function ViewDetailScreen({ view, onBack, onUpdate, onDelete, onApply }) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();
  const [form, setForm] = useState(view);
  const [seedId, setSeedId] = useState(view?.id);
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);

  // Re-seed when the editor swaps to a different view (the events pattern —
  // adjusting state during render beats an effect that fires after a paint).
  if (view && view.id !== seedId) {
    setSeedId(view.id);
    setForm(view);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!view) return null;

  // Fold a patch into the local view model, then persist it after the debounce.
  const persist = (patch, next) => {
    setForm(next);
    onUpdate?.(next);
    clearTimeout(timer.current);
    setSaving(true);
    timer.current = setTimeout(async () => {
      const saved = await updateView(view.id, patch);
      setSaving(false);
      if (!saved) toast.error("Couldn't save changes");
    }, SAVE_DEBOUNCE_MS);
  };

  const handleName = (name) => persist({ name }, { ...form, name });
  const handleSort = (sort) => persist({ sort }, { ...form, sort });
  const handleFilter = (filter) => persist({ filter }, { ...form, filter });

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

  return (
    <EditorShell
      back={{ label: "Views", onClick: onBack }}
      title={form.name}
      status={sharedKey(form)}
      statusMap={VIEW_SHARED_MAP}
      meta={[
        filterSummary(form.filter),
        sortLabel(form.sort),
        formatDate(form.createdAt) ? `Created ${formatDate(form.createdAt)}` : null,
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
