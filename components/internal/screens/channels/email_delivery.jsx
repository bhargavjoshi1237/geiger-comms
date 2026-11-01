"use client";

// Email channel Delivery section + overview badge: real sending status (/api/email/status), the send switch, a test send, and no receiving yet.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Inbox, Loader2, Radio, Send } from "lucide-react";
import { Badge, Button, LogoLoading, Switch } from "@geiger/ui";
import { SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { Notice } from "@/components/internal/shared/notice";
import { apiPath } from "@/lib/widget/embed";

const OUTLINE_ACTION =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const TEST_ERRORS = {
  email_not_configured: "Email isn't set up on this deployment, so nothing can be sent.",
  from_address_required: "Add a valid from address first.",
  no_recipient: "Your account has no email address to send the test to.",
  rate_limited: "Too many test emails — try again in a few minutes.",
};

// { configured, outboxReady, stalled } or null when the check itself failed.
export function useEmailStatus(projectId) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(Boolean(projectId));

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    fetch(apiPath(`/api/email/status?projectId=${encodeURIComponent(projectId)}`))
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        if (!alive) return;
        setStatus(data);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  return { status, loading };
}

const isReady = (status) => Boolean(status?.configured && status?.outboxReady);
const isSending = (channel, status) =>
  isReady(status) && channel.status === "connected" && channel.sendReplies === true;

export function EmailDeliveryBadge({ channel, status }) {
  if (!isReady(status)) {
    return (
      <Badge variant="warning">
        <AlertTriangle aria-hidden="true" />
        Not set up
      </Badge>
    );
  }
  if (isSending(channel, status)) {
    return (
      <Badge variant="success">
        <Radio aria-hidden="true" />
        Sending
      </Badge>
    );
  }
  return <Badge variant="outline">Not sending</Badge>;
}

// One line on what happens to a reply right now; the overview and the Delivery section both show it.
export function deliverySummary(channel, status) {
  if (!status) return "Couldn't check email delivery. Reload to try again.";
  if (!status.configured) return "Email isn't set up on this deployment, so replies are not emailed.";
  if (!status.outboxReady) return "Email delivery isn't installed on this workspace's database yet, so replies are not emailed.";
  if (channel.status !== "connected") return "This channel is disconnected, so replies are not emailed.";
  if (channel.sendReplies !== true) return "Sending is off, so replies stay in Comms and are not emailed.";
  return `Teammate and workflow replies are emailed to the customer from ${channel.address}.`;
}

function TestEmailButton({ channel }) {
  const [sending, setSending] = useState(false);

  async function sendTest() {
    setSending(true);
    try {
      const res = await fetch(apiPath("/api/email/test"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channelId: channel.id }),
      });
      const payload = await res.json().catch(() => null);
      if (res.ok && payload?.to) {
        toast.success(`Test email sent to ${payload.to}`, { description: `From ${payload.from}` });
        return;
      }
      toast.error(
        payload?.error === "send_unconfirmed" ? "The email service didn't confirm the send" : "Test email not sent",
        { description: TEST_ERRORS[payload?.error] || payload?.message || "Try again in a moment." },
      );
    } catch {
      toast.error("Test email not sent", { description: "Check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={OUTLINE_ACTION}
      onClick={sendTest}
      disabled={sending || !channel.address}
    >
      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      {sending ? "Sending…" : "Send test email"}
    </Button>
  );
}

export function EmailDeliverySection({ channel, config, onConfig }) {
  const { status, loading } = useEmailStatus(channel.projectId);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
        <LogoLoading size={40} aria-label="Checking email delivery" />
      </div>
    );
  }

  const ready = isReady(status);
  const on = channel.sendReplies === true;

  return (
    <div className="space-y-6">
      <SectionCard title="Sending" description={deliverySummary(channel, status)}>
        <SettingsList>
          <SettingRow
            title="Send replies by email"
            description="Teammate and workflow replies (never internal notes) on this channel's conversations go to the customer's email address."
            control={
              <Switch
                checked={on}
                // Turning sending off always works; turning it on waits until email can really go out.
                disabled={!on && !ready}
                onCheckedChange={(next) => onConfig({ ...config, sendReplies: next })}
                aria-label="Send replies by email"
              />
            }
          />
          <SettingRow
            title="Delivery status"
            description="Each emailed reply records sent, failed (with the reason) or unconfirmed on the message."
            control={<EmailDeliveryBadge channel={channel} status={status} />}
          />
        </SettingsList>
        {status?.stalled ? (
          <div className="mt-4">
            <Notice icon={AlertTriangle}>
              {status.stalled === 1 ? "1 reply has" : `${status.stalled} replies have`} waited more than five minutes.
              Nothing is draining the email outbox — ask whoever runs this deployment to schedule it.
            </Notice>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Test email"
        description={`Sends a real email from ${channel.address || "this channel's address"} to you. Comms can't read the domain's DNS status, so this is the check: an unverified domain fails here with the reason.`}
        action={status?.configured ? <TestEmailButton channel={channel} /> : null}
      >
        <p className="text-sm text-text-secondary">
          {status?.configured
            ? "The from address's domain must be verified in the Geiger suite's email service, which sends for every suite app."
            : TEST_ERRORS.email_not_configured}
        </p>
      </SectionCard>

      <SectionCard title="Receiving email" action={<Badge variant="outline">Not available</Badge>}>
        <SettingsList>
          <SettingRow
            icon={Inbox}
            title="Customer emails don't arrive in Comms yet"
            description={`The suite's email service only sends. Customers' replies go to ${channel.address || "the from address"}'s own mailbox, not into a conversation. Sent replies use a "Re:" subject but carry no threading headers.`}
            control={null}
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}
