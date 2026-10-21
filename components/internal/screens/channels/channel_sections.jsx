"use client";

// Channel editor nav + section bodies (spec §5.1); Messenger- and Email-only sections hide through showIf.

import {
  Code,
  Eye,
  LayoutDashboard,
  Radio,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Badge, Button, Input } from "@geiger/ui";
import {
  Field,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import {
  CHANNEL_STATUS_MAP,
  CONNECT_DISCLOSURE,
  formatDate,
  isSimulated,
} from "./constants";
import { ChannelConfigForm } from "./channel_config_form";
import {
  EmailDeliveryBadge,
  EmailDeliverySection,
  deliverySummary,
  useEmailStatus,
} from "./email_delivery";
import { InstallSection } from "./install_section";
import { MessengerPreview } from "./messenger_preview";
import { SimulatedBadge } from "./simulated_badge";

const isMessenger = (channel) => channel?.kind === "messenger";
const isEmail = (channel) => channel?.kind === "email";

export const NAV_GROUPS = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        desc: "A snapshot of this channel — connection state, volume, and what it's set to.",
      },
    ],
  },
  {
    group: "Setup",
    items: [
      {
        key: "configuration",
        label: "Configuration",
        icon: SlidersHorizontal,
        desc: "The name and provider settings for this channel. Changes save automatically.",
      },
      {
        key: "install",
        label: "Install",
        icon: Code,
        desc: "Embed the Messenger on your site.",
        showIf: isMessenger,
        ownHeader: true,
      },
      {
        key: "delivery",
        label: "Delivery",
        icon: Send,
        desc: "Whether replies are emailed, a real test send, and what Comms can't do with email yet.",
        showIf: isEmail,
      },
    ],
  },
  {
    group: "Appearance",
    items: [
      {
        key: "preview",
        label: "Preview",
        icon: Eye,
        desc: "How the launcher and greeting look to a visitor. A mock, not a live embed.",
        showIf: isMessenger,
      },
    ],
  },
  {
    group: "Advanced",
    items: [
      {
        key: "advanced",
        label: "Advanced",
        icon: ShieldAlert,
        desc: "Connection state and destructive actions for this channel.",
      },
    ],
  },
];

// The connection row: simulated kinds say so, Email reports what delivery can do right now, Messenger is simply live.
function ConnectionRow({ channel, meta }) {
  const email = useEmailStatus(isEmail(channel) ? channel.projectId : null);
  if (isSimulated(channel)) {
    return (
      <SettingRow
        title="Simulated connection"
        description={CONNECT_DISCLOSURE}
        control={<SimulatedBadge channel={channel} />}
      />
    );
  }
  if (isEmail(channel)) {
    return (
      <SettingRow
        title="Email delivery"
        description={email.loading ? "Checking email delivery…" : deliverySummary(channel, email.status)}
        control={email.loading ? null : <EmailDeliveryBadge channel={channel} status={email.status} />}
      />
    );
  }
  return (
    <SettingRow
      title="Live connection"
      description={meta.liveNote}
      control={
        <Badge variant="success">
          <Radio aria-hidden="true" />
          Live
        </Badge>
      }
    />
  );
}

function OverviewSection({ channel, meta, conversationCount }) {
  const stats = [
    { label: "Conversations", value: String(conversationCount ?? 0), hint: "Linked to this channel" },
    { label: "Status", value: CHANNEL_STATUS_MAP[channel.status]?.label || channel.status },
    { label: "Created", value: formatDate(channel.createdAt) || "—" },
    { label: "Last updated", value: formatDate(channel.updatedAt) || "—" },
  ];

  return (
    <div className="space-y-6">
      <StatGrid stats={stats} />
      <SectionCard title="Summary" description={meta.blurb}>
        <SettingsList>
          <SettingRow
            title="Configured as"
            description={meta.summary(channel) || "Nothing configured yet"}
            control={<StatusPill status={channel.status} map={CHANNEL_STATUS_MAP} />}
          />
          <ConnectionRow channel={channel} meta={meta} />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

function ConfigurationSection({ channel, meta, config, errors = [], onName, onConfig }) {
  const nameMissing = errors.includes("name");
  return (
    <div className="space-y-6">
      <SectionCard title="Channel">
        <Field
          label="Name"
          htmlFor="channel-name"
          hint={
            nameMissing ? (
              <span className="text-red-400">Required — changes won&apos;t save until it&apos;s filled in.</span>
            ) : (
              "Shown in the inbox and on conversation rows."
            )
          }
        >
          <Input
            id="channel-name"
            value={channel.name}
            onChange={(e) => onName(e.target.value)}
            placeholder={meta.label}
            aria-invalid={nameMissing || undefined}
            className="h-9 sm:max-w-sm"
          />
        </Field>
      </SectionCard>
      <SectionCard
        title={`${meta.label} settings`}
        description={
          isSimulated(channel)
            ? "Changes save automatically. Stored only — nothing is sent to the provider."
            : "Changes save automatically."
        }
      >
        <ChannelConfigForm meta={meta} config={config} errors={errors} onChange={onConfig} />
      </SectionCard>
    </div>
  );
}

function PreviewSection({ config }) {
  return (
    <SectionCard
      title="Launcher preview"
      description="Reflects the launcher colour, greeting and position — it is a mock, not an embed."
    >
      <MessengerPreview config={config} />
    </SectionCard>
  );
}

function InstallSectionBody({ channel }) {
  return <InstallSection channel={channel} />;
}

// Status copy: simulated rows never claim traffic; a live kind says what disconnecting stops.
function connectionCopy(channel, meta, connected) {
  if (isSimulated(channel)) {
    return `Marked as ${connected ? "connected" : "disconnected"} for your records. Simulated — nothing is received from or sent to the provider.`;
  }
  return connected ? meta.connectedCopy : meta.disconnectedCopy;
}

function AdvancedSection({ channel, meta, onStatus, onDelete }) {
  const connected = channel.status === "connected";
  return (
    <div className="space-y-6">
      <SectionCard title="Connection">
        <SettingsList>
          <SettingRow
            title="Connected"
            description={connectionCopy(channel, meta, connected)}
            checked={connected}
            onCheckedChange={(next) => onStatus(next ? "connected" : "disconnected")}
          />
        </SettingsList>
      </SectionCard>

      <SectionCard
        title="Danger zone"
        description={`Deleting removes this ${meta.label.toLowerCase()} channel from the workspace. Existing conversations keep their history.`}
      >
        <Button type="button" variant="destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Delete channel
        </Button>
      </SectionCard>
    </div>
  );
}

export const SECTIONS = {
  overview: OverviewSection,
  configuration: ConfigurationSection,
  install: InstallSectionBody,
  delivery: EmailDeliverySection,
  preview: PreviewSection,
  advanced: AdvancedSection,
};
