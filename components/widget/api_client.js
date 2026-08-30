"use client";

// Authenticated fetch wrapper for the widget public API (spec §5). The session
// token lives in memory only (spec §4.3) — nothing durable is persisted
// anywhere. On a 401 the token pair is refreshed once and the call retried; a
// second failure hands control back to the app for one silent re-boot.

// Next serves this app under basePath ("/comms" in prod), but fetch() is not
// basePath-aware — a bare "/api/..." would miss the prefix and 404.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export class ApiError extends Error {
  constructor(status, code) {
    super(code || "error");
    this.name = "ApiError";
    this.status = status;
    this.code = code || "error";
  }
}

export function createWidgetApi({ getTokens, onTokensRefreshed, onRequestReboot, onEvent }) {
  let refreshing = null;

  // Outbound widget event hook — fire-and-forget so an analytics blip never
  // blocks the chat. Every analytics event flows through trackEvent() so the
  // host page can build its own pipeline if it wants richer tracking.
  function emit(name, meta) {
    try {
      onEvent?.({ name, meta });
    } catch {
      /* listener is allowed to throw */
    }
  }

  async function raw(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    const token = getTokens()?.sessionToken;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE}/api/widget${path}`, { ...options, headers });
    let body = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON error bodies are fine to ignore
    }
    if (!res.ok) throw new ApiError(res.status, body?.error);
    return body;
  }

  // New tokens from a still-valid session (spec §4.1); shared so concurrent
  // 401s trigger exactly one refresh call.
  function refresh() {
    if (!refreshing) {
      refreshing = raw("/session/refresh", { method: "POST" })
        .then((tokens) => {
          onTokensRefreshed?.(tokens);
          return tokens;
        })
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  }

  async function request(path, options = {}) {
    try {
      return await raw(path, options);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      try {
        await refresh();
      } catch {
        // Refresh failed too — the session is gone for good.
        onRequestReboot?.();
        throw e;
      }
      return raw(path, options);
    }
  }

  const json = (body) => ({ body: JSON.stringify(body), method: "POST" });

  return {
    request,

    conversations() {
      return request("/conversations").then((b) => b.conversations ?? []);
    },

    messages(conversationId, before) {
      const q = before ? `?before=${encodeURIComponent(before)}` : "";
      return request(`/conversations/${conversationId}/messages${q}`).then((b) => b.messages ?? []);
    },

    sendMessage(conversationId, text, attachments = []) {
      return request(`/conversations/${conversationId}/messages`, json({ body: text, attachments }));
    },

    createConversation(subject, aboutKind, aboutOrderId, aboutLabel) {
      return request("/conversations", json({ subject, aboutKind, aboutOrderId, aboutLabel })).then((b) => b.conversation);
    },

    markRead(conversationId) {
      return request(`/conversations/${conversationId}/read`, { method: "POST" });
    },

    rate(conversationId, score, comment) {
      return request(`/conversations/${conversationId}/rating`, json({ score, comment })).catch(() => null);
    },

    upload(file) {
      const form = new FormData();
      form.append("file", file);
      return request("/upload", { method: "POST", body: form });
    },

    articles(q = "") {
      return request(`/articles?q=${encodeURIComponent(q)}`).then((b) => b.articles ?? []);
    },

    article(id) {
      return request(`/articles/${id}`).then((b) => b.article);
    },

    news() {
      return request("/news").then((b) => b.posts ?? []);
    },

    tickets() {
      return request("/tickets").then((b) => b.tickets ?? []);
    },

    /* ------------------------------------------------------------- *
     *  Ask / answer-card surfaces (AI help)                         *
     * ------------------------------------------------------------- */

    /**
     * Submit an AI question. Returns an AnswerCard-shaped payload:
     * { query, summary, steps, sources, followUps, hero, topArticles }.
     */
    ask(query) {
      emit("ask:submitted", { query });
      return request("/ask", json({ query })).then((b) => b.answer);
    },

    /**
     * Submit the customer's email so a teammate can reply by email when
     * the team is offline.
     */
    leaveMessage(email, message) {
      return request("/leads", json({ email, message }));
    },

    /**
     * Quick actions (Track an order, Start a return, Billing, Account).
     * Surfaces a category + recent orders so the new-conversation screen
     * can preselect context.
     */
    quickActions() {
      return request("/quick-actions").then((b) => b.actions ?? []);
    },

    /** Recent orders surfaced under the Hub "your orders" rail. */
    recentOrders() {
      return request("/orders").then((b) => b.orders ?? []);
    },

    /** Popular articles shown under the Hub footer. */
    popularArticles() {
      return request("/articles?popular=1").then((b) => b.articles ?? []);
    },

    trackEvent(name, meta) {
      emit(name, meta);
      return request("/events", json({ name, meta })).catch(() => null); // never breaks chat
    },
  };
}
