"use client";

import { UserRoundX } from "lucide-react";

export function SignedOutNotice() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-card text-text-secondary">
        <UserRoundX className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Sign in to see this inbox</p>
        <p className="max-w-sm text-sm text-text-secondary">
          Your Inbox and Mentions are personal queues — they need a signed-in
          teammate. All Conversations stays available without an account.
        </p>
      </div>
    </div>
  );
}
