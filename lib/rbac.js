export const WORKSPACE_PERMISSIONS = [
  // One key per top-level sidebar entry — tabPermissionKey(title) derives these.
  { key: "view.overview", label: "Overview", group: "Workspace views" },
  { key: "view.inbox", label: "Inbox", group: "Workspace views" },
  { key: "view.channels", label: "Channels", group: "Workspace views" },
  { key: "view.voice_ivr", label: "Voice & IVR", group: "Workspace views" },
  { key: "view.customers", label: "Customers", group: "Workspace views" },
  { key: "view.automation", label: "Automation", group: "Workspace views" },
  { key: "view.ai_agent", label: "AI Agent", group: "Workspace views" },
  { key: "view.ai_performance", label: "AI Performance", group: "Workspace views" },
  { key: "view.copilot", label: "Copilot", group: "Workspace views" },
  { key: "view.knowledge_base", label: "Knowledge Base", group: "Workspace views" },
  { key: "view.proactive", label: "Proactive", group: "Workspace views" },
  { key: "view.reports", label: "Reports", group: "Workspace views" },
  { key: "view.integrations", label: "Integrations", group: "Workspace views" },
  { key: "view.settings", label: "Settings", group: "Workspace views" },
  { key: "team.invite", label: "Invite members", group: "Team control" },
  { key: "team.assign_roles", label: "Assign roles", group: "Team control" },
  { key: "roles.manage", label: "Create and edit roles", group: "Team control" },
  { key: "billing.manage", label: "Manage billing", group: "Administration" },
  { key: "settings.manage", label: "Manage settings", group: "Administration" },
];

export const ROLE_STORAGE_KEY = "flow.workspace.roles";

export function normalizeRoleId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function mergeWorkspaceRoles(customRoles = []) {
  const byId = new Map();

  customRoles.forEach((role) => {
    if (!role?.id) return;
    byId.set(role.id, {
      ...role,
      permissions: Array.isArray(role.permissions) ? role.permissions : [],
      system: Boolean(role.system),
    });
  });

  return Array.from(byId.values());
}

export function getRoleById(roles, roleId) {
  return (
    roles.find((role) => role.id === roleId) ||
    roles.find((role) => role.id === "manager") ||
    roles[0]
  );
}

export function roleHasPermission(roles, roleId, permissionKey) {
  if (!roles?.length) {
    return true;
  }

  const role = getRoleById(roles, roleId);
  return Boolean(role?.permissions?.includes(permissionKey));
}

export function tabPermissionKey(title) {
  const normalized = normalizeRoleId(title);
  return `view.${normalized}`;
}
