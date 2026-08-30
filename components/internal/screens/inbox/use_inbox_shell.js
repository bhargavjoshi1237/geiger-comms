"use client";

// ALL shared state for the three-pane inbox (spec §4.2). Your Inbox / All
// Conversations / Mentions call this hook with a different starting filter —
// never three copies of the logic. InboxShell (the component) is presentational
// glue on top of what this returns.
//
// Realtime rule (spec §5.4): every handler dedupes by id against current
// state — an INSERT whose id exists is the echo of our own optimistic write;
// an UPDATE merges field-by-field so a local edit isn't clobbered.
//
// State discipline (repo convention): every setState happens in an async
// continuation, never synchronously in an effect body. List/thread loads are
// therefore stored under their request key and `loading` is DERIVED by
// comparing keys, not flipped by hand.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useOptionalProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import {
  assignConversation,
  closeConversation,
  createConversation,
  createMessage,
  listConversations,
  listThread,
  markRead,
  markUnread,
  normalizeConversation,
  normalizeMessage,
  reopenConversation,
  setPriority,
  snoozeConversation,
} from "@/lib/supabase/comms";
import { getCurrentTeammate, listTeammates } from "@/lib/supabase/teammates";
import { listTags, setConversationTags } from "@/lib/supabase/tags";
import { createTicket, linkTicket } from "@/lib/supabase/tickets";
import { createMentions, listMentions, markMentionsRead } from "@/lib/supabase/mentions";
import { subscribeTable } from "@/lib/supabase/realtime";
import { defaultFilter, matchesFilter, snoozeUntil } from "./constants";

const PAGE_SIZE = 50;

export const TICKET_TYPE_LABELS = {
  customer: "Customer",
  back_office: "Back-office",
  tracker: "Tracker",
};

// Starting filter per preset (spec §4.2 — same component, different start).
export function presetFilter(preset) {
  const base = defaultFilter();
  if (preset === "mine") base.assignee = "me";
  return base;
}

