"use client";

// CSV import for People/Companies: upload, map, preview, batched upsert, summary; each run is logged to comms.imports.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileUp, Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileInput,
  Progress,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";
import { DataTable, Field, StatGrid } from "@/components/internal/shared/screen_kit";
import { getUser } from "@/lib/supabase/user";
import { createAttribute, listContacts, saveContacts } from "@/lib/supabase/customers";
import { listCompanies, saveCompanies } from "@/lib/supabase/companies";
import { createImport, finishImport, listImports, recordImportErrors } from "@/lib/supabase/imports";
import { downloadCsv, parseCsv } from "@/components/internal/shared/csv";
import { formatDateTime } from "./constants";
import {
  ATTRIBUTE_ENTITY,
  IMPORT_BATCH,
  IMPORT_TARGETS,
  MAX_IMPORT_ROWS,
  autoMap,
  bareCompanyInput,
  buildPlan,
  companyInput,
  contactInput,
  mappingProblems,
  newAttributeTarget,
} from "./import_plan";

const SKIP = "__skip";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const NOUN = {
  people: { one: "person", many: "people" },
  companies: { one: "company", many: "companies" },
};

const ACTION_BADGE = {
  create: { label: "New", variant: "success" },
  update: { label: "Update", variant: "info" },
  unchanged: { label: "Unchanged", variant: "neutral" },
  rejected: { label: "Rejected", variant: "danger" },
};

