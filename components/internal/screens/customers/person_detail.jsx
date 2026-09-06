"use client";

// The contact editor: back link, identity, lifecycle, right-hand section nav.
// Reached from the People row (?person=<id>). Edits persist through the data
// layer (or locally for demo rows); notes/tasks/tags live in the contact's
// metadata bag so every surface reads the same row.

import { useState } from "react";
import { toast } from "sonner";
import { MessagesSquare, Plus } from "lucide-react";
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
  demo,
  conversations,
  tickets,
  tags,
  onBack,
  onUpdate,
  onDelete,
}) {
  const [active, setActive] = useState("overview");
  const [saving, setSaving] = useState(false);
  const { openConversationInTab, openTicket } = useWorkspaceUrl();

  if (!person) return null;

  async function persist(patch, optimistic) {
    onUpdate?.(optimistic);
    if (demo) return optimistic;
    setSaving(true);
    const saved = await updateContact(person.id, patch);
    setSaving(false);
    if (!saved) {
      toast.error("Couldn't save changes.");
      return null;
    }
    onUpdate?.(saved);
    return saved;
  }

  const handleField = (key, value) =>
    persist({ [key]: value }, { ...person, [key]: value });

  const handleToggleTag = (name) => {
    const current = (person.tags || []).map((t) =>
      typeof t === "string" ? t : t.name,
    );
    const has = current.some((t) => t.toLowerCase() === name.toLowerCase());
    const next = has
      ? current.filter((t) => t.toLowerCase() !== name.toLowerCase())
      : [...current, name];
    persist({ tags: next }, { ...person, tags: next });
  };

  const handleSubscription = (channel, on) =>
    channel === "email"
      ? persist({ subscribedEmail: on }, { ...person, subscribedEmail: on })
      : persist({ subscribedSms: on }, { ...person, subscribedSms: on });

  const handleCustom = (key, value) => {
    const next = { ...(person.custom || {}), [key]: value };
    persist({ custom: next }, { ...person, custom: next });
  };

  const handleDeleteCustom = (key) => {
    const next = { ...(person.custom || {}) };
    delete next[key];
    persist({ custom: next }, { ...person, custom: next });
  };

  const handleAddNote = (body) => {
    const note = {
      id: crypto.randomUUID(),
      body,
      author: "You",
      createdAt: new Date().toISOString(),
    };
    const next = [...(person.notes || []), note];
    persist({ notes: next }, { ...person, notes: next });
    toast.success("Note added");
  };

  const handleDeleteNote = (id) => {
    const next = (person.notes || []).filter((n) => n.id !== id);
    persist({ notes: next }, { ...person, notes: next });
  };

  const handleAddTask = (title) => {
    const task = { id: crypto.randomUUID(), title, done: false, dueAt: null };
    const next = [...(person.tasks || []), task];
    persist({ tasks: next }, { ...person, tasks: next });
    toast.success("Task added");
  };

  const handleToggleTask = (id) => {
    const next = (person.tasks || []).map((t) =>
      t.id === id ? { ...t, done: !t.done } : t,
    );
    persist({ tasks: next }, { ...person, tasks: next });
  };

  const handleDeleteTask = (id) => {
    const next = (person.tasks || []).filter((t) => t.id !== id);
    persist({ tasks: next }, { ...person, tasks: next });
  };

  async function handleNewTicket() {
    const firstConvo = (conversations || [])[0];
    if (demo || !firstConvo) {
      toast.success("Ticket draft started — link a conversation first.");
      return;
    }
    const user = await getUser();
    const created = await createTicket({
      conversationId: firstConvo.id,
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
    openTicket(created.id);
  }

  const ActiveSection = SECTIONS[active] || SECTIONS.overview;

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
          {(conversations || [])[0] ? (
            <Button
              variant="outline"
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={() =>
                openConversationInTab(conversations[0].id, "All Conversations")
              }
            >
              <MessagesSquare className="h-4 w-4" /> Message
            </Button>
          ) : null}
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
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
        onField={handleField}
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
        onOpenTicket={(id) => openTicket(id)}
      />
    </EditorShell>
  );
}

export default PersonDetailScreen;
