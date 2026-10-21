"use client";

// Companies: account records people link to (suite list pattern), with a one-click link for people carrying only a company name.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  Download,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
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
  LogoLoading,
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
import { getUser } from "@/lib/supabase/user";
import { setContactsCompany } from "@/lib/supabase/customers";
import {
  createCompany,
  normalizeDomain,
  saveCompanies,
  softDeleteCompany,
  updateCompany,
} from "@/lib/supabase/companies";
import {
  formatDate,
  formatRelativeTime,
  restoreRow,
  summarizeCompanies,
  unlinkedCompanyGroups,
} from "./constants";
import { downloadCsv } from "@/components/internal/shared/csv";
import { IMPORT_BATCH, bareCompanyInput, exportRows } from "./import_plan";
import { ImportDialog } from "./import_dialog";
import { useCustomers } from "./use_customers";
import { CompanyDetailScreen } from "./company_detail";

const EMPTY_DRAFT = { name: "", domain: "", owner: "" };

const OUTLINE_BUTTON =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

export function CompaniesScreen() {
  const { companyId, openCompany, closeCompany } = useWorkspaceUrl();
  const {
    projectId,
    people,
    setPeople,
    companies,
    setCompanies,
    companiesAvailable,
    attributes,
    setAttributes,
    conversations,
    tickets,
    loading,
    error,
    reload,
    ticketsOf,
  } = useCustomers();

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [linking, setLinking] = useState(false);

  const rows = useMemo(
    () =>
      summarizeCompanies(companies, people, conversations).map((c) => ({
        ...c,
        tickets: ticketsOf(c.conversations),
      })),
    [companies, people, conversations, ticketsOf],
  );

  const unlinked = useMemo(() => unlinkedCompanyGroups(people), [people]);
  const unlinkedPeople = unlinked.reduce((n, g) => n + g.people.length, 0);

  const owners = useMemo(
    () => [
      { value: "all", label: "All owners" },
      ...[...new Set(rows.map((c) => c.owner).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map((o) => ({ value: o, label: o })),
    ],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (ownerFilter !== "all" && c.owner !== ownerFilter) return false;
      if (q && !`${c.name} ${c.domain} ${c.website}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, search, ownerFilter]);

  const pager = usePagination(filtered, {
    resetKey: `${search}|${ownerFilter}`,
  });

  const isFiltered = ownerFilter !== "all" || search.trim() !== "";

  const stats = useMemo(() => {
    const linked = rows.reduce((n, c) => n + c.contactCount, 0);
    const open = rows.reduce((n, c) => n + c.openCount, 0);
    const ticketCount = new Set(rows.flatMap((c) => c.tickets.map((t) => t.id))).size;
    return [
      {
        label: "Companies",
        value: String(rows.length),
        footer: `${linked.toLocaleString("en-US")} people linked`,
      },
      { label: "Open conversations", value: String(open), footer: "Across all companies" },
      { label: "Tickets", value: String(ticketCount), footer: `Of ${tickets.length} in this workspace` },
      {
        label: "No owner",
        value: String(rows.filter((c) => !c.owner).length),
        footer: "Need an account owner",
      },
    ];
  }, [rows, tickets]);

  async function handleCreate() {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Give the company a name.");
      return;
    }
    const domain = normalizeDomain(draft.domain);
    if (domain && companies.some((c) => c.domain === domain)) {
      toast.error(`A company with the domain ${domain} already exists.`);
      return;
    }
    const now = new Date().toISOString();
    const input = { id: crypto.randomUUID(), name, domain, owner: draft.owner.trim(), projectId };
    setCreateOpen(false);
    setDraft(EMPTY_DRAFT);
    setCompanies((prev) => [
      { ...input, externalId: "", website: "", industry: "", size: null, plan: "", monthlySpend: null, custom: {}, metadata: {}, createdAt: now, updatedAt: now },
      ...prev,
    ]);
    const user = await getUser();
    const created = await createCompany({ ...input, createdBy: user?.id ?? null });
    if (!created) {
      setCompanies((prev) => prev.filter((c) => c.id !== input.id));
      toast.error("Couldn't create the company.");
      return;
    }
    setCompanies((prev) => prev.map((c) => (c.id === created.id ? created : c)));
    toast.success("Company created");
    openCompany(created.id);
  }

  // Optimistic edit; a rename also rewrites linked people's company name (as the database does).
  async function handleUpdate(company, patch) {
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, company[k]]));
    const rename = (name) =>
      setPeople((prev) =>
        prev.map((p) => (p.companyId === company.id ? { ...p, company: name } : p)),
      );
    setCompanies((prev) => prev.map((c) => (c.id === company.id ? { ...c, ...patch } : c)));
    if ("name" in patch) rename(patch.name);
    const saved = await updateCompany(company.id, patch);
    if (!saved) {
      // Revert only this patch's keys so a concurrent edit survives the rollback.
      setCompanies((prev) => prev.map((c) => (c.id === company.id ? { ...c, ...before } : c)));
      if ("name" in patch) rename(before.name);
      toast.error("Couldn't save the company.");
      return null;
    }
    setCompanies((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    return saved;
  }

  // Soft delete; the database unlinks its people, so mirror that locally.
  async function handleDelete(company) {
    setDeleteTarget(null);
    const index = companies.findIndex((c) => c.id === company.id);
    const original = companies[index];
    const members = new Map(
      people.filter((p) => p.companyId === company.id).map((p) => [p.id, p.company]),
    );
    setCompanies((prev) => prev.filter((c) => c.id !== company.id));
    setPeople((prev) =>
      prev.map((p) => (p.companyId === company.id ? { ...p, companyId: null, company: "" } : p)),
    );
    if (companyId === company.id) closeCompany();
    const ok = await softDeleteCompany(company.id);
    if (!ok) {
      setCompanies((prev) => restoreRow(prev, original, index));
      setPeople((prev) =>
        prev.map((p) =>
          members.has(p.id) ? { ...p, companyId: company.id, company: members.get(p.id) } : p,
        ),
      );
      toast.error("Couldn't delete the company.");
      return;
    }
    toast.success(`Deleted “${company.name}”.`);
  }

  // Links people's free-text company names to records, creating the missing ones.
  async function handleLinkUnlinked() {
    setLinking(true);
    const user = await getUser();
    const byName = new Map(companies.map((c) => [c.name.toLowerCase(), c]));
    const missing = unlinked.filter((g) => !byName.has(g.name.toLowerCase()));
    let created = 0;
    for (let i = 0; i < missing.length; i += IMPORT_BATCH) {
      const saved = await saveCompanies(
        missing
          .slice(i, i + IMPORT_BATCH)
          .map((g) => bareCompanyInput({ name: g.name, projectId, createdBy: user?.id ?? null })),
      );
      for (const c of saved || []) byName.set(c.name.toLowerCase(), c);
      created += saved?.length || 0;
    }
    let linked = 0;
    for (const group of unlinked) {
      const company = byName.get(group.name.toLowerCase());
      if (company && (await setContactsCompany(group.people.map((p) => p.id), company))) {
        linked += group.people.length;
      }
    }
    setLinking(false);
    if (linked === unlinkedPeople) {
      toast.success(
        `Linked ${linked} ${linked === 1 ? "person" : "people"}${created ? ` · ${created} new compan${created === 1 ? "y" : "ies"}` : ""}.`,
      );
    } else {
      toast.error(`Linked ${linked} of ${unlinkedPeople} people — try again for the rest.`);
    }
    reload();
  }

  function handleExport() {
    downloadCsv(
      `companies-${new Date().toISOString().slice(0, 10)}.csv`,
      exportRows("companies", filtered, attributes),
    );
  }

  const selected = useMemo(
    () => (companyId ? rows.find((c) => c.id === companyId) || null : null),
    [companyId, rows],
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
            {row.domain || row.website ? (
              <p className="truncate text-xs text-text-secondary">{row.domain || row.website}</p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "contacts",
      header: "People",
      render: (row) => (
        <span className="text-sm tabular-nums text-foreground">{row.contactCount}</span>
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
      key: "plan",
      header: "Plan",
      render: (row) => (
        <span className="text-sm text-text-secondary">{row.plan || "—"}</span>
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
            Its {deleteTarget?.contactCount || 0}{" "}
            {(deleteTarget?.contactCount || 0) === 1 ? "person stays" : "people stay"} in
            People, just without a company.
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
          attributes={attributes}
          onAttributeCreated={(attr) => setAttributes((prev) => [...prev, attr])}
          onBack={closeCompany}
          onUpdate={(patch) => handleUpdate(selected, patch)}
          onDelete={setDeleteTarget}
        />
        {deleteDialog}
      </>
    );
  }

  const createButton = (
    <Button
      className="bg-primary text-primary-foreground hover:bg-primary/90"
      disabled={!companiesAvailable}
      onClick={() => setCreateOpen(true)}
    >
      <Plus className="h-4 w-4" /> Add company
    </Button>
  );

  const unavailable = !loading && (error || !companiesAvailable);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title={`Companies (${rows.length.toLocaleString("en-US")})`}
        description="Accounts and the people who belong to them — contacts, open threads and ownership at a glance."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              disabled={loading || filtered.length === 0}
              onClick={handleExport}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={OUTLINE_BUTTON}
              disabled={loading || unavailable}
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-4 w-4" /> Import
            </Button>
            {createButton}
          </div>
        }
      />

      <StatsBar stats={stats} />

      {!loading && companiesAvailable && unlinked.length ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {unlinkedPeople} {unlinkedPeople === 1 ? "person has" : "people have"} a company
              name but no company record
            </p>
            <p className="text-sm text-text-secondary">
              {unlinked.length} name{unlinked.length === 1 ? "" : "s"} — link them to matching
              companies, creating the ones that don&apos;t exist yet.
            </p>
          </div>
          <Button
            variant="outline"
            className={OUTLINE_BUTTON}
            disabled={linking}
            onClick={() => void handleLinkUnlinked()}
          >
            {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Link to companies
          </Button>
        </div>
      ) : null}

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
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface-subtle px-6 py-16">
          <LogoLoading size={48} aria-label="Loading companies" />
        </div>
      ) : unavailable ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={Building2}
            title="Couldn't load companies"
            description={
              error
                ? "The contact directory didn't respond. Try again."
                : "Company records aren't available in this workspace's database yet."
            }
            action={
              <Button variant="outline" className={OUTLINE_BUTTON} onClick={reload}>
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
            }
          />
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
                      : "Add a company, import a CSV, or link people's company names."
                  }
                  action={
                    isFiltered ? (
                      <Button
                        variant="outline"
                        className={OUTLINE_BUTTON}
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
              An account record people can be linked to. The domain must be unique.
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
              onClick={() => void handleCreate()}
            >
              Add company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entity="companies"
        projectId={projectId}
        attributes={attributes}
        companiesAvailable={companiesAvailable}
        onImported={reload}
      />

      {deleteDialog}
    </MainScreenWrapper>
  );
}

export default CompaniesScreen;
