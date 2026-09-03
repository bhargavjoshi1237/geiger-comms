"use client";

// The ticket editor: the suite editor frame — back link, title, state pill,
// right-hand section nav — over the ticket's fields. Typed edits are optimistic
// and persist on a short debounce; selects write straight through. The list
// screen owns the rows and receives every change through onUpdate.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";

import { Button } from "@geiger/ui";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listLinkedConversationIds, updateTicket } from "@/lib/supabase/tickets";
import { listTeammates } from "@/lib/supabase/teammates";
import {
  TICKET_STATE_MAP,
  TICKET_TYPE_MAP,
  ageInDays,
  formatDate,
} from "./constants";
import { NAV_GROUPS, SECTIONS } from "./ticket_sections";

const SAVE_DEBOUNCE_MS = 600;

export function TicketDetailScreen({
  ticket,
  projectId,
  onBack,
  onUpdate,
  onDelete,
  onOpenConversation,
}) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();
  const [form, setForm] = useState(ticket);
  const [seedId, setSeedId] = useState(ticket?.id);
  const [saving, setSaving] = useState(false);
  const [linkedIds, setLinkedIds] = useState([]);
  const [teammates, setTeammates] = useState([]);
  const timer = useRef(null);

  // Re-seed when the editor swaps to a different ticket — adjusting state during
  // render beats an effect that fires after a paint.
  if (ticket && ticket.id !== seedId) {
    setSeedId(ticket.id);
    setForm(ticket);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const ticketId = ticket?.id;
  useEffect(() => {
    let alive = true;
    if (ticketId) {
      listLinkedConversationIds(ticketId).then(
        (ids) => alive && setLinkedIds(ids ?? []),
      );
    }
    return () => {
      alive = false;
    };
  }, [ticketId]);

  useEffect(() => {
    let alive = true;
    listTeammates({ projectId }).then((rows) => alive && setTeammates(rows ?? []));
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (!ticket) return null;

  // Fold a patch into the local view model, then persist it after the debounce.
  const persist = (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    onUpdate?.(next);
    clearTimeout(timer.current);
    setSaving(true);
    timer.current = setTimeout(async () => {
      const saved = await updateTicket(ticket.id, patch);
      setSaving(false);
      if (!saved) toast.error("Couldn't save changes.");
    }, SAVE_DEBOUNCE_MS);
  };

  // Type / state / assignee are deliberate picks, not typing — write them now.
  const persistNow = async (patch) => {
    const previous = form;
    const next = { ...form, ...patch };
    setForm(next);
    onUpdate?.(next);
    const saved = await updateTicket(ticket.id, patch);
    if (!saved) {
      setForm(previous);
      onUpdate?.(previous);
      toast.error("Couldn't update the ticket.");
      return;
    }
    setForm(saved);
    onUpdate?.(saved);
    toast.success("Ticket updated");
  };

  const age = ageInDays(form.createdAt);
  const meta = [
    `${TICKET_TYPE_MAP[form.type]?.label || form.type} ticket`,
    linkedIds.length ? `${linkedIds.length} linked conversations` : null,
    age == null ? null : `${age}d old`,
    formatDate(form.updatedAt) ? `Updated ${formatDate(form.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ActiveSection = SECTIONS[active] || SECTIONS.overview;

  return (
    <EditorShell
      back={{ label: "Tickets", onClick: onBack }}
      title={form.title || "Untitled ticket"}
      status={form.state}
      statusMap={TICKET_STATE_MAP}
      meta={meta}
      badges={saving ? <span className="text-xs text-text-secondary">Saving…</span> : null}
      actions={
        form.conversationId ? (
          <Button
            variant="outline"
            className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            onClick={() => onOpenConversation?.(form.conversationId)}
          >
            <MessagesSquare className="h-4 w-4" /> Open conversation
          </Button>
        ) : null
      }
      nav={NAV_GROUPS}
      subject={form}
      active={active}
      onActiveChange={setActive}
    >
      <ActiveSection
        ticket={form}
        teammates={teammates}
        linkedIds={linkedIds}
        onField={persist}
        onImmediate={persistNow}
        onOpenConversation={onOpenConversation}
        onDelete={() => onDelete?.(form)}
      />
    </EditorShell>
  );
}

export default TicketDetailScreen;
