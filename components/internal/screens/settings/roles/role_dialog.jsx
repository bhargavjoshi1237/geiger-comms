"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";

export const EMPTY_ROLE_DRAFT = {
  name: "",
  description: "",
  cloneFrom: "none",
};

export function RoleDialog({ open, onOpenChange, editing, draft, setDraft, roles, onSubmit }) {
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit role" : "Create role"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this role's details. Permissions are edited in the role's panel."
              : "Name the role and optionally start from an existing one."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="role-name">
            <Input
              id="role-name"
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder="e.g. Event Coordinator"
            />
          </Field>
          <Field label="Description" htmlFor="role-desc">
            <Textarea
              id="role-desc"
              value={draft.description}
              onChange={(e) => set("description")(e.target.value)}
              placeholder="What this role is for"
              rows={2}
            />
          </Field>
          {!editing ? (
            <Field
              label="Start from"
              hint="Copies that role's permissions as a starting point."
            >
              <Select value={draft.cloneFrom} onValueChange={set("cloneFrom")}>
                <SelectTrigger>
                  <SelectValue placeholder="Blank" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Blank (no permissions)</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Copy from {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground" onClick={onSubmit}>
            {editing ? "Save Changes" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
