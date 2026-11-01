"use client";

// Publish article (KB spec §9.4): the first publish of an unplaced source picks a help center and collection,
// or publishes unlisted (Intercom's "Publish as unlisted"). Closes only once the write succeeds.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { DEFAULT_CENTER_NAME } from "@/lib/supabase/help_centers";
import { collectionTree } from "./constants";

const UNLISTED = "__unlisted__";
const NEW_CENTER = "__new__";
const UNASSIGNED = "__unassigned__";

function initialCenter(centers, defaultCenter) {
  if (!centers.length) return NEW_CENTER;
  return defaultCenter?.id ?? centers[0].id;
}

export function PublishDialog({ open, onOpenChange, centers, collections, defaultCenter, count = 1, onConfirm }) {
  const [centerId, setCenterId] = useState(() => initialCenter(centers, defaultCenter));
  const [collectionId, setCollectionId] = useState(UNASSIGNED);
  const [busy, setBusy] = useState(false);

  const unlisted = centerId === UNLISTED;
  const creating = centerId === NEW_CENTER;
  const chosen = centers.find((c) => c.id === centerId) ?? null;
  const tree = chosen ? collectionTree(collections, chosen.id) : [];

  function close(next) {
    if (busy) return;
    onOpenChange(next);
  }

  function pickCenter(value) {
    setCenterId(value);
    setCollectionId(UNASSIGNED);
  }

  async function confirm() {
    setBusy(true);
    const ok = await onConfirm({
      centerId: chosen?.id ?? null,
      collectionId: collectionId === UNASSIGNED ? null : collectionId,
      unlisted,
      createDefault: creating,
    });
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  let note = "Published articles in your default help center appear in the Messenger's Help space.";
  if (unlisted) note = "Not listed in the Help space. AI answers can still use it, without a link.";
  else if (chosen && !chosen.isDefault) {
    note = "This help center isn't the Messenger's, so the article won't show in the Help space.";
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{count > 1 ? `Publish ${count} articles` : "Publish article"}</DialogTitle>
          <DialogDescription>{note}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field label="Help center">
            <Select value={centerId} onValueChange={pickCenter} disabled={busy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {centers.length ? (
                  centers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name || "Untitled help center"}
                      {c.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={NEW_CENTER}>{DEFAULT_CENTER_NAME} (new default)</SelectItem>
                )}
                <SelectSeparator />
                <SelectItem value={UNLISTED}>Don&apos;t add to a help center (unlisted)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {creating ? (
            <p className="text-sm text-text-secondary">
              We&apos;ll create <span className="font-medium text-foreground">{DEFAULT_CENTER_NAME}</span> as your
              default.
            </p>
          ) : null}

          {chosen ? (
            <Field label="Collection" hint="Optional — articles without one are listed under Unassigned.">
              <Select value={collectionId} onValueChange={setCollectionId} disabled={busy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {tree.map(({ collection, depth }) => (
                    <SelectItem key={collection.id} value={collection.id}>
                      <span style={{ paddingLeft: `${(depth - 1) * 12}px` }}>
                        {collection.name || "Untitled collection"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {unlisted ? "Publish unlisted" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PublishDialog;
