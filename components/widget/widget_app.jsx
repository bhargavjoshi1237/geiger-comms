"use client";

// The iframe app root (spec §9): handshake → boot → ready, the in-memory session (§4.1), spaces routing, unread counts and realtime (§6).
// Tokens live in memory only. The tab bar belongs to the panel, so a sub-screen (thread, article, composer) hides it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LogoLoading } from "@geiger/ui/logo-loading";
import { createBridge } from "./bridge";
import { bootWidgetSession, createWidgetApi } from "./api_client";
import { createRealtime } from "./realtime";
import { HomeSpace } from "./home_space";
import { AskSpace } from "./ask_space";
import { MessagesSpace } from "./messages_space";
import { HelpSpace } from "./help_space";
import { NewsSpace } from "./news_space";
import { TicketsSpace } from "./tickets_space";
import { OfflineMessageView } from "./offline_message";
import {
  BookOpen,
  BrandMark,
  firstName,
  House,
  initialsOf,
  MessageCircle,
  Newspaper,
  ReconnectingBanner,
  Ticket,
} from "./widget_primitives";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const HOME_ROUTE = { space: "home" };
const FIRST_BOOT_ATTEMPTS = 4; // transient first-boot failures before the error screen
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;
const WATCH_LIMIT = 20; // most recent conversations listened on, so unread counts work while the panel is closed
const FALLBACK_POLL_MS = 30_000; // re-sync cadence while realtime is unavailable
const RESYNC_MIN_GAP_MS = 3_000;
const LIST_DEBOUNCE_MS = 400;
const MAX_PENDING = 20;
const EMPTY_CONTENT = { help: null, news: null, tickets: null };
const CORE_SPACES = new Set(["home", "messages"]);

// Boot statuses a retry cannot fix.
const FATAL_BOOT = {
  400: "Chat couldn't start on this page.",
  401: "Your sign-in has expired. Refresh the page to keep chatting.",
  403: "Chat isn't enabled for this site.",
  404: "Chat isn't available right now.",
};
const TRANSIENT_BOOT = "We couldn't reach chat right now. Please try again shortly.";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const pickText = (...values) => values.find((v) => typeof v === "string" && v.trim())?.trim() ?? "";

// Server config → the flat view model every space reads; neutral defaults stand in for anything missing.
export function normalizeConfig(raw) {
  const c = isObject(raw) ? raw : {};
  const a = isObject(c.appearance) ? c.appearance : {};
  const assistant = isObject(c.assistant) ? c.assistant : {};
  const logo = pickText(a.logoUrl, c.logoUrl);
  return {
    name: pickText(a.name, c.name) || "Support",
    greeting: pickText(a.greeting, c.greeting) || "Hi there. How can we help?",
    officeHoursNote: pickText(a.officeHoursNote, c.officeHoursNote),
    backAt: pickText(a.backAt, c.backAt),
    logoUrl: /^https:\/\//i.test(logo) ? logo : "",
    // The launcher colour doubles as the panel accent: the visitor's bubbles, primary buttons and badges.
    accent: HEX_RE.test(a.launcherColor || "") ? a.launcherColor : "",
    // AI surfaces (Ask, hand-over copy) only appear when the server names an assistant.
    assistantName: pickText(assistant.name, c.assistantName),
    assistantTagline: pickText(assistant.tagline, c.assistantTagline),
    team: Array.isArray(c.team) ? c.team.filter((p) => isObject(p) && pickText(p.name)).slice(0, 3) : [],
    teamOnline: typeof c.teamOnline === "boolean" ? c.teamOnline : null,
    showAvatars: a.showAvatars !== false,
    spaces: isObject(c.spaces) ? c.spaces : {},
  };
}

const spaceEnabled = (config, id) => config?.spaces?.[id] !== false;

// A tab shows when its space is enabled and, for content spaces, a probe found something in it (spec §9).
function tabVisible(config, content, id) {
  if (!spaceEnabled(config, id)) return false;
  return CORE_SPACES.has(id) || content[id] === true;
}

// What the panel renders: a disabled space falls back to Home; Ask without an assistant becomes a new message.
function resolveRoute(route, config) {
  if (route.space === "ask") {
    return config.assistantName ? route : { space: "messages", compose: true, draft: route.query || "" };
  }
  return spaceEnabled(config, route.space) ? route : HOME_ROUTE;
}

