"use client";

import React, { useState } from "react";
import { Loader2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@geiger/ui";
import { Input } from "@geiger/ui";
import { EmptyState } from "@/components/internal/shared/screen_kit";
import { useProject } from "@/context/project-context";

// Shared gate states for the project-scoped workspace. Used by the /project
// resolver and the /project/[projectId] shell.

export function LoadingArea() {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-text-secondary">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading…
    </div>
  );
}

// Shown when the signed-in user has no projects yet — the whole workspace is
// project-scoped, so there is nothing to show until one exists. Creating a
// project switches to it (navigating into /project/<id>).
export function NoProjectState() {
  const { createProject } = useProject();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) {
      toast.error("Give your project a name.");
      return;
    }
    setSaving(true);
    const created = await createProject(name);
    setSaving(false);
    if (!created) toast.error("Couldn't create the project.");
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-subtle p-2">
        <EmptyState
          icon={FolderPlus}
          title="Create your first project"
          description="Events, tickets, registrations, and automations all live inside a project. Create one to get started."
          action={
            <div className="flex w-full max-w-sm items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Events"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving) create();
                }}
              />
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                onClick={create}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderPlus className="h-4 w-4" />
                )}
                Create
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}
