"use client";

// Pure CSV import planning: targets, auto-mapping, validation and dedupe (people: user ID then email; companies: ID, domain, then name).

import { attributeKey } from "@/lib/supabase/customers";
import { normalizeDomain } from "@/lib/supabase/companies";
import { LIFECYCLE_MAP, coerceAttribute, tagLabel } from "./constants";

export const MAX_IMPORT_ROWS = 10000;
export const IMPORT_BATCH = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const IMPORT_TARGETS = {
  people: [
    { value: "name", label: "Name", aliases: ["full name", "contact name"] },
    { value: "firstName", label: "First name", aliases: ["first", "given name"] },
    { value: "lastName", label: "Last name", aliases: ["last", "surname", "family name"] },
    { value: "email", label: "Email", aliases: ["email address", "e mail"] },
    { value: "externalId", label: "User ID", aliases: ["user id", "external id", "customer id"] },
    { value: "phone", label: "Phone", aliases: ["phone number", "mobile"] },
    { value: "company", label: "Company name", aliases: ["company", "organization", "organisation"] },
    { value: "title", label: "Job title", aliases: ["title", "role", "position"] },
    { value: "location", label: "Location", aliases: ["city", "address"] },
    { value: "timezone", label: "Timezone", aliases: ["time zone"] },
    { value: "language", label: "Language", aliases: ["locale"] },
    { value: "lifecycle", label: "Lifecycle stage", aliases: ["lifecycle", "stage"] },
    { value: "owner", label: "Owner", aliases: ["account owner"] },
    { value: "website", label: "Website", aliases: ["url"] },
    { value: "tags", label: "Tags", aliases: ["tag", "labels"] },
    { value: "unsubscribedEmail", label: "Unsubscribed from email", aliases: ["unsubscribed from emails", "unsubscribed"] },
  ],
  companies: [
    { value: "name", label: "Company name", aliases: ["name", "company"] },
    { value: "externalId", label: "Company ID", aliases: ["external id", "account id"] },
    { value: "domain", label: "Domain", aliases: ["company domain"] },
    { value: "website", label: "Website", aliases: ["url", "company website"] },
    { value: "industry", label: "Industry", aliases: ["sector"] },
    { value: "size", label: "Company size", aliases: ["size", "employees", "employee count"] },
    { value: "plan", label: "Plan", aliases: ["plan name"] },
    { value: "monthlySpend", label: "Monthly spend", aliases: ["mrr", "monthly revenue"] },
    { value: "owner", label: "Owner", aliases: ["account owner"] },
  ],
};

export const ATTRIBUTE_ENTITY = { people: "contact", companies: "company" };

const norm = (s) => String(s || "").toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

// Column index -> target: a standard key, "custom:<key>", "new:<key>", or "" (skip).
export function autoMap(entity, header, attributes) {
  const targets = IMPORT_TARGETS[entity];
  const custom = (attributes || []).filter((a) => a.entity === ATTRIBUTE_ENTITY[entity]);
  const used = new Set();
  return header.map((col) => {
    const h = norm(col);
    const standard = targets.find(
      (t) => norm(t.label) === h || norm(t.value) === h || t.aliases.includes(h),
    );
    const attribute = custom.find((a) => norm(a.label) === h || norm(a.key) === h);
    const target = standard ? standard.value : attribute ? `custom:${attribute.key}` : "";
    if (!target || used.has(target)) return "";
    used.add(target);
    return target;
  });
}

// Mapping problems that block the import, as user-facing sentences.
export function mappingProblems(entity, header, mapping) {
  const problems = [];
  const chosen = mapping.filter(Boolean);
  const dupes = chosen.filter((t, i) => chosen.indexOf(t) !== i);
  if (dupes.length) problems.push("Two columns are mapped to the same field.");
  if (entity === "people" && !chosen.includes("email") && !chosen.includes("externalId")) {
    problems.push("Map an Email or a User ID column so people can be matched.");
  }
  if (entity === "companies" && !["name", "domain", "website", "externalId"].some((t) => chosen.includes(t))) {
    problems.push("Map a Company name, Domain or Company ID column.");
  }
  if (chosen.some((t) => t === "new:")) problems.push("A new attribute needs a column name.");
  return problems;
}

export function newAttributeTarget(label) {
  return `new:${attributeKey(label)}`;
}

function attributeType(target, attributes, entity) {
  const key = target.slice(target.indexOf(":") + 1);
  const def = (attributes || []).find(
    (a) => a.entity === ATTRIBUTE_ENTITY[entity] && a.key === key,
  );
  return { key, type: def?.type || "text", label: def?.label || key };
}

