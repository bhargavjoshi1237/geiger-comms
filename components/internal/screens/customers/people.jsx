"use client";

// People — the contact directory and hub of the Customers area. Follows the
// suite list pattern: header + create, KPI bar, toolbar filters, a DataTable
// and pagination. Selecting a row opens the person in the URL (?person=<id>)
// and swaps to the full contact editor (the unified-timeline detail view).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Loader2,
  MessagesSquare,
  Pencil,
  Plus,
  Ticket as TicketIcon,
  Trash2,
  Users,
} from "lucide-react";
import {
  ActionMenu,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@geiger/ui";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  ListPagination,
  usePagination,
} from "@/components/internal/shared/pagination";
import {
  DataTable,
  EmptyState,
  Field,
  ScreenHeader,
  SearchInput,
  StatsBar,
  StatusPill,
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "../overview/filter_dropdown";
import { useOptionalProject } from "@/context/project-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { getUser } from "@/lib/supabase/user";
import {
  createContact,
  softDeleteContact,
} from "@/lib/supabase/customers";
import {
  LIFECYCLE_FILTER_OPTIONS,
  LIFECYCLE_MAP,
  formatRelativeTime,
  initialsOf,
} from "./constants";
import { useCustomers } from "./use_customers";
import { PersonDetailScreen } from "./person_detail";

// Module scope: the "new this week" window is fixed per mount, not per render.
const NEW_WINDOW_MS = 7 * 86400000;
const newSince = Date.now() - NEW_WINDOW_MS;

export function PeopleScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const { personId, openPerson, closePerson, openConversationInTab, openTicket } =
    useWorkspaceUrl();
  const {
    people,
    setPeople,
    conversations,
    tickets,
    loading,
    demo,
    conversationsOf,
    ticketsOf,
  } = useCustomers();

  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", company: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const companies = useMemo(() => {
    const set = new Map();
    for (const p of people) {
      const c = (p.company || "").trim();
      if (c) set.set(c.toLowerCase(), c);
    }
    return [
      { value: "all", label: "All companies" },
      ...[...set.values()]
        .sort((a, b) => a.localeCompare(b))
        .map((c) => ({ value: c.toLowerCase(), label: c })),
    ];
  }, [people]);

  const counts = useMemo(() => {
    const map = new Map();
    for (const p of people) {
      const convos = conversationsOf(p);
      const open = convos.filter(
        (c) => (c.status || "").toLowerCase() !== "closed",
      ).length;
      const last = [...convos]
        .map((c) => c.lastMessageAt || c.createdAt)
        .filter(Boolean)
        .sort()
        .reverse()[0];
      map.set(p.id, { total: convos.length, open, last });
    }
    return map;
  }, [people, conversationsOf]);

  const ticketCounts = useMemo(() => {
    const map = new Map();
    for (const p of people) {
      map.set(p.id, ticketsOf(p, conversationsOf(p)).length);
    }
    return map;
  }, [people, conversationsOf, ticketsOf]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (lifecycle !== "all" && (p.lifecycle || "lead") !== lifecycle)
        return false;
      if (
        companyFilter !== "all" &&
        (p.company || "").toLowerCase() !== companyFilter
      )
        return false;
      if (
        q &&
        !`${p.name} ${p.email} ${p.company} ${p.location}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [people, search, lifecycle, companyFilter]);

  const pager = usePagination(filtered, {
    resetKey: `${search}|${lifecycle}|${companyFilter}`,
  });

  const isFiltered =
    lifecycle !== "all" || companyFilter !== "all" || search.trim() !== "";

  const stats = useMemo(() => {
    const fresh = people.filter(
      (p) => p.createdAt && new Date(p.createdAt).getTime() >= newSince,
    ).length;
    const vip = people.filter(
      (p) =>
        p.lifecycle === "vip" ||
        (p.tags || []).some((t) =>
          (typeof t === "string" ? t : t.name || "").toLowerCase() === "vip",
        ),
    ).length;
    const active = people.filter(
      (p) => (counts.get(p.id)?.open || 0) > 0,
    ).length;
    return [
      {
        label: "People",
        value: String(people.length),
        footer: demo ? "Demo data — add a project contact" : `${fresh} new this week`,
      },
      { label: "VIP", value: String(vip), footer: "Flagged or lifecycle VIP" },
      {
        label: "In conversation",
        value: String(active),
        footer: "With an open thread",
      },
      {
        label: "Tickets",
        value: String(tickets.length),
        footer: "Linked across people",
      },
    ];
  }, [people, tickets, counts, demo]);

  async function handleCreate() {
    if (!draft.name.trim() && !draft.email.trim()) {
      toast.error("Give the person a name or an email.");
      return;
    }
    const optimisticId = crypto.randomUUID();
    const optimistic = {
      id: optimisticId,
      name: draft.name.trim() || draft.email.trim().split("@")[0],
      email: draft.email.trim(),
      company: draft.company.trim(),
      lifecycle: "lead",
      tags: [],
      notes: [],
      tasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCreateOpen(false);
    setDraft({ name: "", email: "", company: "" });
    if (demo) {
      setPeople((prev) => [optimistic, ...prev]);
      toast.success("Person added");
      openPerson(optimisticId);
      return;
    }
    setPeople((prev) => [optimistic, ...prev]);
    const user = await getUser();
    const created = await createContact({
      id: optimisticId,
      name: optimistic.name,
      email: optimistic.email || null,
      company: optimistic.company || null,
      projectId: projectId ?? null,
      createdBy: user?.id ?? null,
    });
    if (!created) {
      setPeople((prev) => prev.filter((p) => p.id !== optimisticId));
      toast.error("Couldn't create the person.");
      return;
    }
    setPeople((prev) => prev.map((p) => (p.id === created.id ? created : p)));
    toast.success("Person created");
    openPerson(created.id);
  }

  const handleUpdate = (updated) =>
    setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));

  async function handleDelete(person) {
    setDeleteTarget(null);
    const previous = people;
    setPeople((prev) => prev.filter((p) => p.id !== person.id));
    if (personId === person.id) closePerson();
    if (demo || String(person.id).startsWith("demo-")) {
      toast.success(`Deleted “${person.name}”.`);
      return;
    }
    const ok = await softDeleteContact(person.id);
    if (!ok) {
      setPeople(previous);
      toast.error("Couldn't delete the person.");
      return;
    }
    toast.success(`Deleted “${person.name}”.`);
  }

  const selected = useMemo(
    () => (personId ? people.find((p) => p.id === personId) || null : null),
    [personId, people],
  );

  const columns = [
    {
      key: "person",
      header: "Person",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-8 w-8 shrink-0">
            {row.avatarUrl ? (
              <AvatarImage src={row.avatarUrl} alt={row.name} />
            ) : null}
            <AvatarFallback className="bg-surface-card text-xs text-text-secondary">
              {initialsOf(row.name, row.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-text-secondary">
              {row.email || "No email"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "company",
      header: "Company",
      render: (row) =>
        row.company ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
            <Building2 className="h-3.5 w-3.5 text-text-tertiary" />
            {row.company}
          </span>
        ) : (
          <span className="text-sm text-text-tertiary">—</span>
        ),
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      render: (row) => (
        <StatusPill status={row.lifecycle || "lead"} map={LIFECYCLE_MAP} />
      ),
    },
    {
      key: "open",
      header: "Open",
      render: (row) => (
        <span className="text-sm tabular-nums text-foreground">
          {counts.get(row.id)?.open || 0}
          <span className="text-text-tertiary"> / {counts.get(row.id)?.total || 0}</span>
        </span>
      ),
    },
    {
      key: "tickets",
      header: "Tickets",
      render: (row) => (
        <span className="text-sm tabular-nums text-text-secondary">
          {ticketCounts.get(row.id) || 0}
        </span>
      ),
    },
    {
      key: "seen",
      header: "Last seen",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatRelativeTime(counts.get(row.id)?.last || row.updatedAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12 text-right",
      render: (row) => {
        const convos = conversationsOf(row);
        return (
          <ActionMenu
            label={`Actions for ${row.name}`}
            items={[
              { icon: Pencil, label: "Open", onSelect: () => openPerson(row.id) },
              convos[0] && {
                icon: MessagesSquare,
                label: "Open conversation",
                onSelect: () =>
                  openConversationInTab(convos[0].id, "All Conversations"),
              },
              ticketsOf(row, convos)[0] && {
                icon: TicketIcon,
                label: "Open ticket",
                onSelect: () => openTicket(ticketsOf(row, convos)[0].id),
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
        );
      },
    },
  ];

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete person</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
            Their conversations keep their history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            className="bg-red-500/90 text-white hover:bg-red-500"
            onClick={() => handleDelete(deleteTarget)}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (selected) {
    const selectedConvos = conversationsOf(selected);
    const convoTags = [
      ...new Map(
        selectedConvos
          .flatMap((c) => c.tags || [])
          .map((t) => [
            (typeof t === "string" ? t : t.name || "").toLowerCase(),
            t,
          ])
          .filter(([k]) => k),
      ).values(),
    ];
    return (
      <>
        <PersonDetailScreen
          person={selected}
          demo={demo || String(selected.id).startsWith("demo-")}
          conversations={selectedConvos}
          tickets={ticketsOf(selected, selectedConvos)}
          tags={convoTags}
          onBack={closePerson}
          onUpdate={handleUpdate}
          onDelete={setDeleteTarget}
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
      <Plus className="h-4 w-4" /> Add person
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="People"
        description="Every person who has written in — the record behind each conversation, with its lifelong timeline one click away."
        actions={createButton}
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            value={lifecycle}
            onValueChange={setLifecycle}
            options={LIFECYCLE_FILTER_OPTIONS}
            placeholder="All stages"
            height="h-9"
          />
          <FilterDropdown
            value={companyFilter}
            onValueChange={setCompanyFilter}
            options={companies}
            placeholder="All companies"
            height="h-9"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, email, company…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-6 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading people…
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(row) => row.id}
            onRowClick={(row) => openPerson(row.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Users}
                  title={isFiltered ? "No people match these filters" : "No people yet"}
                  description={
                    isFiltered
                      ? "Try clearing the search or the filters."
                      : "People appear here the moment someone writes in — or add one manually."
                  }
                  action={
                    isFiltered ? (
                      <Button
                        variant="outline"
                        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={() => {
                          setSearch("");
                          setLifecycle("all");
                          setCompanyFilter("all");
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
          <ListPagination {...pager} itemLabel="people" />
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add person</DialogTitle>
            <DialogDescription>
              A contact record you can attach conversations and tickets to.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name" htmlFor="person-draft-name">
              <Input
                id="person-draft-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Ada Lovelace"
              />
            </Field>
            <Field label="Email" htmlFor="person-draft-email">
              <Input
                id="person-draft-email"
                value={draft.email}
                onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                placeholder="ada@company.com"
              />
            </Field>
            <Field label="Company" htmlFor="person-draft-company">
              <Input
                id="person-draft-company"
                value={draft.company}
                onChange={(e) => setDraft((d) => ({ ...d, company: e.target.value }))}
                placeholder="Company"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => void handleCreate()}
            >
              Add person
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default PeopleScreen;
