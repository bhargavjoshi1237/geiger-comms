"use client";

// Fetch wrapper for the widget public API (spec §4.1, §5). Tokens live in memory only (§4.3).
// The session is refreshed proactively before it expires; a 401 triggers exactly one silent re-boot via onRequestReboot (§4.1).

// Next serves this app under basePath ("/comms" in prod), and fetch() is not basePath-aware.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Refresh this long before expiry, so a slow network or a throttled background timer still lands in time.
const REFRESH_LEAD_MS = 2 * 60 * 1000;
// A failed refresh (network, 5xx, 429) retries on this cadence until the token actually expires.
const REFRESH_RETRY_MS = 15 * 1000;

export class ApiError extends Error {
  constructor(status, code) {
    super(code || "error");
    this.name = "ApiError";
    this.status = status;
    this.code = code || "error";
  }
}

async function readBody(res) {
  try {
    return await res.json();
  } catch {
    return null; // non-JSON error bodies are fine to ignore
  }
}

// POST /session. parentOrigin is the host origin the bridge verified (bridge.verifiedParentOrigin()); the server checks it
// against the app's allowlist. Resolves { sessionToken, realtimeToken, expiresIn, realtimeExpiresIn, contact, visitorId, config }.
export async function bootWidgetSession({ appId, jwt, anonymousId, parentOrigin } = {}) {
  const res = await fetch(`${BASE}/api/widget/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId, jwt: jwt || null, anonymousId, parentOrigin: parentOrigin || null }),
  });
  const body = await readBody(res);
  if (!res.ok) throw new ApiError(res.status, body?.error);
  return body;
}

// Expiry (ms, local clock) from the advertised TTL when present, else from the JWT's own exp claim.
function expiryOf(tokens) {
  const seconds = Number(tokens?.expiresIn);
  if (Number.isFinite(seconds) && seconds > 0) return Date.now() + seconds * 1000;
  try {
    const part = String(tokens?.sessionToken ?? "").split(".")[1];
    const exp = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))).exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

// getTokens() returns the live session ({ sessionToken, expiresIn, … }). The instance adopts the first session token it sees (it may
// be set just after creation) and acts only while that session is still live, so a leftover instance never writes stale tokens back.
export function createWidgetApi({ getTokens, onTokensRefreshed, onRequestReboot, onEvent }) {
  let ownToken = null;
  let expiresAt = null;
  let refreshing = null;
  let timer = null;
  let disposed = false;
  let rebootRequested = false;

  function current() {
    if (disposed) return false;
    const live = getTokens()?.sessionToken ?? null;
    if (!ownToken && live) {
      ownToken = live;
      expiresAt = expiryOf(getTokens());
      schedule();
    }
    return Boolean(ownToken) && live === ownToken;
  }

  function requestReboot() {
    if (rebootRequested || !current()) return;
    rebootRequested = true;
    clearTimeout(timer);
    onRequestReboot?.();
  }

  function schedule(delayMs) {
    clearTimeout(timer);
    if (disposed || !ownToken || !expiresAt) return;
    const delay = delayMs ?? Math.max(0, expiresAt - Date.now() - REFRESH_LEAD_MS);
    timer = setTimeout(() => {
      refresh().catch(() => {});
    }, delay);
  }

  // Outbound widget event hook — fire-and-forget so an analytics blip never blocks the chat.
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
    const body = await readBody(res);
    if (!res.ok) throw new ApiError(res.status, body?.error);
    return body;
  }

  // New tokens from the still-valid session; shared so concurrent callers trigger exactly one refresh.
  // Resolves { sessionToken, realtimeToken, expiresIn, realtimeExpiresIn }; onTokensRefreshed must swap both tokens in.
  function refresh() {
    if (!current()) return Promise.reject(new ApiError(0, "session_replaced"));
    if (!refreshing) {
      refreshing = raw("/session/refresh", { method: "POST" })
        .then((tokens) => {
          if (!current()) throw new ApiError(0, "session_replaced");
          ownToken = tokens.sessionToken;
          expiresAt = expiryOf(tokens);
          onTokensRefreshed?.(tokens);
          schedule();
          return tokens;
        })
        .catch((e) => {
          if (e instanceof ApiError && e.code === "session_replaced") {
            // Nothing to do: a newer session owns the widget now.
          } else if (e instanceof ApiError && e.status === 401) {
            requestReboot();
          } else if (expiresAt && Date.now() < expiresAt) {
            schedule(REFRESH_RETRY_MS);
          } else {
            requestReboot();
          }
          throw e;
        })
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  }

  // A background tab's timer may fire late; check before every call and refresh first when the token is close to expiring.
  async function ensureFresh() {
    if (!current() || !expiresAt) return;
    if (Date.now() >= expiresAt - REFRESH_LEAD_MS / 2) await refresh().catch(() => {});
  }

  async function request(path, options = {}) {
    await ensureFresh();
    try {
      return await raw(path, options);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) requestReboot();
      throw e;
    }
  }

  // The session token is usually stored right after creation; pick it up on the next tick so the refresh timer starts.
  current();
  setTimeout(current, 0);

  const json =(body) => ({ body: JSON.stringify(body), method: "POST" });

  return {
    request,
    refresh,

    // Stops the refresh timer; call when this session is replaced or the widget shuts down.
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },

    conversations() {
      return request("/conversations").then((b) => b.conversations ?? []);
    },

    messages(conversationId, before) {
      const q = before ? `?before=${encodeURIComponent(before)}` : "";
      return request(`/conversations/${encodeURIComponent(conversationId)}/messages${q}`).then((b) => b.messages ?? []);
    },

    // attachments: the objects /upload returned ({ url, name, … }); the server accepts only files this session uploaded.
    sendMessage(conversationId, text, attachments = []) {
      return request(`/conversations/${encodeURIComponent(conversationId)}/messages`, json({ body: text, attachments }));
    },

    createConversation(subject, aboutKind, aboutOrderId, aboutLabel) {
      return request("/conversations", json({ subject, aboutKind, aboutOrderId, aboutLabel })).then((b) => b.conversation);
    },

    markRead(conversationId) {
      return request(`/conversations/${encodeURIComponent(conversationId)}/read`, { method: "POST" });
    },

    rate(conversationId, score, comment) {
      return request(`/conversations/${encodeURIComponent(conversationId)}/rating`, json({ score, comment })).catch(() => null);
    },

    // Resolves { url, name, size, contentType }.
    upload(file) {
      const form = new FormData();
      form.append("file", file);
      return request("/upload", { method: "POST", body: form });
    },

    articles(q = "") {
      return request(`/articles?q=${encodeURIComponent(q)}`).then((b) => b.articles ?? []);
    },

    article(id) {
      return request(`/articles/${encodeURIComponent(id)}`).then((b) => b.article);
    },

    news() {
      return request("/news").then((b) => b.posts ?? []);
    },

    tickets() {
      return request("/tickets").then((b) => b.tickets ?? []);
    },

    // Help-centre search shaped as an answer card; answer.generatedByAi is false — never present it as an AI reply.
    ask(query) {
      emit("ask:submitted", { query });
      return request("/ask", json({ query })).then((b) => b.answer);
    },

    // The customer's email so a teammate can reply by email when the team is offline.
    leaveMessage(email, message) {
      return request("/leads", json({ email, message }));
    },

    quickActions() {
      return request("/quick-actions").then((b) => b.actions ?? []);
    },

    // Identified contacts only; an anonymous visitor always gets [] — hide the picker then.
    recentOrders() {
      return request("/orders").then((b) => b.orders ?? []);
    },

    popularArticles() {
      return request("/articles?popular=1").then((b) => b.articles ?? []);
    },

    trackEvent(name, meta) {
      emit(name, meta);
      return request("/events", json({ name, meta })).catch(() => null); // never breaks chat
    },
  };
}
