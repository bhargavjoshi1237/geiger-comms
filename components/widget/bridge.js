"use client";

// Strict postMessage bridge (spec §8): exact origin, source window, versioned envelope, then a per-type payload schema.
// Every inbound frame is hostile input — anything that fails a check is dropped silently, never logged.
// The expected parent origin is baked into the iframe URL by the loader (?parentOrigin=).

export const BRIDGE_SOURCE = "geiger-comms";
export const BRIDGE_VERSION = 1;

// Messenger → host envelopes we send. The loader filters on these too.
export const OUTBOUND_TYPES = new Set([
  "ready",
  "unreadCount",
  "resize",
  "open",
  "close",
  "visitor",
  "userEmailSupplied",
  "launcher",
  "event",
]);

export const WIDGET_SPACES = new Set(["home", "messages", "help", "news", "tickets"]);
const LAUNCHER_ICONS = new Set(["help", "ai", "minimize", "close"]);

const BAD = Symbol("bad");
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const APP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ANON_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
const MAX_JWT = 8192;
const MAX_TEXT = 5000;

function isPlainObject(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const isNil = (v) => v === null || v === undefined;

// Optional bounded string: nil → null, valid → value, anything else → BAD.
function optString(v, max, re) {
  if (isNil(v)) return null;
  if (typeof v !== "string" || v.length > max) return BAD;
  if (re && v !== "" && !re.test(v)) return BAD;
  return v;
}

function optOrigin(v) {
  if (isNil(v) || v === "") return null;
  if (typeof v !== "string" || v.length > 2048) return BAD;
  try {
    return new URL(v).origin === v ? v : BAD;
  } catch {
    return BAD;
  }
}

// Accepts either a bare value or `{ [key]: value }` — the loader sends both shapes.
function unwrap(payload, key) {
  return isPlainObject(payload) ? payload[key] : payload;
}

function requiredId(payload) {
  const id = unwrap(payload, "id");
  return typeof id === "string" && ID_RE.test(id) ? { id } : BAD;
}

function optionalText(payload, max) {
  const text = optString(unwrap(payload, "text"), max);
  return text === BAD ? BAD : { text: text ?? "" };
}

function noPayload(payload) {
  return isNil(payload) || isPlainObject(payload) ? null : BAD;
}

// trackEvent meta: a flat bag of primitives, bounded in size.
function cleanMeta(meta) {
  if (isNil(meta)) return null;
  if (!isPlainObject(meta)) return BAD;
  const entries = Object.entries(meta);
  if (entries.length > 25) return BAD;
  const out = {};
  for (const [key, value] of entries) {
    if (key.length > 64) return BAD;
    if (value === null || typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string" && value.length <= 500) out[key] = value;
    else return BAD;
  }
  return out;
}

// Per-type schema: returns the sanitized payload, or BAD to drop the frame.
const INBOUND = {
  boot(p) {
    if (!isPlainObject(p)) return BAD;
    if (typeof p.appId !== "string" || !APP_ID_RE.test(p.appId)) return BAD;
    if (typeof p.anonymousId !== "string" || !ANON_ID_RE.test(p.anonymousId)) return BAD;
    const jwt = optString(p.jwt, MAX_JWT, JWT_RE);
    const email = optString(p.email, 254);
    const parentOrigin = optOrigin(p.parentOrigin);
    if (jwt === BAD || email === BAD || parentOrigin === BAD) return BAD;
    return { appId: p.appId, anonymousId: p.anonymousId, jwt: jwt || null, email: email || null, parentOrigin };
  },
  update(p) {
    if (!isPlainObject(p)) return BAD;
    const jwt = optString(p.jwt, MAX_JWT, JWT_RE);
    const email = optString(p.email, 254);
    if (jwt === BAD || email === BAD) return BAD;
    // An absent jwt key means "identity unchanged"; an explicit null means anonymous.
    return { hasJwt: "jwt" in p, jwt: jwt || null, email: email || null };
  },
  show: noPayload,
  hide: noPayload,
  shutdown: noPayload,
  showSpace(p) {
    const name = unwrap(p, "name");
    return typeof name === "string" && WIDGET_SPACES.has(name) ? { name } : BAD;
  },
  showAsk: (p) => optionalText(p, 500),
  showNewMessage: (p) => optionalText(p, MAX_TEXT),
  showArticle: requiredId,
  showConversation: requiredId,
  showTicket: requiredId,
  showNews(p) {
    const id = unwrap(p, "id");
    if (isNil(id) || id === "") return { id: null };
    return typeof id === "string" && ID_RE.test(id) ? { id } : BAD;
  },
  trackEvent(p) {
    if (!isPlainObject(p) || typeof p.name !== "string") return BAD;
    const name = p.name.trim();
    if (!name || name.length > 120) return BAD;
    const meta = cleanMeta(p.meta);
    return meta === BAD ? BAD : { name, meta };
  },
  // Echo of the host's setLauncherState(); only known keys survive.
  launcher(p) {
    if (!isPlainObject(p)) return BAD;
    const out = {};
    if ("label" in p) {
      const label = optString(p.label, 80);
      if (label === BAD) return BAD;
      out.label = label;
    }
    if (!isNil(p.unread)) {
      if (typeof p.unread !== "number" || !Number.isFinite(p.unread) || p.unread < 0) return BAD;
      out.unread = Math.min(9999, Math.floor(p.unread));
    }
    if ("icon" in p) {
      if (!isNil(p.icon) && !LAUNCHER_ICONS.has(p.icon)) return BAD;
      out.icon = p.icon ?? null;
    }
    return out;
  },
};

// Exported for tests: the sanitized payload, or undefined when the frame must be dropped.
export function validateInbound(type, payload) {
  if (typeof type !== "string" || !Object.prototype.hasOwnProperty.call(INBOUND, type)) return undefined;
  const clean = INBOUND[type](payload);
  return clean === BAD ? undefined : clean;
}

function targetOrigin(expectedParentOrigin) {
  // Exact origin, never "*"; a standalone open (no parentOrigin) only ever talks to our own origin.
  return expectedParentOrigin || window.location.origin;
}

function envelope(type, payload) {
  return { source: BRIDGE_SOURCE, v: BRIDGE_VERSION, type, payload: payload ?? null };
}

export function createBridge({ expectedParentOrigin, onMessage }) {
  if (typeof window === "undefined") {
    return { send() {}, confirmParent: () => false, verifiedParentOrigin: () => null, close() {} };
  }

  // Set once a frame from the expected parent passes every check.
  let verified = false;

  const send = (type, payload) => {
    if (window.parent === window) return;
    if (!OUTBOUND_TYPES.has(type)) return;
    window.parent.postMessage(envelope(type, payload), targetOrigin(expectedParentOrigin));
  };

  // The loader echoes the origin it baked into the URL; a mismatch means the handshake is not talking to the page we think it is.
  const confirmParent = (parentOrigin) =>
    !expectedParentOrigin || !parentOrigin || expectedParentOrigin === parentOrigin;

  // The host origin proven by the handshake (URL param + event.origin agree); null until then or when standalone.
  const verifiedParentOrigin = () => (verified && expectedParentOrigin ? expectedParentOrigin : null);

  const onFrame = (event) => {
    if (event.origin !== targetOrigin(expectedParentOrigin)) return;
    if (event.source !== window.parent || window.parent === window) return;
    const m = event.data;
    if (!isPlainObject(m) || m.source !== BRIDGE_SOURCE || m.v !== BRIDGE_VERSION) return;
    const payload = validateInbound(m.type, m.payload);
    if (payload === undefined) return;
    verified = true;
    onMessage(m.type, payload);
  };

  window.addEventListener("message", onFrame, false);
  return {
    send,
    confirmParent,
    verifiedParentOrigin,
    close() {
      window.removeEventListener("message", onFrame, false);
    },
  };
}