// The tab a route belongs to; sub-screens return null so the nav hides.
function tabForRoute(route) {
  if (route.space === "home") return "home";
  if (route.space === "messages") return route.conversationId || route.compose ? null : "messages";
  if (route.space === "help") return route.articleId ? null : "help";
  if (route.space === "news") return route.postId ? null : "news";
  if (route.space === "tickets") return route.ticketId ? null : "tickets";
  return null;
}

const retryDelay = (failures) => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, failures - 1));

const sameIdentity = (a, b) =>
  a?.appId === b?.appId && (a?.jwt || null) === (b?.jwt || null) && a?.anonymousId === b?.anonymousId;

// The server's per-conversation unread counts (agent/AI replies since the visitor last read) are authoritative;
// the thread the visitor has on screen always reads zero.
function unreadFromRows(rows, readId) {
  const map = {};
  for (const row of rows) {
    const n = typeof row.unreadCount === "number" && row.unreadCount > 0 ? Math.floor(row.unreadCount) : 0;
    if (n && row.id !== readId) map[row.id] = n;
  }
  return map;
}

// POST /session (spec §4) → { ok, session } or { ok: false, status }; parentOrigin is the host origin the bridge verified.
async function startSession(payload, parentOrigin) {
  try {
    const session = await bootWidgetSession({
      appId: payload.appId,
      jwt: payload.jwt,
      anonymousId: payload.anonymousId,
      parentOrigin,
    });
    return typeof session?.sessionToken === "string" ? { ok: true, session } : { ok: false, status: 0 };
  } catch (e) {
    return { ok: false, status: typeof e?.status === "number" ? e.status : 0 };
  }
}

