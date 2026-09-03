"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserPlus } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ScreenHeader,
  StatsBar,
} from "@/components/internal/shared/screen_kit";
import { Button, Tabs, TabsList, TabsTrigger } from "@geiger/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { Notice } from "./roles/notice";
import { useTeam } from "./team/use_team";
import MembersTab from "./team/members_tab";
import InvitationsTab from "./team/invitations_tab";
import GroupsTab from "./team/groups_tab";
import ActivityTab from "./team/activity_tab";
import MemberDrawer from "./team/member_drawer";
import MemberDetailScreen from "./team/member_detail";
import InviteDialog from "./team/invite_dialog";
import GroupDialog from "./team/group_dialog";

const TABS = [
  { key: "members", label: "Members" },
  { key: "invitations", label: "Invitations" },
  { key: "groups", label: "Groups" },
  { key: "activity", label: "Activity" },
];

export function TeamMembersScreen() {
  // The roster, everything derived from it, and every write live in useTeam;
  // this component owns only view state and the layout.
  const {
    loading,
    canInvite,
    canAssign,
    members,
    roles,
    groups,
    activity,
    roleById,
    roleIdOf,
    groupById,
    memberCountByGroup,
    activeMembers,
    invites,
    isLastOwner,
    seatsFull,
    stats,
    changeRole,
    setMemberGroups,
    toggleSuspend,
    removeMember,
    renameMember,
    parseInviteList,
    inviteMembers,
    resendInvite,
    revokeInvite,
    addGroup,
    editGroup,
    deleteGroup,
  } = useTeam();

  // The full editor lives in the URL (?member=<id>) so a refresh stays on it.
  const { memberId, openMember, closeMember } = useWorkspaceUrl();

  const [tab, setTab] = useState("members");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Deep-link from Roles & Permissions stashes a role id to pre-filter on. Read
  // it once as the initial value (client-only) and clear it so it doesn't stick.
  const [roleFilter, setRoleFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    try {
      const stashed = window.sessionStorage.getItem("team:roleFilter");
      if (stashed) {
        window.sessionStorage.removeItem("team:roleFilter");
        return stashed;
      }
    } catch {
      // ignore storage failures
    }
    return "all";
  });
  const [groupFilter, setGroupFilter] = useState("all");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [openMemberId, setOpenMemberId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeMembers.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (roleFilter !== "all" && roleIdOf(m) !== roleFilter) return false;
      if (groupFilter !== "all" && !(m.groupIds || []).includes(groupFilter))
        return false;
      if (q && !`${m.name} ${m.email}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeMembers, search, statusFilter, roleFilter, groupFilter, roleIdOf]);

  const drawerMember = useMemo(
    () => members.find((m) => m.id === openMemberId) || null,
    [members, openMemberId],
  );

  const editingMember = useMemo(
    () => (memberId ? members.find((m) => m.id === memberId) || null : null),
    [members, memberId],
  );

  const confirmRemove = async () => {
    const member = removeTarget;
    setRemoveTarget(null);
    if (!member) return;
    const removed = await removeMember(member);
    if (!removed) return;
    if (openMemberId === member.id) setOpenMemberId(null);
    if (memberId === member.id) closeMember();
  };

  // Close the dialog only once the input is known good, so a bad list keeps the
  // typed emails on screen.
  const handleInvite = (emails, roleId, groupId, message) => {
    const list = parseInviteList(emails);
    if (!list) return;
    setInviteOpen(false);
    inviteMembers(list, roleId, groupId, message);
  };

  const handleCreateGroup = (name, description) => {
    if (!name.trim()) {
      toast.error("Name the group.");
      return;
    }
    setGroupOpen(false);
    addGroup(name, description);
  };

  const openInvite = () =>
    seatsFull ? toast.error("All seats are in use.") : setInviteOpen(true);

  const inviteAction = canInvite ? (
    <Button
      onClick={openInvite}
      className="bg-primary text-primary-foreground"
      disabled={seatsFull}
    >
      <UserPlus className="h-4 w-4" /> Invite people
    </Button>
  ) : null;

  const roleFilterOptions = [
    { value: "all", label: "All Roles" },
    ...roles.map((r) => ({ value: r.id, label: r.name })),
  ];
  const groupFilterOptions = [
    { value: "all", label: "All Groups" },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ];

  // Jump from a group row to the members it holds.
  const viewGroupMembers = (group) => {
    setGroupFilter(group.id);
    setTab("members");
  };

  // Shared by the list and the editor, so the editor's danger zone gets the same
  // confirmation the row action does.
  const removeDialog = (
    <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove member</DialogTitle>
          <DialogDescription>
            {removeTarget
              ? `Remove ${removeTarget.name || removeTarget.email} from this workspace? They lose access immediately.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
            Cancel
          </Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={confirmRemove}
          >
            Remove member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (editingMember) {
    return (
      <>
        <MemberDetailScreen
          member={editingMember}
          role={roleById[roleIdOf(editingMember)] || null}
          roles={roles}
          groups={groups}
          activity={activity}
          canAssign={canAssign}
          isLastOwner={isLastOwner(editingMember)}
          onBack={closeMember}
          onRename={renameMember}
          onChangeRole={changeRole}
          onSetGroups={setMemberGroups}
          onToggleSuspend={toggleSuspend}
          onRemove={setRemoveTarget}
        />
        {removeDialog}
      </>
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Teammates"
        description="Manage who has access to this workspace and what they can do."
        actions={inviteAction}
      />

      <StatsBar stats={stats} />

      {!canAssign ? (
        <Notice icon={ShieldCheck}>
          You can see who is on the team, but changing roles or access needs the
          <span className="text-foreground"> Assign roles </span>
          permission.
        </Notice>
      ) : null}

      {/* Tabs — same line variant as Roles & Permissions. */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="border-b border-border">
          {TABS.map((t) => {
            const count =
              t.key === "invitations"
                ? invites.length
                : t.key === "groups"
                  ? groups.length
                  : null;
            return (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
                {count ? (
                  <span className="ml-1.5 text-xs text-text-tertiary">{count}</span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-6 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading team…
        </div>
      ) : tab === "members" ? (
        <MembersTab
          members={filteredMembers}
          total={activeMembers.length}
          roleById={roleById}
          roleIdOf={roleIdOf}
          canAssign={canAssign}
          groupById={groupById}
          roles={roles}
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          roleFilter={roleFilter}
          setRoleFilter={setRoleFilter}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          roleFilterOptions={roleFilterOptions}
          groupFilterOptions={groupFilterOptions}
          onOpen={(m) => setOpenMemberId(m.id)}
          onEdit={(m) => openMember(m.id)}
          onChangeRole={changeRole}
          onToggleSuspend={toggleSuspend}
          onRemove={setRemoveTarget}
          onInvite={() => setInviteOpen(true)}
        />
      ) : tab === "invitations" ? (
        <InvitationsTab
          invites={invites}
          roles={roles}
          roleById={roleById}
          onResend={resendInvite}
          onRevoke={revokeInvite}
          onInvite={openInvite}
        />
      ) : tab === "groups" ? (
        <GroupsTab
          groups={groups}
          counts={memberCountByGroup}
          onCreate={() => setGroupOpen(true)}
          onEdit={editGroup}
          onDelete={deleteGroup}
          onViewMembers={viewGroupMembers}
        />
      ) : (
        <ActivityTab activity={activity} />
      )}

      <InviteDialog
        key={inviteOpen ? "invite-open" : "invite-closed"}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles}
        groups={groups}
        onSubmit={handleInvite}
      />

      <GroupDialog
        key={groupOpen ? "group-open" : "group-closed"}
        open={groupOpen}
        onOpenChange={setGroupOpen}
        onSubmit={handleCreateGroup}
      />

      <MemberDrawer
        member={drawerMember}
        role={drawerMember ? roleById[roleIdOf(drawerMember)] : null}
        roles={roles}
        groups={groups}
        canAssign={canAssign}
        isLastOwner={drawerMember ? isLastOwner(drawerMember) : false}
        onOpenChange={(o) => !o && setOpenMemberId(null)}
        onChangeRole={changeRole}
        onSetGroups={setMemberGroups}
        onToggleSuspend={toggleSuspend}
        onRemove={setRemoveTarget}
      />

      {removeDialog}
    </MainScreenWrapper>
  );
}

export default TeamMembersScreen;
