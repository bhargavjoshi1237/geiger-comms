"use client";

// Section nav + bodies for the full-page role editor. Mirrors the channel
// editor: NAV_GROUPS drives the right-hand nav, SECTIONS maps a key to its
// body. The permission list itself lives here and the drawer imports it, so
// there is exactly one grant editor in the app.

import {
  Copy,
  LayoutDashboard,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Input,
  Switch,
  Textarea,
} from "@geiger/ui";
import {
  EmptyState,
  Field,
  SearchInput,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
} from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac";
import { formatDate } from "../constants";
import { CoverageBar } from "./coverage_bar";
import { Notice } from "./notice";
import { filterGroups, grantedCount, grantsKey, isOwnerRole } from "./utils";

export const NAV_GROUPS = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        desc: "A snapshot of this role — how much of the catalog it reaches and who holds it.",
      },
    ],
  },
  {
    group: "Configure",
    items: [
      {
        key: "details",
        label: "Details",
        icon: SlidersHorizontal,
        desc: "The name and description teammates see. Changes save automatically.",
      },
      {
        key: "permissions",
        label: "Permissions",
        icon: ShieldCheck,
        desc: "Everything this role can do. Toggling a permission saves immediately.",
      },
    ],
  },
  {
    group: "People",
    items: [
      {
        key: "members",
        label: "Members",
        icon: Users,
        desc: "Teammates currently holding this role.",
      },
    ],
  },
  {
    group: "Advanced",
    items: [
      {
        key: "advanced",
        label: "Advanced",
        icon: ShieldAlert,
        desc: "Duplicating and destructive actions for this role.",
      },
    ],
  },
];

