"use client";

// Mentions — threads where the current teammate was @mentioned, newest first.

import { InboxShell } from "./inbox_shell";

export function MentionsScreen() {
  return <InboxShell preset="mentions" />;
}

export default MentionsScreen;
