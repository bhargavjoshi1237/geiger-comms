"use client";

// The iframe app root (spec §9). Owns the handshake → boot → ready lifecycle,
// the in-memory session, spaces routing and the realtime subscription. Tokens
// never leave memory — nothing here is persisted.
//
// Visually it is the design's panel: `.gc-widget` holds the tokens, `.gc-panel`
// is the card, and every space renders header → body → footer inside it. The
// three-tab bar belongs to the panel, so a sub-screen (a thread, an article,
// the composer) hides it and the panel reads as one task.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBridge } from "./bridge";
import { createWidgetApi } from "./api_client";
import { subscribeToConversation } from "./realtime";
import { HomeSpace } from "./home_space";
import { AskSpace } from "./ask_space";
import { MessagesSpace } from "./messages_space";
import { HelpSpace } from "./help_space";
import { NewsSpace } from "./news_space";
import { TicketsSpace } from "./tickets_space";
import { OfflineMessageView } from "./offline_message";
import {
  BookHeart,
  BrandBubble,
  Mail,
  MessageCircle,
  ReconnectingBanner,
  Spinner,
} from "./widget_primitives";
import { ProactivePopup } from "./proactive";

// Next serves this app under basePath ("/comms" in prod), but fetch() is not
// basePath-aware — a bare "/api/..." would miss the prefix and 404.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
// A failed refresh re-boots; cap it so an unrecoverable session can't spin.
const MAX_REBOOTS = 3;

const HOME_ROUTE = { space: "home" };
const DEFAULT_CONFIG = {
  name: "Northwind Help",
  greeting: "Hi there. How can we help?",
  officeHoursNote: "",
  assistantName: "Aria",
  assistantTagline: "Answers about your order, return or account in seconds.",
  team: [],
  teamOnline: true,
  showAvatars: true,
  spaces: { home: true, messages: true, help: true, news: true, tickets: true, ask: true },
};
const DEMO_PROACTIVE = {
  id: "p1",
  author: "Maya from Northwind",
  subtitle: "Just now",
  body: "Saw you looking at the returns policy. Want me to check whether your order is still inside the window?",
  actions: [
    { label: "Yes, check it", primary: true },
    { label: "No thanks" },
  ],
};

// Which tab root the current route belongs to. Sub-screens return null so the
// nav hides; news and tickets keep the bar but light nothing up.
function tabForRoute(route) {
  if (route.space === "home") return "home";
  if (route.space === "messages" && !route.conversationId && !route.newAbout && !route.newLabel) {
    return "messages";
  }
  if (route.space === "help" && !route.articleId) return "help";
  if (route.space === "news" && !route.postId) return "";
  if (route.space === "tickets" && !route.ticketId) return "";
  return null;
}

