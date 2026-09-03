"use client";

// Section nav + bodies for the teammate editor. Mirrors the channel editor:
// NAV_GROUPS drives the right-hand nav, SECTIONS maps a key to its body. The
// member drawer stays the quick look; this is the full surface behind "Edit".

import {
  Activity as ActivityIcon,
  IdCard,
  LayoutDashboard,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { matchesAny } from "@geiger/rbac";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@geiger/ui";
import {
  EmptyState,
  Field,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_ACTION_MAP,
  MEMBER_STATUS_MAP,
  PERMISSION_GROUPS,
  formatDate,
  formatRelativeTime,
  initialsOf,
} from "../constants";

export const NAV_GROUPS = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        desc: "A snapshot of this teammate — role, status, groups and recent presence.",
      },
    ],
  },
  {
    group: "Details",
    items: [
      {
        key: "profile",
        label: "Profile",
        icon: IdCard,
        desc: "How this teammate is shown across the workspace.",
      },
      {
        key: "access",
        label: "Role & access",
        icon: ShieldCheck,
        desc: "The role that decides what they can do, and what it grants.",
      },
      {
        key: "groups",
        label: "Groups",
        icon: UsersRound,
        desc: "The sub-teams this person belongs to.",
      },
    ],
  },
  {
    group: "History",
    items: [
      {
        key: "activity",
        label: "Activity",
        icon: ActivityIcon,
        desc: "Everything the workspace has recorded about this teammate.",
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
        desc: "Suspend access or remove this person from the workspace.",
      },
    ],
  },
];

// Roles store PATTERNS — Owner's "*" grants everything, so a literal includes()
// would report the most powerful role as granting nothing.
function grantedGroupsOf(role) {
  return PERMISSION_GROUPS.map(({ group, permissions }) => ({
    group,
    granted: permissions.filter((p) => matchesAny(role?.permissions || [], p.key)),
  })).filter((g) => g.granted.length);
}

