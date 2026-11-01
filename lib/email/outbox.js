import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/server/admin";
import { isUuid } from "@/lib/widget/apps";
import { isEmailConfigured, sendSuiteEmail } from "./client";
import { channelSender } from "./channel";
import { replyEmail, replySubject } from "./templates";

// Drains comms.email_outbox (rows the messages_email_outbox trigger queues for customer-facing replies) through the suite email API.
// Same contract as geiger-events' notice worker: claim one row right before sending it, record the outcome, never resend an unknown one.

async function loadReply(db, row) {
  const [message, conversation, channel] = await Promise.all([
    db.from("messages").select("id, body, attachments, deleted_at").eq("id", row.message_id).maybeSingle(),
    db.from("conversations").select("id, subject, deleted_at").eq("id", row.conversation_id).maybeSingle(),
    row.channel_id
      ? db.from("channels").select("id, kind, status, config, deleted_at").eq("id", row.channel_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const failed = [message, conversation, channel].find((r) => r.error);
  if (failed) throw new Error(failed.error.message);
  return { message: message.data, conversation: conversation.data, channel: channel.data };
}

// Why a claimed reply can't go out any more, or null when it can.
function blocker({ message, conversation, channel }) {
  if (!message || message.deleted_at) return "The reply was deleted before it was sent.";
  if (!conversation || conversation.deleted_at) return "The conversation was deleted before the reply was sent.";
  if (!channel || channel.deleted_at || channel.kind !== "email") return "The conversation's email channel no longer exists.";
  if (channel.status !== "connected" || channel.config?.sendReplies !== true) {
    return "Email replies were turned off for this channel before it was sent.";
  }
  if (!channelSender(channel)) return "The email channel has no valid from address.";
  return null;
}

async function deliver(db, row) {
  let reply;
  try {
    reply = await loadReply(db, row);
  } catch (e) {
    console.error("[email.outbox.load]", e);
    return { status: "failed", error: "The reply couldn't be read, so it was not sent." };
  }
  const reason = blocker(reply);
  if (reason) return { status: "failed", error: reason };

  const sender = channelSender(reply.channel);
  const response = await sendSuiteEmail({
    to: row.to_address,
    from: sender.from,
    subject: replySubject(reply.conversation.subject),
    html: replyEmail({
      body: reply.message.body,
      signature: reply.channel.config?.signature,
      attachments: Array.isArray(reply.message.attachments) ? reply.message.attachments : [],
    }),
    template: "comms.conversation_reply",
    signal: AbortSignal.timeout(15_000),
  });
  if (response?.ok) return { status: "sent", logId: response.id, providerId: response.providerId };
  if (response?.uncertain) {
    return { status: "uncertain", error: "The email service didn't confirm delivery, so it was not retried." };
  }
  return { status: "failed", error: String(response?.error ?? "The email service rejected the reply.") };
}

// -> { processed, sent, failed, uncertain } or { error } when the outbox can't be read at all.
export async function drainEmailOutbox({ limit = 3 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new RangeError("limit must be 1-50");
  // Unconfigured email leaves rows queued, so they go out once the key is set rather than all failing now.
  if (!isEmailConfigured()) return { error: "email_not_configured" };
  const db = adminClient();
  if (!db) return { error: "not_configured" };

  const result = { processed: 0, sent: 0, failed: 0, uncertain: 0 };
  while (result.processed < limit) {
    // One row per lease, so a slow batch never outlives the five-minute lease of a later row.
    const lease = randomUUID();
    const { data, error } = await db.rpc("email_outbox_claim", { p_limit: 1, p_lease: lease });
    if (error) {
      console.error("[email.outbox.claim]", error.message);
      return result.processed ? result : { error: "claim_failed" };
    }
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) break;

    const outcome = await deliver(db, row);
    // If recording fails the lease lapses, and the next claim parks the row as 'uncertain'; it is never resent here.
    const { error: finishError } = await db.rpc("email_outbox_finish", {
      p_id: row.id,
      p_lease: lease,
      p_status: outcome.status,
      p_log_id: isUuid(outcome.logId) ? outcome.logId : null,
      p_provider_id: outcome.providerId ?? null,
      p_error: outcome.error ?? null,
    });
    if (finishError) console.error("[email.outbox.finish]", finishError.message);

    result.processed += 1;
    result[outcome.status] += 1;
  }
  return result;
}