export function WidgetApp() {
  const searchParams = useSearchParams();
  const expectedParentOrigin = searchParams.get("parentOrigin") || "";

  const [phase, setPhase] = useState("waiting"); // waiting | booting | ready | error
  const [bootError, setBootError] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [config, setConfig] = useState(() => normalizeConfig(null));
  const [contact, setContact] = useState(null);
  const [route, setRoute] = useState(HOME_ROUTE);
  const [epoch, setEpoch] = useState(0); // bumps on every successful boot so spaces re-fetch
  const [sessionTrouble, setSessionTrouble] = useState(false);
  const [liveStatus, setLiveStatus] = useState("off");
  const [hadLive, setHadLive] = useState(false);
  const [browserOffline, setBrowserOffline] = useState(false);
  const [visible, setVisible] = useState(true);
  const [convos, setConvos] = useState({ rows: null, failed: false });
  const [unreadMap, setUnreadMap] = useState({});
  const [threadTicks, setThreadTicks] = useState({});
  const [syncTick, setSyncTick] = useState(0);
  const [probeTick, setProbeTick] = useState(0);
  const [content, setContent] = useState(EMPTY_CONTENT);
  const [theme, setTheme] = useState("dark");

  const bridgeRef = useRef(null);
  const apiRef = useRef(null);
  const tokensRef = useRef(null);
  const realtimeRef = useRef(null);
  const lastBootRef = useRef(null);
  const bootSeqRef = useRef(0);
  const bootingRef = useRef(false);
  const failuresRef = useRef(0);
  const retryTimerRef = useRef(null);
  const listTimerRef = useRef(null);
  const pendingRef = useRef([]);
  const unreadRef = useRef({}); // mirror of unreadMap for diffing inside callbacks
  const unreadPrimedRef = useRef(false); // a list has landed since unreadRef was reset, so growth means a new reply
  const openIdRef = useRef(null);
  const visibleRef = useRef(true);
  const liveRef = useRef("off");
  const lastResyncRef = useRef(0);
  const lastUnreadSentRef = useRef(null);
  // Latest callbacks for long-lived listeners (bridge, timers, realtime, API client).
  const handlersRef = useRef({});

  // The panel carries its own token set; follow the document's theme so it never sits dark inside a light page.
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const postToHost = useCallback((type, payload) => bridgeRef.current?.send(type, payload), []);
  const getApi = useCallback(() => apiRef.current, []);

  const clearRetry = useCallback(() => {
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);

  // Every token pair (boot, and the API client's proactive refresh) lands here; realtime re-auths in place (spec §4.1).
  const applyTokens = useCallback((tokens) => {
    if (!isObject(tokens) || typeof tokens.sessionToken !== "string") return;
    tokensRef.current = { ...(tokensRef.current || {}), ...tokens };
    failuresRef.current = 0;
    realtimeRef.current?.setToken(tokensRef.current.realtimeToken ?? null);
  }, []);

  const disposeApi = useCallback(() => {
    apiRef.current?.dispose?.();
    apiRef.current = null;
  }, []);

  // Drops every trace of the current session; in-flight boots and pending timers become no-ops.
  const teardownSession = useCallback(() => {
    bootSeqRef.current += 1;
    bootingRef.current = false;
    clearRetry();
    clearTimeout(listTimerRef.current);
    tokensRef.current = null;
    disposeApi();
    realtimeRef.current?.setToken(null);
    unreadRef.current = {};
    unreadPrimedRef.current = false;
  }, [clearRetry, disposeApi]);

  const resetView = useCallback(() => {
    setContact(null);
    setRoute(HOME_ROUTE);
    setConvos({ rows: null, failed: false });
    unreadRef.current = {};
    unreadPrimedRef.current = false;
    setUnreadMap({});
    setThreadTicks({});
    setContent(EMPTY_CONTENT);
    setSessionTrouble(false);
    setHadLive(false);
    setLiveStatus("off");
    liveRef.current = "off";
  }, []);

  // POST /session → in-memory tokens + config. `silent` keeps the current panel on screen (a re-boot after session loss).
  const boot = useCallback(
    async (payload, { silent = false } = {}) => {
      if (!payload) return;
      if (!bridgeRef.current?.confirmParent(payload.parentOrigin)) {
        teardownSession();
        setBootError("We couldn't verify the page hosting this chat.");
        setRetryable(false);
        setPhase("error");
        return;
      }
      const seq = ++bootSeqRef.current;
      clearRetry();
      lastBootRef.current = payload;
      bootingRef.current = true;
      if (!silent) setPhase("booting");

      const result = await startSession(payload, bridgeRef.current?.verifiedParentOrigin() ?? null);
      if (seq !== bootSeqRef.current) return; // superseded by a newer boot, update or shutdown
      bootingRef.current = false;

      if (result.ok) {
        const { session } = result;
        // The API client binds to the session token it sees at construction, so tokens land first.
        disposeApi();
        tokensRef.current = null;
        applyTokens({
          sessionToken: session.sessionToken,
          realtimeToken: session.realtimeToken ?? null,
          expiresIn: session.expiresIn,
          realtimeExpiresIn: session.realtimeExpiresIn ?? null,
        });
        apiRef.current = createWidgetApi({
          getTokens: () => tokensRef.current || {},
          onTokensRefreshed: (tokens) => handlersRef.current.applyTokens?.(tokens),
          onRequestReboot: () => handlersRef.current.recover?.(),
          onEvent: (event) => postToHost("event", { name: event?.name, meta: event?.meta ?? null }),
        });
        setConfig(normalizeConfig(session.config));
        setContact(session.contact ?? null);
        postToHost("visitor", { visitorId: session.visitorId ?? null });
        setSessionTrouble(false);
        setEpoch((n) => n + 1);
        setPhase("ready");
        return;
      }

      failuresRef.current += 1;
      const fatal = FATAL_BOOT[result.status];
      if (fatal) {
        teardownSession();
        setBootError(fatal);
        setRetryable(result.status !== 401);
        setPhase("error");
        return;
      }
      if (silent) {
        // The silent re-boot failed too: surface "reconnecting" and keep retrying with backoff (spec §4.1).
        setSessionTrouble(true);
      } else if (failuresRef.current >= FIRST_BOOT_ATTEMPTS) {
        setBootError(TRANSIENT_BOOT);
        setRetryable(true);
        setPhase("error");
        return;
      }
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        void handlersRef.current.boot?.(lastBootRef.current, { silent });
      }, retryDelay(failuresRef.current));
    },
    [applyTokens, clearRetry, disposeApi, postToHost, teardownSession],
  );

  // Session refused (a 401, or a refresh that could not land before expiry): one silent re-boot; its failure surfaces "reconnecting" (spec §4.1).
  const recoverSession = useCallback(() => {
    if (!lastBootRef.current || bootingRef.current || retryTimerRef.current) return;
    tokensRef.current = null;
    realtimeRef.current?.setToken(null);
    void boot(lastBootRef.current, { silent: true });
  }, [boot]);

  const shutdown = useCallback(() => {
    teardownSession();
    lastBootRef.current = null;
    pendingRef.current = [];
    failuresRef.current = 0;
    resetView();
    setPhase("waiting");
  }, [resetView, teardownSession]);

  // A different identity gets a clean session; the server merges anonymous history on sign-in (spec §4.2).
  const switchIdentity = useCallback(
    (payload) => {
      teardownSession();
      failuresRef.current = 0;
      resetView();
      void boot(payload);
    },
    [boot, resetView, teardownSession],
  );

  // Host commands that need a session wait until one exists.
  const runWithSession = useCallback((fn) => {
    const api = apiRef.current;
    if (api && tokensRef.current) fn(api);
    else if (pendingRef.current.length < MAX_PENDING) pendingRef.current.push(fn);
  }, []);

  // Resume (tab visible, back online, realtime recovered, panel shown): re-fetch to close any gap (spec §6).
  const requestResync = useCallback(({ probe = false } = {}) => {
    const now = Date.now();
    if (now - lastResyncRef.current < RESYNC_MIN_GAP_MS) return;
    lastResyncRef.current = now;
    setSyncTick((n) => n + 1);
    if (probe) setProbeTick((n) => n + 1);
  }, []);

  const commitUnread = useCallback((next) => {
    unreadRef.current = next;
    setUnreadMap(next);
  }, []);

  // The list carries the authoritative unread counts; a count that grew lights the launcher's "<agent> replied" pill.
  // Growth after the first list of a session is a reply that just arrived, so it also rings the host's chime; replies already waiting at boot don't.
  const loadConversations = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const rows = await api.conversations();
      if (apiRef.current !== api) return;
      const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r.id === "string") : [];
      const next = unreadFromRows(list, visibleRef.current ? openIdRef.current : null);
      const prev = unreadRef.current;
      const grew = list.find((r) => (next[r.id] || 0) > (prev[r.id] || 0));
      const arrived = Boolean(grew) && unreadPrimedRef.current;
      unreadPrimedRef.current = true;
      setConvos({ rows: list, failed: false });
      commitUnread(next);
      // The loader is size-capped, so it gets the pill's words ready-made: "Maya" replied, beside an "MR" disc.
      if (grew) {
        const author = grew.agentName || "";
        postToHost("launcher", {
          unreadReply: true,
          author: firstName(author) || null,
          initials: author ? initialsOf(author) : null,
        });
      }
      if (arrived) postToHost("chime");
    } catch {
      if (apiRef.current === api) setConvos((c) => (c.rows ? c : { rows: null, failed: true }));
    }
  }, [commitUnread, postToHost]);

  const reloadConversations = useCallback(() => {
    setConvos((c) => (c.failed ? { rows: null, failed: false } : c));
    void loadConversations();
  }, [loadConversations]);

  const scheduleListReload = useCallback(() => {
    clearTimeout(listTimerRef.current);
    listTimerRef.current = setTimeout(() => {
      listTimerRef.current = null;
      void loadConversations();
    }, LIST_DEBOUNCE_MS);
  }, [loadConversations]);

  // Content spaces show a tab only when they have something in them (spec §9).
  const probeContent = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    const has = (call) =>
      Promise.resolve()
        .then(call)
        .then((rows) => Array.isArray(rows) && rows.length > 0)
        .catch(() => null);
    const [help, news, tickets] = await Promise.all([
      has(() => api.articles?.("")),
      has(() => api.news?.()),
      has(() => api.tickets?.()),
    ]);
    if (apiRef.current !== api) return;
    setContent((prev) => ({
      help: help ?? prev.help,
      news: news ?? prev.news,
      tickets: tickets ?? prev.tickets,
    }));
  }, []);

  // message.created (spec §6) carries no body: re-fetch the affected thread through the API, and the list for previews and unread.
  const handleNotify = useCallback(
    (envelope) => {
      const id = envelope.conversationId;
      setThreadTicks((t) => ({ ...t, [id]: (t[id] || 0) + 1 }));
      scheduleListReload();
    },
    [scheduleListReload],
  );

  const handleStatus = useCallback(
    (status) => {
      const prev = liveRef.current;
      liveRef.current = status;
      setLiveStatus(status);
      if (status !== "live") return;
      setHadLive(true);
      if (prev === "down") requestResync();
    },
    [requestResync],
  );

  // The visitor has the thread on screen: clear its unread count and tell the server.
  const markSeen = useCallback(
    (conversationId) => {
      if (!conversationId) return;
      const current = unreadRef.current;
      if (current[conversationId]) commitUnread({ ...current, [conversationId]: 0 });
      Promise.resolve(apiRef.current?.markRead?.(conversationId)).catch(() => {});
    },
    [commitUnread],
  );

  // Widget → host `userEmailSupplied` (spec §8), fired when the visitor gives us their email.
  const onEmailSupplied = useCallback(
    (email) => {
      if (typeof email === "string" && email) postToHost("userEmailSupplied", { email });
    },
    [postToHost],
  );

  // Payloads arrive already validated per type by the bridge.
  const handleCommand = useCallback(
    (type, payload) => {
      switch (type) {
        case "boot": {
          const prev = lastBootRef.current;
          // A repeat boot for the live (or still-booting) identity is a no-op.
          if (prev && (apiRef.current || bootingRef.current) && sameIdentity(prev, payload)) break;
          if (prev) switchIdentity(payload);
          else {
            failuresRef.current = 0;
            void boot(payload);
          }
          break;
        }
        case "update": {
          const prev = lastBootRef.current;
          if (!payload.hasJwt || !prev || (prev.jwt || null) === payload.jwt) break;
          switchIdentity({ ...prev, jwt: payload.jwt, email: payload.email ?? prev.email });
          break;
        }
        case "shutdown":
          shutdown();
          break;
        case "show":
          setVisible(true);
          requestResync({ probe: true });
          break;
        case "hide":
          setVisible(false);
          break;
        case "showSpace":
          setRoute({ space: payload.name });
          break;
        case "showAsk":
          setRoute({ space: "ask", query: payload.text });
          break;
        case "showArticle":
          setRoute({ space: "help", articleId: payload.id });
          break;
        case "showNews":
          setRoute(payload.id ? { space: "news", postId: payload.id } : { space: "news" });
          break;
        case "showConversation":
          setRoute({ space: "messages", conversationId: payload.id });
          break;
        case "showNewMessage":
          setRoute({ space: "messages", compose: true, draft: payload.text });
          break;
        case "showTicket":
          setRoute({ space: "tickets", ticketId: payload.id });
          break;
        case "trackEvent":
          // Straight to /events: the host already fired its own onEvent listeners for this call.
          runWithSession((api) =>
            Promise.resolve(
              api.request("/events", {
                method: "POST",
                body: JSON.stringify({ name: payload.name, meta: payload.meta }),
              }),
            ).catch(() => null),
          );
          break;
        default:
          break; // "launcher" echoes need nothing from the panel
      }
    },
    [boot, requestResync, runWithSession, shutdown, switchIdentity],
  );

  useEffect(() => {
    handlersRef.current = {
      boot,
      recover: recoverSession,
      applyTokens,
      notify: handleNotify,
      status: handleStatus,
      command: handleCommand,
    };
  });

  // Handshake: announce readiness; every inbound envelope is origin-, source- and schema-checked by the bridge.
  useEffect(() => {
    const bridge = createBridge({
      expectedParentOrigin,
      onMessage: (type, payload) => handlersRef.current.command?.(type, payload),
    });
    bridgeRef.current = bridge;
    bridge.send("ready");
    return () => {
      bridge.close();
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
  }, [expectedParentOrigin]);

  useEffect(() => teardownSession, [teardownSession]);

  // Commands queued before the session existed run once it does.
  useEffect(() => {
    if (phase !== "ready" || !apiRef.current) return;
    const api = apiRef.current;
    const queued = pendingRef.current;
    pendingRef.current = [];
    queued.forEach((fn) => fn(api));
  }, [phase, epoch]);

  // One realtime socket per session; it stays up while the panel is hidden so the launcher badge keeps counting.
  useEffect(() => {
    if (phase !== "ready") return undefined;
    const rt = createRealtime({
      url: SUPABASE_URL,
      apiKey: SUPABASE_ANON_KEY,
      onNotify: (envelope) => handlersRef.current.notify?.(envelope),
      onStatus: (status) => handlersRef.current.status?.(status),
    });
    realtimeRef.current = rt;
    rt.setToken(tokensRef.current?.realtimeToken ?? null);
    return () => {
      rt.close();
      if (realtimeRef.current === rt) realtimeRef.current = null;
    };
  }, [phase, epoch]);

  const viewRoute = resolveRoute(route, config);
  const openConversationId =
    viewRoute.space === "messages" && viewRoute.conversationId ? viewRoute.conversationId : null;

  // Listen on the open thread plus the most recent conversations; a string key keeps the effect from churning.
  const watchIds = openConversationId ? [openConversationId] : [];
  for (const row of convos.rows ?? []) {
    if (watchIds.length > WATCH_LIMIT) break;
    if (!watchIds.includes(row.id)) watchIds.push(row.id);
  }
  const watchKey = watchIds.join(",");

  useEffect(() => {
    realtimeRef.current?.watch(watchKey ? watchKey.split(",") : []);
  }, [watchKey, phase, epoch]);

  useEffect(() => {
    openIdRef.current = openConversationId;
    visibleRef.current = visible;
  }, [openConversationId, visible]);

  useEffect(() => {
    if (phase !== "ready") return;
    void loadConversations();
  }, [phase, epoch, syncTick, loadConversations]);

  useEffect(() => {
    if (phase !== "ready") return;
    void probeContent();
  }, [phase, epoch, probeTick, probeContent]);

  // Unread total → host, which drives the launcher badge and onUnreadCountChange (spec §9.1).
  const unreadTotal = useMemo(
    () => Object.values(unreadMap).reduce((sum, n) => sum + (n > 0 ? n : 0), 0),
    [unreadMap],
  );
  useEffect(() => {
    if (lastUnreadSentRef.current === unreadTotal) return;
    lastUnreadSentRef.current = unreadTotal;
    postToHost("unreadCount", { count: unreadTotal });
    if (unreadTotal === 0) postToHost("launcher", { unreadReply: false });
  }, [unreadTotal, postToHost]);

  // Offline/resume are first-class (spec §9): flag offline, re-sync when the tab or the network comes back.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") requestResync({ probe: true });
    };
    const onOnline = () => {
      setBrowserOffline(false);
      requestResync({ probe: true });
    };
    const onOffline = () => setBrowserOffline(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [requestResync]);

  // Without a live socket (not configured, or never authorised) an open panel re-syncs on a slow poll instead.
  const realtimeHealthy = liveStatus === "live" || liveStatus === "idle";
  useEffect(() => {
    if (phase !== "ready" || !visible || realtimeHealthy) return undefined;
    const timer = setInterval(() => setSyncTick((n) => n + 1), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [phase, visible, realtimeHealthy]);

  if (phase === "waiting" || phase === "booting") {
    return (
      <Shell theme={theme} accent={config.accent}>
        <div className="gc-boot">
          <LogoLoading size={64} aria-label="Starting chat" />
          <p className="gc-boot__label">{phase === "waiting" ? "Starting chat" : "Signing you in"}</p>
        </div>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell theme={theme} accent={config.accent}>
        <div className="gc-boot" role="alert">
          <span className="gc-boot__mark" aria-hidden="true">
            <BrandMark size={24} />
          </span>
          <p>{bootError}</p>
          {retryable ? (
            <button
              type="button"
              className="gc-btn gc-btn--outline gc-btn--sm"
              onClick={() => {
                failuresRef.current = 0;
                void boot(lastBootRef.current);
              }}
            >
              Try again
            </button>
          ) : null}
        </div>
      </Shell>
    );
  }

  const reconnecting = browserOffline || sessionTrouble || (liveStatus === "down" && hadLive);
  // Team away: the panel opens on the "leave a message" screen instead of home.
  const away = config.teamOnline === false && viewRoute.space === "home";
  const activeTab = away ? null : tabForRoute(viewRoute);
  const tabs = TABS.filter((t) => tabVisible(config, content, t.id));

  const spaceProps = {
    getApi,
    config,
    contact,
    route: viewRoute,
    navigate: setRoute,
    postToHost,
    visible,
    sessionKey: epoch,
    syncTick,
    content,
    conversations: convos.rows,
    conversationsFailed: convos.failed,
    reloadConversations,
    unreadMap,
    threadTicks,
    onSeen: markSeen,
    onEmailSupplied,
  };

  return (
    <Shell theme={theme} accent={config.accent}>
      <div className="gc-panel" role="dialog" aria-label="Messenger">
        <ReconnectingBanner
          visible={reconnecting}
          label={browserOffline ? "You're offline. Waiting for a connection…" : "Reconnecting…"}
        />

        {away ? (
          <OfflineMessageView
            getApi={getApi}
            config={config}
            contact={contact}
            onAsk={config.assistantName ? () => setRoute({ space: "ask" }) : null}
            onHelp={tabVisible(config, content, "help") ? () => setRoute({ space: "help" }) : null}
            onClose={() => postToHost("close")}
            onEmailSupplied={onEmailSupplied}
          />
        ) : viewRoute.space === "ask" ? (
          <AskSpace {...spaceProps} />
        ) : viewRoute.space === "messages" ? (
          <MessagesSpace {...spaceProps} />
        ) : viewRoute.space === "help" ? (
          <HelpSpace {...spaceProps} />
        ) : viewRoute.space === "news" ? (
          <NewsSpace {...spaceProps} />
        ) : viewRoute.space === "tickets" ? (
          <TicketsSpace {...spaceProps} />
        ) : (
          <HomeSpace {...spaceProps} />
        )}

        {activeTab === null ? null : (
          <TabBar tabs={tabs} active={activeTab} unread={unreadTotal} onChange={setRoute} />
        )}
      </div>
    </Shell>
  );
}

// WCAG relative luminance of a #rgb / #rrggbb colour.
function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.replace(/./g, "$&$&");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// The launcher colour as the panel accent plus the ink that reads on it; one the panel would swallow falls back to ink or white.
export function accentVars(hex, theme) {
  const panel = theme === "light" ? 1 : luminance("#161616");
  let accent = HEX_RE.test(hex || "") ? hex : "#ffffff";
  if (contrast(luminance(accent), panel) < 1.6) accent = theme === "light" ? "#18181b" : "#ffffff";
  const l = luminance(accent);
  return {
    "--gc-accent": accent,
    "--gc-accent-ink": contrast(l, 1) >= contrast(l, luminance("#161616")) ? "#ffffff" : "#161616",
  };
}

// The token scope and the frame the loader's iframe fills.
function Shell({ theme, accent, children }) {
  return (
    <div className="gc-widget gc-widget--framed" data-theme={theme} style={accentVars(accent, theme)}>
      <div className="gc-root">{children}</div>
    </div>
  );
}

// Intercom's space set (spec §9); which of them appear is decided per session.
const TABS = [
  { id: "home", label: "Home", Icon: House },
  { id: "messages", label: "Messages", Icon: MessageCircle },
  { id: "help", label: "Help", Icon: BookOpen },
  { id: "news", label: "News", Icon: Newspaper },
  { id: "tickets", label: "Tickets", Icon: Ticket },
];

// Fewer than two tabs means there is nothing to switch between, so the bar hides.
function TabBar({ tabs, active, unread = 0, onChange }) {
  if (tabs.length < 2) return null;

  return (
    <nav className="gc-tabs" aria-label="Messenger sections">
      {tabs.map(({ id, label, Icon }) => {
        const selected = id === active;
        const badge = id === "messages" && unread > 0;
        return (
          <button
            key={id}
            type="button"
            className="gc-tab"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange({ space: id })}
          >
            <span className="gc-tab__icon">
              <Icon size={19} />
              {badge ? (
                <span className="gc-tab__badge" aria-hidden="true">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </span>
            <span>{label}</span>
            {badge ? <span className="gc-sr">, {unread} unread</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
