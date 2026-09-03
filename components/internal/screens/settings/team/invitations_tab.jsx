"use client";

import { useMemo, useState } from "react";
import { Clock, Send, Trash2, UserPlus } from "lucide-react";

import {
  DataTable,
  EmptyState,
  SearchInput,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
import { ActionMenu, Avatar, AvatarFallback, Button } from "@geiger/ui";
import FilterDropdown from "@/components/internal/screens/overview/filter_dropdown";
import { MEMBER_STATUS_MAP, formatRelativeTime, initialsOf } from "../constants";

export default function InvitationsTab({
  invites,
  roles,
  roleById,
  onResend,
  onRevoke,
  onInvite,
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const roleFilterOptions = [
    { value: "all", label: "All Roles" },
    ...roles.map((r) => ({ value: r.id, label: r.name })),
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invites.filter((m) => {
      if (roleFilter !== "all" && m.roleId !== roleFilter) return false;
      if (q && !m.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [invites, search, roleFilter]);

  const pager = usePagination(filtered, { resetKey: `${search}|${roleFilter}` });

  const columns = [
    {
      key: "invitee",
      header: "Invitee",
      render: (m) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-surface-card text-xs text-text-secondary">
              {initialsOf("", m.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{m.email}</p>
            <p className="truncate text-xs text-text-tertiary">
              {m.message || "No message"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (m) => (
        <span className="text-sm text-foreground">
          {roleById[m.roleId]?.name || "No role"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (m) => <StatusPill status={m.status} map={MEMBER_STATUS_MAP} />,
    },
    {
      key: "invited",
      header: "Invited",
      render: (m) => (
        <span className="text-xs text-text-secondary">
          {formatRelativeTime(m.invitedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (m) => (
        <div className="flex justify-end">
          <ActionMenu
            label={`Actions for ${m.email}`}
            items={[
              { icon: Send, label: "Resend", onSelect: () => onResend(m) },
              { separator: true },
              {
                icon: Trash2,
                label: "Revoke",
                variant: "destructive",
                onSelect: () => onRevoke(m),
              },
            ]}
          />
        </div>
      ),
    },
  ];

  const inviteButton = (
    <Button onClick={onInvite} className="bg-primary text-primary-foreground">
      <UserPlus className="h-4 w-4" /> Invite people
    </Button>
  );

  return (
    <div className="space-y-4">
      <Toolbar>
        <FilterDropdown
          value={roleFilter}
          onValueChange={setRoleFilter}
          options={roleFilterOptions}
          placeholder="All Roles"
          height="h-9"
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search invitations…"
        />
      </Toolbar>

      <DataTable
        columns={columns}
        data={pager.pageItems}
        getRowKey={(m) => m.id}
        empty={
          <div className="rounded-xl border border-border bg-surface-subtle">
            {invites.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No pending invitations"
                description="Invited people who haven't joined yet appear here."
                action={inviteButton}
              />
            ) : (
              <EmptyState
                icon={Clock}
                title="No matching invitations"
                description="Try clearing the search or role filter."
              />
            )}
          </div>
        }
      />

      <ListPagination {...pager} itemLabel="invitations" />
    </div>
  );
}
