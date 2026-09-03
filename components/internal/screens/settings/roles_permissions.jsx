"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Plus } from "lucide-react";

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader, StatsBar } from "@/components/internal/shared/screen_kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Tabs, TabsList, TabsTrigger } from "@geiger/ui";
import { ALL_PERMISSION_KEYS } from "@/lib/rbac";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { ROLE_TABS } from "./constants";
import { Notice } from "./roles/notice";
import { RolesTab } from "./roles/roles_tab";
import { MatrixTab } from "./roles/matrix_tab";
import { RoleDrawer } from "./roles/role_drawer";
import { RoleDetailScreen } from "./roles/role_detail";
import { EMPTY_ROLE_DRAFT, RoleDialog } from "./roles/role_dialog";
import { useRoles } from "./roles/use_roles";

export function RolesPermissionsScreen() {
  const {
    canManage,
    roles,
    members,
    loading,
    memberCountByRole,
    stats,
    togglePermission,
    toggleGroup,
    saveRole,
    duplicateRole,
    deleteRole,
    goToTeam,
  } = useRoles();

  // Two surfaces, deliberately: a row click opens the drawer for a quick look
  // (view state, kept local), while the action menu's Edit opens the full-page
  // editor — which is deep-linkable, so it lives in the URL as ?role=<id>.
  const [recordId, setRecordId] = useState(null);
  const openRecord = setRecordId;
  const closeRecord = () => setRecordId(null);
  const { roleId, openRole, closeRole } = useWorkspaceUrl();

  const [tab, setTab] = useState("roles");
  // The roles list filters on its own terms; the permission catalog has its own
  // query, shared by the matrix and the drawer so a search survives the hop.
  const [roleSearch, setRoleSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [permQuery, setPermQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");

  // One dialog serves create + edit; `editing` holds the role being edited.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(EMPTY_ROLE_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const openedRole = useMemo(
    () => (recordId ? roles.find((r) => r.id === recordId) || null : null),
    [roles, recordId],
  );

  const editedRole = useMemo(
    () => (roleId ? roles.find((r) => r.id === roleId) || null : null),
    [roles, roleId],
  );

  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return roles.filter((r) => {
      if (typeFilter === "system" && !r.isSystem) return false;
      if (typeFilter === "custom" && r.isSystem) return false;
      if (q && !`${r.name} ${r.description || ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [roles, roleSearch, typeFilter]);

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_ROLE_DRAFT);
    setDialogOpen(true);
  };

  const openEdit = (role) => {
    setEditing(role);
    setDraft({ name: role.name, description: role.description, cloneFrom: "none" });
    setDialogOpen(true);
  };

  const submitDialog = () => {
    if (!draft.name.trim()) {
      toast.error("Give the role a name.");
      return;
    }
    const isCreate = !editing;
    saveRole(editing, draft, { onOptimistic: isCreate ? openRecord : undefined });
    setDialogOpen(false);
  };

  const handleDuplicate = (role) => {
    duplicateRole(role, { onOptimistic: openRecord });
  };

  const confirmDelete = async () => {
    const role = deleteTarget;
    setDeleteTarget(null);
    if (!role) return;
    if (recordId === role.id) closeRecord();
    if (roleId === role.id) closeRole();
    await deleteRole(role);
  };

  // Name/description edits from the full editor go through the same write the
  // rename dialog uses, so the list and the drawer see them straight away.
  const saveDetails = (role, draft) =>
    saveRole(role, { ...draft, cloneFrom: "none" });

  const createAction = canManage ? (
    <Button onClick={openCreate} className="bg-primary text-primary-foreground">
      <Plus className="h-4 w-4" /> Create role
    </Button>
  ) : null;

  // Lives outside the list/editor branch so the editor's danger zone gets the
  // same confirmation the row action does.
  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete role</DialogTitle>
          <DialogDescription>
            {deleteTarget
              ? `Remove “${deleteTarget.name}”? Anyone holding it loses the access it granted.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={confirmDelete}
          >
            Delete role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (editedRole) {
    return (
      <>
        <RoleDetailScreen
          role={editedRole}
          canManage={canManage}
          memberCount={memberCountByRole[editedRole.id] || 0}
          members={members}
          query={permQuery}
          setQuery={setPermQuery}
          onBack={closeRole}
          onToggle={togglePermission}
          onToggleGroup={toggleGroup}
          onSaveDetails={saveDetails}
          onDuplicate={handleDuplicate}
          onDelete={setDeleteTarget}
          onViewMembers={goToTeam}
        />
        {deleteDialog}
      </>
    );
  }

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Roles & Permissions"
        description="Define roles and control what each can access across the workspace."
        actions={createAction}
      />

      <StatsBar stats={stats} />

      {!canManage ? (
        <Notice icon={Lock}>
          You can see how access is set up here, but only someone with
          <span className="text-foreground"> Create and edit roles </span>
          can change it.
        </Notice>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="border-b border-border">
          {ROLE_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
              <span className="ml-1.5 text-xs text-text-tertiary">
                {t.key === "roles" ? roles.length : ALL_PERMISSION_KEYS.length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-6 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading roles…
        </div>
      ) : tab === "roles" ? (
        <RolesTab
          roles={filteredRoles}
          total={roles.length}
          counts={memberCountByRole}
          canManage={canManage}
          search={roleSearch}
          setSearch={setRoleSearch}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          onOpen={(r) => openRecord(r.id)}
          onOpenEditor={(r) => openRole(r.id)}
          onEdit={openEdit}
          onDuplicate={handleDuplicate}
          onDelete={setDeleteTarget}
          onViewMembers={goToTeam}
          onCreate={openCreate}
        />
      ) : (
        <MatrixTab
          roles={roles}
          canManage={canManage}
          query={permQuery}
          setQuery={setPermQuery}
          groupFilter={groupFilter}
          setGroupFilter={setGroupFilter}
          onToggle={togglePermission}
          onOpenRole={(r) => openRecord(r.id)}
          onCreate={openCreate}
        />
      )}

      <RoleDrawer
        role={openedRole}
        canManage={canManage}
        memberCount={openedRole ? memberCountByRole[openedRole.id] || 0 : 0}
        query={permQuery}
        setQuery={setPermQuery}
        onOpenChange={(o) => !o && closeRecord()}
        onToggle={togglePermission}
        onToggleGroup={toggleGroup}
        onEdit={openEdit}
        onDuplicate={handleDuplicate}
        onDelete={setDeleteTarget}
        onViewMembers={goToTeam}
        onOpenEditor={(r) => openRole(r.id)}
      />

      <RoleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        draft={draft}
        setDraft={setDraft}
        roles={roles}
        onSubmit={submitDialog}
      />

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default RolesPermissionsScreen;
