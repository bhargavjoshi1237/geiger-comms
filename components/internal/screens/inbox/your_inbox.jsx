"use client";

// Your Inbox — the signed-in teammate's own queue (assignee: me).

import { InboxShell } from "./inbox_shell";

export function YourInboxScreen() {
  return <InboxShell preset="mine" />;
}

export default YourInboxScreen;
