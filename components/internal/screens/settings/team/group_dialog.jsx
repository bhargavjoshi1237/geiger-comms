"use client";

import { useState } from "react";

import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui";
import { Input } from "@geiger/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui";

export default function GroupDialog({ open, onOpenChange, onSubmit }) {
  // Keyed by `open` in the parent, so it mounts fresh (form resets) each open.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Group</DialogTitle>
          <DialogDescription>Group members into a sub-team.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Check-in staff"
            />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this group is for"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground"
            onClick={() => onSubmit(name, description)}
          >
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
