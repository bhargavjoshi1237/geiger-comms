"use client";

// The contact editor (?person=<id>): optimistic edits persist through the data layer and roll back on failure.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, Plus, Trash2 } from "lucide-react";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { Avatar, AvatarFallback, AvatarImage, Button } from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { updateContact } from "@/lib/supabase/customers";
import { getUser } from "@/lib/supabase/user";
import { createTicket } from "@/lib/supabase/tickets";
import { LIFECYCLE_MAP, formatRelativeTime, initialsOf } from "./constants";
import { NAV_GROUPS, SECTIONS } from "./person_sections";

export function PersonDetailScreen({
  person,
  companies,
  companiesAvailable,
  attributes,
  onAttributeCreated,
  conversations,
  tickets,
  tags,
  onBack,
  onUpdate,
  onDelete,
}) {
  const [active, setActive] = useState("overview");
  const [saving, setSaving] = useState(false);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const { openConversationInTab, openTicketInTab } = useWorkspaceUrl();

  if (!person) return null;

  // Writes run one at a time so each merges onto the last, and only the final response replaces local state.
  async function persist(patch) {
    const id = person.id;
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, person[k]]));
    onUpdate?.(id, (p) => ({ ...p, ...patch }));
    pending.current += 1;
    setSaving(true);
    const run = queue.current.then(() => updateContact(id, patch));
    queue.current = run;
    const saved = await run;
    pending.current -= 1;
    const idle = pending.current === 0;
    if (idle) setSaving(false);
    if (!saved) {
      onUpdate?.(id, (p) => ({ ...p, ...before }));
      toast.error("Couldn't save changes.");
      return null;
    }
    if (idle) onUpdate?.(id, saved);
    return saved;
  }

  const handleField = (key, value) => persist({ [key]: value });

  const handleToggleTag = (name) => {
    const current = (person.tags || []).map((t) =>
      typeof t === "string" ? t : t.name,
    );
    const has = current.some((t) => t.toLowerCase() === name.toLowerCase());
    persist({
      tags: has
        ? current.filter((t) => t.toLowerCase() !== name.toLowerCase())
        : [...current, name],
    });
  };

  const handleSubscription = (channel, on) =>
    persist(channel === "email" ? { subscribedEmail: on } : { subscribedSms: on });

  const handleCustom = (key, value) => {
    const next = { ...(person.custom || {}) };
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
    persist({ custom: next });
  };

  const handleDeleteCustom = (key) => handleCustom(key, null);

  // Notes are shared, so they carry the author's name rather than "You".
  const handleAddNote = async (body) => {
    const user = await getUser();
    const note = {
      id: crypto.randomUUID(),
      body,
      author: user?.name || "Teammate",
      createdAt: new Date().toISOString(),
    };
    persist({ notes: [...(person.notes || []), note] }).then(
      (saved) => saved && toast.success("Note added"),
    );
  };

  const handleDeleteNote = (id) =>
    persist({ notes: (person.notes || []).filter((n) => n.id !== id) });

  const handleAddTask = (title) => {
    const task = { id: crypto.randomUUID(), title, done: false, dueAt: null };
    persist({ tasks: [...(person.tasks || []), task] }).then(
      (saved) => saved && toast.success("Task added"),
    );
  };

  const handleToggleTask = (id) =>
    persist({
      tasks: (person.tasks || []).map((t) =>
        t.id === id ? { ...t, done: !t.done } : t,
      ),
    });

  const handleDeleteTask = (id) =>
    persist({ tasks: (person.tasks || []).filter((t) => t.id !== id) });

  const firstConvo = (conversations || [])[0];

  async function handleNewTicket() {
    const user = await getUser();
    const created = await createTicket({
      conversationId: firstConvo.id,
      projectId: person.projectId,
      type: "customer",
      state: "submitted",
      title: `Follow-up for ${person.name}`,
      description: "",
      createdBy: user?.id ?? null,
    });
    if (!created) {
      toast.error("Couldn't create the ticket.");
      return;
    }
    toast.success("Ticket created");
    openTicketInTab(created.id, "Tickets");
  }

  const ActiveSection = SECTIONS[active] || SECTIONS.overview;
  const outline =
    "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

  return (
    <EditorShell
      back={{ label: "People", onClick: onBack }}
      title={
        <span className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            {person.avatarUrl ? (
              <AvatarImage src={person.avatarUrl} alt={person.name} />
            ) : null}
            <AvatarFallback className="bg-surface-card text-sm text-text-secondary">
              {initialsOf(person.name, person.email)}
            </AvatarFallback>
          </Avatar>
          {person.name || "Unknown"}
        </span>
      }
      status={person.lifecycle || "lead"}
      statusMap={LIFECYCLE_MAP}
      meta={[
        person.email,
        person.company,
        person.location,
        `Last seen ${formatRelativeTime(person.updatedAt)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
      badges={
        saving ? (
          <span className="text-xs text-text-secondary">Saving…</span>
        ) : null
      }
      actions={
        <>
          {firstConvo ? (
            <Button
              variant="outline"
              className={outline}
              onClick={() => openConversationInTab(firstConvo.id, "All Conversations")}
            >
              <MessagesSquare className="h-4 w-4" /> Message
            </Button>
          ) : null}
          <Button variant="outline" className={outline} onClick={() => onDelete?.(person)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!firstConvo}
            title={firstConvo ? undefined : "Tickets link to a conversation — this person has none yet"}
            onClick={() => void handleNewTicket()}
          >
            <Plus className="h-4 w-4" /> New ticket
          </Button>
        </>
      }
      nav={NAV_GROUPS}
      subject={person}
      active={active}
      onActiveChange={setActive}
    >
      <ActiveSection
        person={person}
        conversations={conversations}
        tickets={tickets}
        allTags={tags}
        companies={companies}
        companiesAvailable={companiesAvailable}
        attributes={attributes}
        onAttributeCreated={onAttributeCreated}
        onField={handleField}
        onPatch={persist}
        onToggleTag={handleToggleTag}
        onToggleSubscription={handleSubscription}
        onCustom={handleCustom}
        onDeleteCustom={handleDeleteCustom}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        onAddTask={handleAddTask}
        onToggleTask={handleToggleTask}
        onDeleteTask={handleDeleteTask}
        onGoto={setActive}
        onOpenConversation={(id) => openConversationInTab(id, "All Conversations")}
        onOpenTicket={(id) => openTicketInTab(id, "Tickets")}
      />
    </EditorShell>
  );
}

export default PersonDetailScreen;
