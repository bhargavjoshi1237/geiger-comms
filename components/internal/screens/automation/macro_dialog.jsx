"use client";

// Create-only macro dialog plus the reply-body field (textarea + insert-at-cursor variable chips) the editor reuses.

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Notice } from "@/components/internal/shared/notice";
import { MACRO_SCOPE_MAP, MACRO_VARIABLES, NEEDS_MANAGE_MACROS } from "./constants";

export const MACRO_SCOPE_OPTIONS = [
  { value: "team", label: MACRO_SCOPE_MAP.team.label, hint: "Every teammate in this workspace can use it." },
  { value: "personal", label: MACRO_SCOPE_MAP.personal.label, hint: "Only you can see and use it." },
];

// Reply textarea with chips that drop a {{token}} at the cursor (or replace the selection).
export function MacroBodyField({ id, value, onChange, rows = 6, placeholder, disabled }) {
  const ref = useRef(null);

  function insert(token) {
    const el = ref.current;
    const text = value || "";
    const start = el ? el.selectionStart : text.length;
    const end = el ? el.selectionEnd : text.length;
    onChange(text.slice(0, start) + token + text.slice(end));
    // Restore focus with the caret just after the inserted token once React has re-rendered.
    requestAnimationFrame(() => {
      if (!ref.current) return;
      const caret = start + token.length;
      ref.current.focus();
      ref.current.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Hi {{contact.name}} — thanks for reaching out…"}
        rows={rows}
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-text-tertiary">Insert</span>
        {MACRO_VARIABLES.map((v) => (
          <button
            key={v.token}
            type="button"
            disabled={disabled}
            onClick={() => insert(v.token)}
            className="rounded-md border border-border bg-surface-card px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Without `canShare` (comms.settings.manage) a new macro can only be private to its creator.
export function MacroDialog({ open, canShare = true, onCancel, onCreate }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState("team");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const scope = canShare ? picked : "personal";

  function reset() {
    setName("");
    setPicked("team");
    setBody("");
  }

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const created = await onCreate({ name, scope, body });
    setBusy(false);
    if (created) {
      reset();
      onCancel();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        reset();
        onCancel();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New macro</DialogTitle>
          <DialogDescription>
            A saved reply your team can reuse. Add actions like assigning or closing in the editor.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {canShare ? null : <Notice>New macros are private to you. {NEEDS_MANAGE_MACROS}</Notice>}
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Name" htmlFor="macro-dialog-name">
              <Input
                id="macro-dialog-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Refund approved"
                autoFocus
              />
            </Field>
            <Field label="Available to" htmlFor="macro-dialog-scope">
              <Select value={scope} onValueChange={setPicked}>
                <SelectTrigger id="macro-dialog-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MACRO_SCOPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} disabled={o.value === "team" && !canShare}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field
            label="Reply"
            htmlFor="macro-dialog-body"
            hint="Variables fill in from the conversation the macro is used on."
          >
            <MacroBodyField id="macro-dialog-body" value={body} onChange={setBody} rows={5} />
          </Field>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset();
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!name.trim() || busy}
            onClick={() => void submit()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create macro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default MacroDialog;
