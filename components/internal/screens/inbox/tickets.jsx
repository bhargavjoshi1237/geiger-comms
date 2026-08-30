"use client";

// Tickets — DataTable over comms.tickets with type / state / assignee filters
// and search (spec §6). Row click opens the linked conversation when there is
// one; a tracker ticket opens a detail showing all linked conversations.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@geiger/ui";
import { MessagesSquare, Ticket as TicketIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "../overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  listLinkedConversationIds,
  listTickets,
  softDeleteTicket,
  updateTicket,
  TICKET_STATES,
} from "@/lib/supabase/tickets";
import {
  TICKET_STATE_MAP,
  TICKET_STATE_OPTIONS,
  TICKET_TYPE_MAP,
  TICKET_TYPE_OPTIONS,
} from "./constants";

export function TicketsScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { openConversationInTab } = useWorkspaceUrl();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [detail, setDetail] = useState(null); // ticket whose links we show
  const [linkedIds, setLinkedIds] = useState([]);

  useEffect(() => {
    let alive = true;
    listTickets({ projectId }).then((rows) => {
      if (!alive) return;
      setTickets(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    let rows = tickets;
    if (typeFilter !== "all") rows = rows.filter((t) => t.type === typeFilter);
    if (stateFilter !== "all") rows = rows.filter((t) => t.state === stateFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [tickets, typeFilter, stateFilter, search]);

  async function advanceState(ticket, state) {
    const previous = tickets;
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, state } : t)));
    const saved = await updateTicket(ticket.id, { state });
    if (!saved) {
      setTickets(previous);
      toast.error("Couldn't update the ticket.");
      return;
    }
    toast.success(`Moved to ${TICKET_STATE_MAP[state]?.label ?? state}`);
  }

  async function remove(ticket) {
    const previous = tickets;
    setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
    const ok = await softDeleteTicket(ticket.id);
    if (!ok) {
      setTickets(previous);
      toast.error("Couldn't delete the ticket.");
      return;
    }
    toast.success("Ticket deleted");
  }

  function openTicket(ticket) {
    if (ticket.type === "tracker") {
      void showTrackerDetail(ticket);
      return;
    }
    if (!ticket.conversationId) {
      toast.error("This ticket has no linked conversation.");
      return;
    }
    // Land on the linked thread in All Conversations in one navigation.
    openConversationInTab(ticket.conversationId, "All Conversations");
  }

  async function showTrackerDetail(ticket) {
    setDetail(ticket);
    setLinkedIds(await listLinkedConversationIds(ticket.id));
  }

  const columns = [
    {
      key: "title",
      header: "Ticket",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <TicketIcon className="h-4 w-4 shrink-0 text-text-tertiary" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.title}</p>
            {row.description ? (
              <p className="truncate text-xs text-text-secondary">{row.description}</p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => <StatusPill status={row.type} map={TICKET_TYPE_MAP} />,
    },
    {
      key: "state",
      header: "State",
      render: (row) => <StatusPill status={row.state} map={TICKET_STATE_MAP} />,
    },
    {
      key: "updated",
      header: "Updated",
      render: (row) =>
        row.updatedAt
          ? new Date(row.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "—",
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12",
      render: (row) => (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`${row.title} actions`}>
                ⋯
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-surface-subtle">
              {(TICKET_STATES.filter((s) => s !== row.state)).map((state) => (
                <DropdownMenuItem key={state} className="text-xs" onClick={() => void advanceState(row, state)}>
                  Move to {TICKET_STATE_MAP[state]?.label ?? state}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem variant="destructive" className="text-xs" onClick={() => void remove(row)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Tickets"
        description="Customer, back-office and tracker tickets — a type filter over one queue, not three screens."
      />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={[{ value: "all", label: "All types" }, ...TICKET_TYPE_OPTIONS]}
            placeholder="All types"
          />
          <FilterDropdown
            value={stateFilter}
            onValueChange={setStateFilter}
            options={[{ value: "all", label: "All states" }, ...TICKET_STATE_OPTIONS]}
            placeholder="All states"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search tickets…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="space-y-2 rounded-xl border border-border bg-surface-subtle p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md border border-border bg-surface-card" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(row) => row.id}
          onRowClick={openTicket}
          empty={
            <EmptyState
              icon={MessagesSquare}
              title={
                filtered.length === 0 && tickets.length > 0
                  ? "No tickets match these filters"
                  : "No tickets yet"
              }
              description={
                filtered.length === 0 && tickets.length > 0
                  ? "Try clearing the type or state filter."
                  : "Create one from any conversation's thread menu."
              }
              className="rounded-xl border border-border bg-surface-subtle"
            />
          }
        />
      )}

      {/* Tracker detail: every conversation reporting this one bug. */}
      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>
              A tracker ticket spans many customer conversations — everyone
              reporting this issue links back to here.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border rounded-lg border border-border bg-surface-subtle">
            {linkedIds.length === 0 ? (
              <p className="px-3 py-4 text-sm text-text-secondary">No linked conversations yet.</p>
            ) : (
              linkedIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setDetail(null);
                    openConversationInTab(id, "All Conversations");
                  }}
                  className="block w-full truncate px-3 py-2.5 text-left text-sm text-text-secondary transition-colors first:rounded-t-lg hover:bg-surface-hover hover:text-foreground last:rounded-b-lg"
                >
                  <span className="font-mono text-xs text-text-tertiary">{id.slice(0, 8)}</span>{" "}
                  Open linked conversation
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </MainScreenWrapper>
  );
}

export default TicketsScreen;
