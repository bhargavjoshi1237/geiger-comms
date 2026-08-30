// Lookups & declarative config for the six Channels screens. CHANNEL_KIND_META
// drives everything: the shared screen reads label/icon/blurb from it and the
// config form renders straight from `fields`, so adding a field or kind is a
// one-line change here (docs/specs/2026-08-22-channels-design.md §3).

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
  disconnected: { label: "Disconnected", variant: "outline", dotClass: "bg-[#737373]" },
  error: { label: "Error", variant: "destructive", dotClass: "bg-red-400" },
};

// Field types the config form understands: text | textarea | select | switch |
// color | accounts. `required` gates the connect/save validation.
const ACCOUNT_NETWORKS = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "x", label: "X" },
];

export const CHANNEL_KIND_META = {
  email: {
    label: "Email",
    icon: Mail,
    blurb: "Forward support emails into your inbox and reply from one place.",
    fields: [
      { key: "address", label: "Email address", type: "text", placeholder: "support@acme.com", required: true },
      { key: "forwardingAddress", label: "Forwarding address", type: "text", placeholder: "forward@in.acme.com", hint: "Point your provider's forwarding rule here." },
      { key: "replyToName", label: "Reply-to name", type: "text", placeholder: "Acme Support" },
      { key: "signature", label: "Signature", type: "textarea", placeholder: "— The Acme team" },
      { key: "verified", label: "Verified", type: "switch", hint: "Mark once the address ownership check passes." },
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
    blurb: "Chat with customers on WhatsApp Business.",
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
    blurb: "Send and receive text messages from a shared number.",
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
    blurb: "Manage Instagram, Facebook and X conversations together.",
    fields: [{ key: "accounts", label: "Accounts", type: "accounts", options: ACCOUNT_NETWORKS }],
    summary: (config) => {
      const handles = (config?.accounts || []).map((a) => a.handle).filter(Boolean);
      return handles.length ? handles.map((h) => `@${h.replace(/^@/, "")}`).join(", ") : "";
    },
  },

  slack: {
    label: "Slack",
    icon: Slack,
    blurb: "Answer questions from shared Slack channels.",
    fields: [
      { key: "workspaceName", label: "Workspace name", type: "text", placeholder: "acme.slack.com", required: true },
      { key: "defaultChannel", label: "Default channel", type: "text", placeholder: "#support" },
      { key: "notifyOnAssign", label: "Notify assignee", type: "switch", hint: "DM the assignee when a thread needs them." },
    ],
    summary: (config) => config?.defaultChannel || config?.workspaceName || "",
  },
};

// Sidebar order of the six kinds.
export const CHANNEL_KINDS = ["email", "messenger", "whatsapp", "sms", "social", "slack"];

// The §1.1 honesty requirement: nothing connects to a real provider yet.
export const CONNECT_DISCLOSURE =
  "This stores settings only — it does not connect to the provider and no messages flow through it yet.";