// One CSV row -> { values, custom, error }; blank cells are left out so they never overwrite existing data.
function extract(entity, row, mapping, attributes) {
  const values = {};
  const custom = {};
  for (let i = 0; i < mapping.length; i++) {
    const target = mapping[i];
    const raw = String(row[i] ?? "").trim();
    if (!target || raw === "") continue;
    if (target.startsWith("custom:") || target.startsWith("new:")) {
      const { key, type, label } = attributeType(target, attributes, entity);
      const value = coerceAttribute(type, raw);
      if (value === undefined) return { error: `“${raw}” isn't a valid ${type} for ${label}.` };
      custom[key] = value;
    } else if (target === "email") {
      values.email = raw.toLowerCase();
    } else if (target === "lifecycle") {
      const stage = raw.toLowerCase();
      if (!LIFECYCLE_MAP[stage]) return { error: `Unknown lifecycle stage “${raw}”.` };
      values.lifecycle = stage;
    } else if (target === "tags") {
      values.tags = raw.split(/[;,|]/).map((t) => t.trim()).filter(Boolean);
    } else if (target === "unsubscribedEmail") {
      const value = coerceAttribute("boolean", raw);
      if (value === undefined) return { error: `“${raw}” isn't true or false for Unsubscribed from email.` };
      values.unsubscribedEmail = value;
    } else if (target === "size" || target === "monthlySpend") {
      const value = coerceAttribute("number", raw);
      if (value === undefined) return { error: `“${raw}” isn't a number.` };
      values[target] = value;
    } else {
      values[target] = raw;
    }
  }
  if (entity === "people" && !values.name && (values.firstName || values.lastName)) {
    values.name = [values.firstName, values.lastName].filter(Boolean).join(" ");
  }
  delete values.firstName;
  delete values.lastName;
  if (entity === "companies") {
    values.domain = normalizeDomain(values.domain || values.website) || undefined;
    if (!values.domain) delete values.domain;
  }
  return { values, custom };
}

// Classifies every row: create | update | unchanged (matched, left alone) | rejected.
export function buildPlan({ entity, rows, mapping, existing, attributes, onMatch }) {
  const byExternal = new Map();
  const byEmail = new Map();
  const byDomain = new Map();
  const byName = new Map();
  for (const r of existing || []) {
    if (r.externalId) byExternal.set(r.externalId, r);
    if (entity === "people" && r.email) byEmail.set(r.email.toLowerCase(), r);
    if (entity === "companies" && r.domain) byDomain.set(r.domain.toLowerCase(), r);
    if (entity === "companies" && !r.domain && !r.externalId && r.name) {
      byName.set(r.name.toLowerCase(), r);
    }
  }
  const seen = new Map();
  const items = rows.map((row, index) => {
    const line = index + 2; // spreadsheet row; the header is row 1
    const reject = (reason) => ({ line, action: "rejected", reason });
    const { values, custom, error } = extract(entity, row, mapping, attributes);
    if (error) return reject(error);

    let keys;
    let match;
    if (entity === "people") {
      if (!values.email && !values.externalId) return reject("Needs an email or a user ID.");
      if (values.email && !EMAIL_RE.test(values.email)) return reject(`“${values.email}” isn't a valid email.`);
      keys = [values.externalId && `id:${values.externalId}`, values.email && `email:${values.email}`];
      const a = values.externalId ? byExternal.get(values.externalId) : null;
      const b = values.email ? byEmail.get(values.email) : null;
      if (a && b && a.id !== b.id) return reject("Email and user ID belong to two different people.");
      match = a || b || null;
    } else {
      if (!values.name && !values.domain) return reject("Needs a company name or domain.");
      values.name = values.name || values.domain;
      keys = [
        values.externalId && `id:${values.externalId}`,
        values.domain && `domain:${values.domain}`,
        !values.externalId && !values.domain && `name:${values.name.toLowerCase()}`,
      ];
      match =
        (values.externalId && byExternal.get(values.externalId)) ||
        (values.domain && byDomain.get(values.domain)) ||
        (!values.externalId && !values.domain && byName.get(values.name.toLowerCase())) ||
        null;
    }
    keys = keys.filter(Boolean);
    const duplicateOf = keys.map((k) => seen.get(k)).find(Boolean);
    if (duplicateOf) return reject(`Duplicate of row ${duplicateOf}.`);
    keys.forEach((k) => seen.set(k, line));

    if (match && values.externalId && match.externalId && match.externalId !== values.externalId) {
      return reject(`Matches “${match.name}”, which already has a different ID.`);
    }
    if (!match) return { line, action: "create", values, custom };
    if (onMatch === "skip") return { line, action: "unchanged", match };
    return { line, action: "update", values, custom, match };
  });
  const counts = { create: 0, update: 0, unchanged: 0, rejected: 0 };
  for (const item of items) counts[item.action] += 1;
  return { items, counts };
}

