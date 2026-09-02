"use client";

// Section nav + bodies for the channel editor (channels spec §5.1). Mirrors the
// events editor: NAV_GROUPS drives the right-hand nav, SECTIONS maps a key to
// its body. Messenger-only sections hide themselves through showIf.

import {
  Code,
  Eye,
  LayoutDashboard,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button, Input } from "@geiger/ui";
import {
  Field,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { CHANNEL_STATUS_MAP, CONNECT_DISCLOSURE, formatDate } from "./constants";
import { ChannelConfigForm } from "./channel_config_form";
import { InstallSection } from "./install_section";
import { MessengerPreview } from "./messenger_preview";

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
  const stats = [
    { label: "Conversations", value: String(conversationCount ?? 0), hint: "Routed through this channel" },
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
            title="Simulated"
            description={CONNECT_DISCLOSURE}
            control={
              <span className="rounded-full border border-border bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {channel.simulated === false ? "Live" : "Simulated"}
              </span>
            }
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

function ConfigurationSection({ channel, meta, config, onName, onConfig }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Channel">
        <Field label="Name" htmlFor="channel-name" hint="Shown in the inbox and on conversation rows.">
          <Input
            id="channel-name"
            value={channel.name}
            onChange={(e) => onName(e.target.value)}
            placeholder={meta.label}
            className="h-9 sm:max-w-sm"
          />
        </Field>
      </SectionCard>
      <SectionCard
        title={`${meta.label} settings`}
        description="Changes save automatically."
      >
        <ChannelConfigForm meta={meta} config={config} onChange={onConfig} />
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

function AdvancedSection({ channel, meta, onStatus, onDelete }) {
  const connected = channel.status === "connected";
  return (
    <div className="space-y-6">
      <SectionCard title="Connection">
        <SettingsList>
          <SettingRow
            title="Connected"
            description={
              connected
                ? "Conversations route into your inbox from this channel."
                : "Nothing routes in while this channel is disconnected."
            }
            checked={connected}
            onCheckedChange={(next) => onStatus(next ? "connected" : "disconnected")}
          />
        </SettingsList>
      </SectionCard>

      <SectionCard
        title="Danger zone"
        description={`Deleting removes this ${meta.label.toLowerCase()} channel from the workspace. Existing conversations keep their history.`}
      >
        <Button
          type="button"
          className="bg-red-500/90 text-white hover:bg-red-500"
          onClick={onDelete}
        >
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
