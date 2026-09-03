"use client";

// The teammate editor: the suite editor frame — back link, title, status,
// right-hand section nav — over the roster fields. Reached from the members
// row action menu ("Edit", ?member=<id>); the drawer stays the quick look.
// Every write goes through useTeam's mutations, so the list, drawer and editor
// all read the same row.

import { useEffect, useRef, useState } from "react";

import { EditorShell } from "@/components/internal/shared/editor_shell";
import { Button } from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { MEMBER_STATUS_MAP, formatRelativeTime } from "../constants";
import { NAV_GROUPS, SECTIONS } from "./member_sections";

const SAVE_DEBOUNCE_MS = 600;

export function MemberDetailScreen({
  member,
  role,
  roles,
  groups,
  activity,
  canAssign,
  isLastOwner,
  onBack,
  onRename,
  onChangeRole,
  onSetGroups,
  onToggleSuspend,
  onRemove,
}) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();
  // Only the free-text name is buffered locally — role, groups and status write
  // straight through the parent so every surface updates at once.
  const [name, setName] = useState(member?.name ?? "");
  const [seedId, setSeedId] = useState(member?.id);
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);

  // Re-seed when the editor swaps to another teammate — adjusting state during
  // render beats an effect that fires after a wasted paint.
  if (member && member.id !== seedId) {
    setSeedId(member.id);
    setName(member.name ?? "");
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!member) return null;

  const handleName = (next) => {
    setName(next);
    clearTimeout(timer.current);
    setSaving(true);
    timer.current = setTimeout(async () => {
      await onRename(member, next);
      setSaving(false);
    }, SAVE_DEBOUNCE_MS);
  };

  const view = { ...member, name };
  const ActiveSection = SECTIONS[active] || SECTIONS.overview;

  return (
    <EditorShell
      back={{ label: "Teammates", onClick: onBack }}
      title={view.name || view.email?.split("@")[0] || "Teammate"}
      status={view.status}
      statusMap={MEMBER_STATUS_MAP}
      meta={[
        view.email,
        role?.name || "No role",
        `Last active ${formatRelativeTime(view.lastActiveAt)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
      badges={saving ? <span className="text-xs text-text-secondary">Saving…</span> : null}
      actions={
        <Button
          variant="outline"
          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
          onClick={() => setActive("access")}
        >
          Manage access
        </Button>
      }
      nav={NAV_GROUPS}
      subject={view}
      active={active}
      onActiveChange={setActive}
    >
      <ActiveSection
        member={view}
        role={role}
        roles={roles}
        groups={groups}
        activity={activity}
        canAssign={canAssign}
        isLastOwner={isLastOwner}
        onName={handleName}
        onChangeRole={onChangeRole}
        onSetGroups={onSetGroups}
        onToggleSuspend={onToggleSuspend}
        onRemove={onRemove}
      />
    </EditorShell>
  );
}

export default MemberDetailScreen;
