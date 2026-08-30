// ===========================================================================
// Geiger Comms — realtime helper (owns the single subscription seam, inbox
// spec §3.2). One channel per subscription; the caller owns the lifecycle and
// must run the returned unsubscribe in its effect cleanup — a leaked channel
// per selection change will exhaust the connection.
//
// Never throws. No-ops (returns a no-op unsubscribe) when Supabase is
// unconfigured or on any setup failure.
// ===========================================================================

import { createClient } from "./client";
import { isSupabaseConfigured } from "./comms";

const noop = () => {};

export function subscribeTable(
  table,
  { filter, onInsert, onUpdate, onDelete } = {},
) {
  if (!table || !isSupabaseConfigured()) return noop;
  try {
    const sb = createClient();
    const channel = sb.channel(`comms-${table}-${crypto.randomUUID()}`);

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "comms", table, filter },
      (payload) => onInsert?.(payload.new),
    );
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "comms", table, filter },
      (payload) => onUpdate?.(payload.new),
    );
    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "comms", table, filter },
      (payload) => onDelete?.(payload.old),
    );

    // subscribe() reports status asynchronously; a failed status just leaves
    // the caller with live-data silence — never an exception.
    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[realtime.subscribe] ${table}: ${status}`);
      }
    });

    return () => {
      try {
        sb.removeChannel(channel);
      } catch (e) {
        console.error("[realtime.unsubscribe]", e);
      }
    };
  } catch (e) {
    console.error("[realtime.subscribe]", e);
    return noop;
  }
}
