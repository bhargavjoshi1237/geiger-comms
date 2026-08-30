// Widget app resolution and the public /config payload. Appearance lives on
// the messenger channel row (Channels spec §3) — read here, never duplicated.

import { serviceClient } from "./service";

const DEFAULT_APPEARANCE = Object.freeze({
  launcherColor: "#6366f1",
  greeting: "Hi there 👋 How can we help?",
  position: "right",
  showAvatars: true,
  officeHoursNote: "",
});

export async function getAppByPublicId(publicId) {
  if (typeof publicId !== "string" || !publicId) return null;
  try {
    const { data, error } = await serviceClient()
      .from("widget_apps")
      .select("*")
      .eq("public_id", publicId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[widget.getApp]", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[widget.getApp]", e);
    return null;
  }
}

// By internal uuid — used on session-token-authenticated routes only.
export async function getAppById(id) {
  if (typeof id !== "string" || !id) return null;
  try {
    const { data, error } = await serviceClient()
      .from("widget_apps")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      console.error("[widget.getAppById]", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.error("[widget.getAppById]", e);
    return null;
  }
}

async function messengerAppearance(channelId) {
  if (!channelId) return {};
  try {
    const { data, error } = await serviceClient()
      .from("channels")
      .select("config")
      .eq("id", channelId)
      .maybeSingle();
    if (error) {
      console.error("[widget.appearance]", error.message);
      return {};
    }
    const config = data?.config && typeof data.config === "object" ? data.config : {};
    const appearance = {};
    for (const key of Object.keys(DEFAULT_APPEARANCE)) {
      if (config[key] !== undefined && config[key] !== null && config[key] !== "") {
        appearance[key] = config[key];
      }
    }
    return appearance;
  } catch (e) {
    console.error("[widget.appearance]", e);
    return {};
  }
}

// Spaces are advertised as core-only; Help/News/Tabs hide client-side when
// their content comes back empty (spec §9 — never render an empty tab).
export async function buildWidgetConfig(app) {
  return {
    appId: app.public_id,
    name: app.name ?? "Website",
    appearance: { ...DEFAULT_APPEARANCE, ...(await messengerAppearance(app.channel_id)) },
    spaces: { home: true, messages: true },
  };
}
