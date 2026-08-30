"use client";

// Strict postMessage bridge (spec §8). Both directions carry a versioned
// envelope { source, v, type, payload }; every inbound frame is treated as
// hostile — origin, source window and shape are validated before use, and
// anything unknown is dropped without logging payload contents.
//
// The expected parent origin is baked into the iframe URL by the loader
// (?parentOrigin=), so the widget never has to trust event.origin on its own.

export const BRIDGE_SOURCE = "geiger-comms";
export const BRIDGE_VERSION = 1;

// Host → widget commands this app understands.
const INBOUND_TYPES = new Set([
  "boot",
  "update",
  "show",
  "hide",
  "showSpace",
  "showAsk",
  "showArticle",
  "showNews",
  "showConversation",
  "showNewMessage",
  "showTicket",
  "trackEvent",
  "shutdown",
]);

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

function targetOrigin(expectedParentOrigin) {
  // Exact origin, never "*". Standalone opens (no parentOrigin param) can only
  // ever talk to our own origin.
  return expectedParentOrigin || window.location.origin;
}

function envelope(type, payload) {
  return { source: BRIDGE_SOURCE, v: BRIDGE_VERSION, type, payload: payload ?? null };
}

export function createBridge({ expectedParentOrigin, onMessage }) {
  if (typeof window === "undefined") return { send() {}, confirmParent() { return false; }, close() {} };

  const send = (type, payload) => {
    if (window.parent === window) return;
    if (!OUTBOUND_TYPES.has(type)) return;
    window.parent.postMessage(envelope(type, payload), targetOrigin(expectedParentOrigin));
  };

  // The loader echoes the origin it baked into the URL; a mismatch means the
  // handshake is not talking to the page we think it is.
  const confirmParent = (parentOrigin) =>
    !expectedParentOrigin || !parentOrigin || expectedParentOrigin === parentOrigin;

  const onFrame = (event) => {
    if (event.origin !== targetOrigin(expectedParentOrigin)) return;
    if (event.source !== window.parent) return;
    const m = event.data;
    if (!m || m.source !== BRIDGE_SOURCE || m.v !== BRIDGE_VERSION) return;
    if (!INBOUND_TYPES.has(m.type)) return;
    onMessage(m.type, m.payload ?? null);
  };

  window.addEventListener("message", onFrame, false);
  return {
    send,
    confirmParent,
    close() {
      window.removeEventListener("message", onFrame, false);
    },
  };
}
