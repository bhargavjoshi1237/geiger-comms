"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useProject } from "@/context/project-context";
import { useRbac } from "@/context/rbac-context";
import { getUser } from "@/lib/supabase/user";
import {
  ensureSystemRoles,
  listGrants,
  revokeGrant,
  setMemberRole,
} from "@/lib/supabase/rbac";
import {
  listMembers,
  sendInvitations,
  resendInvitation,
  getInvitationLink,
  revokeInvitation,
  updateMember,
  softDeleteMember,
  listGroups,
  createGroup,
  updateGroup,
  softDeleteGroup,
  listActivity,
  logActivity,
  syncTeam,
} from "@/lib/supabase/team";
import { DEFAULT_SEAT_LIMIT } from "../constants";

// What the /api/team/invites routes' error codes mean to the person inviting.
const INVITE_ERRORS = {
  already_invited: "Already invited — resend it from Invitations.",
  already_member: "Already on the team.",
  org_invite_forbidden: "You need permission to add people to the organization.",
  org_invite_failed: "The organization invite couldn't be created.",
  write_failed: "The invitation couldn't be saved.",
  forbidden: "You don't have permission to invite people.",
  role_not_allowed: "Invitations can't carry the Owner role — invite them as Admin, then promote them.",
  role_needs_assign: "Inviting with a role other than Member needs the Assign roles permission.",
  invalid_email: "Some of those email addresses aren't valid.",
  too_many: "Invite at most 20 people at a time.",
  rate_limited: "Too many invitations — try again later.",
  not_pending: "That person has already joined.",
  not_configured: "Invitations aren't available on this deployment.",
  unauthorized: "Your session has expired — sign in again.",
};

const inviteError = (code) => INVITE_ERRORS[code] || "Something went wrong — try again.";

