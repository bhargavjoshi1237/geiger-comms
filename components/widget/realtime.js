"use client";

import { createClient } from "@supabase/supabase-js";

// Realtime delivery (spec §6): a private Broadcast channel scoped to one
// conversation. The envelope carries no message body — on receipt the widget
// re-fetches through the API, so authorisation stays in exactly one place.
// The realtimeToken (signed with the Supabase project's secret, claims in
// token) is what Realtime's RLS checks against.

// Two distinct callbacks on purpose: a socket status change and an actual new
// message are different facts, and conflating them makes the unread badge
// inflate every time the connection is re-established.
export function subscribeToConversation({ url, realtimeToken, conversationId, onMessage, onStatus }) {
  if (!url || !realtimeToken || !conversationId) return () => {};

  const client = createClient(url, realtimeToken, {
    realtime: { params: { eventsPerSecond: 5 } },
    accessToken: async () => realtimeToken,
    auth: { persistSession: false },
  });

  const channel = client
    .channel(`conversation:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
    .on("broadcast", { event: "message.created" }, (frame) => {
      // Envelope carries no body — just enough to attribute the reply. The
      // widget re-fetches the message through the API so authorisation stays
      // in exactly one place.
      const p = (frame && frame.payload) || {};
      onMessage?.({
        author: p.author || p.authorName || null,
        direction: p.direction === "out" ? "out" : "in",
      });
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus?.({ offline: true });
      if (status === "SUBSCRIBED") onStatus?.({ online: true });
    });

  return () => {
    try {
      channel.unsubscribe();
      // Detach so the short-lived client does not hold the socket open.
      client.removeAllChannels();
    } catch {
      // Socket may already be gone during teardown.
    }
  };
}
