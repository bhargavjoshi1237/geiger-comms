// Lookups & declarative config for the six Channels screens; the config form renders from CHANNEL_KIND_META[kind].fields (spec §3).

import {
  Mail,
  MessageCircle,
  MessageCircleMore,
  Smartphone,
  Share2,
  Slack,
} from "lucide-react";

// Connection status -> badge styling for StatusPill.
export const CHANNEL_STATUS_MAP = {
  connected: { label: "Connected", variant: "success", dotClass: "bg-emerald-400" },
  disconnected: { label: "Disconnected", variant: "outline", dotClass: "bg-text-tertiary" },
  error: { label: "Error", variant: "danger", dotClass: "bg-red-400" },
};

// Field types: text | textarea | select | switch | color | accounts; `required` gates connect and every later save.
const ACCOUNT_NETWORKS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X" },
];

// Blurbs say what is stored, never that messages flow — only Messenger is live (spec §1.1).
export const CHANNEL_KIND_META = {
  email: {
    label: "Email",
    icon: Mail,
    blurb: "Settings for your support email addresses. Simulated — no email is received or sent.",
    fields: [
      { key: "address", label: "Email address", type: "text", placeholder: "support@acme.com", required: true },
      { key: "forwardingAddress", label: "Forwarding address", type: "text", placeholder: "forward@in.acme.com", hint: "Stored for reference — nothing is forwarded yet." },
      { key: "replyToName", label: "Reply-to name", type: "text", placeholder: "Acme Support" },
      { key: "signature", label: "Signature", type: "textarea", placeholder: "— The Acme team" },
      { key: "verified", label: "Verified", type: "switch", hint: "A manual marker — no ownership check runs." },
    ],
    summary: (config) => config?.address || "",
  },

  messenger: {
    label: "Messenger",
    icon: MessageCircle,
    blurb: "The embedded chat widget for your site or app.",
    fields: [
      { key: "launcherColor", label: "Launcher colour", type: "color" },
      { key: "greeting", label: "Greeting", type: "text", placeholder: "Hi there 👋 How can we help?" },
      {
        key: "position",
        label: "Position",
        type: "select",
        options: [
          { value: "left", label: "Bottom left" },
          { value: "right", label: "Bottom right" },
        ],
      },
      { key: "showAvatars", label: "Show avatars", type: "switch" },
      { key: "officeHoursNote", label: "Office-hours note", type: "textarea", placeholder: "We usually reply within a few hours." },
    ],
    summary: (config) => config?.greeting || "",
  },

  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircleMore,
    blurb: "Settings for a WhatsApp Business number. Simulated — no messages are received or sent.",
    fields: [
      { key: "phoneNumber", label: "Phone number", type: "text", placeholder: "+1 555 010 2030", required: true },
      { key: "displayName", label: "Display name", type: "text", placeholder: "Acme" },
      { key: "businessAccountId", label: "Business account ID", type: "text", placeholder: "wa-1234567890" },
    ],
    summary: (config) => config?.phoneNumber || "",
  },

  sms: {
    label: "SMS",
    icon: Smartphone,
    blurb: "Settings for a shared SMS number. Simulated — no texts are received or sent.",
    fields: [
      { key: "number", label: "Number", type: "text", placeholder: "+1 555 010 4050", required: true },
      { key: "provider", label: "Provider", type: "text", placeholder: "Twilio" },
      { key: "senderId", label: "Sender ID", type: "text", placeholder: "ACME" },
    ],
    summary: (config) => config?.number || "",
  },

  social: {
    label: "Social",
    icon: Share2,
    blurb: "Settings for your Instagram, Facebook and X accounts. Simulated — no messages are received or sent.",
    fields: [{ key: "accounts", label: "Accounts", type: "accounts", options: ACCOUNT_NETWORKS }],
    summary: (config) => {
      const handles = (config?.accounts || []).map((a) => a.handle).filter(Boolean);
      return handles.length ? handles.map((h) => `@${h.replace(/^@/, "")}`).join(", ") : "";
    },
  },

  slack: {
    label: "Slack",
    icon: Slack,
    blurb: "Settings for a Slack workspace. Simulated — no Slack messages are received or sent.",
    fields: [
      { key: "workspaceName", label: "Workspace name", type: "text", placeholder: "acme.slack.com", required: true },
      { key: "defaultChannel", label: "Default channel", type: "text", placeholder: "#support" },
      { key: "notifyOnAssign", label: "Notify assignee", type: "switch", hint: "Stored only — no Slack DMs are sent yet." },
    ],
    summary: (config) => config?.defaultChannel || config?.workspaceName || "",
  },
};

// Sidebar order of the six kinds.
export const CHANNEL_KINDS = ["email", "messenger", "whatsapp", "sms", "social", "slack"];

// Toolbar filter for the channels list; "all" sentinel first.
export const CHANNEL_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "connected", label: "Connected" },
  { value: "disconnected", label: "Disconnected" },
  { value: "error", label: "Error" },
];

// The flat view model spreads config keys; pull just this kind's back out.
export function configOf(meta, channel) {
  const config = {};
  for (const field of meta?.fields || []) {
    if (channel && field.key in channel) config[field.key] = channel[field.key];
  }
  return config;
}

// Keys ("name" plus required config fields) left blank on a channel view model.
export function missingRequired(meta, channel) {
  const missing = [];
  if (!String(channel?.name ?? "").trim()) missing.push("name");
  for (const field of meta?.fields || []) {
    if (field.required && !String(channel?.[field.key] ?? "").trim()) missing.push(field.key);
  }
  return missing;
}

// A missing flag counts as simulated — the badge only drops when a row says simulated: false.
export function isSimulated(channel) {
  return channel?.simulated !== false;
}

export function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// The §1.1 honesty requirement for every simulated kind.
export const CONNECT_DISCLOSURE =
  "This stores settings only. It does not connect to the provider, and no messages are received or sent through it.";

// Messenger is the one live kind: conversations arrive through the installed widget.
export const LIVE_NOTE =
  "Live — conversations from your installed widget arrive in your inbox.";