function OverviewSection({ member, role, groups }) {
  const memberGroups = (member.groupIds || [])
    .map((id) => groups.find((g) => g.id === id))
    .filter(Boolean);

  const stats = [
    { label: "Role", value: role?.name || "No role" },
    { label: "Status", value: MEMBER_STATUS_MAP[member.status]?.label || member.status },
    { label: "Groups", value: String(memberGroups.length) },
    { label: "Last active", value: formatRelativeTime(member.lastActiveAt) },
  ];

  return (
    <div className="space-y-6">
      <StatGrid stats={stats} />
      <SectionCard title="Identity">
        <SettingsList>
          <SettingRow
            title="Email"
            description={member.email || "No email on file"}
            control={<StatusPill status={member.status} map={MEMBER_STATUS_MAP} />}
          />
          <SettingRow
            title="Account"
            description={
              member.userId
                ? "Linked to a Geiger account."
                : "Invited — they have not signed in yet."
            }
            control={
              <span className="text-xs text-text-secondary">
                {member.userId ? "Linked" : "Pending"}
              </span>
            }
          />
          <SettingRow
            title="Joined"
            description={
              member.joinedAt
                ? `Joined ${formatDate(member.joinedAt)}`
                : `Invited ${formatDate(member.invitedAt)}`
            }
            control={
              <span className="text-xs text-text-secondary">
                {formatDate(member.joinedAt || member.invitedAt)}
              </span>
            }
          />
          <SettingRow
            title="Access"
            description="Roles apply across the whole workspace — there is no per-inbox scope yet."
            control={
              <span className="text-xs text-text-secondary">Whole workspace</span>
            }
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

function ProfileSection({ member, canAssign, onName }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Display">
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            {member.avatarUrl ? (
              <AvatarImage src={member.avatarUrl} alt={member.name} />
            ) : null}
            <AvatarFallback className="bg-surface-card text-sm text-text-secondary">
              {initialsOf(member.name, member.email)}
            </AvatarFallback>
          </Avatar>
          <Field
            label="Display name"
            htmlFor="member-name"
            hint="Shown on conversations and in the roster. Changes save automatically."
            className="flex-1"
          >
            <Input
              id="member-name"
              value={member.name || ""}
              disabled={!canAssign}
              onChange={(e) => onName(e.target.value)}
              placeholder={member.email?.split("@")[0] || "Teammate"}
              className="h-9 sm:max-w-sm"
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Account"
        description="These come from the person's Geiger account and can't be edited here."
      >
        <SettingsList>
          <SettingRow
            title="Email"
            description={member.email || "—"}
            control={<span className="text-xs text-text-secondary">Read-only</span>}
          />
          <SettingRow
            title="Invited"
            description={
              member.invitedAt ? formatRelativeTime(member.invitedAt) : "Not via invite"
            }
            control={
              <span className="text-xs text-text-secondary">
                {formatDate(member.invitedAt)}
              </span>
            }
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

function AccessSection({ member, role, roles, canAssign, isLastOwner, onChangeRole }) {
  const grantedGroups = grantedGroupsOf(role);

  return (
    <div className="space-y-6">
      <SectionCard title="Role">
        <Field
          label="Assigned role"
          hint={
            isLastOwner
              ? "The workspace's last owner — hand Owner to someone else before changing this."
              : "The role is what @geiger/rbac reads; changing it takes effect immediately."
          }
        >
          <Select
            value={role?.id || ""}
            disabled={!canAssign || isLastOwner}
            onValueChange={(v) => onChangeRole(member, v)}
          >
            <SelectTrigger className="sm:max-w-sm">
              <SelectValue placeholder="Assign a role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>

      <SectionCard
        title={`What ${role?.name || "this role"} can do`}
        description="Every permission this role grants, grouped the way the catalog is."
      >
        {grantedGroups.length ? (
          <div className="space-y-3">
            {grantedGroups.map(({ group, granted }) => (
              <div key={group}>
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                  {group}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {granted.map((p) => (
                    <Badge key={p.key} variant="neutral">
                      {p.label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">
            This role grants no permissions yet.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

function GroupsSection({ member, groups, canAssign, onSetGroups }) {
  const memberGroupIds = member.groupIds || [];
  const toggleGroup = (id, on) =>
    onSetGroups(
      member,
      on ? [...memberGroupIds, id] : memberGroupIds.filter((g) => g !== id),
    );

  return (
    <SectionCard
      title="Groups"
      description="Groups are for organising people; they don't grant permissions."
      bodyPadding={groups.length > 0}
    >
      {groups.length ? (
        <SettingsList>
          {groups.map((g) => (
            <SettingRow
              key={g.id}
              title={g.name}
              description={g.description || undefined}
              control={
                <Checkbox
                  checked={memberGroupIds.includes(g.id)}
                  disabled={!canAssign}
                  onCheckedChange={(v) => toggleGroup(g.id, !!v)}
                />
              }
            />
          ))}
        </SettingsList>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No groups yet"
          description="Create a group on the Groups tab, then assign people to it."
        />
      )}
    </SectionCard>
  );
}

function ActivitySection({ member, activity }) {
  const rows = (activity || []).filter((a) => a.targetMemberId === member.id);

  return (
    <SectionCard title="Activity" bodyPadding={rows.length > 0}>
      {rows.length ? (
        <ol className="space-y-4">
          {rows.map((a) => {
            const meta = ACTIVITY_ACTION_MAP[a.action] || {
              label: a.action,
              icon: ActivityIcon,
              tone: "text-text-secondary",
            };
            const Icon = meta.icon;
            return (
              <li key={a.id} className="flex gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-card">
                  <Icon className={cn("h-3.5 w-3.5", meta.tone)} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{a.actorName || "Someone"}</span>{" "}
                    <span className="text-text-secondary">{meta.label}</span>{" "}
                    <span className="font-medium">{a.targetName || ""}</span>
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {formatRelativeTime(a.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState
          icon={ActivityIcon}
          title="Nothing recorded yet"
          description="Role changes, suspensions and group edits for this person land here."
        />
      )}
    </SectionCard>
  );
}

function AdvancedSection({ member, canAssign, isLastOwner, onToggleSuspend, onRemove }) {
  const suspended = member.status === "suspended";
  const locked = !canAssign || isLastOwner;

  return (
    <div className="space-y-6">
      <SectionCard title="Access">
        <SettingsList>
          <SettingRow
            title="Suspended"
            description={
              suspended
                ? "They keep their role but can't sign in to this workspace."
                : "Suspending keeps the role and history but blocks access."
            }
            control={
              <Switch
                checked={suspended}
                disabled={locked}
                onCheckedChange={() => onToggleSuspend(member)}
              />
            }
          />
        </SettingsList>
      </SectionCard>

      <SectionCard
        title="Danger zone"
        description={
          isLastOwner
            ? "This is the workspace's last owner — hand Owner to someone else first."
            : "Removing revokes their grant immediately. Their history stays on the conversations they touched."
        }
      >
        <Button
          type="button"
          disabled={locked}
          className="bg-red-500/90 text-white hover:bg-red-500"
          onClick={() => onRemove(member)}
        >
          <Trash2 className="h-4 w-4" /> Remove from workspace
        </Button>
      </SectionCard>
    </div>
  );
}

export const SECTIONS = {
  overview: OverviewSection,
  profile: ProfileSection,
  access: AccessSection,
  groups: GroupsSection,
  activity: ActivitySection,
  advanced: AdvancedSection,
};
