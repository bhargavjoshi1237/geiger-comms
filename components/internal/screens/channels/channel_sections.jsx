"use client";

// Channel editor nav + section bodies (spec §5.1); Messenger-only sections hide through showIf.

import {
  Code,
  Eye,
  LayoutDashboard,
  Radio,
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
  LIVE_NOTE,
  formatDate,
  isSimulated,
} from "./constants";
import { ChannelConfigForm } from "./channel_config_form";
import { InstallSection } from "./install_section";
import { MessengerPreview } from "./messenger_preview";
import { SimulatedBadge } from "./simulated_badge";

const isMessenger = (channel) => channel?.kind === "messenger";

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

function OverviewSection({ channel, meta, conversationCount }) {
  const simulated = isSimulated(channel);
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
          <SettingRow
            title={simulated ? "Simulated connection" : "Live connection"}
            description={simulated ? CONNECT_DISCLOSURE : LIVE_NOTE}
            control={
              simulated ? (
                <SimulatedBadge channel={channel} />
              ) : (
                <Badge variant="success">
                  <Radio aria-hidden="true" />
                  Live
                </Badge>
              )
            }
          />
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

// Status copy per (simulated, connected): simulated rows never claim traffic; a disconnected Messenger stops its widget.
function connectionCopy(simulated, connected) {
  if (simulated) {
    return `Marked as ${connected ? "connected" : "disconnected"} for your records. Simulated — nothing is received from or sent to the provider.`;
  }
  return connected
    ? "Conversations from your installed widget arrive in your inbox."
    : "Disconnected. Your installed widget stops loading until you reconnect.";
}

function AdvancedSection({ channel, meta, onStatus, onDelete }) {
  const connected = channel.status === "connected";
  return (
    <div className="space-y-6">
      <SectionCard title="Connection">
        <SettingsList>
          <SettingRow
            title="Connected"
            description={connectionCopy(isSimulated(channel), connected)}
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
  preview: PreviewSection,
  advanced: AdvancedSection,
};