// The whole catalog as one continuous divided list under sticky group headers.
// Shared by the drawer and the editor so a grant is edited the same way in both.
export function PermissionGroupList({
  role,
  groups,
  locked,
  query,
  onToggle,
  onToggleGroup,
  inset = "px-5",
}) {
  if (!groups.length) {
    return (
      <p className={cn("py-12 text-center text-sm text-text-tertiary", inset)}>
        No permission matches “{query}”.
      </p>
    );
  }

  return (
    <>
      {groups.map(({ group, permissions }) => {
        const keys = permissions.map((p) => p.key);
        const on = keys.filter((k) => grantsKey(role, k)).length;
        const allOn = on === keys.length;
        return (
          <section key={group}>
            <div
              className={cn(
                "sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-card py-2",
                inset,
              )}
            >
              <span className="flex-1 truncate text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                {group}
              </span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                  on ? "bg-primary/15 text-primary" : "text-text-tertiary",
                )}
              >
                {on}/{keys.length}
              </span>
              {!locked ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-text-secondary"
                  onClick={() => onToggleGroup(role, keys, !allOn)}
                >
                  {allOn ? "Clear" : "Select all"}
                </Button>
              ) : null}
            </div>

            <div className={cn("divide-y divide-border", inset)}>
              {permissions.map((perm) => (
                <label
                  key={perm.key}
                  className={cn(
                    "flex items-center justify-between gap-4 py-3",
                    !locked && "cursor-pointer",
                  )}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-foreground">
                        {perm.label}
                      </span>
                      {perm.scopeBy ? (
                        <span className="shrink-0 rounded border border-border bg-surface-card px-1 py-px text-[10px] text-text-tertiary">
                          per {perm.scopeBy}
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-text-tertiary">
                      {perm.key}
                    </span>
                  </span>
                  <Switch
                    checked={grantsKey(role, perm.key)}
                    disabled={locked}
                    onCheckedChange={() => onToggle(role, perm.key)}
                  />
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

// Owner is deliberately read-only, so its notice reads the same everywhere.
export function OwnerNotice() {
  return (
    <Notice icon={ShieldCheck}>
      Owner holds every permission — including ones added to the product later.
      It is deliberately not editable, so a workspace always keeps at least one
      role that can administer it.
    </Notice>
  );
}

function OverviewSection({ role, memberCount }) {
  const owner = isOwnerRole(role);
  const total = ALL_PERMISSION_KEYS.length;
  const granted = owner ? total : grantedCount(role);

  const stats = [
    {
      label: "Permissions",
      value: owner ? String(total) : `${granted}`,
      hint: owner ? "Every permission in the catalog" : `of ${total} in the catalog`,
    },
    {
      label: "People",
      value: String(memberCount ?? 0),
      hint: memberCount === 1 ? "Holds this role" : "Hold this role",
    },
    { label: "Type", value: role.isSystem ? "System" : "Custom" },
    { label: "Created", value: formatDate(role.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <StatGrid stats={stats} />
      <SectionCard
        title="Summary"
        description={role.description || "No description for this role yet."}
      >
        <SettingsList>
          <SettingRow
            title="Access"
            description="How much of the permission catalog this role reaches."
            control={<CoverageBar role={role} />}
          />
          <SettingRow
            title="Role type"
            description={
              role.isSystem
                ? "Seeded with the workspace. You can still change what it grants."
                : "Created for this workspace."
            }
            control={
              <Badge variant={role.isSystem ? "neutral" : "info"}>
                {role.isSystem ? "System" : "Custom"}
              </Badge>
            }
          />
        </SettingsList>
      </SectionCard>
      {owner ? <OwnerNotice /> : null}
    </div>
  );
}

function DetailsSection({ role, draft, locked, onDraft }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Identity" description="Changes save automatically.">
        <div className="grid gap-4">
          <Field
            label="Name"
            htmlFor="role-detail-name"
            hint="Shown wherever this role is assigned."
          >
            <Input
              id="role-detail-name"
              value={draft.name}
              disabled={locked}
              onChange={(e) => onDraft({ name: e.target.value })}
              placeholder="e.g. Event Coordinator"
              className="h-9 sm:max-w-sm"
            />
          </Field>
          <Field
            label="Description"
            htmlFor="role-detail-desc"
            hint="What this role is for."
          >
            <Textarea
              id="role-detail-desc"
              value={draft.description}
              disabled={locked}
              onChange={(e) => onDraft({ description: e.target.value })}
              placeholder="Who this role is for and what it covers"
              rows={3}
              className="sm:max-w-lg"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Identifier" description="Read-only, set when the role was created.">
        <SettingsList>
          <SettingRow
            title="Type"
            description={role.isSystem ? "Seeded with the workspace." : "Created here."}
            control={
              <Badge variant={role.isSystem ? "neutral" : "info"}>
                {role.isSystem ? "System" : "Custom"}
              </Badge>
            }
          />
          <SettingRow
            title="Key"
            description="Stable identifier used by the permission resolver."
            control={
              <span className="font-mono text-xs text-text-secondary">
                {role.key || "—"}
              </span>
            }
          />
        </SettingsList>
      </SectionCard>

      {locked ? (
        <OwnerNotice />
      ) : null}
    </div>
  );
}

function PermissionsSection({
  role,
  canManage,
  query,
  setQuery,
  onToggle,
  onToggleGroup,
}) {
  const owner = isOwnerRole(role);
  const locked = owner || !canManage;
  // Owner's list is read-only and unsearchable, so a query carried over from
  // the matrix must not silently hide half of it.
  const groups = filterGroups(owner ? "" : query);

  return (
    <div className="space-y-6">
      <CoverageBar role={role} className="w-full max-w-sm" />

      {owner ? <OwnerNotice /> : null}

      <SectionCard
        title="Permission catalog"
        description={
          locked
            ? "Read-only — you can see what this role grants but not change it."
            : "Toggling a permission saves immediately."
        }
        action={
          owner ? null : (
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filter permissions…"
            />
          )
        }
        bodyPadding={false}
      >
        <PermissionGroupList
          role={role}
          groups={groups}
          locked={locked}
          query={query}
          onToggle={onToggle}
          onToggleGroup={onToggleGroup}
        />
      </SectionCard>
    </div>
  );
}

function initialsOf(member) {
  const source = member.name || member.email || "";
  return (
    source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?"
  );
}

function MembersSection({ role, members, onViewMembers }) {
  const holders = (members || []).filter((m) => m.roleId === role.id);

  return (
    <SectionCard
      title="Members"
      description={
        holders.length
          ? `${holders.length} ${holders.length === 1 ? "person holds" : "people hold"} this role.`
          : "Nobody holds this role yet."
      }
      action={
        holders.length ? (
          <Button variant="outline" size="sm" onClick={onViewMembers}>
            <Users className="h-3.5 w-3.5" /> View in Team
          </Button>
        ) : null
      }
      bodyPadding={false}
    >
      {holders.length ? (
        <div className="divide-y divide-border px-5">
          {holders.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <Avatar className="h-8 w-8">
                {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-[11px]">
                  {initialsOf(m)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {m.name || m.email || "Unnamed teammate"}
                </p>
                <p className="truncate text-xs text-text-tertiary">{m.email}</p>
              </div>
              <Badge variant={m.status === "active" ? "success" : "neutral"}>
                {m.status || "active"}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={UserRound}
          title="Nobody holds this role"
          description="Assign it to a teammate from the Teammates screen."
        />
      )}
    </SectionCard>
  );
}

function AdvancedSection({ role, canManage, onDuplicate, onDelete }) {
  const owner = isOwnerRole(role);
  const deletable = canManage && !owner && !role.isSystem;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Duplicate"
        description="Copies this role's permissions into a new custom role you can edit freely."
      >
        <Button variant="outline" disabled={!canManage} onClick={onDuplicate}>
          <Copy className="h-4 w-4" /> Duplicate role
        </Button>
      </SectionCard>

      <SectionCard
        title="Danger zone"
        description={
          owner
            ? "Owner can't be deleted — a workspace always keeps one role that can administer it."
            : role.isSystem
              ? "System roles ship with the workspace and can't be deleted."
              : "Deleting this role removes the access it granted from everyone holding it."
        }
      >
        <Button
          type="button"
          disabled={!deletable}
          className="bg-red-500/90 text-white hover:bg-red-500 disabled:bg-surface-active disabled:text-text-tertiary"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" /> Delete role
        </Button>
      </SectionCard>
    </div>
  );
}

export const SECTIONS = {
  overview: OverviewSection,
  details: DetailsSection,
  permissions: PermissionsSection,
  members: MembersSection,
  advanced: AdvancedSection,
};
