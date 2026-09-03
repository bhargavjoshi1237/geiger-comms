"use client";

// The full-page role editor, reached from the row action menu's Edit item and
// deep-linked as ?role=<id>. The drawer stays for a quick look; this is where a
// role is composed properly. Every edit lifts back through useRoles, so the
// list, the drawer and this screen always agree.

import { useEffect, useRef, useState } from "react";
import { Copy, Lock } from "lucide-react";

import { EditorShell } from "@/components/internal/shared/editor_shell";
import { Badge, Button } from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac";
import { grantedCount, isOwnerRole } from "./utils";
import { NAV_GROUPS, SECTIONS } from "./role_sections";

const SAVE_DEBOUNCE_MS = 600;

export function RoleDetailScreen({
  role,
  canManage,
  memberCount,
  members,
  query,
  setQuery,
  onBack,
  onToggle,
  onToggleGroup,
  onSaveDetails,
  onDuplicate,
  onDelete,
  onViewMembers,
}) {
  const { section: active, setSection: setActive } = useWorkspaceUrl();

  // Only name/description are drafted here — permissions come straight off the
  // live role so a toggle reflects the moment the hook state updates.
  const [seedId, setSeedId] = useState(role?.id);
  const [draft, setDraft] = useState({
    name: role?.name || "",
    description: role?.description || "",
  });
  const timer = useRef(null);

  // Re-seed when the editor swaps to a different role (adjusting state during
  // render beats an effect that fires after a wasted paint).
  if (role && role.id !== seedId) {
    setSeedId(role.id);
    setDraft({ name: role.name || "", description: role.description || "" });
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!role) return null;

  const owner = isOwnerRole(role);
  const locked = owner || !canManage;
  const total = ALL_PERMISSION_KEYS.length;
  const granted = owner ? total : grantedCount(role);

  // Fold a patch into the draft, then persist it after the debounce. An empty
  // name never reaches the write — it would only toast on every keystroke.
  const handleDraft = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    clearTimeout(timer.current);
    if (!next.name.trim()) return;
    timer.current = setTimeout(() => {
      // Nothing to write when the draft has landed back on what's stored.
      if (next.name === role.name && next.description === role.description) return;
      onSaveDetails?.(role, next);
    }, SAVE_DEBOUNCE_MS);
  };

  const ActiveSection = SECTIONS[active] || SECTIONS.overview;

  const meta = [
    role.description || null,
    owner ? "Every permission" : `${granted} of ${total} permissions`,
    `${memberCount || 0} ${memberCount === 1 ? "person" : "people"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <EditorShell
      back={{ label: "Roles & Permissions", onClick: onBack }}
      title={draft.name || "Untitled role"}
      badges={
        <>
          <Badge variant={role.isSystem ? "neutral" : "info"}>
            {role.isSystem ? "System" : "Custom"}
          </Badge>
          {owner ? (
            <Badge variant="neutral">
              <Lock className="h-3 w-3" /> Read-only
            </Badge>
          ) : null}
        </>
      }
      meta={meta}
      actions={
        <>
          {canManage ? (
            <Button
              variant="outline"
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={() => onDuplicate?.(role)}
            >
              <Copy className="h-4 w-4" /> Duplicate
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
            onClick={() => setActive("permissions")}
          >
            Edit permissions
          </Button>
        </>
      }
      nav={NAV_GROUPS}
      subject={role}
      active={active}
      onActiveChange={setActive}
    >
      <ActiveSection
        role={role}
        draft={draft}
        canManage={canManage}
        locked={locked}
        memberCount={memberCount}
        members={members}
        query={query}
        setQuery={setQuery}
        onDraft={handleDraft}
        onToggle={onToggle}
        onToggleGroup={onToggleGroup}
        onDuplicate={() => onDuplicate?.(role)}
        onDelete={() => onDelete?.(role)}
        onViewMembers={() => onViewMembers?.(role)}
      />
    </EditorShell>
  );
}

export default RoleDetailScreen;
