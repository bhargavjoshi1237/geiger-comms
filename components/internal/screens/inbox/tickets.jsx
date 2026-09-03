"use client";

// Tickets — one queue over comms.tickets with type / state filters and search
// (spec §6). Follows the suite list pattern: header + create, KPI bar, toolbar
// filters, a DataTable and pagination. Selecting a row opens the ticket in the
// URL (?ticket=<id>) and swaps to the full-page editor.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  MessagesSquare,
  Pencil,
  Plus,
  RotateCcw,
  Ticket as TicketIcon,
  Trash2,
} from "lucide-react";
import {
  ActionMenu,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "../overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  createTicket,
  listTickets,
  softDeleteTicket,
  updateTicket,
} from "@/lib/supabase/tickets";
import { getUser } from "@/lib/supabase/user";
import {
  TICKET_STATE_FILTER_OPTIONS,
  TICKET_STATE_MAP,
  TICKET_TYPE_FILTER_OPTIONS,
  TICKET_TYPE_MAP,
  ageInDays,
  formatDate,
} from "./constants";
import { TicketDialog } from "./ticket_dialog";
import { TicketDetailScreen } from "./ticket_detail";

export function TicketsScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { ticketId, openTicket, closeTicket, openConversationInTab } =
    useWorkspaceUrl();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  const selected = useMemo(
    () => (ticketId ? tickets.find((t) => t.id === ticketId) || null : null),
    [ticketId, tickets],
  );

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

  const pager = usePagination(filtered, {
    resetKey: `${search}|${typeFilter}|${stateFilter}`,
  });

  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.state !== "resolved");
    const inProgress = tickets.filter((t) => t.state === "in_progress").length;
    const resolved = tickets.filter((t) => t.state === "resolved").length;
    const ages = open.map((t) => ageInDays(t.createdAt)).filter((d) => d != null);
    const avgAge = ages.length
      ? Math.round(ages.reduce((sum, d) => sum + d, 0) / ages.length)
      : 0;
    return [
      {
        label: "Open",
        value: String(open.length),
        footer: `${tickets.length} tickets in total`,
      },
      {
        label: "In progress",
        value: String(inProgress),
        footer: "Actively being worked on",
      },
      {
        label: "Resolved",
        value: String(resolved),
        footer: tickets.length
          ? `${Math.round((resolved / tickets.length) * 100)}% of the queue`
          : "Nothing resolved yet",
      },
      {
        label: "Avg age",
        value: `${avgAge}d`,
        footer: "Across open tickets",
      },
    ];
  }, [tickets]);

  // The dialog is create-only; editing happens in the full-page editor.
  async function handleCreate({ conversation, type, title, description }) {
    const optimisticId = crypto.randomUUID();
    const user = await getUser();
    const now = new Date().toISOString();
    const optimistic = {
      id: optimisticId,
      conversationId: conversation?.id ?? null,
      type,
      state: "submitted",
      title: title.trim(),
      description: description?.trim() ?? "",
      assigneeId: null,
      projectId: projectId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    setTickets((prev) => [optimistic, ...prev]);
    const created = await createTicket({
      id: optimisticId,
      conversationId: optimistic.conversationId,
      type,
      state: "submitted",
      title: optimistic.title,
      description: optimistic.description,
      projectId: projectId ?? null,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      setTickets((prev) => prev.filter((t) => t.id !== optimisticId));
      toast.error("Couldn't create the ticket.");
      return null;
    }
    setTickets((prev) => prev.map((t) => (t.id === created.id ? created : t)));
    toast.success("Ticket created");
    openTicket(created.id);
    return created;
  }

  // The editor lifts every edit back up so the list and the open row agree.
  const handleUpdate = (updated) =>
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));

  async function handleState(ticket, state) {
    const previous = tickets;
    setTickets((prev) =>
      prev.map((t) => (t.id === ticket.id ? { ...t, state } : t)),
    );
    const saved = await updateTicket(ticket.id, { state });
    if (!saved) {
      setTickets(previous);
      toast.error("Couldn't update the ticket.");
      return;
    }
    toast.success(`Moved to ${TICKET_STATE_MAP[state]?.label ?? state}`);
  }

  async function handleDelete(ticket) {
    setDeleteTarget(null);
    const previous = tickets;
    setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
    if (ticketId === ticket.id) closeTicket();
    const ok = await softDeleteTicket(ticket.id);
    if (!ok) {
      setTickets(previous);
      toast.error("Couldn't delete the ticket.");
      return;
    }
    toast.success(`Deleted "${ticket.title}".`);
  }

  const openConversation = (id) =>
    openConversationInTab(id, "All Conversations");

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
              <p className="truncate text-xs text-text-secondary">
                {row.description}
              </p>
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
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {formatDate(row.updatedAt) || "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "text-right",
      render: (row) => (
        <ActionMenu
          label={`Actions for ${row.title}`}
          items={[
            { icon: Pencil, label: "Edit", onSelect: () => openTicket(row.id) },
            row.conversationId && {
              icon: MessagesSquare,
              label: "Open conversation",
              onSelect: () => openConversation(row.conversationId),
            },
            row.state === "resolved"
              ? {
                  icon: RotateCcw,
                  label: "Reopen",
                  onSelect: () => void handleState(row, "in_progress"),
                }
              : {
                  icon: CheckCircle2,
                  label: "Mark resolved",
                  onSelect: () => void handleState(row, "resolved"),
                },
            { separator: true },
            {
              icon: Trash2,
              label: "Delete",
              variant: "destructive",
              onSelect: () => setDeleteTarget(row),
            },
          ]}
        />
      ),
    },
  ];

  // Confirmation lives outside the list/editor branch so the editor's danger
  // zone gets the same dialog the row action does.
  const deleteDialog = (
    <Dialog
      open={!!deleteTarget}
      onOpenChange={(open) => !open && setDeleteTarget(null)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete ticket</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              {deleteTarget?.title}
            </span>
            ? Linked conversations keep their history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={() => void handleDelete(deleteTarget)}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (selected) {
    return (
      <>
        <TicketDetailScreen
          ticket={selected}
          projectId={projectId}
          onBack={closeTicket}
          onUpdate={handleUpdate}
          onDelete={setDeleteTarget}
          onOpenConversation={openConversation}
        />
        {deleteDialog}
      </>
    );
  }

  const createButton = (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={() => setCreateOpen(true)}
    >
      <Plus className="h-4 w-4" /> New ticket
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Tickets"
        description="Customer, back-office and tracker tickets — a type filter over one queue, not three screens."
        actions={createButton}
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            value={typeFilter}
            onValueChange={setTypeFilter}
            options={TICKET_TYPE_FILTER_OPTIONS}
            placeholder="All types"
            height="h-9"
          />
          <FilterDropdown
            value={stateFilter}
            onValueChange={setStateFilter}
            options={TICKET_STATE_FILTER_OPTIONS}
            placeholder="All states"
            height="h-9"
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
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-6 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading tickets…
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(row) => row.id}
            onRowClick={(row) => openTicket(row.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={TicketIcon}
                  title={
                    tickets.length
                      ? "No tickets match these filters"
                      : "No tickets yet"
                  }
                  description={
                    tickets.length
                      ? "Try clearing the search, type or state filter."
                      : "Create one here, or from any conversation's thread menu."
                  }
                  action={
                    tickets.length ? (
                      <Button
                        variant="outline"
                        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={() => {
                          setSearch("");
                          setTypeFilter("all");
                          setStateFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      createButton
                    )
                  }
                />
              </div>
            }
          />
          <ListPagination {...pager} itemLabel="tickets" />
        </div>
      )}

      <TicketDialog
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default TicketsScreen;
