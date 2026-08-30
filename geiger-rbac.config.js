import { defineRbacConfig, defineRole } from "@geiger/rbac";

// The @geiger/rbac catalog for Geiger Comms.
//
// This is the TRUSTED half of authorization: permission keys, what each one is
// scoped by, and the conditions attached to it are all declared here, in
// versioned code. The database only ever stores which roles exist, which keys
// they carry, and who holds them — customers compose roles and narrow grants,
// they never author a predicate.
//
// Keys are "<product>.<resource>.<action>". Nav-shaped keys gate the sidebar;
// resource/action keys gate an operation now and compile to an RLS policy as
// comms tables are tightened one at a time.
//
// Titles below must match components/internal/sidebar/sidebar_nav.jsx exactly —
// navPermissionKey() derives a key from a nav title, so a renamed section needs
// its key renamed here too (and a migration to rewrite stored role rows).

// Nav-section slug, matching normalizeRoleId() so stored keys stay stable.
export function navSlug(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function navPermissionKey(title) {
  return `comms.${navSlug(title)}.view`;
}

// Every top-level sidebar section. Sub-items inherit their section's gate — the
// nav filter only ever tests top-level titles.
const NAV_SECTIONS = [
  "Overview",
  "Inbox",
  "Channels",
  "Phone",
  "Customers",
  "Automation",
  "AI Agent",
  "AI Performance",
  "Knowledge Base",
  "Proactive",
  "Reports",
  "Integrations",
  "Settings",
];

const navPermissions = NAV_SECTIONS.map((title) => ({
  key: navPermissionKey(title),
  label: title,
  group: "Workspace views",
}));

// Real operations. These are the keys worth gating a button on — and the ones
// that will back RLS policies as tables are tightened one at a time. A grant
// may be narrowed to specific conversations via scope {"conversation": [...]}.
const operationPermissions = [
  {
    key: "comms.conversation.reply",
    label: "Reply to a conversation",
    group: "Inbox",
    scopeBy: "conversation",
  },
  {
    key: "comms.conversation.assign",
    label: "Assign a conversation",
    group: "Inbox",
    scopeBy: "conversation",
  },
  {
    key: "comms.conversation.close",
    label: "Close a conversation",
    group: "Inbox",
    scopeBy: "conversation",
  },
  {
    key: "comms.contact.edit",
    label: "Edit a contact or company",
    group: "Customers",
    scopeBy: "conversation",
  },
  {
    key: "comms.article.publish",
    label: "Publish a help-centre article",
    group: "Help Center",
  },
  {
    key: "comms.team.invite",
    label: "Invite Members",
    group: "Team Control",
  },
  {
    key: "comms.team.assign",
    label: "Assign roles",
    group: "Team Control",
  },
  {
    key: "comms.role.manage",
    label: "Create and edit roles",
    group: "Team Control",
  },
  {
    key: "comms.billing.manage",
    label: "Manage billing",
    group: "Administration",
  },
  {
    key: "comms.settings.manage",
    label: "Manage settings",
    group: "Administration",
  },
];

const permissions = [...navPermissions, ...operationPermissions];

const viewKeys = permissions
  .filter((p) => p.key.endsWith(".view"))
  .map((p) => p.key);

// The five roles seeded into public.roles for a project the first time it needs
// them. Owner holds "*" — the wildcard is what "the project owner can set all
// things" means, and it keeps granting new permissions automatically as the
// catalog grows.
const systemRoles = [
  defineRole({
    key: "owner",
    name: "Owner",
    description: "Full access to everything, including billing.",
    color: "violet",
    permissions: ["*"],
    sort: 0,
  }),
  defineRole({
    key: "admin",
    name: "Admin",
    description: "Manage the workspace, team and roles — no billing control.",
    color: "blue",
    permissions: [
      ...viewKeys,
      "comms.conversation.reply",
      "comms.conversation.assign",
      "comms.conversation.close",
      "comms.contact.edit",
      "comms.article.publish",
      "comms.team.invite",
      "comms.team.assign",
      "comms.role.manage",
      "comms.settings.manage",
    ],
    sort: 1,
  }),
  defineRole({
    key: "manager",
    name: "Manager",
    description: "Work the inbox and invite teammates; can't edit roles or billing.",
    color: "emerald",
    permissions: [
      ...viewKeys,
      "comms.conversation.reply",
      "comms.conversation.assign",
      "comms.conversation.close",
      "comms.contact.edit",
      "comms.article.publish",
      "comms.team.invite",
      "comms.team.assign",
    ],
    sort: 2,
  }),
  defineRole({
    key: "member",
    name: "Member",
    description: "Day-to-day agent access to conversations and contacts.",
    color: "amber",
    permissions: [
      "comms.overview.view",
      "comms.inbox.view",
      "comms.channels.view",
      "comms.customers.view",
      "comms.knowledge_base.view",
      "comms.conversation.reply",
      "comms.conversation.assign",
    ],
    sort: 3,
  }),
  defineRole({
    key: "viewer",
    name: "Viewer",
    description: "Read-only access to the overview and reports.",
    color: "slate",
    permissions: ["comms.overview.view", "comms.reports.view"],
    sort: 4,
  }),
];

export default defineRbacConfig({
  product: "comms",
  permissions,
  systemRoles,
});
