"use client";

import { createClient } from "@supabase/supabase-js";

// Realtime delivery (spec §6): a private Broadcast channel scoped to one
// conversation. The envelope carries no message body — on receipt the widget
// re-fetches through the API, so authorisation stays in exactly one place.
// The realtimeToken (signed with the Supabase project's secret, claims in
// token) is what Realtime's RLS checks against.

export function subscribeToConversation({ url, realtimeToken, conversationId, onNotify }) {
  if (!url || !realtimeToken || !conversationId) return () => {};

  const client = createClient(url, realtimeToken, {
    realtime: { params: { eventsPerSecond: 5 } },
    accessToken: async () => realtimeToken,
    auth: { persistSession: false },
  });

  const channel = client
    .channel(`conversation:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
    .on("broadcast", { event: "message.created" }, () => onNotify())
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onNotify({ offline: true });
      if (status === "SUBSCRIBED") onNotify({ online: true });
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
