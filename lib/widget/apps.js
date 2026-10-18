import "server-only";
import { serviceClient } from "./service";

// Widget app resolution and the public /config payload; appearance lives on the messenger channel row (Channels spec §3), never duplicated.

const PUBLIC_ID_RE = /^wg_[a-z0-9]{1,32}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

const DEFAULT_APPEARANCE = Object.freeze({
  // White is the drawn default; the loader derives a legible glyph colour from any launcherColor.
  launcherColor: "#ffffff",
  greeting: "Hi there 👋 How can we help?",
  position: "right",
  showAvatars: true,
  officeHoursNote: "",
});

// The app row plus its messenger channel; appearance, quick actions and liveness all come from that one read.
const APP_COLUMNS = "*, channel:channels(id, kind, status, config, deleted_at)";

// A soft-deleted, disconnected or missing messenger channel stops its widget exactly like a revoked app (§10.8: 404).
export function isAppLive(app) {
  const channel = app?.channel;
  return Boolean(
    app &&
      !app.deleted_at &&
      channel &&
      !channel.deleted_at &&
      channel.kind === "messenger" &&
      channel.status !== "disconnected",
  );
}

async function loadApp(column, value, tag) {
  try {
    const { data, error } = await serviceClient()
      .from("widget_apps")
      .select(APP_COLUMNS)
      .eq(column, value)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error(tag, error.message);
      return null;
    }
    return isAppLive(data) ? data : null;
  } catch (e) {
    console.error(tag, e);
    return null;
  }
}

export async function getAppByPublicId(publicId) {
  if (typeof publicId !== "string" || !PUBLIC_ID_RE.test(publicId)) return null;
  return loadApp("public_id", publicId, "[widget.getApp]");
}

// By internal uuid — used on session-token-authenticated routes only.
export async function getAppById(id) {
  if (!isUuid(id)) return null;
  return loadApp("id", id, "[widget.getAppById]");
}

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

// Only well-typed appearance values reach the loader, which writes them into the host page's DOM.
function messengerAppearance(channel) {
  const config = channel?.config && typeof channel.config === "object" ? channel.config : {};
  const appearance = {};
  if (typeof config.launcherColor === "string" && HEX_COLOR_RE.test(config.launcherColor)) {
    appearance.launcherColor = config.launcherColor;
  }
  if (typeof config.greeting === "string" && config.greeting.trim()) appearance.greeting = config.greeting.slice(0, 200);
  if (config.position === "left" || config.position === "right") appearance.position = config.position;
  if (typeof config.showAvatars === "boolean") appearance.showAvatars = config.showAvatars;
  if (typeof config.officeHoursNote === "string") appearance.officeHoursNote = config.officeHoursNote.slice(0, 300);
  return appearance;
}

// Spaces are advertised as core-only; Help/News hide client-side when their content comes back empty (spec §9).
export async function buildWidgetConfig(app) {
  return {
    appId: app.public_id,
    name: app.name ?? "Website",
    appearance: { ...DEFAULT_APPEARANCE, ...messengerAppearance(app.channel) },
    spaces: { home: true, messages: true },
  };
}
