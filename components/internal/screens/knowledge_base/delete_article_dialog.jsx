"use client";

// The one article delete confirmation (KB spec §9.1), shared by the row menu, the bulk bar and the editor.
// target: { kind: "source" | "translation", article, sourceTitle, translationCount } | { kind: "bulk", count }

import { Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui";
import { localeLabel, plural } from "./constants";

function Emphasis({ children }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function sourceConsequence(count, published) {
  const translations = count === 1 ? "Its translation is" : `Its ${count} translations are`;
  if (count && published) return ` ${translations} deleted too, and it's removed from the Messenger.`;
  if (count) return ` ${translations} deleted too.`;
  return published ? " It's removed from the Messenger." : "";
}

export function DeleteArticleDialog({ target, onOpenChange, onConfirm }) {
  const kind = target?.kind;
  const title = target?.article?.title || "Untitled article";

  let heading = "Delete article";
  let body = null;
  if (kind === "bulk") {
    heading = "Delete articles";
    body = <>Delete {plural(target.count, "article")}? Their translations are deleted too.</>;
  } else if (kind === "translation") {
    heading = "Delete translation";
    body = (
      <>
        Delete the <Emphasis>{localeLabel(target.article.locale)}</Emphasis> translation of{" "}
        <Emphasis>{target.sourceTitle || "Untitled article"}</Emphasis>? The other languages are kept.
      </>
    );
  } else if (kind === "source") {
    body = (
      <>
        Delete <Emphasis>{title}</Emphasis>?
        {sourceConsequence(target.translationCount, target.article.state === "published")}
      </>
    );
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(target)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteArticleDialog;
