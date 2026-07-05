"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { getUser } from "@/lib/supabase/user";
import { ProfileDropdown } from "@/components/internal/topbar/dialogue/profile_dropdown";
import { SuiteMegaMenu } from "@/components/landing/suite-mega-menu";

// Marketing header. Resolves the shared suite session (getUser) and shows the
// profile dropdown when signed in, else a Sign In link.
export function Header({ dashboardHref = "/project" }) {
  const [user, setUser] = useState(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let active = true;
    getUser()
      .then((u) => active && setUser(u))
      .finally(() => active && setResolved(true));
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background md:border-border/50 md:bg-background/85 md:backdrop-blur-md">
      <div className="relative mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-subtle">
            <Inbox className="h-4 w-4 text-foreground" />
          </div>
          <span className="truncate bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-sm font-bold tracking-tight text-transparent">
            Geiger Comms
          </span>
        </Link>

        <SuiteMegaMenu />

        <div className="hidden items-center gap-4 md:flex">
          {user ? (
            <ProfileDropdown />
          ) : resolved ? (
            <a
              href="/login"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign In
            </a>
          ) : (
            <div className="h-8 w-8 rounded-full border border-border bg-surface-subtle" />
          )}
        </div>
      </div>
    </header>
  );
}
