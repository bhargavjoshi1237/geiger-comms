"use client";

// Merge a duplicate into another conversation (closed, linked, noted); lists the contact's other threads until you search the inbox.

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  LogoLoading,
} from "@geiger/ui";
import { Loader2, Search } from "lucide-react";
import { listContactConversations, listConversations } from "@/lib/supabase/comms";
import { cn } from "@/lib/utils";
import { CONVERSATION_STATUS_MAP, contactLabel, defaultFilter, formatWhen } from "./constants";

const SEARCH_DEBOUNCE_MS = 250;

export function MergeDialog({ conversation, projectId, teammateId, onCancel, onMerge }) {
  return (
    <Dialog open={Boolean(conversation)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        {conversation ? (
          <MergePicker
            key={conversation.id}
            conversation={conversation}
            projectId={projectId}
            teammateId={teammateId}
            onCancel={onCancel}
            onMerge={onMerge}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MergePicker({ conversation, projectId, teammateId, onCancel, onMerge }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ key: null, rows: [], failed: false });
  const [targetId, setTargetId] = useState(null);
  const [merging, setMerging] = useState(false);
  const q = query.trim();
  const contactId = conversation.contactId;

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(
      () => {
        const request = q
          ? listConversations({ projectId, filter: { ...defaultFilter(), search: q, teammateId }, limit: 20 })
          : contactId
            ? listContactConversations(contactId, { projectId })
            : Promise.resolve([]);
        request.then((rows) => {
          if (alive) setResults({ key: q, rows: rows ?? [], failed: rows === null });
        });
      },
      q ? SEARCH_DEBOUNCE_MS : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, projectId, teammateId, contactId]);

  const loading = results.key !== q;
  const candidates = results.rows.filter((r) => r.id !== conversation.id && !r.mergedIntoId);
  const target = candidates.find((r) => r.id === targetId) ?? null;
  const subject = conversation.subject || `Conversation with ${contactLabel(conversation)}`;

  async function merge() {
    if (!target || merging) return;
    setMerging(true);
    const ok = await onMerge?.(target);
    if (!ok) setMerging(false);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Merge conversation</DialogTitle>
        <DialogDescription>
          “{subject}” will be closed and linked to the conversation you pick. Both threads get a note; messages stay where
          they are.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations, messages and people"
            aria-label="Search for the conversation to merge into"
            className="h-9 border-border bg-surface-card pl-8"
            autoFocus
          />
        </div>

        <p className="text-xs font-medium text-muted-foreground">
          {q ? "Matching conversations" : `Other conversations with ${contactLabel(conversation)}`}
        </p>

        <div className="max-h-72 min-h-[120px] overflow-y-auto rounded-md border border-border" role="radiogroup" aria-label="Merge into">
          {loading ? (
            <div className="flex h-[120px] items-center justify-center">
              <LogoLoading size={32} />
            </div>
          ) : results.failed ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Couldn&apos;t load conversations.</p>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {q ? "No conversations match." : "No other conversations with this contact. Search to find one."}
            </p>
          ) : (
            candidates.map((row) => {
              const selected = row.id === targetId;
              const status = CONVERSATION_STATUS_MAP[row.status] || CONVERSATION_STATUS_MAP.Open;
              return (
                <button
                  key={row.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTargetId(row.id)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border px-3 py-2.5 text-left transition-colors last:border-b-0",
                    selected ? "bg-surface-active" : "hover:bg-surface-hover",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {row.subject || `Conversation with ${contactLabel(row)}`}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatWhen(row.lastMessageAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn("size-1.5 shrink-0 rounded-full", status.dotClass)} />
                      <span className="shrink-0">{status.label}</span>
                      <span className="truncate">· {contactLabel(row)}</span>
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="bg-primary" disabled={!target || merging} onClick={() => void merge()}>
          {merging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Merge
        </Button>
      </DialogFooter>
    </>
  );
}

export default MergeDialog;
