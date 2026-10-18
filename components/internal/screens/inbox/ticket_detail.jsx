"use client";

// Ticket editor: suite editor frame over the ticket's fields and its linked conversations; edits are optimistic and lift to the Tickets list via onUpdate.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";

import { Button } from "@geiger/ui";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  linkTicket,
  listTicketConversations,
  ticketConversationIds,
  unlinkTicket,
  updateTicket,
} from "@/lib/supabase/tickets";
import {
  TICKET_STATE_MAP,
  TICKET_TYPE_MAP,
  ageInDays,
  formatDate,
} from "./constants";
import { LinkConversationDialog, NAV_GROUPS, SECTIONS } from "./ticket_sections";

const SAVE_DEBOUNCE_MS = 600;

export function TicketDetailScreen({
  ticket,
  projectId,
  teammates = [],
  onBack,
  onUpdate,
  onDelete,
  onOpenConversation,
}) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();
  const [form, setForm] = useState(ticket);
  const [seedId, setSeedId] = useState(ticket?.id);
  const [saving, setSaving] = useState(false);
  // Linked conversations, keyed by ticket id so loading is derived rather than flipped by hand.
  const [linked, setLinked] = useState({ key: null, items: [] });
  const [pickerOpen, setPickerOpen] = useState(false);
  const timer = useRef(null);
  const pending = useRef(null); // { id, patch } awaiting the debounce

  // Re-seed when the editor swaps to a different ticket (adjusting state during render beats a post-paint effect).
  if (ticket && ticket.id !== seedId) {
    setSeedId(ticket.id);
    setForm(ticket);
  }

  // Leaving the editor mid-debounce flushes the pending patch instead of dropping it.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const batch = pending.current;
      pending.current = null;
      if (batch) {
        void updateTicket(batch.id, batch.patch).then(
          (saved) => saved || toast.error("Couldn't save changes."),
        );
      }
    },
    [],
  );

  const ticketId = ticket?.id;
  useEffect(() => {
    if (!ticketId) return;
    let alive = true;
    listTicketConversations(ticketId).then((rows) => {
      if (!alive) return;
      setLinked({ key: ticketId, items: rows ?? [] });
      if (rows === null) toast.error("Couldn't load linked conversations.");
    });
    return () => {
      alive = false;
    };
  }, [ticketId]);

  if (!ticket) return null;

  const conversations = {
    loading: linked.key !== ticket.id,
    items: linked.key === ticket.id ? linked.items : [],
  };

  // Fold a patch into the local view model; pending patches accumulate so a quick title-then-description edit saves both.
  const persist = (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    onUpdate?.(next);
    clearTimeout(timer.current);
    const prior = pending.current?.id === ticket.id ? pending.current.patch : {};
    pending.current = { id: ticket.id, patch: { ...prior, ...patch } };
    setSaving(true);
    timer.current = setTimeout(async () => {
      const batch = pending.current;
      pending.current = null;
      if (!batch) return;
      const saved = await updateTicket(batch.id, batch.patch);
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
    // Plain writes don't carry link ids, so merge rather than replace.
    setForm((current) => ({ ...current, ...saved }));
    onUpdate?.({ ...next, ...saved });
    toast.success("Ticket updated");
  };

  // Link one conversation: optimistic row + link id, rolled back if the write fails.
  const handleLink = async (conversation) => {
    const previousItems = linked.items;
    const previousForm = form;
    const nextForm = {
      ...form,
      linkedConversationIds: [...(form.linkedConversationIds ?? []), conversation.id],
    };
    setLinked((prev) => ({
      ...prev,
      items: [
        { ...conversation, isLinked: true, isOrigin: conversation.id === form.conversationId },
        ...prev.items.filter((c) => c.id !== conversation.id),
      ],
    }));
    setForm(nextForm);
    onUpdate?.(nextForm);
    const ok = await linkTicket(ticket.id, conversation.id);
    if (!ok) {
      setLinked((prev) => ({ ...prev, items: previousItems }));
      setForm(previousForm);
      onUpdate?.(previousForm);
      toast.error("Couldn't link the conversation.");
      return;
    }
    toast.success("Conversation linked");
  };

  // Unlink removes the ticket_links row and, for the origin thread, clears conversation_id too.
  const handleUnlink = async (conversation) => {
    const previousItems = linked.items;
    const previousForm = form;
    const isOrigin = conversation.id === form.conversationId;
    const nextForm = {
      ...form,
      conversationId: isOrigin ? null : form.conversationId,
      linkedConversationIds: (form.linkedConversationIds ?? []).filter(
        (id) => id !== conversation.id,
      ),
    };
    setLinked((prev) => ({
      ...prev,
      items: prev.items.filter((c) => c.id !== conversation.id),
    }));
    setForm(nextForm);
    onUpdate?.(nextForm);
    const [unlinked, cleared] = await Promise.all([
      conversation.isLinked ? unlinkTicket(ticket.id, conversation.id) : true,
      isOrigin ? updateTicket(ticket.id, { conversationId: null }) : true,
    ]);
    if (!unlinked || !cleared) {
      setLinked((prev) => ({ ...prev, items: previousItems }));
      setForm(previousForm);
      onUpdate?.(previousForm);
      toast.error("Couldn't unlink the conversation.");
      return;
    }
    toast.success("Conversation unlinked");
  };

  const linkedIds = new Set([
    ...ticketConversationIds(form),
    ...conversations.items.map((c) => c.id),
  ]);
  const linkedCount = conversations.loading
    ? ticketConversationIds(form).length
    : conversations.items.length;

  const age = ageInDays(form.createdAt);
  const meta = [
    `${TICKET_TYPE_MAP[form.type]?.label || form.type} ticket`,
    linkedCount
      ? `${linkedCount} linked conversation${linkedCount === 1 ? "" : "s"}`
      : null,
    age == null ? null : `${age}d old`,
    formatDate(form.updatedAt) ? `Updated ${formatDate(form.updatedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ActiveSection = SECTIONS[active] || SECTIONS.overview;

  return (
    <>
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
          conversations={conversations}
          onField={persist}
          onImmediate={persistNow}
          onOpenConversation={onOpenConversation}
          onUnlink={handleUnlink}
          onLinkRequest={() => setPickerOpen(true)}
          onDelete={() => onDelete?.(form)}
        />
      </EditorShell>

      <LinkConversationDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        projectId={projectId}
        linkedIds={linkedIds}
        onLink={handleLink}
      />
    </>
  );
}

export default TicketDetailScreen;
