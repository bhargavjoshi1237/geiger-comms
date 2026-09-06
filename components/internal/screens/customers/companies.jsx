"use client";

// Companies — accounts derived from the people directory (grouped by the
// company field; there is no separate companies table). Mirrors the suite
// list pattern: header + create, KPI bar, toolbar filters, a DataTable and
// pagination. Selecting a row swaps to the company editor.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  ActionMenu,
  Avatar,
  AvatarFallback,
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
  Toolbar,
} from "@/components/internal/shared/screen_kit";
import FilterDropdown from "../overview/filter_dropdown";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  deriveCompanies,
  formatDate,
  formatRelativeTime,
} from "./constants";
import { useCustomers } from "./use_customers";
import { CompanyDetailScreen } from "./company_detail";

export function CompaniesScreen() {
  const { companyId, openCompany, closeCompany } = useWorkspaceUrl();
  const {
    people,
    setPeople,
    conversations,
    tickets,
    loading,
    conversationsOf,
    ticketsOf,
  } = useCustomers();

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", domain: "", owner: "" });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const companies = useMemo(
    () => deriveCompanies(people, conversations),
    [people, conversations],
  );

  const owners = useMemo(
    () => [
      { value: "all", label: "All owners" },
      ...[...new Set(companies.map((c) => c.owner).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map((o) => ({ value: o, label: o })),
    ],
    [companies],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (ownerFilter !== "all" && c.owner !== ownerFilter) return false;
      if (
        q &&
        !`${c.name} ${c.domain} ${c.website}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [companies, search, ownerFilter]);

  const pager = usePagination(filtered, {
    resetKey: `${search}|${ownerFilter}`,
  });

  const isFiltered = ownerFilter !== "all" || search.trim() !== "";

  const stats = useMemo(() => {
    const contacts = companies.reduce((n, c) => n + c.contactCount, 0);
    const open = companies.reduce((n, c) => n + c.openCount, 0);
    const unassigned = companies.filter((c) => !c.owner).length;
    return [
      {
        label: "Companies",
        value: String(companies.length),
        footer: `${contacts.toLocaleString("en-US")} contacts in total`,
      },
      {
        label: "Open conversations",
        value: String(open),
        footer: "Across all companies",
      },
      {
        label: "Tickets",
        value: String(tickets.length),
        footer: "Linked across companies",
      },
      {
        label: "No owner",
        value: String(unassigned),
        footer: "Need an account owner",
      },
    ];
  }, [companies, tickets]);

  function handleCreate() {
    if (!draft.name.trim()) {
      toast.error("Give the company a name.");
      return;
    }
    const person = {
      id: crypto.randomUUID(),
      name: `Contact at ${draft.name.trim()}`,
      email: draft.domain.trim()
        ? `hello@${draft.domain.trim().replace(/^www\./, "")}`
        : "",
      company: draft.name.trim(),
      website: draft.domain.trim(),
      owner: draft.owner.trim(),
      lifecycle: "lead",
      tags: [],
      notes: [],
      tasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setPeople((prev) => [person, ...prev]);
    setCreateOpen(false);
    setDraft({ name: "", domain: "", owner: "" });
    toast.success("Company added");
  }

  // A company is a lens on people — deleting removes its people.
  function handleDelete(company) {
    setDeleteTarget(null);
    const ids = new Set(company.people.map((p) => p.id));
    setPeople((prev) => prev.filter((p) => !ids.has(p.id)));
    if (companyId === company.id) closeCompany();
    toast.success(`Deleted “${company.name}”.`);
  }

  const selected = useMemo(
    () => (companyId ? companies.find((c) => c.id === companyId) || null : null),
    [companyId, companies],
  );

  const columns = [
    {
      key: "name",
      header: "Company",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-8 w-8 shrink-0 rounded-lg">
            <AvatarFallback className="rounded-lg bg-surface-card text-xs text-text-secondary">
              {row.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            {row.website ? (
              <p className="truncate text-xs text-text-secondary">{row.website}</p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "contacts",
      header: "Contacts",
      render: (row) => (
        <span className="text-sm tabular-nums text-foreground">
          {row.contactCount}
        </span>
      ),
    },
    {
      key: "open",
      header: "Open",
      render: (row) => (
        <span className="text-sm tabular-nums text-text-secondary">
          {row.openCount}
          <span className="text-text-tertiary"> / {row.conversationCount}</span>
        </span>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      render: (row) => (
        <span className="text-sm text-text-secondary">{row.owner || "—"}</span>
      ),
    },
    {
      key: "activity",
      header: "Last activity",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatRelativeTime(row.lastActivityAt)}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      className: "w-12 text-right",
      render: (row) => (
        <ActionMenu
          label={`Actions for ${row.name}`}
          items={[
            { icon: Pencil, label: "Open", onSelect: () => openCompany(row.id) },
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

  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete company</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
            Its {deleteTarget?.contactCount || 0} contact
            {(deleteTarget?.contactCount || 0) === 1 ? "" : "s"} go with it —
            conversations keep their history.
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
    return (
      <>
        <CompanyDetailScreen
          company={selected}
          conversationsOf={conversationsOf}
          ticketsOf={ticketsOf}
          onBack={closeCompany}
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
      <Plus className="h-4 w-4" /> Add company
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={`Companies (${companies.length.toLocaleString("en-US")})`}
        description="Accounts rolled up from the people directory — contacts, open threads and ownership at a glance."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => toast.success("Export started — check back shortly.")}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              onClick={() => toast.success("Drop a CSV to import companies.")}
            >
              <Upload className="h-4 w-4" /> Import
            </Button>
            {createButton}
          </div>
        }
      />

      <StatsBar stats={stats} />

      <Toolbar>
        <div className="flex items-center gap-2">
          <FilterDropdown
            value={ownerFilter}
            onValueChange={setOwnerFilter}
            options={owners}
            placeholder="All owners"
            height="h-9"
          />
        </div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search company or domain…"
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-subtle px-6 py-16 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading companies…
        </div>
      ) : (
        <div className="space-y-5">
          <DataTable
            columns={columns}
            data={pager.pageItems}
            getRowKey={(row) => row.id}
            onRowClick={(row) => openCompany(row.id)}
            empty={
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={Building2}
                  title={isFiltered ? "No companies match these filters" : "No companies yet"}
                  description={
                    isFiltered
                      ? "Try clearing the search or the owner filter."
                      : "Companies appear once people carry a company name."
                  }
                  action={
                    isFiltered ? (
                      <Button
                        variant="outline"
                        className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                        onClick={() => {
                          setSearch("");
                          setOwnerFilter("all");
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
          <ListPagination {...pager} itemLabel="companies" />
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add company</DialogTitle>
            <DialogDescription>
              Starts the account with a first contact you can fill in later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Company name" htmlFor="company-draft-name">
              <Input
                id="company-draft-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Acme Inc"
              />
            </Field>
            <Field label="Domain" htmlFor="company-draft-domain">
              <Input
                id="company-draft-domain"
                value={draft.domain}
                onChange={(e) => setDraft((d) => ({ ...d, domain: e.target.value }))}
                placeholder="acme.com"
              />
            </Field>
            <Field label="Owner" htmlFor="company-draft-owner">
              <Input
                id="company-draft-owner"
                value={draft.owner}
                onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
                placeholder="Teammate"
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
              onClick={handleCreate}
            >
              Add company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CompaniesScreen;