// Merge field-by-field: only overwrite keys the payload actually carries.
function mergeFields(previous, next) {
  const out = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function useInboxShell({ preset = "all", startFilter }) {
  const { projectId } = useOptionalProject() ?? {};
  // Alias the URL closer so it doesn't collide with the data layer's
  // closeConversation (which persists status 'Closed').
  const {
    conversationId,
    openConversation,
    closeConversation: closeThread,
  } = useWorkspaceUrl();
  const canReply = useCan("comms.conversation.reply");
  const canAssign = useCan("comms.conversation.assign");
  const canClose = useCan("comms.conversation.close");

  // ---- filter state -----------------------------------------------------------
  // `startFilter` arrives pre-resolved and the caller keys this component by
  // view id, so it is safe to read it once in the initializer.
  const [filter, setFilter] = useState(() =>
    startFilter ? startFilter : presetFilter(preset),
  );

  // ---- list page: { key, rows, failed, hasMore }; loading is DERIVED ----------
  const [page, setPage] = useState({
    key: "",
    rows: [],
    failed: false,
    hasMore: false,
  });

  const [teammates, setTeammates] = useState([]);
  const [me, setMe] = useState(null);
  const [identityReady, setIdentityReady] = useState(false);

  const [tagMap, setTagMap] = useState({});
  const [allTags, setAllTags] = useState([]);
  const [mentionIds, setMentionIds] = useState(null); // null until first load

  // ---- thread: { key, items }; loading is DERIVED -------------------------------
  const [thread, setThread] = useState({ key: "", items: [] });

  // ---- ui state ------------------------------------------------------------------
  const [focusedId, setFocusedId] = useState(null); // keyboard cursor (j/k)
  const [newOpen, setNewOpen] = useState(false);
  const [customSnooze, setCustomSnooze] = useState(null); // conversation being snoozed
  const [ticketDraft, setTicketDraft] = useState(null); // conversation being ticketed

  // Refs so realtime handlers always see current values without re-subscribing.
  const filterRef = useRef(filter);
  const meRef = useRef(me);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  // ---- identity + lookups ---------------------------------------------------------
  useEffect(() => {
    let alive = true;
    Promise.all([
      listTeammates({ projectId }),
      getCurrentTeammate({ projectId }),
    ]).then(([mateRows, current]) => {
      if (!alive) return;
      setTeammates(mateRows || []);
      setMe(current ?? null);
      setIdentityReady(true);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    listTags({ projectId }).then((tags) => {
      if (alive) setAllTags(tags || []);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // ---- mentions (drives the Mentions preset) ---------------------------------------
  const refreshMentions = useCallback(async () => {
    if (!meRef.current?.id) {
      setMentionIds([]);
      return;
    }
    const mentions = await listMentions({
      projectId,
      teammateId: meRef.current.id,
    });
    setMentionIds([...new Set((mentions || []).map((m) => m.conversationId))]);
  }, [projectId]);

  useEffect(() => {
    if (preset === "mentions") void refreshMentions();
  }, [preset, refreshMentions]);

  // ---- list loading (keyset pagination, spec §3.4) -----------------------------------
  const listKey = useMemo(
    () =>
      JSON.stringify({
        p: projectId,
        f: { ...filter, search: (filter.search || "").trim() },
        m: me?.id,
        r: identityReady,
      }),
    [projectId, filter, me?.id, identityReady],
  );

  useEffect(() => {
    let alive = true;
    listConversations({
      projectId,
      filter: { ...filter, teammateId: me?.id },
      limit: PAGE_SIZE,
    }).then((result) => {
      if (!alive) return;
      setPage({
        key: listKey,
        rows: result ?? [],
        failed: result === null,
        hasMore: (result?.length ?? 0) === PAGE_SIZE,
      });
      if (result === null) {
        toast.error("Couldn't load conversations.");
        return;
      }
      // Deep link: the opened thread arrived with this page — mark it read
      // here (async continuation), not in an effect.
      if (conversationId && me?.id) {
        const opened = (result ?? []).find((r) => r.id === conversationId);
        if (opened?.unread) void markRead(opened.id, me.id);
        if (opened)
          void markMentionsRead({ conversationId: opened.id, teammateId: me.id });
      }
    });
    return () => {
      alive = false;
    };
  }, [listKey, projectId, filter, me?.id, conversationId]);

  const rows = useMemo(
    () => (page.key === listKey ? page.rows : []),
    [page, listKey],
  );
  const loading = page.key !== listKey;

  const loadMore = useCallback(async () => {
    const current = page.rows;
    if (current.length === 0) return;
    const before = current[current.length - 1].lastMessageAt;
    const result = await listConversations({
      projectId,
      filter: { ...filter, teammateId: me?.id },
      limit: PAGE_SIZE,
      before,
    });
    if (result === null) {
      toast.error("Couldn't load older conversations.");
      return;
    }
    setPage((prev) => {
      const seen = new Set(prev.rows.map((r) => r.id));
      return {
        ...prev,
        rows: [...prev.rows, ...result.filter((r) => !seen.has(r.id))],
        hasMore: result.length === PAGE_SIZE,
      };
    });
  }, [projectId, filter, me?.id, page.rows]);

  // ---- thread loading -----------------------------------------------------------------
  const threadLoading = Boolean(conversationId) && thread.key !== conversationId;
  const messages = thread.key === conversationId ? thread.items : [];

  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    listThread(conversationId).then((result) => {
      if (!alive) return;
      setThread({
        key: conversationId,
        items: result ?? [],
      });
      if (result === null) toast.error("Couldn't load this thread.");
    });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  // Opening a thread marks it read (per-agent) and clears my mentions in it.
  // Runs from user events (selection) and load continuations (deep link) only
  // — never synchronously inside an effect (repo convention). rowsRef is
  // synced by an effect so handlers always see current rows. Repeat opens are
  // naturally idempotent: once read locally, nothing fires again.
  const rowsRef = useRef([]);
  useEffect(() => {
    rowsRef.current = page.rows;
  }, [page.rows]);

  const markThreadOpened = useCallback(
    (id) => {
      if (!id || !me?.id) return;
      const row = rowsRef.current.find((r) => r.id === id);
      if (row?.unread) {
        setPage((prev) => ({
          ...prev,
          rows: prev.rows.map((r) => (r.id === id ? { ...r, unread: false } : r)),
        }));
        void markRead(id, me.id);
      }
      void markMentionsRead({ conversationId: id, teammateId: me.id });
    },
    [me],
  );

  // Selection from either a row click or keyboard Enter.
  const selectConversation = useCallback(
    (id) => {
      setFocusedId(null);
      openConversation(id);
      markThreadOpened(id);
    },
    [openConversation, markThreadOpened],
  );

  // ---- realtime (dedupe-by-id rule, spec §5.4) ------------------------------------------
  useEffect(() => {
    const unsubscribeConversations = subscribeTable("conversations", {
      filter: projectId ? `project_id=eq.${projectId}` : undefined,
      onInsert: (raw) => {
        const row = normalizeConversation(raw);
        setPage((prev) => {
          // Echo of our own optimistic insert — ignore.
          if (prev.rows.some((r) => r.id === row.id)) return prev;
          return matchesFilter(row, filterRef.current, meRef.current?.id)
            ? { ...prev, rows: [row, ...prev.rows] }
            : prev;
        });
      },
      onUpdate: (raw) => {
        const row = normalizeConversation(raw);
        setPage((prev) => {
          const exists = prev.rows.some((r) => r.id === row.id);
          const inFilter = matchesFilter(
            row,
            filterRef.current,
            meRef.current?.id,
          );
          if (exists && !inFilter) {
            return { ...prev, rows: prev.rows.filter((r) => r.id !== row.id) };
          }
          if (exists) {
            // Merge field-by-field — never clobber local optimistic edits.
            return {
              ...prev,
              rows: prev.rows.map((r) =>
                r.id === row.id ? mergeFields(r, row) : r,
              ),
            };
          }
          return inFilter ? { ...prev, rows: [...prev.rows, row] } : prev;
        });
      },
      onDelete: (old) => {
        setPage((prev) => ({
          ...prev,
          rows: prev.rows.filter((r) => r.id !== old.id),
        }));
      },
    });

    // Messages ride the OPEN conversation; resubscribed on selection change.
    const unsubscribeMessages = conversationId
      ? subscribeTable("messages", {
          filter: `conversation_id=eq.${conversationId}`,
          onInsert: (raw) => {
            setThread((prev) => {
              if (prev.key !== conversationId) return prev;
              if (prev.items.some((m) => m.id === raw.id)) return prev; // own echo
              return { ...prev, items: [...prev.items, normalizeMessage(raw)] };
            });
          },
          onUpdate: (raw) => {
            setThread((prev) => {
              if (prev.key !== conversationId) return prev;
              return {
                ...prev,
                items: prev.items.map((m) =>
                  m.id === raw.id ? mergeFields(m, normalizeMessage(raw)) : m,
                ),
              };
            });
          },
          onDelete: (old) => {
            setThread((prev) =>
              prev.key !== conversationId
                ? prev
                : { ...prev, items: prev.items.filter((m) => m.id !== old.id) },
            );
          },
        })
      : null;

    // Mentions drive the Mentions preset's list.
    const unsubscribeMentions =
      preset === "mentions" && meRef.current?.id
        ? subscribeTable("mentions", {
            filter: `teammate_id=eq.${meRef.current.id}`,
            onInsert: () => void refreshMentions(),
          })
        : null;

    return () => {
      unsubscribeConversations();
      unsubscribeMessages?.();
      unsubscribeMentions?.();
    };
  }, [projectId, conversationId, preset, refreshMentions]);

  // ---- derived ---------------------------------------------------------------------------
  const displayRows = useMemo(
    () => rows.map((r) => ({ ...r, tags: tagMap[r.id] ?? [] })),
    [rows, tagMap],
  );

  const visibleRows = useMemo(() => {
    if (preset !== "mentions" || !mentionIds) return displayRows;
    const mentioned = new Set(mentionIds);
    return displayRows.filter(
      (r) => mentioned.has(r.id) || r.id === conversationId,
    );
  }, [displayRows, preset, mentionIds, conversationId]);

  const activeRow = useMemo(
    () =>
      visibleRows.find((r) => r.id === conversationId) ??
      displayRows.find((r) => r.id === conversationId) ??
      null,
    [visibleRows, displayRows, conversationId],
  );

  // ---- mutations (optimistic → persist → reconcile) ----------------------------------------
  function patchRow(id, patch) {
    setPage((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  // Optimistic patch first, persist second, roll back + toast on a falsy
  // write. Never leave the UI claiming a change that didn't stick.
  const mutateRow = useCallback(
    async (id, applyPatch, persist, failMessage) => {
      const previous = page.rows.find((r) => r.id === id);
      applyPatch();
      const saved = await persist();
      if (!saved) {
        if (previous) patchRow(id, previous);
        toast.error(failMessage);
        return null;
      }
      return saved;
    },
    [page.rows],
  );

  const handleAssign = useCallback(
    (conversation, teammate) => {
      if (!canAssign) return;
      void mutateRow(
        conversation.id,
        () =>
          patchRow(conversation.id, {
            assigneeId: teammate?.id ?? null,
            assignee: teammate?.name ?? "Unassigned",
          }),
        () => assignConversation(conversation.id, teammate ?? null),
        "Couldn't update the assignee.",
      );
    },
    [canAssign, mutateRow],
  );

  const handleSnooze = useCallback(
    async (conversation, presetOrISO) => {
      if (!canClose) return;
      if (presetOrISO === "custom") {
        setCustomSnooze(conversation);
        return;
      }
      const until = presetOrISO.includes("T")
        ? presetOrISO // an explicit ISO instant (custom picker)
        : snoozeUntil(presetOrISO);
      if (!until) return;
      void mutateRow(
        conversation.id,
        () =>
          patchRow(conversation.id, {
            status: "Snoozed",
            snoozedUntil: until,
          }),
        () => snoozeConversation(conversation.id, until),
        "Couldn't snooze the conversation.",
      );
      toast.success("Snoozed");
    },
    [canClose, mutateRow],
  );

  const handleClose = useCallback(
    async (conversation) => {
      if (!canClose) return;
      void mutateRow(
        conversation.id,
        () =>
          patchRow(conversation.id, {
            status: "Closed",
            closedAt: new Date().toISOString(),
          }),
        () => closeConversation(conversation.id),
        "Couldn't close the conversation.",
      );
      toast.success("Closed");
    },
    [canClose, mutateRow],
  );

  const handleReopen = useCallback(
    async (conversation) => {
      if (!canClose) return;
      void mutateRow(
        conversation.id,
        () =>
          patchRow(conversation.id, {
            status: "Open",
            closedAt: null,
            snoozedUntil: null,
          }),
        () => reopenConversation(conversation.id),
        "Couldn't reopen the conversation.",
      );
      toast.success("Reopened");
    },
    [canClose, mutateRow],
  );

  const handlePriority = useCallback(
    (conversation, priority) => {
      void mutateRow(
        conversation.id,
        () => patchRow(conversation.id, { priority }),
        () => setPriority(conversation.id, priority),
        "Couldn't update priority.",
      );
    },
    [mutateRow],
  );

  const handleMarkUnread = useCallback(
    (conversation) => {
      if (!me?.id) return;
      patchRow(conversation.id, { unread: true });
      markUnread(conversation.id, me.id).then((ok) => {
        if (!ok) {
          patchRow(conversation.id, { unread: false });
          toast.error("Couldn't mark as unread.");
        }
      });
    },
    [me?.id],
  );

  const handleSetTags = useCallback(
    async (conversation, tagIds) => {
      const previousIds = (tagMap[conversation.id] ?? []).map((t) => t.id);
      setTagMap((prev) => ({
        ...prev,
        [conversation.id]: allTags.filter((t) => tagIds.includes(t.id)),
      }));
      const ok = await setConversationTags(conversation.id, tagIds);
      if (!ok) {
        setTagMap((prev) => ({
          ...prev,
          [conversation.id]: allTags.filter((t) => previousIds.includes(t.id)),
        }));
        toast.error("Couldn't save tags.");
      }
    },
    [allTags, tagMap],
  );

  // Reply / note. Returns false so the composer keeps the draft on failure.
  const handleSend = useCallback(
    async ({ body, messageType }) => {
      if (!activeRow) return false;
      const authorName = me?.name ?? "Agent";
      const optimisticId = crypto.randomUUID();
      const optimistic = {
        id: optimisticId,
        conversationId: activeRow.id,
        authorRole: "agent",
        authorName,
        authorId: me?.id ?? null,
        messageType,
        body,
        attachments: [],
        createdAt: new Date().toISOString(),
      };
      setThread((prev) =>
        prev.key === activeRow.id
          ? { ...prev, items: [...prev.items, optimistic] }
          : prev,
      );
      // Notes touch none of the customer-facing surface (post_message skips
      // them server-side; mirror that locally).
      if (messageType !== "note") {
        patchRow(activeRow.id, {
          preview: body.slice(0, 140),
          lastMessageAt: optimistic.createdAt,
          waitingOnUs: false,
        });
      }

      const saved = await createMessage({
        id: optimisticId, // optimistic row and DB row share a UUID (spec §5.3)
        conversationId: activeRow.id,
        body,
        messageType,
        authorRole: "agent",
        authorName,
        authorId: me?.id ?? null,
      });
      if (!saved) {
        setThread((prev) =>
          prev.key === activeRow.id
            ? { ...prev, items: prev.items.filter((m) => m.id !== optimisticId) }
            : prev,
        );
        if (messageType !== "note") {
          const previous = page.rows.find((r) => r.id === activeRow.id);
          if (previous) patchRow(activeRow.id, previous);
        }
        toast.error(
          messageType === "note" ? "Couldn't save the note." : "Message not sent.",
        );
        return false;
      }
      setThread((prev) =>
        prev.key === activeRow.id
          ? {
              ...prev,
              items: prev.items.map((m) =>
                m.id === optimisticId ? saved : m,
              ),
            }
          : prev,
      );

      // @mentions → one mentions row per named teammate (best effort).
      const named = teammates.filter((t) => body.includes(`@${t.name}`));
      if (named.length > 0) {
        await createMentions({
          conversationId: activeRow.id,
          messageId: saved.id,
          teammateIds: named.map((t) => t.id),
        });
        if (preset === "mentions") void refreshMentions();
      }
      return true;
    },
    [activeRow, me, teammates, page.rows, preset, refreshMentions],
  );

  const handleCreateConversation = useCallback(
    async (draft) => {
      const created = await createConversation({
        id: crypto.randomUUID(),
        subject: draft.subject.trim(),
        contactName: draft.contactName.trim(),
        contactEmail: draft.contactEmail.trim() || null,
        channel: draft.channel,
        projectId,
        status: "Open",
        createdBy: me?.userId ?? null,
      });
      if (!created) {
        toast.error("Couldn't create the conversation.");
        return null;
      }
      setPage((prev) => ({ ...prev, rows: [{ ...created, tags: [] }, ...prev.rows] }));
      if (draft.body.trim()) {
        await createMessage({
          conversationId: created.id,
          body: draft.body.trim(),
          authorRole: "customer",
          authorName: created.contactName,
        });
      }
      toast.success("Conversation created");
      return created;
    },
    [projectId, me],
  );

  const handleCreateTicket = useCallback(
    async ({ conversation, type, title, description }) => {
      const ticket = await createTicket({
        conversationId: conversation.id,
        type,
        title: title.trim(),
        description: description.trim(),
        projectId,
      });
      if (!ticket) {
        toast.error("Couldn't create the ticket.");
        return null;
      }
      await linkTicket(ticket.id, conversation.id);
      toast.success(`${TICKET_TYPE_LABELS[type]} ticket created`);
      return ticket;
    },
    [projectId],
  );

  // ---- keyboard shortcuts (skipped while typing, spec §5.5) -----------------------------------
  useEffect(() => {
    function onKeyDown(event) {
      const target = document.activeElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (visibleRows.length === 0) return;
      const idx = visibleRows.findIndex(
        (r) => r.id === (focusedId ?? conversationId),
      );
      const at = (i) => visibleRows[Math.max(0, Math.min(i, visibleRows.length - 1))];
      const current = visibleRows[idx];

      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          setFocusedId(at(idx + 1)?.id ?? null);
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          setFocusedId(at(idx - 1)?.id ?? null);
          break;
        case "Enter":
          if (focusedId) selectConversation(focusedId);
          break;
        case "e":
          if (current)
            (current.status === "Closed" ? handleReopen : handleClose)(current);
          break;
        case "s":
          if (current) void handleSnooze(current, "tomorrow9");
          break;
        case "/": {
          event.preventDefault();
          document.querySelector('[data-inbox-search="true"] input')?.focus();
          break;
        }
        case "Escape":
          if (focusedId) setFocusedId(null);
          else if (conversationId) closeThread();
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    visibleRows,
    focusedId,
    conversationId,
    selectConversation,
    closeThread,
    handleReopen,
    handleClose,
    handleSnooze,
  ]);

  // Signed-out gate (spec §5.6): Your Inbox and Mentions explain themselves;
  // All Conversations still lists rows.
  const waitingOnIdentity = preset !== "all" && !identityReady;
  const signedOut = preset !== "all" && identityReady && !me;

  return {
    projectId,
    conversationId,
    closeThread,
    canReply,
    canAssign,
    filter,
    setFilter,
    page,
    teammates,
    me,
    allTags,
    mentionIds,
    loading,
    loadMore,
    threadLoading,
    messages,
    focusedId,
    setFocusedId,
    newOpen,
    setNewOpen,
    customSnooze,
    setCustomSnooze,
    ticketDraft,
    setTicketDraft,
    visibleRows,
    activeRow,
    selectConversation,
    handleAssign,
    handleSnooze,
    handleClose,
    handleReopen,
    handlePriority,
    handleMarkUnread,
    handleSetTags,
    handleSend,
    handleCreateConversation,
    handleCreateTicket,
    waitingOnIdentity,
    signedOut,
  };
}