// The complete contact for an upsert, keeping existing data where the row was blank; company is { id, name } | null.
export function contactInput({ item, projectId, createdBy, company, withCompanyId }) {
  const base = item.match || {
    id: crypto.randomUUID(),
    name: "",
    email: "",
    externalId: "",
    company: "",
    companyId: null,
    avatarUrl: "",
    projectId,
    createdBy,
    metadata: {},
    phone: "",
    location: "",
    timezone: "",
    language: "",
    title: "",
    lifecycle: "lead",
    owner: "",
    website: "",
    tags: [],
    notes: [],
    tasks: [],
    subscribedEmail: true,
    subscribedSms: false,
    custom: {},
  };
  const v = item.values;
  const pick = (key) => (v[key] !== undefined ? v[key] : base[key]);
  const tags = [...(base.tags || []).map(tagLabel)];
  for (const t of v.tags || []) {
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
  }
  const input = {
    id: base.id,
    name: pick("name") || (pick("email") || "").split("@")[0] || "Unknown",
    email: pick("email"),
    externalId: pick("externalId"),
    company: company ? company.name : pick("company"),
    avatarUrl: base.avatarUrl,
    projectId: base.projectId ?? projectId,
    createdBy: base.createdBy ?? createdBy,
    metadata: base.metadata || {},
    phone: pick("phone"),
    location: pick("location"),
    timezone: pick("timezone"),
    language: pick("language"),
    title: pick("title"),
    lifecycle: pick("lifecycle"),
    owner: pick("owner"),
    website: pick("website"),
    tags,
    notes: base.notes || [],
    tasks: base.tasks || [],
    subscribedEmail:
      v.unsubscribedEmail !== undefined ? !v.unsubscribedEmail : base.subscribedEmail,
    subscribedSms: base.subscribedSms,
    custom: { ...(base.custom || {}), ...item.custom },
  };
  if (withCompanyId) input.companyId = company ? company.id : base.companyId;
  return input;
}

export function companyInput({ item, projectId, createdBy }) {
  const base = item.match || {
    id: crypto.randomUUID(),
    name: "",
    domain: "",
    externalId: "",
    projectId,
    createdBy,
    metadata: {},
    website: "",
    industry: "",
    size: null,
    plan: "",
    monthlySpend: null,
    owner: "",
    custom: {},
  };
  const v = item.values;
  const pick = (key) => (v[key] !== undefined ? v[key] : base[key]);
  return {
    id: base.id,
    name: pick("name"),
    domain: pick("domain"),
    externalId: pick("externalId"),
    projectId: base.projectId ?? projectId,
    createdBy: base.createdBy ?? createdBy,
    metadata: base.metadata || {},
    website: pick("website"),
    industry: pick("industry"),
    size: pick("size"),
    plan: pick("plan"),
    monthlySpend: pick("monthlySpend"),
    owner: pick("owner"),
    custom: { ...(base.custom || {}), ...item.custom },
  };
}

// A minimal new company for a person's company name the workspace doesn't have yet.
export function bareCompanyInput({ name, projectId, createdBy }) {
  return companyInput({ item: { values: { name }, custom: {} }, projectId, createdBy });
}

// Export uses the import labels, so an exported file re-imports fully auto-mapped.
export function exportRows(entity, records, attributes) {
  const targets = IMPORT_TARGETS[entity].filter(
    (t) => t.value !== "firstName" && t.value !== "lastName",
  );
  const defs = (attributes || []).filter((a) => a.entity === ATTRIBUTE_ENTITY[entity]);
  const defined = new Set(defs.map((a) => a.key));
  const extra = [
    ...new Set(records.flatMap((r) => Object.keys(r.custom || {}))),
  ].filter((k) => !defined.has(k));
  const cell = (key, r) => {
    if (key === "tags") return (r.tags || []).map(tagLabel).join("; ");
    if (key === "unsubscribedEmail") return r.subscribedEmail === false ? "true" : "false";
    return r[key] ?? "";
  };
  return [
    [...targets.map((t) => t.label), ...defs.map((a) => a.label), ...extra],
    ...records.map((r) => [
      ...targets.map((t) => cell(t.value, r)),
      ...[...defs.map((a) => a.key), ...extra].map((k) => r.custom?.[k] ?? ""),
    ]),
  ];
}
