"use client";

import { createClient } from "@supabase/supabase-js";

// Realtime delivery (spec §6): one socket, one private Broadcast channel per watched conversation (topic conversation:<id>).
// Envelopes carry no message body — the app re-fetches through the API, so authorisation stays in exactly one place.
// The realtimeToken is pushed in through setToken(), so a refreshed token re-auths live channels without a reconnect.

const TOPIC_PREFIX = "conversation:";
const REJOIN_MAX_MS = 30_000;

// The server envelope is { type: "message.created", conversationId, messageId }; a topic only speaks for its own conversation.
function readEnvelope(payload, conversationId) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.conversationId !== undefined && payload.conversationId !== conversationId) return null;
  const messageId = typeof payload.messageId === "string" && payload.messageId.length <= 128 ? payload.messageId : null;
  return { type: "message.created", conversationId, messageId };
}

// Status reported to onStatus: off (no url/token) | idle (nothing watched) | connecting | live | down.
export function createRealtime({ url, apiKey, onNotify, onStatus }) {
  let token = null;
  let client = null;
  let closed = false;
  let wanted = new Set();
  let lastStatus = null;
  const channels = new Map(); // conversationId → { channel, state, timer, serverClosed }
  const attempts = new Map(); // conversationId → consecutive unexpected closes
  const removing = new Map(); // conversationId → in-flight removal (the library would hand back the leaving channel)

  function aggregate() {
    if (!url || !token) return "off";
    if (!channels.size) return "idle";
    let pending = false;
    for (const entry of channels.values()) {
      if (entry.state === "down") return "down";
      if (entry.state !== "live") pending = true;
    }
    return pending ? "connecting" : "live";
  }

  function report() {
    if (closed) return;
    const status = aggregate();
    if (status === lastStatus) return;
    lastStatus = status;
    onStatus?.(status);
  }

  function ensureClient() {
    if (client || !url || !token) return client;
    // apikey is the public anon key when present (the gateway checks it); the realtime token rides as the access token.
    client = createClient(url, apiKey || token, {
      accessToken: async () => token,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
    return client;
  }

  function leave(conversationId) {
    const entry = channels.get(conversationId);
    if (!entry) return;
    channels.delete(conversationId);
    clearTimeout(entry.timer);
    // A server-closed channel has already detached itself from the client.
    if (!entry.channel || entry.serverClosed || !client) return;
    const removal = Promise.resolve(client.removeChannel(entry.channel))
      .catch(() => {})
      .finally(() => {
        if (removing.get(conversationId) === removal) removing.delete(conversationId);
      });
    removing.set(conversationId, removal);
  }

  // A server-side close (e.g. an expired token) is not retried by the client library, so rejoin with backoff.
  function scheduleRejoin(conversationId, entry) {
    const n = (attempts.get(conversationId) || 0) + 1;
    attempts.set(conversationId, n);
    entry.timer = setTimeout(() => {
      if (closed || channels.get(conversationId) !== entry || !wanted.has(conversationId)) return;
      leave(conversationId);
      join(conversationId);
      report();
    }, Math.min(REJOIN_MAX_MS, 1000 * 2 ** n));
  }

  function join(conversationId) {
    const c = ensureClient();
    if (!c || channels.has(conversationId)) return;
    const entry = { channel: null, state: "joining", timer: null, serverClosed: false };
    channels.set(conversationId, entry);
    const pending = removing.get(conversationId);
    if (pending) {
      pending.then(() => {
        if (!closed && channels.get(conversationId) === entry) open(conversationId, entry, c);
      });
      return;
    }
    open(conversationId, entry, c);
  }

  function open(conversationId, entry, c) {
    entry.channel = c
      .channel(`${TOPIC_PREFIX}${conversationId}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "message.created" }, (frame) => {
        if (closed) return;
        const envelope = readEnvelope(frame?.payload, conversationId);
        if (envelope) onNotify?.(envelope);
      })
      .subscribe((status) => {
        if (closed || channels.get(conversationId) !== entry) return;
        if (status === "SUBSCRIBED") {
          entry.state = "live";
          attempts.delete(conversationId);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          entry.state = "down"; // the library rejoins these itself
        } else if (status === "CLOSED") {
          entry.state = "down";
          entry.serverClosed = true;
          scheduleRejoin(conversationId, entry);
        }
        report();
      });
  }

  function sync() {
    for (const id of [...channels.keys()]) if (!wanted.has(id)) leave(id);
    if (ensureClient()) for (const id of wanted) join(id);
    report();
  }

  return {
    // The full set of conversation ids to listen on; channels are diffed, not rebuilt.
    watch(ids) {
      if (closed) return;
      wanted = new Set((ids || []).filter((id) => typeof id === "string" && id));
      sync();
    },

    // A fresh realtime token re-auths every joined channel in place and is used for any later join.
    setToken(next) {
      if (closed) return;
      const value = typeof next === "string" && next ? next : null;
      if (value === token) return;
      token = value;
      if (!token) {
        for (const id of [...channels.keys()]) leave(id);
        report();
        return;
      }
      if (client) Promise.resolve(client.realtime.setAuth(token)).catch(() => {});
      sync();
    },

    close() {
      for (const id of [...channels.keys()]) leave(id);
      closed = true;
      try {
        Promise.resolve(client?.removeAllChannels()).catch(() => {});
        client?.realtime.disconnect();
      } catch {
        // Socket may already be gone during teardown.
      }
      client = null;
    },
  };
}
