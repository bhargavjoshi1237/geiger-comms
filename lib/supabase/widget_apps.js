// View model for comms.widget_apps (messenger-widget spec §3, §12). The table is reachable only through the /api/widget-apps server
// routes (service role; browser roles hold no privileges on it), so this module is the shape those routes return — nothing more.
// Sealed secrets (secret_hash, previous_secret_hash) and the metadata bag never leave the server: fields are whitelisted, not spread.

export function normalizeWidgetApp(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const lastBootAt = row.last_boot_at ?? meta.last_boot_at ?? null;
  const graceEnds = row.previous_secret_hash && row.previous_secret_expires_at ? row.previous_secret_expires_at : null;
  return {
    id: row.id ?? null,
    publicId: row.public_id ?? "",
    name: row.name || "Website",
    secretLast4: row.secret_last4 || "",
    allowedOrigins: Array.isArray(row.allowed_origins) ? row.allowed_origins : [],
    channelId: row.channel_id ?? null,
    projectId: row.project_id ?? null,
    lastBootAt,
    hasBooted: Boolean(lastBootAt),
    previousSecretExpiresAt: graceEnds && Date.parse(graceEnds) > Date.now() ? graceEnds : null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
  };
}