export function WidgetApp() {
  const searchParams = useSearchParams();
  const expectedParentOrigin = searchParams.get("parentOrigin") || "";

  const [phase, setPhase] = useState("waiting"); // waiting | booting | ready | error
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [contact, setContact] = useState(null);
  const [route, setRoute] = useState(HOME_ROUTE);
  const [reconnecting, setReconnecting] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [bootError, setBootError] = useState("");
  const [realtimeToken, setRealtimeToken] = useState(null);
  const [proactive, setProactive] = useState(null);
  const [lastAgent, setLastAgent] = useState(null);
  const [unread, setUnreadCount] = useState(0);
  const [theme, setTheme] = useState("dark");
  // The host can hide the iframe without tearing it down; while hidden we stop
  // the realtime subscription and any polling so a closed widget costs nothing.
  const [visible, setVisible] = useState(true);
  const [launcherState, setLauncherState] = useState(null);

  const tokensRef = useRef(null);
  const bridgeRef = useRef(null);
  const apiRef = useRef(null);
  const queueRef = useRef([]);
  const lastBootRef = useRef(null);
  const unreadRef = useRef(0);
  const rebootsRef = useRef(0);
  const bootRef = useRef(null);

  // The panel carries its own token set; follow the document's theme so the
  // messenger doesn't sit dark inside a light page (or the reverse).
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const postToHost = useCallback(
    (type, payload) => bridgeRef.current?.send(type, payload),
    [],
  );

  const setUnread = useCallback(
    (count, author = null) => {
      let next;
      if (typeof count === "function") {
        next = Math.max(0, count(unreadRef.current) | 0);
      } else {
        next = Math.max(0, count | 0);
      }
      const changed = unreadRef.current !== next;
      unreadRef.current = next;
      setUnreadCount(next);
      if (changed) postToHost("unreadCount", { count: next });
      if (next > 0 && author) {
        setLastAgent(author);
        postToHost("launcher", { unreadReply: true, author });
      }
    },
    [postToHost],
  );

  function emitEvent(name, meta) {
    postToHost("event", { name, meta });
  }

  const boot = useCallback(async (payload) => {
    if (!payload?.appId || !payload?.anonymousId) return;
    if (!bridgeRef.current?.confirmParent(payload.parentOrigin)) {
      setBootError("We couldn't verify the page hosting this chat.");
      setPhase("error");
      return;
    }
    lastBootRef.current = payload;
    setPhase("booting");
    try {
      const res = await fetch(`${BASE}/api/widget/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId: payload.appId,
          jwt: payload.jwt || "",
          anonymousId: payload.anonymousId,
        }),
      });
      if (!res.ok) throw new Error(`session_${res.status}`);
      const session = await res.json();
      tokensRef.current = session;
      setRealtimeToken(session.realtimeToken ?? null);
      apiRef.current = createWidgetApi({
        getTokens: () => tokensRef.current || {},
        onTokensRefreshed: (tokens) => {
          tokensRef.current = { ...tokensRef.current, ...tokens };
          setRealtimeToken(tokens?.realtimeToken ?? null);
        },
        onEvent: (event) => {
          emitEvent(event.name, event.meta);
        },
        onRequestReboot: () => {
          tokensRef.current = null;
          setRealtimeToken(null);
          if (!lastBootRef.current || rebootsRef.current >= MAX_REBOOTS) {
            setBootError("We couldn't reach chat right now. Please try again shortly.");
            setPhase("error");
            return;
          }
          rebootsRef.current += 1;
          setReconnecting(true);
          void bootRef.current?.(lastBootRef.current);
        },
      });
      setConfig({ ...DEFAULT_CONFIG, ...session.config });
      setContact(session.contact);
      postToHost("visitor", { visitorId: session.visitorId ?? null });
      setReconnecting(false);
      setPhase("ready");
    } catch {
      setBootError("We couldn't reach chat right now. Please try again shortly.");
      setPhase("error");
    }
  }, [postToHost]);

  useEffect(() => {
    bootRef.current = boot;
  }, [boot]);

  // Handshake: announce readiness; every inbound envelope is origin-checked.
  useEffect(() => {
    const bridge = createBridge({
      expectedParentOrigin,
      onMessage: (type, payload) => {
        switch (type) {
          case "boot":
            void boot(payload);
            break;
          case "show":
            setVisible(true);
            break;
          case "hide":
            setVisible(false);
            break;
          // Echo of the host's setLauncherState(); keeps the messenger's idea of
          // the launcher (label, badge, who replied) in sync with the host page.
          case "launcher": {
            const p = payload && typeof payload === "object" ? payload : {};
            setLauncherState((prev) => ({ ...(prev || {}), ...p }));
            if (typeof p.author === "string" && p.author) setLastAgent(p.author);
            break;
          }
          case "update":
            if (payload && typeof payload === "object" && typeof payload.jwt === "string") {
              tokensRef.current = null;
              setPhase("waiting");
              void boot({ ...(lastBootRef.current || payload), jwt: payload.jwt });
            }
            break;
          case "showSpace":
            setRoute({ space: String(payload?.name || payload || "home") });
            break;
          case "showAsk":
            setRoute({ space: "ask", query: String(payload?.text || payload || "") });
            break;
          case "showArticle":
            setRoute({ space: "help", articleId: String(payload?.id || payload || "") });
            break;
          case "showNews": {
            const newsId = payload?.id ?? (typeof payload === "string" ? payload : "");
            setRoute({ space: "news", postId: newsId ? String(newsId) : undefined });
            break;
          }
          case "showConversation":
            setRoute({ space: "messages", conversationId: String(payload?.id || payload || "") });
            break;
          case "showNewMessage": {
            const text = typeof payload === "string" ? payload : String(payload?.text || "");
            setRoute({ space: "messages", draft: text });
            break;
          }
          case "showTicket":
            setRoute({ space: "tickets", ticketId: String(payload?.id || payload || "") });
            break;
          case "trackEvent":
            if (payload?.name) apiRef.current?.trackEvent(String(payload.name), payload.meta);
            break;
          case "shutdown":
            tokensRef.current = null;
            apiRef.current = null;
            setContact(null);
            setRoute(HOME_ROUTE);
            setProactive(null);
            setPhase("waiting");
            break;
          default:
            break;
        }
      },
    });
    bridgeRef.current = bridge;
    bridge.send("ready");
    return () => bridge.close();
  }, [expectedParentOrigin, boot]);

  const navigate = useCallback((nextRoute) => setRoute(nextRoute), []);

  // Commands that arrive before the session exists wait in a queue.
  const enqueueCommand = useCallback(
    (fn) => {
      if (phase === "ready") fn();
      else queueRef.current.push(fn);
    },
    [phase],
  );

  useEffect(() => {
    if (phase !== "ready") return;
    const queued = queueRef.current;
    queueRef.current = [];
    queued.forEach((fn) => fn());
  }, [phase]);

  // Surface a proactive popup on first ready (demo mode).
  useEffect(() => {
    if (phase !== "ready" || !visible) return;
    const t = setTimeout(() => setProactive(DEMO_PROACTIVE), 8_000);
    return () => clearTimeout(t);
  }, [phase, visible]);

  const openConversationId =
    route.space === "messages" && route.conversationId ? route.conversationId : null;
  useEffect(() => {
    if (phase !== "ready" || !visible || !openConversationId || !realtimeToken) return undefined;
    return subscribeToConversation({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      realtimeToken,
      conversationId: openConversationId,
      onNotify: (status) => {
        if (status?.online) setReconnecting(false);
        else if (status?.offline) setReconnecting(true);
        setRefreshSignal((n) => n + 1);
        // While a conversation is open the thread is read; otherwise count.
        setUnread((u) => u + 1, lastAgent);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, visible, openConversationId, realtimeToken]);

  const spaceProps = useMemo(
    () => ({
      getApi: () => apiRef.current,
      config,
      contact,
      route,
      navigate,
      enqueueCommand,
      reconnecting,
      refreshSignal,
      onUnread: setUnread,
      postToHost,
      lastAgent,
      visible,
      launcherState,
      onProactive: (msg) => {
        setProactive(msg);
        if (msg?.author) setLastAgent(msg.author);
      },
    }),
    [
      config,
      contact,
      route,
      navigate,
      enqueueCommand,
      reconnecting,
      refreshSignal,
      setUnread,
      postToHost,
      lastAgent,
      visible,
      launcherState,
    ],
  );

  if (phase === "waiting" || phase === "booting") {
    return (
      <Shell theme={theme}>
        <div className="gc-boot">
          <span className="gc-boot__mark" aria-hidden="true">
            <BrandBubble size={26} />
          </span>
          <Spinner />
          <p>{phase === "waiting" ? "Starting chat…" : "Signing you in…"}</p>
        </div>
      </Shell>
    );
  }

  if (phase === "error") {
    return (
      <Shell theme={theme}>
        <div className="gc-boot">
          <span className="gc-boot__mark" aria-hidden="true">
            <BrandBubble size={26} />
          </span>
          <p>{bootError}</p>
        </div>
      </Shell>
    );
  }

  // Team away: the panel opens on the "leave a message" screen instead of home.
  const away = config?.teamOnline === false && route.space === "home";
  const activeTab = away ? null : tabForRoute(route);

  return (
    <Shell theme={theme}>
      <div className="gc-panel" role="dialog" aria-label="Messenger">
        <ReconnectingBanner visible={reconnecting} />

        {away ? (
          <OfflineMessageView
            config={config}
            contact={contact}
            onAsk={() => navigate({ space: "ask" })}
            onClose={() => postToHost("close")}
          />
        ) : route.space === "ask" ? (
          <AskSpace {...spaceProps} />
        ) : route.space === "messages" ? (
          <MessagesSpace {...spaceProps} />
        ) : route.space === "help" ? (
          <HelpSpace {...spaceProps} />
        ) : route.space === "news" ? (
          <NewsSpace {...spaceProps} />
        ) : route.space === "tickets" ? (
          <TicketsSpace {...spaceProps} />
        ) : (
          <HomeSpace {...spaceProps} />
        )}

        {activeTab === null ? null : (
          <TabBar active={activeTab} unread={unread} config={config} onChange={navigate} />
        )}
      </div>

      <ProactivePopup
        message={proactive}
        onDismiss={() => setProactive(null)}
        onReply={(text) => {
          apiRef.current?.trackEvent?.("proactive:replied", { id: proactive?.id, text });
          setRoute({ space: "messages", newAbout: "order", newLabel: "An order", draft: text });
          setProactive(null);
        }}
      />
    </Shell>
  );
}

// The token scope and the frame the loader's iframe fills.
function Shell({ theme, children }) {
  return (
    <div className="gc-widget gc-widget--framed" data-theme={theme}>
      <div className="gc-root">{children}</div>
    </div>
  );
}

const TABS = [
  { id: "home", label: "Home", Icon: MessageCircle },
  { id: "messages", label: "Messages", Icon: Mail },
  { id: "help", label: "Help", Icon: BookHeart },
];

// Home · Messages · Help. A space the config has disabled drops out; fewer than
// two tabs means there is nothing to switch between, so the bar hides.
function TabBar({ active, unread = 0, config, onChange }) {
  const tabs = TABS.filter((t) => config?.spaces?.[t.id] !== false);
  if (tabs.length < 2) return null;

  return (
    <nav
      className="gc-tabs"
      aria-label="Messenger sections"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
    >
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
            <Icon />
            <span>{label}</span>
            {badge ? (
              <span className="gc-tab__badge" aria-hidden="true">
                {unread}
              </span>
            ) : null}
            {badge ? <span className="gc-sr">, {unread} unread</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