function plural(n, entity) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? NOUN[entity].one : NOUN[entity].many}`;
}

export function ImportDialog({
  open,
  onOpenChange,
  entity,
  projectId,
  attributes,
  companiesAvailable,
  onImported,
}) {
  const [step, setStep] = useState("upload");
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [onMatch, setOnMatch] = useState("update");
  const [existing, setExisting] = useState(null);
  const [companyPool, setCompanyPool] = useState([]);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState(null);

  const attributeEntity = ATTRIBUTE_ENTITY[entity];
  const customAttributes = useMemo(
    () => (attributes || []).filter((a) => a.entity === attributeEntity),
    [attributes, attributeEntity],
  );

  useEffect(() => {
    if (!open || !projectId) return;
    let alive = true;
    listImports({ projectId, entity }).then((rows) => {
      if (alive) setRecent(rows);
    });
    return () => {
      alive = false;
    };
  }, [open, projectId, entity]);

  const plan = useMemo(
    () =>
      file && existing
        ? buildPlan({
            entity,
            rows: file.rows,
            mapping,
            existing,
            attributes: customAttributes,
            onMatch,
          })
        : null,
    [entity, file, mapping, existing, customAttributes, onMatch],
  );

  const problems = file ? mappingProblems(entity, file.header, mapping) : [];

  function reset() {
    setStep("upload");
    setFile(null);
    setMapping([]);
    setOnMatch("update");
    setExisting(null);
    setCompanyPool([]);
    setProgress({ done: 0, total: 0 });
    setResult(null);
  }

  function handleOpenChange(next) {
    if (step === "running") return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFile(event) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    if (picked.size > MAX_FILE_BYTES) {
      toast.error("That file is over 10 MB — split it and import in parts.");
      return;
    }
    const rows = parseCsv(await picked.text());
    if (rows.length < 2) {
      toast.error("The file needs a header row and at least one data row.");
      return;
    }
    if (rows.length - 1 > MAX_IMPORT_ROWS) {
      toast.error(`Import up to ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows at a time.`);
      return;
    }
    const width = Math.max(...rows.map((r) => r.length));
    const header = Array.from({ length: width }, (_, i) => rows[0][i]?.trim() || `Column ${i + 1}`);
    setFile({ name: picked.name, header, rows: rows.slice(1) });
    setMapping(autoMap(entity, header, customAttributes));
    setStep("map");
  }

  async function handlePreview() {
    setChecking(true);
    const needsCompanies = entity === "people" && companiesAvailable && mapping.includes("company");
    const [records, pool] = await Promise.all([
      entity === "people" ? listContacts({ projectId }) : listCompanies({ projectId }),
      needsCompanies ? listCompanies({ projectId }) : Promise.resolve([]),
    ]);
    setChecking(false);
    if (records === null || pool === null) {
      toast.error(`Couldn't check for existing ${NOUN[entity].many}. Try again.`);
      return;
    }
    setExisting(records);
    setCompanyPool(pool);
    setStep("preview");
  }

  // People rows naming a company link to it by name; missing ones are created first.
  async function resolveCompanies(items, createdBy) {
    const byName = new Map(companyPool.map((c) => [c.name.toLowerCase(), c]));
    const missing = [
      ...new Map(
        items
          .map((item) => item.values.company)
          .filter((name) => name && !byName.has(name.toLowerCase()))
          .map((name) => [name.toLowerCase(), name]),
      ).values(),
    ];
    let created = 0;
    for (let i = 0; i < missing.length; i += IMPORT_BATCH) {
      const saved = await saveCompanies(
        missing
          .slice(i, i + IMPORT_BATCH)
          .map((name) => bareCompanyInput({ name, projectId, createdBy })),
      );
      for (const c of saved || []) byName.set(c.name.toLowerCase(), c);
      created += saved?.length || 0;
    }
    return {
      created,
      companyFor: (item) =>
        item.values.company ? byName.get(item.values.company.toLowerCase()) || null : null,
    };
  }

  async function handleRun() {
    setStep("running");
    const user = await getUser();
    const createdBy = user?.id ?? null;

    let defs = customAttributes;
    const fresh = mapping
      .map((target, i) => (target.startsWith("new:") ? { key: target.slice(4), label: file.header[i] } : null))
      .filter(Boolean);
    for (const attr of fresh) {
      if (defs.some((a) => a.key === attr.key)) continue;
      const created = await createAttribute({
        projectId,
        entity: attributeEntity,
        label: attr.label,
        position: defs.length,
        createdBy,
      });
      if (!created) {
        toast.error(`Couldn't create the “${attr.label}” attribute — nothing was imported.`);
        setStep("preview");
        if (defs !== customAttributes) onImported?.();
        return;
      }
      defs = [...defs, created];
    }

    const log = await createImport({
      projectId,
      entity,
      fileName: file.name,
      total: file.rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      createdBy,
    });

    const actionable = plan.items.filter((i) => i.action === "create" || i.action === "update");
    const errors = plan.items
      .filter((i) => i.action === "rejected")
      .map((i) => ({ rowRef: i.line, message: i.reason }));
    const linking =
      entity === "people" && companiesAvailable && mapping.includes("company")
        ? await resolveCompanies(actionable, createdBy)
        : { created: 0, companyFor: () => null };

    const toInput = (item) =>
      entity === "people"
        ? contactInput({
            item,
            projectId,
            createdBy,
            company: linking.companyFor(item),
            withCompanyId: companiesAvailable,
          })
        : companyInput({ item, projectId, createdBy });
    const save = entity === "people" ? saveContacts : saveCompanies;

    let created = 0;
    let updated = 0;
    const tally = (item) => {
      if (item.action === "create") created += 1;
      else updated += 1;
    };
    setProgress({ done: 0, total: actionable.length });
    for (let i = 0; i < actionable.length; i += IMPORT_BATCH) {
      const batch = actionable.slice(i, i + IMPORT_BATCH);
      // Built once so a row-by-row retry reuses each new row's id instead of minting another.
      const inputs = batch.map(toInput);
      const saved = await save(inputs);
      if (saved) {
        batch.forEach(tally);
      } else {
        // One bad row rejects the whole batch; retry row by row to isolate it.
        for (const [j, item] of batch.entries()) {
          if (await save([inputs[j]])) tally(item);
          else errors.push({ rowRef: item.line, message: "Couldn't be saved." });
        }
      }
      setProgress({ done: Math.min(i + IMPORT_BATCH, actionable.length), total: actionable.length });
    }

    const unchanged = plan.counts.unchanged;
    const failed = actionable.length - created - updated;
    let logged = Boolean(log);
    if (log) {
      const errorsSaved = await recordImportErrors(log.id, errors);
      const finished = await finishImport(log.id, {
        status: actionable.length > 0 && created + updated === 0 ? "error" : "done",
        doneCount: created + updated,
        errorCount: errors.length,
        entity,
        fileName: file.name,
        created,
        updated,
        skipped: unchanged,
      });
      logged = errorsSaved && Boolean(finished);
    }
    errors.sort((a, b) => a.rowRef - b.rowRef);
    setResult({
      created,
      updated,
      unchanged,
      rejected: plan.counts.rejected,
      failed,
      companiesCreated: linking.created,
      errors,
      logged,
    });
    setStep("done");
    // Reload even on failure: new attribute definitions or companies may have landed.
    onImported?.();
    if (created + updated > 0) {
      toast.success(`Imported ${plural(created + updated, entity)}.`);
    } else if (actionable.length > 0) {
      toast.error(`No ${NOUN[entity].many} could be saved.`);
    }
  }

  const targets = IMPORT_TARGETS[entity];
  const title = `Import ${NOUN[entity].many}`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl" showCloseButton={step !== "running"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {step === "upload"
              ? entity === "people"
                ? "Upload a CSV. People are matched on user ID, then email — matches are updated, the rest are created."
                : "Upload a CSV. Companies are matched on company ID, then domain — matches are updated, the rest are created."
              : step === "map"
                ? `${file.name} · ${plural(file.rows.length, entity)}. Choose where each column goes; blank cells never overwrite existing data.`
                : step === "preview"
                  ? "Check what will happen before anything is written."
                  : step === "running"
                    ? "Importing — keep this window open."
                    : "Import finished."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="grid gap-4">
            <Field label="CSV file" htmlFor="customer-import-file" hint="UTF-8, comma, semicolon or tab separated; first row is the header. Up to 10,000 rows.">
              <FileInput id="customer-import-file" accept=".csv,text/csv" onChange={(e) => void handleFile(e)} />
            </Field>
            {recent?.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Recent imports</p>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {recent.map((run) => (
                    <li key={run.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 truncate text-foreground">{run.fileName || "CSV import"}</span>
                      <span className="shrink-0 text-xs text-text-secondary">
                        {run.status === "running"
                          ? "Did not finish"
                          : `${run.created} created · ${run.updated} updated · ${run.errorCount} rejected`}
                        {" · "}
                        {formatDateTime(run.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "map" ? (
          <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
            {file.header.map((col, i) => {
              const sample = file.rows.map((r) => r[i]).find((v) => v && v.trim());
              const newTarget = newAttributeTarget(col);
              return (
                <div key={`${col}-${i}`} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border px-3 py-2 sm:grid-cols-[1fr_240px]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{col}</p>
                    <p className="truncate text-xs text-text-tertiary">{sample || "No values"}</p>
                  </div>
                  <Select
                    value={mapping[i] || SKIP}
                    onValueChange={(v) =>
                      setMapping((m) => m.map((t, j) => (j === i ? (v === SKIP ? "" : v) : t)))
                    }
                  >
                    <SelectTrigger size="sm" aria-label={`Map ${col}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>Don&apos;t import</SelectItem>
                      <SelectGroup>
                        <SelectLabel>Standard</SelectLabel>
                        {targets.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Custom attributes</SelectLabel>
                        {customAttributes.map((a) => (
                          <SelectItem key={a.key} value={`custom:${a.key}`}>
                            {a.label}
                          </SelectItem>
                        ))}
                        {newTarget !== "new:" && !customAttributes.some((a) => `new:${a.key}` === newTarget) ? (
                          <SelectItem value={newTarget}>New text attribute “{col}”</SelectItem>
                        ) : null}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        ) : null}

        {step === "preview" && plan ? (
          <div className="grid gap-4">
            <StatGrid
              stats={[
                { label: "New", value: String(plan.counts.create) },
                { label: "Updates", value: String(plan.counts.update) },
                { label: "Unchanged", value: String(plan.counts.unchanged) },
                { label: "Rejected", value: String(plan.counts.rejected) },
              ]}
            />
            <Field label={`When a row matches an existing ${NOUN[entity].one}`} htmlFor="customer-import-match">
              <Select value={onMatch} onValueChange={setOnMatch}>
                <SelectTrigger id="customer-import-match" size="sm" className="sm:max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="update">Update it with the file&apos;s values</SelectItem>
                  <SelectItem value="skip">Leave it unchanged</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="max-h-[36vh] overflow-y-auto">
              <DataTable
                columns={[
                  { key: "line", header: "Row", className: "w-16 tabular-nums text-text-secondary", render: (r) => r.line },
                  {
                    key: "action",
                    header: "Result",
                    render: (r) => (
                      <Badge variant={ACTION_BADGE[r.action].variant}>{ACTION_BADGE[r.action].label}</Badge>
                    ),
                  },
                  {
                    key: "record",
                    header: entity === "people" ? "Person" : "Company",
                    render: (r) => (
                      <span className="block max-w-xs truncate text-sm text-foreground">
                        {r.action === "rejected"
                          ? r.reason
                          : entity === "people"
                            ? r.values?.email || r.values?.externalId || r.match?.email || r.match?.name
                            : r.values?.name || r.match?.name}
                      </span>
                    ),
                  },
                ]}
                data={[
                  ...plan.items.filter((r) => r.action === "rejected").slice(0, 20),
                  ...plan.items.filter((r) => r.action !== "rejected").slice(0, 20),
                ]}
                getRowKey={(r) => r.line}
              />
            </div>
          </div>
        ) : null}

        {step === "running" ? (
          <div className="grid gap-3 py-6">
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            <p className="text-center text-sm text-text-secondary">
              {progress.done.toLocaleString("en-US")} of {plural(progress.total, entity)} saved
            </p>
          </div>
        ) : null}

        {step === "done" && result ? (
          <div className="grid gap-4">
            <StatGrid
              stats={[
                { label: "Created", value: String(result.created) },
                { label: "Updated", value: String(result.updated) },
                { label: "Unchanged", value: String(result.unchanged) },
                { label: "Rejected", value: String(result.rejected + result.failed) },
              ]}
            />
            {result.companiesCreated ? (
              <p className="text-sm text-text-secondary">
                {plural(result.companiesCreated, "companies")} created for company names that didn&apos;t exist yet.
              </p>
            ) : null}
            {!result.logged ? (
              <p className="text-sm text-amber-400">This run couldn&apos;t be saved to the import history.</p>
            ) : null}
            {result.errors.length ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-muted-foreground">Rejected rows</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
                    onClick={() =>
                      downloadCsv(`${file.name.replace(/\.csv$/i, "")}-rejected.csv`, [
                        ["Row", "Reason"],
                        ...result.errors.map((e) => [e.rowRef, e.message]),
                      ])
                    }
                  >
                    <Download className="h-4 w-4" /> Download
                  </Button>
                </div>
                <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                  {result.errors.slice(0, 50).map((e) => (
                    <li key={`${e.rowRef}-${e.message}`} className="flex gap-3 px-4 py-2 text-sm">
                      <span className="w-16 shrink-0 tabular-nums text-text-tertiary">Row {e.rowRef}</span>
                      <span className="text-text-secondary">{e.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {step === "map" ? (
            <>
              {problems.length ? (
                <p className="mr-auto self-center text-xs text-amber-400">{problems[0]}</p>
              ) : null}
              <Button type="button" variant="ghost" onClick={reset}>
                Choose another file
              </Button>
              <Button
                type="button"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={problems.length > 0 || checking}
                onClick={() => void handlePreview()}
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Preview
              </Button>
            </>
          ) : null}
          {step === "preview" ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setStep("map")}>
                Back
              </Button>
              <Button
                type="button"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={!plan || plan.counts.create + plan.counts.update === 0}
                onClick={() => void handleRun()}
              >
                <FileUp className="h-4 w-4" />
                Import {plural(plan ? plan.counts.create + plan.counts.update : 0, entity)}
              </Button>
            </>
          ) : null}
          {step === "done" ? (
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => handleOpenChange(false)}
            >
              Done
            </Button>
          ) : null}
          {step === "upload" ? (
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImportDialog;