// The Team & Members roster: loaded rows, everything derived from them and every write; the screen keeps only view state.
export function useTeam() {
  const { projectId } = useProject();
  const { can, userId: myUserId, refresh: refreshRbac } = useRbac();

  const canInvite = can("comms.team.invite");
  const canAssign = can("comms.team.assign");

  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  // What @geiger/rbac actually reads. The roster above is display; these are the
  // rows that decide access.
  const [grants, setGrants] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState("");

  const seatLimit = DEFAULT_SEAT_LIMIT;

  useEffect(() => {
    let alive = true;
    getUser().then((u) => {
      if (!alive) return;
      setUserId(u?.id || null);
      setUserName(u?.name || "");
    });
    (async () => {
      // Fills any missing system role from geiger-rbac.config.js; a no-op once
      // the project has them all.
      const rolesList = (await ensureSystemRoles(projectId, null)) ?? [];
      const defaultRole =
        rolesList.find((r) => r.key === "member") ||
        rolesList[rolesList.length - 1] ||
        null;
      // Project real org members into the overlay, then read the roster.
      await syncTeam(projectId, defaultRole?.id ?? null);
      const memberRows = await listMembers(projectId);
      if (!alive) return;
      setRoles(rolesList);
      setMembers(memberRows ?? []);
      setLoading(false);
    })();
    listGroups(projectId).then((rows) => alive && setGroups(rows ?? []));
    listActivity(projectId).then((rows) => alive && setActivity(rows ?? []));
    listGrants(projectId).then((rows) => alive && setGrants(rows ?? []));
    return () => {
      alive = false;
    };
  }, [projectId]);

  // --- Derived -------------------------------------------------------------

  const roleById = useMemo(() => {
    const map = {};
    roles.forEach((r) => (map[r.id] = r));
    return map;
  }, [roles]);

  // The active grant decides access; the roster's role_id is only a display fallback for an invitee with no account yet.
  const grantByUser = useMemo(() => {
    const map = {};
    for (const g of grants) {
      if (g.userId && g.status === "active" && !g.deletedAt) map[g.userId] = g;
    }
    return map;
  }, [grants]);

  const roleIdOf = useCallback(
    (member) =>
      (member.userId && grantByUser[member.userId]?.roleId) || member.roleId || null,
    [grantByUser],
  );

  // Owner is whichever role holds the wildcard. Demoting or removing the last
  // one would leave the workspace with nobody able to administer it.
  const ownerRoleIds = useMemo(
    () =>
      new Set(
        roles.filter((r) => (r.permissions || []).includes("*")).map((r) => r.id),
      ),
    [roles],
  );

  const ownerCount = useMemo(
    () =>
      Object.values(grantByUser).filter((g) => ownerRoleIds.has(g.roleId)).length,
    [grantByUser, ownerRoleIds],
  );

  const isLastOwner = useCallback(
    (member) => ownerRoleIds.has(roleIdOf(member)) && ownerCount <= 1,
    [ownerRoleIds, roleIdOf, ownerCount],
  );

  const groupById = useMemo(() => {
    const map = {};
    groups.forEach((g) => (map[g.id] = g));
    return map;
  }, [groups]);

  const memberCountByGroup = useMemo(() => {
    const map = {};
    members.forEach((m) =>
      (m.groupIds || []).forEach((id) => (map[id] = (map[id] || 0) + 1)),
    );
    return map;
  }, [members]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.status !== "invited"),
    [members],
  );
  const invites = useMemo(
    () => members.filter((m) => m.status === "invited"),
    [members],
  );

  const seatsUsed = members.filter((m) => m.status !== "suspended").length;
  const seatsFull = seatsUsed >= seatLimit;

  const stats = useMemo(
    () => [
      { label: "Active members", value: String(activeMembers.length) },
      { label: "Pending invites", value: String(invites.length) },
      { label: "Seats used", value: `${seatsUsed} / ${seatLimit}` },
      { label: "Groups", value: String(groups.length) },
    ],
    [activeMembers.length, invites.length, seatsUsed, seatLimit, groups.length],
  );

  // --- Mutations -----------------------------------------------------------

  const audit = (action, target, detail) =>
    logActivity({
      projectId,
      actorUserId: userId,
      actorName: userName,
      targetMemberId: target?.id ?? null,
      targetName: target?.name || target?.email || "",
      action,
      detail: detail ?? {},
    }).then((row) => row && setActivity((prev) => [row, ...prev]));

  const patchMember = (id, patch) =>
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  // The grant is what @geiger/rbac and RLS read; project_members follows only so an invitee without an account shows the right role.
  const changeRole = async (member, roleId) => {
    if (!canAssign) {
      toast.error("You don't have permission to assign roles.");
      return;
    }
    const prevRole = roleIdOf(member);
    if (prevRole === roleId) return;
    if (isLastOwner(member) && !ownerRoleIds.has(roleId)) {
      toast.error(
        "This is the workspace's last owner — give someone else the Owner role first.",
      );
      return;
    }

    patchMember(member.id, { roleId });
    const saved = await updateMember(member.id, { roleId });
    if (!saved) {
      patchMember(member.id, { roleId: prevRole });
      toast.error("Couldn't change the role.");
      return;
    }

    if (member.userId) {
      const granted = await setMemberRole({
        projectId,
        userId: member.userId,
        roleId,
        grantedBy: userId,
        currentGrants: grants,
      });
      if (granted) {
        setGrants((prev) => [
          ...prev.filter((g) => g.userId !== member.userId),
          granted,
        ]);
        // Changing your own role changes your own nav.
        if (member.userId === myUserId) refreshRbac();
      } else {
        patchMember(member.id, { roleId: prevRole });
        await updateMember(member.id, { roleId: prevRole });
        toast.error("Couldn't change their access — the role is unchanged.");
        return;
      }
    }
    audit("role_changed", member, { role: roleById[roleId]?.name });
  };

  // Every grant here is whole-workspace; grant.scope narrowing has no picker yet.

  const toggleSuspend = async (member) => {
    const next = member.status === "suspended" ? "active" : "suspended";
    patchMember(member.id, { status: next });
    const saved = await updateMember(member.id, { status: next });
    if (saved) {
      audit(next === "suspended" ? "suspended" : "status_changed", member, {
        status: next,
      });
    } else {
      patchMember(member.id, { status: member.status });
      toast.error("Couldn't update the member.");
    }
  };

  const setMemberGroups = async (member, groupIds) => {
    patchMember(member.id, { groupIds });
    const saved = await updateMember(member.id, { groupIds });
    if (saved) audit("group_changed", member);
    else {
      patchMember(member.id, { groupIds: member.groupIds });
      toast.error("Couldn't update groups.");
    }
  };

  // Resolves true once the member is gone, so the caller can close whatever was
  // showing them.
  const removeMember = async (member) => {
    if (isLastOwner(member)) {
      toast.error(
        "This is the workspace's last owner — give someone else the Owner role first.",
      );
      return false;
    }
    setMembers((prev) => prev.filter((m) => m.id !== member.id));

    // Revoking the grant removes access (and stops the join bootstrap re-granting it); the roster row alone would not.
    const grant = member.userId ? grantByUser[member.userId] : null;
    if (grant) {
      if (await revokeGrant(grant.id)) {
        setGrants((prev) => prev.filter((g) => g.id !== grant.id));
      } else {
        setMembers((prev) => [...prev, member]);
        toast.error("Couldn't revoke their access — nothing was removed.");
        return false;
      }
    }

    const ok = await softDeleteMember(member.id);
    if (ok) {
      audit("removed", member);
      toast.success("Member removed");
      return true;
    }
    setMembers((prev) => [...prev, member]);
    toast.error("Couldn't remove the member.");
    return false;
  };

  // Split from inviteMembers so the caller can close the dialog only once the
  // input is known good — and keep it open, with the typed emails, when it isn't.
  const parseInviteList = (emails) => {
    const list = emails
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!list.length) {
      toast.error("Enter at least one email.");
      return null;
    }
    if (seatsUsed + list.length > seatLimit) {
      toast.error("Not enough seats for that many invites.");
      return null;
    }
    return list;
  };

  // The server writes each roster row, the org invite, the email and the audit row; placeholders show until it answers.
  // Resolves to the invitations it created but couldn't email, so the caller can hand out their links.
  const inviteMembers = async (list, roleId, groupId, message) => {
    const placeholders = list.map((email) => ({
      id: crypto.randomUUID(),
      projectId,
      userId: null,
      roleId,
      status: "invited",
      email,
      name: "",
      avatarUrl: "",
      groupIds: groupId && groupId !== "none" ? [groupId] : [],
      invitedBy: userId,
      invitedAt: new Date().toISOString(),
      message,
    }));
    const placeholderIds = new Set(placeholders.map((m) => m.id));
    setMembers((prev) => [...prev, ...placeholders]);

    const res = await sendInvitations({ projectId, emails: list, roleId, groupId, message });
    const results = res.ok ? res.results || [] : [];
    const created = results.filter((r) => r.member);
    setMembers((prev) => [
      ...prev.filter((m) => !placeholderIds.has(m.id)),
      ...created.map((r) => r.member),
    ]);
    if (!res.ok) {
      toast.error("Couldn't send the invitations.", { description: inviteError(res.error) });
      return [];
    }
    if (created.length) listActivity(projectId).then((rows) => rows && setActivity(rows));

    const emailed = created.filter((r) => r.emailed);
    const failed = results.filter((r) => r.error);
    if (emailed.length) {
      toast.success(
        emailed.length === 1
          ? `Invitation emailed to ${emailed[0].email}`
          : `${emailed.length} invitations emailed`,
      );
    }
    if (failed.length) {
      toast.error(
        failed.length === 1 ? `Couldn't invite ${failed[0].email}` : `${failed.length} invitations failed`,
        {
          description:
            failed.length === 1
              ? inviteError(failed[0].error)
              : failed.map((r) => `${r.email}: ${inviteError(r.error)}`).join(" "),
        },
      );
    }
    return created
      .filter((r) => !r.emailed)
      .map((r) => ({ email: r.email, inviteUrl: r.inviteUrl, emailError: r.emailError }));
  };

  // Resolves to { email, inviteUrl, emailError } when it couldn't be emailed, so the caller can show the link.
  const resendInvite = async (member) => {
    const res = await resendInvitation(member.id);
    if (!res.ok) {
      toast.error("Couldn't resend the invitation.", { description: inviteError(res.error) });
      return null;
    }
    if (res.member) setMembers((prev) => prev.map((m) => (m.id === member.id ? res.member : m)));
    if (res.emailed) {
      toast.success(`Invitation emailed to ${member.email}`);
      return null;
    }
    return { email: member.email, inviteUrl: res.inviteUrl, emailError: res.emailError };
  };

  // The accept link alone, for sharing some other way; nothing is sent.
  const inviteLinkFor = async (member) => {
    const res = await getInvitationLink(member.id);
    if (!res.ok || !res.inviteUrl) {
      toast.error("Couldn't get the invite link.", { description: inviteError(res.error) });
      return null;
    }
    return { email: member.email, inviteUrl: res.inviteUrl };
  };

  const revokeInvite = async (member) => {
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    const res = await revokeInvitation(member.id);
    if (!res.ok) {
      setMembers((prev) => [...prev, member]);
      toast.error("Couldn't revoke the invite.", { description: inviteError(res.error) });
      return;
    }
    const description = {
      shared: "The emailed link still works, because another project in this organization has invited them too.",
      failed: "The emailed link may still work — the organization invite couldn't be withdrawn.",
    }[res.link];
    toast.success("Invitation revoked", description ? { description } : undefined);
  };

  const addGroup = async (name, description) => {
    const id = crypto.randomUUID();
    const optimistic = {
      id,
      projectId,
      name: name.trim(),
      description,
      createdBy: userId,
    };
    setGroups((prev) => [...prev, optimistic]);
    const saved = await createGroup(optimistic);
    if (saved) {
      setGroups((prev) => prev.map((g) => (g.id === id ? saved : g)));
      audit("group_created", { name: optimistic.name });
      toast.success("Group created");
    } else {
      setGroups((prev) => prev.filter((g) => g.id !== id));
      toast.error("Couldn't create the group.");
    }
  };

  // Display name only — the email and account identity come from the org record.
  const renameMember = async (member, name) => {
    patchMember(member.id, { name });
    const saved = await updateMember(member.id, { name });
    if (saved) return true;
    patchMember(member.id, { name: member.name });
    toast.error("Couldn't save the name.");
    return false;
  };

  const editGroup = async (group, patch) => {
    setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, ...patch } : g)));
    const saved = await updateGroup(group.id, patch);
    if (saved) {
      setGroups((prev) => prev.map((g) => (g.id === group.id ? saved : g)));
      toast.success("Group updated");
      return;
    }
    setGroups((prev) => prev.map((g) => (g.id === group.id ? group : g)));
    toast.error("Couldn't update the group.");
  };

  // Members keep the stale id in group_ids; the chips skip ids with no group.
  const deleteGroup = async (group) => {
    setGroups((prev) => prev.filter((g) => g.id !== group.id));
    const ok = await softDeleteGroup(group.id);
    if (!ok) {
      setGroups((prev) => [...prev, group]);
      toast.error("Couldn't delete the group.");
      return;
    }
    toast.success("Group deleted");
  };

  return {
    loading,
    canInvite,
    canAssign,
    // rows
    members,
    roles,
    groups,
    activity,
    // derived
    roleById,
    roleIdOf,
    grantByUser,
    groupById,
    memberCountByGroup,
    activeMembers,
    invites,
    isLastOwner,
    seatLimit,
    seatsUsed,
    seatsFull,
    stats,
    // mutations
    changeRole,
    setMemberGroups,
    toggleSuspend,
    removeMember,
    renameMember,
    parseInviteList,
    inviteMembers,
    resendInvite,
    inviteLinkFor,
    revokeInvite,
    addGroup,
    editGroup,
    deleteGroup,
  };
}

export default useTeam;
