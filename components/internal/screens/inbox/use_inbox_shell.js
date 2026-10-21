"use client";

// ALL shared state for the three-pane inbox (spec §4.2); Your Inbox / All Conversations / Mentions differ only by starting filter.
// Realtime rule (spec §5.4): dedupe INSERTs by id, merge UPDATEs field-by-field so a local optimistic edit isn't clobbered.
// State discipline (repo convention): setState only in event handlers or async continuations, never synchronously in an effect body.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { useOptionalProject } from "@/context/project-context";
import { useCan } from "@/context/rbac-context";
import {
  assignConversation,
  closeConversation,
  conversationCursor,
  createConversation,
  createMessage,
  findOrCreateContact,
  getConversation,
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
import {
  TAG_COLORS,
  addConversationTag,
  createTag,
  listTags,
  listTagsForConversations,
  removeConversationTag,
} from "@/lib/supabase/tags";
import { listChannels } from "@/lib/supabase/channels";
import { createTicket, linkTicket } from "@/lib/supabase/tickets";
import { createMentions, listMentions, markMentionsRead } from "@/lib/supabase/mentions";
import { subscribeTable } from "@/lib/supabase/realtime";
import { defaultFilter, matchesFilter, snoozeUntil } from "./constants";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;
const OWN_ECHO_MS = 15000;

export const ASSIGN_DENIED =
  "You don't have permission to assign conversations (comms.conversation.assign).";
export const CLOSE_DENIED =
  "You don't have permission to close, reopen or snooze conversations (comms.conversation.close).";
export const REPLY_DENIED =
  "You don't have permission to reply (comms.conversation.reply).";

export const TICKET_TYPE_LABELS = {
  customer: "Customer",
  back_office: "Back-office",
  tracker: "Tracker",
};

// Starting filter per preset (spec §4.2 — same component, different start); queues open on the Open tab, Mentions on All.
export function presetFilter(preset) {
  const base = defaultFilter();
  if (preset !== "mentions") base.status = ["Open"];
  if (preset === "mine") base.assignee = "me";
  if (preset === "mentions") base.mentioned = true;
  return base;
}

// True when `filter` narrows more than the preset's own baseline does; the status tab and sort never count.
function isNarrowed(filter, preset) {
  const base = presetFilter(preset);
  const keys = ["channel", "priority", "tagIds"];
  if (keys.some((k) => (filter[k]?.length || 0) !== (base[k]?.length || 0))) return true;
  return (
    (filter.assignee || null) !== (base.assignee || null) ||
    (filter.channelId || null) !== null ||
    filter.unread != null ||
    Boolean((filter.search || "").trim())
  );
}

// Merge field-by-field: only overwrite keys the payload actually carries.
function mergeFields(previous, next) {
  const out = { ...previous };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function pick(source, keys) {
  const out = {};
  for (const key of keys) out[key] = source?.[key];
  return out;
}

function activityAdvanced(previous, next) {
  const before = Date.parse(previous?.lastMessageAt ?? "");
  const after = Date.parse(next?.lastMessageAt ?? "");
  return Number.isFinite(after) && (!Number.isFinite(before) || after > before);
}

// A realtime row has no joins and only the legacy global unread: keep what it can't know from `previous`.
function fromRealtime(raw, previous, teammates) {
  const row = normalizeConversation(raw);
  delete row.unread;
  if (previous && row.contactId === previous.contactId) {
    delete row.contactName;
    delete row.contactEmail;
    delete row.contactAvatar;
  }
  if (!row.assigneeId) {
    row.assignee = "";
  } else if (previous && row.assigneeId === previous.assigneeId) {
    delete row.assignee;
  } else {
    const mate = teammates.find((t) => t.id === row.assigneeId);
    if (mate) row.assignee = mate.name;
  }
  return row;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Teammates @named in a body; a name must end at a non-word char so "@Ann" never matches "@Anna".
export function mentionedTeammates(body, teammates) {
  return teammates.filter(
    (t) =>
      t.name &&
      new RegExp(`@${escapeRegExp(t.name)}(?![\\p{L}\\p{N}_])`, "u").test(body),
  );
}

export function useInboxShell({ preset = "all", startFilter }) {
  const { projectId } = useOptionalProject() ?? {};
  // Alias the URL closer so it doesn't collide with the data layer's closeConversation.
  const {
    conversationId,
    channelId: urlChannelId,
    openConversation,
    closeConversation: closeThread,
    closeChannel,
  } = useWorkspaceUrl();
  const canReply = useCan("comms.conversation.reply");
  const canAssign = useCan("comms.conversation.assign");
  const canClose = useCan("comms.conversation.close");

  // ---- ui state ------------------------------------------------------------------
  const [focusedId, setFocusedId] = useState(null); // keyboard cursor (j/k)
  const [newOpen, setNewOpen] = useState(false);
  const [customSnooze, setCustomSnooze] = useState(null); // conversation being custom-snoozed
  const [ticketDraft, setTicketDraft] = useState(null); // conversation being ticketed
  const [menu, setMenu] = useState(null); // { kind: "assign" | "snooze", id } opened from the keyboard
  const [contactOpen, setContactOpen] = useState(false); // below-lg contact sheet

  // ---- filter -------------------------------------------------------------------
  // startFilter arrives pre-resolved and the caller keys this component by view id, so reading it once is safe.
  const [filter, setFilter] = useState(() => startFilter ?? presetFilter(preset));
  const [debouncedSearch, setDebouncedSearch] = useState(() => (filter.search || "").trim());

  useEffect(() => {
    const next = (filter.search || "").trim();
    const timer = setTimeout(() => setDebouncedSearch(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filter.search]);

  // ?channel=<id> (Channels → "View conversations") narrows All Conversations to one connected channel.
  const channelParam = preset === "all" ? urlChannelId : null;
  const effectiveFilter = useMemo(
    () => (channelParam ? { ...filter, channelId: channelParam } : filter),
    [filter, channelParam],
  );
  const queryFilter = useMemo(
    () => ({ ...effectiveFilter, search: debouncedSearch }),
    [effectiveFilter, debouncedSearch],
  );

  // ---- identity + lookups ---------------------------------------------------------
  const [teammates, setTeammates] = useState([]);
  const [me, setMe] = useState(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [allTags, setAllTags] = useState([]);
  const [tagMap, setTagMap] = useState({});
  const [channels, setChannels] = useState([]);
  const [mentionIds, setMentionIds] = useState(null); // Set of mentioned conversation ids (Mentions preset)

  useEffect(() => {
    let alive = true;
    Promise.all([listTeammates({ projectId }), getCurrentTeammate({ projectId })]).then(
      ([mateRows, current]) => {
        if (!alive) return;
        setTeammates(mateRows || []);
        setMe(current ?? null);
        setIdentityReady(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    Promise.all([listTags({ projectId }), listChannels({ projectId })]).then(([tags, chans]) => {
      if (!alive) return;
      setAllTags(tags || []);
      setChannels(chans || []);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const signedOut = preset !== "all" && identityReady && !me;

  // ---- list page: { key, rows, failed, hasMore, cursor } ------------------------------
  const [page, setPage] = useState({ key: "", rows: [], failed: false, hasMore: false, cursor: null });
  const listKey = useMemo(
    () => JSON.stringify({ p: projectId ?? null, f: queryFilter, m: me?.id ?? null }),
    [projectId, queryFilter, me?.id],
  );
  const initialLoading = !identityReady || (!signedOut && page.key === "");
  const refreshing = !initialLoading && page.key !== listKey;

  const loadTagsFor = useCallback(async (ids) => {
    const wanted = ids.filter(Boolean);
    if (wanted.length === 0) return;
    const map = await listTagsForConversations(wanted);
    setTagMap((prev) => {
      const next = { ...prev };
      for (const id of wanted) next[id] = map[id] ?? [];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!identityReady || signedOut) return;
    let alive = true;
    const key = listKey;
    listConversations({
      projectId,
      filter: { ...queryFilter, teammateId: me?.id ?? null },
      limit: PAGE_SIZE,
    }).then((result) => {
      if (!alive) return;
      if (result === null) {
        setPage({ key, rows: [], failed: true, hasMore: false, cursor: null });
        toast.error("Couldn't load conversations.");
        return;
      }
      setPage({
        key,
        rows: result,
        failed: false,
        hasMore: result.length === PAGE_SIZE,
        cursor: conversationCursor(result[result.length - 1]),
      });
      void loadTagsFor(result.map((r) => r.id));
    });
    return () => {
      alive = false;
    };
  }, [listKey, identityReady, signedOut, projectId, queryFilter, me?.id, loadTagsFor]);

  const loadingMoreRef = useRef(false);
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || refreshing || !page.hasMore || !page.cursor) return;
    loadingMoreRef.current = true;
    const key = page.key;
    const result = await listConversations({
      projectId,
      filter: { ...queryFilter, teammateId: me?.id ?? null },
      limit: PAGE_SIZE,
      cursor: page.cursor,
    });
    loadingMoreRef.current = false;
    if (result === null) {
      toast.error("Couldn't load older conversations.");
      return;
    }
    setPage((prev) => {
      if (prev.key !== key) return prev; // the filter changed while this page was in flight
      const seen = new Set(prev.rows.map((r) => r.id));
      return {
        ...prev,
        rows: [...prev.rows, ...result.filter((r) => !seen.has(r.id))],
        hasMore: result.length === PAGE_SIZE,
        cursor: conversationCursor(result[result.length - 1]) ?? prev.cursor,
      };
    });
    void loadTagsFor(result.map((r) => r.id));
  }, [refreshing, page.hasMore, page.cursor, page.key, projectId, queryFilter, me?.id, loadTagsFor]);

  // ---- deep-linked thread outside the loaded page (spec §5.1) --------------------------
  const [pinned, setPinned] = useState({ key: null, row: null });
  const inRows = page.rows.some((r) => r.id === conversationId);
  const needPinned = Boolean(conversationId) && !initialLoading && !inRows;

  useEffect(() => {
    if (!needPinned) return;
    let alive = true;
    getConversation(conversationId, { teammateId: me?.id }).then((row) => {
      if (!alive) return;
      setPinned({ key: conversationId, row: row && (!projectId || row.projectId === projectId) ? row : null });
      if (row) void loadTagsFor([row.id]);
    });
    return () => {
      alive = false;
    };
  }, [needPinned, conversationId, me?.id, projectId, loadTagsFor]);

  const pinnedRow = pinned.key === conversationId ? pinned.row : null;
  const threadMissing = Boolean(conversationId) && !inRows && pinned.key === conversationId && !pinned.row;

  // ---- thread -----------------------------------------------------------------------
  const [thread, setThread] = useState({ key: "", items: [] });
  const threadLoading = Boolean(conversationId) && thread.key !== conversationId;
  const messages = thread.key === conversationId ? thread.items : [];

  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    listThread(conversationId).then((result) => {
      if (!alive) return;
      setThread({ key: conversationId, items: result ?? [] });
      if (result === null) toast.error("Couldn't load this thread.");
    });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  // ---- refs so realtime handlers see current values without resubscribing ----------------
  const filterRef = useRef(queryFilter);
  const meRef = useRef(me);
  const teammatesRef = useRef(teammates);
  const conversationIdRef = useRef(conversationId);
  const rowsRef = useRef(page.rows);
  const pinnedRef = useRef(pinnedRow);
  const tagMapRef = useRef(tagMap);
  const mentionIdsRef = useRef(mentionIds);
  const recentSendsRef = useRef(new Map()); // conversationId -> ms of my last reply, to recognise its realtime echo
  useEffect(() => {
    filterRef.current = queryFilter;
    meRef.current = me;
    teammatesRef.current = teammates;
    conversationIdRef.current = conversationId;
    rowsRef.current = page.rows;
    pinnedRef.current = pinnedRow;
    tagMapRef.current = tagMap;
    mentionIdsRef.current = mentionIds;
  });

  const extrasFor = useCallback(
    (id) => ({
      tagIds: tagMapRef.current[id]?.map((t) => t.id),
      mentionIds: mentionIdsRef.current ?? undefined,
    }),
    [],
  );

  // ---- local patches (list rows + the pinned deep-link row) -------------------------------
  const patchRow = useCallback((id, patch) => {
    setPage((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
    setPinned((prev) => (prev.row?.id === id ? { ...prev, row: { ...prev.row, ...patch } } : prev));
  }, []);

  const findRow = useCallback(
    (id) =>
      rowsRef.current.find((r) => r.id === id) ??
      (pinnedRef.current?.id === id ? pinnedRef.current : null),
    [],
  );

  // ---- read state (per agent, spec §3.4) ---------------------------------------------------
  // Opening a thread marks it read once per open — so "mark unread" while it stays open sticks.
  const autoReadRef = useRef(null);
  useEffect(() => {
    if (!conversationId) {
      autoReadRef.current = null;
      return;
    }
    if (!me?.id || autoReadRef.current === conversationId) return;
    autoReadRef.current = conversationId;
    const id = conversationId;
    markRead(id, me.id).then((ok) => {
      if (ok) patchRow(id, { unread: false });
    });
    void markMentionsRead({ conversationId: id, teammateId: me.id });
  }, [conversationId, me?.id, patchRow]);

  const selectConversation = useCallback(
    (id) => {
      setFocusedId(null);
      if (findRow(id)?.unread && meRef.current) patchRow(id, { unread: false }); // instant un-bold; the effect persists
      openConversation(id);
    },
    [openConversation, findRow, patchRow],
  );

  const handleToggleRead = useCallback(
    async (conversation) => {
      const teammateId = me?.id;
      if (!teammateId) {
        toast.error("Sign in to track read state.");
        return;
      }
      const nextUnread = !conversation.unread;
      patchRow(conversation.id, { unread: nextUnread });
      const ok = nextUnread
        ? await markUnread(conversation.id, teammateId)
        : await markRead(conversation.id, teammateId);
      if (!ok) {
        patchRow(conversation.id, { unread: !nextUnread });
        toast.error(nextUnread ? "Couldn't mark as unread." : "Couldn't mark as read.");
      }
    },
    [me?.id, patchRow],
  );

  // ---- realtime (dedupe-by-id rule, spec §5.4); one effect per channel so each has exact deps ----
  useEffect(() => {
    const insertFetched = (row) => {
      setPage((prev) =>
        prev.rows.some((r) => r.id === row.id) ? prev : { ...prev, rows: [row, ...prev.rows] },
      );
      void loadTagsFor([row.id]);
    };

    return subscribeTable("conversations", {
      filter: projectId ? `project_id=eq.${projectId}` : undefined,
      onInsert: (raw) => {
        if (raw.deleted_at || findRow(raw.id)) return; // the echo of our own optimistic insert
        const row = fromRealtime(raw, null, teammatesRef.current);
        row.unread = meRef.current ? true : Boolean(raw.unread);
        if (!matchesFilter(row, filterRef.current, meRef.current?.id, extrasFor(row.id))) return;
        // The payload has no joins (e.g. a widget thread's contact) — prefer the full row, fall back to the payload.
        getConversation(raw.id, { teammateId: meRef.current?.id }).then((full) => insertFetched(full ?? row));
      },
      onUpdate: (raw) => {
        const id = raw.id;
        const mine = meRef.current;
        const isOpen = conversationIdRef.current === id;
        if (raw.deleted_at) {
          setPage((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.id !== id) }));
          return;
        }
        const previous = findRow(id);
        const patch = fromRealtime(raw, previous, teammatesRef.current);
        if (!mine) {
          patch.unread = Boolean(raw.unread);
        } else if (previous && activityAdvanced(previous, patch)) {
          // The echo of my own reply (agent-authored, sent moments ago) never makes the thread unread for me.
          const ownEcho = !raw.waiting_on_us && (recentSendsRef.current.get(id) ?? 0) > Date.now() - OWN_ECHO_MS;
          patch.unread = !isOpen && !ownEcho;
          if (isOpen) void markRead(id, mine.id); // the open thread is being read as it arrives
        }

        if (!previous) {
          // Newly in scope (e.g. just assigned to me): fetch the exact row, with joins and per-agent unread.
          const candidate = { ...patch, unread: patch.unread ?? true };
          if (!matchesFilter(candidate, filterRef.current, mine?.id, extrasFor(id))) return;
          getConversation(id, { teammateId: mine?.id }).then((row) => {
            if (row) insertFetched(row);
          });
          return;
        }

        setPinned((prev) => (prev.row?.id === id ? { ...prev, row: mergeFields(prev.row, patch) } : prev));
        setPage((prev) => {
          const current = prev.rows.find((r) => r.id === id);
          if (!current) return prev;
          const merged = mergeFields(current, patch);
          // A row leaving the filter drops out — except the open one, which stays put while it's read.
          if (!isOpen && !matchesFilter(merged, filterRef.current, mine?.id, extrasFor(id))) {
            return { ...prev, rows: prev.rows.filter((r) => r.id !== id) };
          }
          return { ...prev, rows: prev.rows.map((r) => (r.id === id ? merged : r)) };
        });
      },
      onDelete: (old) => {
        setPage((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.id !== old.id) }));
      },
    });
  }, [projectId, findRow, extrasFor, loadTagsFor]);

  // Messages ride the OPEN conversation; resubscribed on selection change, previous channel always removed.
  useEffect(() => {
    if (!conversationId) return undefined;
    return subscribeTable("messages", {
      filter: `conversation_id=eq.${conversationId}`,
      onInsert: (raw) => {
        if (raw.deleted_at) return;
        setThread((prev) => {
          if (prev.key !== conversationId) return prev;
          if (prev.items.some((m) => m.id === raw.id)) return prev; // own echo
          return { ...prev, items: [...prev.items, normalizeMessage(raw)] };
        });
      },
      onUpdate: (raw) => {
        setThread((prev) => {
          if (prev.key !== conversationId) return prev;
          if (raw.deleted_at) return { ...prev, items: prev.items.filter((m) => m.id !== raw.id) };
          return {
            ...prev,
            items: prev.items.map((m) => (m.id === raw.id ? mergeFields(m, normalizeMessage(raw)) : m)),
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
    });
  }, [conversationId]);

  // Mentions preset: the mentioned-thread set (for realtime filter checks) plus live new mentions.
  useEffect(() => {
    if (preset !== "mentions" || !me?.id) return undefined;
    let alive = true;
    const teammateId = me.id;
    listMentions({ projectId, teammateId }).then((list) => {
      if (alive) setMentionIds(new Set(list.map((m) => m.conversationId)));
    });
    const unsubscribe = subscribeTable("mentions", {
      filter: `teammate_id=eq.${teammateId}`,
      onInsert: (raw) => {
        const id = raw.conversation_id;
        setMentionIds((prev) => new Set([...(prev ?? []), id]));
        getConversation(id, { teammateId }).then((row) => {
          if (!alive || !row || (projectId && row.projectId !== projectId)) return;
          if (!matchesFilter(row, filterRef.current, teammateId, { tagIds: tagMapRef.current[id]?.map((t) => t.id) })) return;
          setPage((prev) =>
            prev.rows.some((r) => r.id === row.id) ? prev : { ...prev, rows: [row, ...prev.rows] },
          );
          void loadTagsFor([row.id]);
        });
      },
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [preset, me?.id, projectId, loadTagsFor]);

  // ---- derived ------------------------------------------------------------------------------
  const visibleRows = useMemo(
    () => page.rows.map((r) => ({ ...r, tags: tagMap[r.id] ?? [] })),
    [page.rows, tagMap],
  );

  const activeRow = useMemo(() => {
    const row = visibleRows.find((r) => r.id === conversationId);
    if (row) return row;
    return pinnedRow ? { ...pinnedRow, tags: tagMap[pinnedRow.id] ?? [] } : null;
  }, [visibleRows, pinnedRow, conversationId, tagMap]);

  const activeChannel = useMemo(
    () =>
      effectiveFilter.channelId
        ? channels.find((c) => c.id === effectiveFilter.channelId) ?? { id: effectiveFilter.channelId, name: "" }
        : null,
    [effectiveFilter.channelId, channels],
  );

  const isFiltered = isNarrowed(effectiveFilter, preset);

  // The list edits the effective filter; never persist the URL's channel into local state (the URL owns it).
  const updateFilter = useCallback(
    (next) => {
      setFocusedId(null);
      setFilter((prev) => ({
        ...next,
        channelId:
          channelParam && next.channelId === channelParam ? (prev.channelId ?? null) : (next.channelId ?? null),
      }));
    },
    [channelParam],
  );

  // Clears the filter menu and search but keeps the status tab the user is on.
  const clearFilters = useCallback(() => {
    setFocusedId(null);
    setFilter((prev) => ({ ...presetFilter(preset), status: prev.status, sort: prev.sort }));
    if (channelParam) closeChannel();
  }, [preset, channelParam, closeChannel]);

  const clearChannelFilter = useCallback(() => {
    setFilter((prev) => ({ ...prev, channelId: null }));
    if (channelParam) closeChannel();
  }, [channelParam, closeChannel]);

  // ---- mutations (optimistic -> persist -> revert only the patched keys + toast) -------------
  const mutateRow = useCallback(
    async (id, patch, persist, failMessage) => {
      const previous = findRow(id);
      patchRow(id, patch);
      const saved = await persist();
      if (!saved) {
        if (previous) patchRow(id, pick(previous, Object.keys(patch)));
        toast.error(failMessage);
        return null;
      }
      return saved;
    },
    [findRow, patchRow],
  );

  const handleAssign = useCallback(
    async (conversation, teammate) => {
      if (!canAssign) return;
      const saved = await mutateRow(
        conversation.id,
        { assigneeId: teammate?.id ?? null, assignee: teammate?.name ?? "" },
        () => assignConversation(conversation.id, teammate ?? null),
        "Couldn't update the assignee.",
      );
      if (saved) toast.success(teammate ? `Assigned to ${teammate.name}` : "Unassigned");
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
      const until = presetOrISO.includes("T") ? presetOrISO : snoozeUntil(presetOrISO);
      if (!until) return;
      const saved = await mutateRow(
        conversation.id,
        { status: "Snoozed", snoozedUntil: until },
        () => snoozeConversation(conversation.id, until),
        "Couldn't snooze the conversation.",
      );
      if (saved) toast.success("Snoozed");
    },
    [canClose, mutateRow],
  );

  const handleClose = useCallback(
    async (conversation) => {
      if (!canClose) return;
      const saved = await mutateRow(
        conversation.id,
        { status: "Closed", closedAt: new Date().toISOString() },
        () => closeConversation(conversation.id),
        "Couldn't close the conversation.",
      );
      if (saved) toast.success("Closed");
    },
    [canClose, mutateRow],
  );

  const handleReopen = useCallback(
    async (conversation) => {
      if (!canClose) return;
      const saved = await mutateRow(
        conversation.id,
        { status: "Open", closedAt: null, snoozedUntil: null },
        () => reopenConversation(conversation.id),
        "Couldn't reopen the conversation.",
      );
      if (saved) toast.success("Reopened");
    },
    [canClose, mutateRow],
  );

  const handlePriority = useCallback(
    (conversation, priority) => {
      if (conversation.priority === priority) return;
      void mutateRow(
        conversation.id,
        { priority },
        () => setPriority(conversation.id, priority),
        "Couldn't update priority.",
      );
    },
    [mutateRow],
  );

  // ---- tags (one link at a time — never a wholesale replace) ------------------------------------
  const setRowTags = useCallback((id, update) => {
    setTagMap((prev) => ({ ...prev, [id]: update(prev[id] ?? []) }));
  }, []);

  const handleToggleTag = useCallback(
    async (conversation, tag) => {
      const id = conversation.id;
      const applied = (tagMapRef.current[id] ?? []).some((t) => t.id === tag.id);
      setRowTags(id, (list) => (applied ? list.filter((t) => t.id !== tag.id) : [...list, tag]));
      const ok = applied
        ? await removeConversationTag(id, tag.id)
        : await addConversationTag(id, tag.id);
      if (!ok) {
        setRowTags(id, (list) => (applied ? [...list, tag] : list.filter((t) => t.id !== tag.id)));
        toast.error(applied ? "Couldn't remove the tag." : "Couldn't add the tag.");
      }
    },
    [setRowTags],
  );

  const handleCreateTag = useCallback(
    async (conversation, rawName) => {
      const name = (rawName || "").trim();
      if (!name) return;
      const existing = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        const applied = (tagMapRef.current[conversation.id] ?? []).some((t) => t.id === existing.id);
        if (!applied) await handleToggleTag(conversation, existing);
        return;
      }
      const tag = {
        id: crypto.randomUUID(),
        name,
        color: TAG_COLORS[allTags.length % TAG_COLORS.length],
        projectId: projectId ?? null,
      };
      const byName = (a, b) => a.name.localeCompare(b.name);
      setAllTags((prev) => [...prev, tag].sort(byName));
      setRowTags(conversation.id, (list) => [...list, tag]);
      const created = await createTag({
        id: tag.id,
        name,
        color: tag.color,
        projectId: projectId ?? null,
        createdBy: me?.userId ?? null,
      });
      if (!created) {
        setAllTags((prev) => prev.filter((t) => t.id !== tag.id));
        setRowTags(conversation.id, (list) => list.filter((t) => t.id !== tag.id));
        toast.error("Couldn't create the tag.");
        return;
      }
      const linked = await addConversationTag(conversation.id, created.id);
      if (!linked) {
        setRowTags(conversation.id, (list) => list.filter((t) => t.id !== tag.id));
        toast.error("Tag created, but couldn't apply it.");
        return;
      }
      toast.success(`Tag "${name}" created`);
    },
    [allTags, projectId, me?.userId, setRowTags, handleToggleTag],
  );

  // ---- reply / note; returns false so the composer keeps the draft on failure -------------------
  const handleSend = useCallback(
    async ({ body, messageType }) => {
      if (!activeRow) return false;
      const conversation = activeRow;
      const isNote = messageType === "note";
      const authorName = me?.name || "Agent";
      const optimisticId = crypto.randomUUID();
      const optimistic = {
        id: optimisticId,
        conversationId: conversation.id,
        authorRole: "agent",
        authorName,
        authorId: me?.id ?? null,
        messageType,
        body,
        attachments: [],
        createdAt: new Date().toISOString(),
      };
      setThread((prev) =>
        prev.key === conversation.id ? { ...prev, items: [...prev.items, optimistic] } : prev,
      );
      // Notes touch none of the customer-facing surface (post_message skips them server-side).
      const surface = { preview: body.slice(0, 140), lastMessageAt: optimistic.createdAt, waitingOnUs: false };
      const previousSurface = pick(conversation, Object.keys(surface));
      if (!isNote) {
        patchRow(conversation.id, surface);
        recentSendsRef.current.set(conversation.id, Date.now());
      }

      const saved = await createMessage({
        id: optimisticId, // optimistic row and DB row share a UUID (spec §5.3)
        conversationId: conversation.id,
        body,
        messageType,
        authorRole: "agent",
        authorName,
        authorId: me?.id ?? null,
      });
      if (!saved) {
        setThread((prev) =>
          prev.key === conversation.id
            ? { ...prev, items: prev.items.filter((m) => m.id !== optimisticId) }
            : prev,
        );
        if (!isNote) patchRow(conversation.id, previousSurface);
        toast.error(isNote ? "Couldn't save the note." : "Message not sent.");
        return false;
      }
      setThread((prev) =>
        prev.key === conversation.id
          ? { ...prev, items: prev.items.map((m) => (m.id === optimisticId ? saved : m)) }
          : prev,
      );
      // My own reply bumps last activity — keep the thread read for me.
      if (!isNote && me?.id) void markRead(conversation.id, me.id);

      // @mentions live in internal notes (Intercom model): one mentions row per named teammate.
      if (isNote) {
        const named = mentionedTeammates(body, teammates).filter((t) => t.id !== me?.id);
        if (named.length > 0) {
          const ok = await createMentions({
            conversationId: conversation.id,
            messageId: saved.id,
            teammateIds: named.map((t) => t.id),
          });
          if (!ok) toast.error("Note saved, but the @mentions weren't delivered.");
        }
      }
      return true;
    },
    [activeRow, me, teammates, patchRow],
  );

  const handleCreateConversation = useCallback(
    async (draft) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const body = draft.body.trim();
      const assignToMe = Boolean(me?.id) && canAssign;
      const optimistic = {
        ...normalizeConversation({
          id,
          subject: draft.subject.trim(),
          contact_name: draft.contactName.trim(),
          contact_email: draft.contactEmail.trim(),
          channel: draft.channel,
          channel_id: draft.channelId ?? null,
          status: "Open",
          priority: "Normal",
          assignee_id: assignToMe ? me.id : null,
          project_id: projectId ?? null,
          preview: body.slice(0, 140),
          created_at: now,
          last_message_at: now,
        }),
        assignee: assignToMe ? me.name : "",
        unread: false,
      };
      setPage((prev) => ({ ...prev, rows: [optimistic, ...prev.rows] }));
      const rollback = (message) => {
        setPage((prev) => ({ ...prev, rows: prev.rows.filter((r) => r.id !== id) }));
        toast.error(message);
        return null;
      };

      const contact = await findOrCreateContact({
        projectId,
        name: draft.contactName,
        email: draft.contactEmail,
        createdBy: me?.userId ?? null,
      });
      if (!contact) return rollback("Couldn't save the contact.");

      const created = await createConversation({
        id, // optimistic row and DB row share a UUID
        subject: optimistic.subject,
        contactId: contact.id,
        contactName: contact.name,
        contactEmail: contact.email || null,
        contactAvatar: contact.avatarUrl || "",
        channel: draft.channel,
        channelId: draft.channelId ?? null,
        projectId,
        status: "Open",
        ...(assignToMe ? { assigneeId: me.id, assignee: me.name } : {}),
        createdBy: me?.userId ?? null,
      });
      if (!created) return rollback("Couldn't create the conversation.");

      patchRow(id, {
        ...created,
        contactName: contact.name,
        contactEmail: contact.email,
        contactAvatar: contact.avatarUrl,
        assignee: assignToMe ? me.name : "",
        unread: false,
      });
      if (body) {
        const first = await createMessage({
          conversationId: id,
          body,
          authorRole: "customer",
          authorName: contact.name,
        });
        if (!first) toast.error("Conversation created, but the first message didn't save.");
      }
      toast.success("Conversation created");
      selectConversation(id);
      return created;
    },
    [projectId, me, canAssign, patchRow, selectConversation],
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

  // Opens the assign / snooze menu for a row, opening the row first when the keyboard cursor is elsewhere.
  const openMenuFor = useCallback(
    (kind, row) => {
      if (row.id !== conversationId) selectConversation(row.id);
      setMenu({ kind, id: row.id });
    },
    [conversationId, selectConversation],
  );

  // ---- keyboard shortcuts (spec §5.5); skipped while typing or inside a menu/dialog --------------
  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = document.activeElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest?.('[role="menu"], [role="dialog"], [role="listbox"]'))
      ) {
        return;
      }
      const idx = visibleRows.findIndex((r) => r.id === (focusedId ?? conversationId));
      const at = (i) => visibleRows[Math.max(0, Math.min(i, visibleRows.length - 1))];
      const current = idx >= 0 ? visibleRows[idx] : activeRow;

      switch (event.key) {
        case "j":
        case "ArrowDown":
          if (visibleRows.length === 0) break;
          event.preventDefault();
          setFocusedId(at(idx + 1)?.id ?? null);
          break;
        case "k":
        case "ArrowUp":
          if (visibleRows.length === 0) break;
          event.preventDefault();
          setFocusedId(at(idx - 1)?.id ?? null);
          break;
        case "Enter": {
          // Only hijack Enter from the page or a list row; any other focused control keeps its native action.
          const onRow = !target || target === document.body || target.dataset?.conversationRow != null;
          if (!focusedId || !onRow) break;
          event.preventDefault();
          selectConversation(focusedId);
          break;
        }
        case "e":
          if (!current) break;
          if (!canClose) toast.error(CLOSE_DENIED);
          else void (current.status === "Closed" ? handleReopen : handleClose)(current);
          break;
        case "a":
          if (!current) break;
          event.preventDefault();
          if (!canAssign) toast.error(ASSIGN_DENIED);
          else openMenuFor("assign", current);
          break;
        case "s":
          if (!current) break;
          event.preventDefault();
          if (!canClose) toast.error(CLOSE_DENIED);
          else openMenuFor("snooze", current);
          break;
        case "/":
          event.preventDefault();
          document.querySelector('[data-inbox-search="true"] input')?.focus();
          break;
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
    activeRow,
    focusedId,
    conversationId,
    canAssign,
    canClose,
    selectConversation,
    closeThread,
    handleReopen,
    handleClose,
    openMenuFor,
  ]);

  return {
    preset,
    projectId,
    conversationId,
    closeThread,
    canReply,
    canAssign,
    canClose,
    filter: effectiveFilter,
    updateFilter,
    clearFilters,
    clearChannelFilter,
    isFiltered,
    activeChannel,
    channels,
    page,
    teammates,
    me,
    allTags,
    initialLoading,
    refreshing,
    loadMore,
    threadLoading,
    threadMissing,
    messages,
    focusedId,
    newOpen,
    setNewOpen,
    customSnooze,
    setCustomSnooze,
    ticketDraft,
    setTicketDraft,
    menu,
    setMenu,
    contactOpen,
    setContactOpen,
    visibleRows,
    activeRow,
    selectConversation,
    handleAssign,
    handleSnooze,
    handleClose,
    handleReopen,
    handlePriority,
    handleToggleRead,
    handleToggleTag,
    handleCreateTag,
    handleSend,
    handleCreateConversation,
    handleCreateTicket,
    signedOut,
  };
}
