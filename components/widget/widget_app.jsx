"use client";

// The iframe app root (spec §9). Owns the handshake → boot → ready lifecycle,
// the in-memory session, spaces routing and the realtime subscription. Tokens
// never leave memory — nothing here is persisted.
//
// Launcher states are echoed up to the host via postMessage so the
// loader's launcher can render pill, badge or close icons.

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
import { ReconnectingBanner, Spinner } from "./widget_primitives";
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

  const tokensRef = useRef(null);
  const bridgeRef = useRef(null);
  const apiRef = useRef(null);
  const queueRef = useRef([]);
  const lastBootRef = useRef(null);
  const unreadRef = useRef(0);
  const rebootsRef = useRef(0);
  const bootRef = useRef(null);

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
    if (phase !== "ready") return;
    const t = setTimeout(() => setProactive(DEMO_PROACTIVE), 8_000);
    return () => clearTimeout(t);
  }, [phase]);

  const openConversationId =
    route.space === "messages" && route.conversationId ? route.conversationId : null;
  useEffect(() => {
    if (phase !== "ready" || !openConversationId || !realtimeToken) return undefined;
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
  }, [phase, openConversationId, realtimeToken]);

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
      onProactive: (msg) => {
        setProactive(msg);
        if (msg?.author) setLastAgent(msg.author);
      },
    }),
    [config, contact, route, navigate, enqueueCommand, reconnecting, refreshSignal, setUnread, postToHost, lastAgent],
  );

  if (phase === "waiting" || phase === "booting") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background text-foreground">
        <Spinner />
        <p className="text-xs text-muted-foreground">
          {phase === "waiting" ? "Starting chat…" : "Signing you in…"}
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex h-dvh items-center justify-center bg-background px-6 text-foreground">
        <p className="text-center text-sm text-muted-foreground">{bootError}</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <ReconnectingBanner visible={reconnecting} />
      <main className="relative min-h-0 flex-1 overflow-y-auto">
        {route.space === "ask" ? (
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

        <ProactivePopup
          message={proactive}
          onDismiss={() => setProactive(null)}
          onReply={(text) => {
            apiRef.current?.trackEvent?.("proactive:replied", { id: proactive?.id, text });
            // Convert a reply into a new conversation prefilled.
            setRoute({ space: "messages", newAbout: "order", newLabel: "An order", draft: text });
            setProactive(null);
          }}
        />
      </main>
      <BottomNav route={route} navigate={navigate} config={config} />
    </div>
  );
}

function BottomNav({ route, navigate, config }) {
  const tabs = useMemo(() => {
    const available = config?.spaces || {};
    const list = [];
    if (available.home) list.push({ id: "home", label: "Home", match: (r) => r.space === "home" });
    if (available.messages)
      list.push({
        id: "messages",
        label: "Messages",
        match: (r) => r.space === "messages",
        matchExact: (r) => r.space === "messages" && r.conversationId,
      });
    if (available.help)
      list.push({
        id: "help",
        label: "Help",
        match: (r) => r.space === "help",
      });
    return list;
  }, [config?.spaces]);

  if (tabs.length < 2) return null;

  return (
    <nav className="grid grid-cols-3 border-t border-border bg-background">
      {tabs.map((t) => {
        const active = t.match(route);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(t.id === "home" ? { space: "home" } : { space: t.id })}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              active ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            <span
              className={`block h-1 w-6 rounded-full ${active ? "bg-foreground" : "bg-transparent"}`}
              aria-hidden="true"
            />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
