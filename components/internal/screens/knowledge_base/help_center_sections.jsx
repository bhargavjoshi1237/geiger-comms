"use client";

// Help Center editor nav + sections (KB spec §10.3); each saves only its own patch, and website-only settings show in Preview (§10.1).

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  FolderTree,
  Globe,
  Languages,
  LayoutDashboard,
  LayoutTemplate,
  Palette,
  Plus,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Textarea,
} from "@geiger/ui";
import {
  Field,
  SectionCard,
  SegmentedTabs,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { Notice } from "@/components/internal/shared/notice";
import {
  FONT_OPTIONS,
  GA_ID_RE,
  HELP_CENTER_SLUG_RE,
  HELP_CENTER_STATUS_MAP,
  HEX_COLOR_RE,
  HOSTNAME_RE,
  LAYOUT_SECTION_LABELS,
  LOCALE_OPTIONS,
  MAX_FEATURED,
  NEEDS_PUBLISH,
  VISIBILITY_MAP,
  WEBSITE_NOTICE,
  httpsUrlError,
  localeLabel,
} from "./constants";
import { Gated } from "@/components/internal/shared/gated";

const SAVE_DEBOUNCE_MS = 600;
const NO_BRAND = "__none__";

export const HELP_CENTER_NAV = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: LayoutDashboard,
        desc: "What this help center does today and how it's set up.",
      },
    ],
  },
  {
    group: "Setup",
    items: [
      { key: "general", label: "General", icon: Settings2, desc: "Name, identifier, brand, default and live state." },
      { key: "languages", label: "Languages", icon: Languages, desc: "The languages articles can be translated into." },
      { key: "domain", label: "Domain", icon: Globe, desc: "A custom domain for the help-center website." },
      {
        key: "visibility",
        label: "Visibility & SEO",
        icon: ShieldCheck,
        desc: "Who can see this help center, and how search engines treat it.",
      },
    ],
  },
  {
    group: "Content",
    items: [
      {
        key: "content",
        label: "Collections & articles",
        icon: FolderTree,
        desc: "Group articles into collections, up to three levels deep. Articles without one are Unassigned.",
      },
    ],
  },
  {
    group: "Design",
    items: [
      { key: "branding", label: "Branding", icon: Palette, desc: "Logo, colours, font and style." },
      { key: "layout", label: "Layout", icon: LayoutTemplate, desc: "Home page sections, article pages and footer." },
      { key: "preview", label: "Preview", icon: Eye, desc: "How the help center would look.", ownHeader: true },
    ],
  },
  {
    group: "Advanced",
    items: [{ key: "advanced", label: "Danger zone", icon: ShieldAlert, desc: "Delete this help center." }],
  },
];

function WebsiteNotice() {
  return <Notice>{WEBSITE_NOTICE}</Notice>;
}

// SegmentedTabs has no disabled state; read-only greys it out and lets Gated explain why.
const LOCKED_TABS = "pointer-events-none opacity-50";

// A text setting that saves itself — debounced while typing, or on blur where the value must validate first.
// onSave resolves truthy on success; a falsy result shows `failMessage` when given (the hook toasts otherwise).
export function AutoInput({
  value,
  onSave,
  validate,
  saveOn = "debounce",
  failMessage,
  multiline = false,
  disabled,
  ...inputProps
}) {
  const current = value ?? "";
  const [draft, setDraft] = useState(current);
  const [synced, setSynced] = useState(current);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const pending = useRef(null);

  // A saved or reverted value from outside replaces the draft.
  if (current !== synced) {
    setSynced(current);
    setDraft(current);
    setError(null);
  }

  async function commit(next) {
    clearTimeout(timer.current);
    pending.current = null;
    const problem = validate?.(next) ?? null;
    setError(problem);
    if (problem || next === current) return;
    const ok = await onSave(next);
    if (!ok && failMessage) setError(failMessage);
  }

  const flushOnLeave = useEffectEvent(() => {
    if (pending.current !== null) void commit(pending.current);
  });
  useEffect(() => () => flushOnLeave(), []);

  function change(e) {
    const next = e.target.value;
    setDraft(next);
    setError(null);
    if (saveOn !== "debounce") return;
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(next), SAVE_DEBOUNCE_MS);
  }

  const Control = multiline ? Textarea : Input;
  return (
    <>
      <Control
        value={draft}
        onChange={change}
        onBlur={() => saveOn === "blur" && void commit(draft.trim())}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        {...inputProps}
      />
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </>
  );
}

const urlField = (value) => httpsUrlError(value.trim());

// ---- Overview ------------------------------------------------------------------

export function OverviewSection({ center, hc }) {
  const s = hc.statsOf(center);
  const stats = [
    { label: "Status", value: center.isLive ? "Live" : "Not live" },
    {
      label: "Articles in Messenger",
      value: String(s.inMessenger),
      hint: center.isDefault ? "Live, public and default" : "Only the default center",
    },
    { label: "Collections", value: String(s.collections) },
    { label: "Views (30 days)", value: s.views.toLocaleString("en-US") },
  ];
  return (
    <div className="space-y-6">
      <StatGrid stats={stats} />
      <WebsiteNotice />
      <SectionCard title="Summary">
        <SettingsList>
          <SettingRow
            title="Default help center"
            description={
              center.isDefault
                ? "The Messenger's Help space shows this help center."
                : "The Messenger shows your default help center, not this one."
            }
            control={center.isDefault ? <Badge variant="info">Default</Badge> : <Badge variant="neutral">No</Badge>}
          />
          <SettingRow
            title="Live"
            description="A help center that isn't live hides its articles from the Messenger."
            control={<StatusPill status={center.isLive ? "live" : "not_live"} map={HELP_CENTER_STATUS_MAP} />}
          />
          <SettingRow
            title="Visibility"
            description="Private help centers' articles stay out of the Messenger."
            control={<StatusPill status={center.visibility} map={VISIBILITY_MAP} />}
          />
          <SettingRow
            title="Languages"
            description={center.locales.map(localeLabel).join(", ")}
            control={<Badge variant="neutral">{center.locales.length}</Badge>}
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

// ---- General -------------------------------------------------------------------

export function GeneralSection({ center, hc, readOnly }) {
  const reason = readOnly ? NEEDS_PUBLISH : null;
  const others = hc.centers.filter((c) => c.id !== center.id);
  const taken = (field, value) => others.some((c) => (c[field] || "").toLowerCase() === value.trim().toLowerCase());

  return (
    <SectionCard>
      <div className="grid gap-5">
        <Field label="Name">
          <AutoInput
            value={center.name}
            disabled={readOnly}
            validate={(v) => (!v.trim() ? "A name is required." : taken("name", v) ? "Another help center has this name." : null)}
            onSave={(name) => hc.updateCenter(center, { name: name.trim() })}
          />
        </Field>
        <Field label="URL identifier" hint="Used in the help center's address once websites ship.">
          <AutoInput
            value={center.slug}
            disabled={readOnly}
            className="font-mono"
            validate={(v) =>
              !HELP_CENTER_SLUG_RE.test(v)
                ? "Use lowercase letters, numbers and hyphens (1–64 characters)."
                : taken("slug", v)
                  ? "Another help center uses this identifier."
                  : null
            }
            onSave={(slug) => hc.updateCenter(center, { slug })}
          />
        </Field>
        {hc.brands.length ? (
          <Field label="Brand">
            <Select
              value={center.brandId ?? NO_BRAND}
              disabled={readOnly}
              onValueChange={(v) => hc.updateCenter(center, { brandId: v === NO_BRAND ? null : v })}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BRAND}>No brand</SelectItem>
                {hc.brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name || b.slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <SettingsList>
          <SettingRow
            title="Default help center"
            description={
              center.isDefault
                ? "The Messenger shows this help center. Make another one default to change it."
                : "Make this the help center the Messenger shows."
            }
            control={
              <Gated reason={reason}>
                <Switch
                  checked={center.isDefault}
                  disabled={readOnly || center.isDefault}
                  aria-label="Default help center"
                  onCheckedChange={(on) => on && hc.setDefault(center)}
                />
              </Gated>
            }
          />
          <SettingRow
            title="Live"
            description="Not live hides this help center's articles from the Messenger."
            control={
              <Gated reason={reason}>
                <Switch
                  checked={center.isLive}
                  disabled={readOnly}
                  aria-label="Live"
                  onCheckedChange={(on) => hc.setLive(center, on)}
                />
              </Gated>
            }
          />
        </SettingsList>
      </div>
    </SectionCard>
  );
}

// ---- Languages -------------------------------------------------------------------

export function LanguagesSection({ center, hc, theme, readOnly }) {
  const setLocales = (locales) => hc.updateCenter(center, { locales });

  function toggle(locale, on) {
    if (on) setLocales([...center.locales, locale]);
    else setLocales(center.locales.filter((l) => l !== locale));
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Languages" description="Articles can be translated into every supported language.">
        <div className="grid gap-5">
          <Field label="Default language" hint="New articles are written in it.">
            <Select
              value={center.defaultLocale}
              disabled={readOnly}
              onValueChange={(l) => setLocales([l, ...center.locales.filter((x) => x !== l)])}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {center.locales.map((l) => (
                  <SelectItem key={l} value={l}>
                    {localeLabel(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Supported languages</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {LOCALE_OPTIONS.map((l) => {
                const isDefault = l.value === center.defaultLocale;
                const id = `locale-${l.value}`;
                return (
                  <div key={l.value} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={center.locales.includes(l.value)}
                      disabled={readOnly || isDefault}
                      onCheckedChange={(on) => toggle(l.value, on === true)}
                    />
                    <Label htmlFor={id} className="text-sm font-normal text-foreground">
                      {l.label}
                      {isDefault ? <span className="ml-1 text-xs text-text-tertiary">(default)</span> : null}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Header Text" description="Shown on the help-center home page in each language (Preview only).">
        <div className="grid gap-6">
          {center.locales.map((l) => {
            const title = theme.header.title?.[l] ?? "";
            return (
              <div key={l} className="grid gap-3">
                <p className="text-sm font-medium text-foreground">{localeLabel(l)}</p>
                <Field
                  label="Header title"
                  hint={
                    title ? null : (
                      <span className="text-amber-400">Add a title for this language — required once the website ships</span>
                    )
                  }
                >
                  <AutoInput
                    value={title}
                    disabled={readOnly}
                    placeholder="Acme Help"
                    onSave={(v) => hc.mergeCenter(center, { theme: { header: { title: { [l]: v } } } })}
                  />
                </Field>
                <Field label="Welcome text">
                  <AutoInput
                    value={theme.hero.welcome?.[l] ?? ""}
                    disabled={readOnly}
                    placeholder="How can we help?"
                    onSave={(v) => hc.mergeCenter(center, { theme: { hero: { welcome: { [l]: v } } } })}
                  />
                </Field>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

// ---- Domain -------------------------------------------------------------------

export function DomainSection({ center, hc, readOnly }) {
  return (
    <div className="space-y-6">
      <WebsiteNotice />
      <SectionCard
        title="Custom Domain"
        action={<Badge variant="neutral">Not verified · Not served</Badge>}
      >
        <div className="grid gap-5">
          <Field label="Domain" hint="Hostname only, for example help.acme.com. Unique within this workspace.">
            <AutoInput
              value={center.domain}
              disabled={readOnly}
              saveOn="blur"
              placeholder="help.acme.com"
              className="font-mono"
              failMessage="This domain can't be used"
              validate={(v) => (v && !HOSTNAME_RE.test(v.toLowerCase()) ? "Enter a hostname like help.acme.com." : null)}
              onSave={(domain) => hc.updateCenter(center, { domain: domain.toLowerCase() }, { quiet: true })}
            />
          </Field>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-card text-xs text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-foreground">CNAME</td>
                  <td className="px-3 py-2 font-mono text-foreground">{center.domain || "help.yourcompany.com"}</td>
                  <td className="px-3 py-2 text-text-secondary">Available when websites ship</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ---- Visibility & SEO ------------------------------------------------------------

export function VisibilitySection({ center, hc, readOnly }) {
  const reason = readOnly ? NEEDS_PUBLISH : null;
  return (
    <div className="space-y-6">
      <WebsiteNotice />
      <SectionCard title="Visibility">
        <RadioGroup
          value={center.visibility}
          disabled={readOnly}
          onValueChange={(visibility) => hc.updateCenter(center, { visibility }, { rederives: true })}
        >
          {[
            { value: "public", label: "Public", hint: "Anyone can read it." },
            {
              value: "private",
              label: "Private",
              hint: "Only signed-in customers can read it. Its articles stay out of the Messenger.",
            },
          ].map((o) => (
            <div key={o.value} className="flex items-start gap-2.5">
              <RadioGroupItem value={o.value} id={`visibility-${o.value}`} className="mt-0.5" />
              <Label htmlFor={`visibility-${o.value}`} className="grid gap-0.5 font-normal">
                <span className="text-sm text-foreground">{o.label}</span>
                <span className="text-xs text-text-secondary">{o.hint}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
        {center.visibility === "private" ? (
          <div className="mt-5">
            <Field label="Login page URL" hint="Where signed-out readers are sent.">
              <AutoInput
                value={center.loginUrl}
                disabled={readOnly}
                saveOn="blur"
                placeholder="https://app.acme.com/login"
                validate={urlField}
                onSave={(loginUrl) => hc.mergeCenter(center, { metadata: { loginUrl } })}
              />
            </Field>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Search & Analytics">
        <SettingsList>
          <SettingRow
            title="Let search engines index this help center"
            description="Adds the robots rules once the website ships."
            control={
              <Gated reason={reason}>
                <Switch
                  checked={center.indexing}
                  disabled={readOnly}
                  aria-label="Let search engines index this help center"
                  onCheckedChange={(indexing) => hc.mergeCenter(center, { metadata: { indexing } })}
                />
              </Gated>
            }
          />
        </SettingsList>
        <div className="mt-5">
          <Field label="Google Analytics measurement ID">
            <AutoInput
              value={center.gaTrackingId}
              disabled={readOnly}
              saveOn="blur"
              placeholder="G-XXXXXXX"
              className="w-64 font-mono"
              validate={(v) => (v && !GA_ID_RE.test(v) ? "Use the G-XXXXXXX measurement ID." : null)}
              onSave={(gaTrackingId) => hc.mergeCenter(center, { metadata: { gaTrackingId } })}
            />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

// ---- Branding -------------------------------------------------------------------

const COLOR_FIELDS = [
  { key: "action", label: "Action colour" },
  { key: "headerBg", label: "Header background" },
  { key: "headerText", label: "Header text" },
  { key: "bodyBg", label: "Body background" },
];

export function BrandingSection({ center, hc, theme, readOnly }) {
  const reason = readOnly ? NEEDS_PUBLISH : null;
  const merge = (patch) => hc.mergeCenter(center, { theme: patch });
  const [dragRadius, setDragRadius] = useState(null);
  const radius = dragRadius ?? theme.radius;

  return (
    <div className="space-y-6">
      <WebsiteNotice />
      <SectionCard title="Images">
        <div className="grid gap-5">
          <Field label="Logo URL">
            <AutoInput
              value={theme.header.logoUrl}
              disabled={readOnly}
              saveOn="blur"
              placeholder="https://…/logo.svg"
              validate={urlField}
              onSave={(logoUrl) => merge({ header: { logoUrl } })}
            />
          </Field>
          <Field label="Favicon URL">
            <AutoInput
              value={theme.faviconUrl}
              disabled={readOnly}
              saveOn="blur"
              placeholder="https://…/favicon.png"
              validate={urlField}
              onSave={(faviconUrl) => merge({ faviconUrl })}
            />
          </Field>
          <Field label="Social image URL" hint="Shown when a help-center link is shared.">
            <AutoInput
              value={theme.socialImageUrl}
              disabled={readOnly}
              saveOn="blur"
              placeholder="https://…/social.png"
              validate={urlField}
              onSave={(socialImageUrl) => merge({ socialImageUrl })}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Colours & Type">
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-6 w-6 shrink-0 rounded-md border border-border"
                    style={{ backgroundColor: theme.colors[f.key] }}
                  />
                  <div className="min-w-0 flex-1">
                    <AutoInput
                      value={theme.colors[f.key]}
                      disabled={readOnly}
                      saveOn="blur"
                      className="font-mono"
                      validate={(v) => (HEX_COLOR_RE.test(v) ? null : "Use a #rrggbb colour.")}
                      onSave={(v) => merge({ colors: { [f.key]: v.toLowerCase() } })}
                    />
                  </div>
                </div>
              </Field>
            ))}
          </div>
          <Field label="Font">
            <Select value={theme.font} disabled={readOnly} onValueChange={(font) => merge({ font })}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={`Corner radius · ${radius}px`}>
            <Slider
              min={0}
              max={30}
              step={1}
              value={[radius]}
              disabled={readOnly}
              onValueChange={([v]) => setDragRadius(v)}
              onValueCommit={([v]) => {
                setDragRadius(null);
                merge({ radius: v });
              }}
              className="max-w-sm"
            />
          </Field>
          <Field label="Style">
            <Gated reason={reason}>
              <SegmentedTabs
                tabs={[
                  { label: "Card", value: "card" },
                  { label: "Floating", value: "floating" },
                ]}
                value={theme.style}
                className={readOnly ? LOCKED_TABS : undefined}
                onChange={(style) => !readOnly && merge({ style })}
              />
            </Gated>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Articles">
        <SettingsList>
          <SettingRow
            title="Show article authors"
            description="The author's name and avatar on article pages."
            control={
              <Gated reason={reason}>
                <Switch
                  checked={theme.showAuthors}
                  disabled={readOnly}
                  aria-label="Show article authors"
                  onCheckedChange={(showAuthors) => merge({ showAuthors })}
                />
              </Gated>
            }
          />
        </SettingsList>
      </SectionCard>
    </div>
  );
}

// ---- Layout -------------------------------------------------------------------

function move(list, index, delta) {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  return next;
}

function LinksEditor({ links, disabled, onSave }) {
  const [rows, setRows] = useState(links);
  const [synced, setSynced] = useState(links);
  const [error, setError] = useState(null);
  if (links !== synced) {
    setSynced(links);
    setRows(links);
  }

  function commit(next) {
    const bad = next.find((l) => !l.label.trim() || httpsUrlError(l.url.trim()) || !l.url.trim());
    if (bad) {
      setError("Each link needs a label and an https:// address.");
      return;
    }
    setError(null);
    const cleaned = next.map((l) => ({ label: l.label.trim(), url: l.url.trim() }));
    if (JSON.stringify(cleaned) !== JSON.stringify(links)) onSave(cleaned);
  }

  const edit = (i, key, value) => setRows((prev) => prev.map((l, j) => (j === i ? { ...l, [key]: value } : l)));

  return (
    <div className="grid gap-2">
      {rows.map((link, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={link.label}
            placeholder="Label"
            disabled={disabled}
            className="w-40"
            onChange={(e) => edit(i, "label", e.target.value)}
            onBlur={() => commit(rows)}
          />
          <Input
            value={link.url}
            placeholder="https://…"
            disabled={disabled}
            onChange={(e) => edit(i, "url", e.target.value)}
            onBlur={() => commit(rows)}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove link"
            disabled={disabled}
            className="text-text-secondary hover:bg-surface-active hover:text-foreground"
            onClick={() => {
              const next = rows.filter((_, j) => j !== i);
              setRows(next);
              commit(next);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
          onClick={() => setRows((prev) => [...prev, { label: "", url: "" }])}
        >
          <Plus className="h-3.5 w-3.5" /> Add link
        </Button>
      </div>
    </div>
  );
}

export function LayoutSection({ center, hc, theme, readOnly }) {
  const reason = readOnly ? NEEDS_PUBLISH : null;
  const layout = theme.layout;
  const mergeLayout = (patch) => hc.mergeCenter(center, { theme: { layout: patch } });
  const sections = layout.sections;
  const featured = layout.featuredArticleIds.filter((id) => hc.articlesById[id]);
  const candidates = hc.statsOf(center)
    .placements.map((p) => hc.articlesById[p.articleId])
    .filter((a) => a && a.state === "published" && !featured.includes(a.id));

  return (
    <div className="space-y-6">
      <WebsiteNotice />
      <SectionCard title="Home Page Sections">
        <div className="divide-y divide-border">
          {sections.map((section, i) => (
            <div key={section.key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="text-sm text-foreground">{LAYOUT_SECTION_LABELS[section.key] ?? section.key}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move up"
                  disabled={readOnly || i === 0}
                  className="text-text-secondary hover:bg-surface-active hover:text-foreground"
                  onClick={() => mergeLayout({ sections: move(sections, i, -1) })}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move down"
                  disabled={readOnly || i === sections.length - 1}
                  className="text-text-secondary hover:bg-surface-active hover:text-foreground"
                  onClick={() => mergeLayout({ sections: move(sections, i, 1) })}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Gated reason={reason}>
                  <Switch
                    checked={section.visible}
                    disabled={readOnly}
                    aria-label={`Show ${LAYOUT_SECTION_LABELS[section.key]}`}
                    onCheckedChange={(visible) =>
                      mergeLayout({ sections: sections.map((s, j) => (j === i ? { ...s, visible } : s)) })
                    }
                  />
                </Gated>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Collections">
        <div className="grid gap-5">
          <Field label="Columns">
            <Gated reason={reason}>
              <SegmentedTabs
                tabs={[1, 2, 3].map((n) => ({ label: String(n), value: n }))}
                value={layout.collectionColumns}
                className={readOnly ? LOCKED_TABS : undefined}
                onChange={(collectionColumns) => !readOnly && mergeLayout({ collectionColumns })}
              />
            </Gated>
          </Field>
          <Field label="Card style">
            <Gated reason={reason}>
              <SegmentedTabs
                tabs={[
                  { label: "Classic", value: "classic" },
                  { label: "Visual", value: "visual" },
                  { label: "Compact", value: "compact" },
                ]}
                value={layout.cardStyle}
                className={readOnly ? LOCKED_TABS : undefined}
                onChange={(cardStyle) => !readOnly && mergeLayout({ cardStyle })}
              />
            </Gated>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Featured Articles" description={`Up to ${MAX_FEATURED} published articles from this help center.`}>
        <div className="grid gap-3">
          {featured.map((id, i) => (
            <div key={id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-card px-3 py-2">
              <span className="truncate text-sm text-foreground">{hc.articlesById[id].title || "Untitled article"}</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move up"
                  disabled={readOnly || i === 0}
                  className="text-text-secondary hover:bg-surface-active hover:text-foreground"
                  onClick={() => mergeLayout({ featuredArticleIds: move(featured, i, -1) })}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move down"
                  disabled={readOnly || i === featured.length - 1}
                  className="text-text-secondary hover:bg-surface-active hover:text-foreground"
                  onClick={() => mergeLayout({ featuredArticleIds: move(featured, i, 1) })}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove from featured"
                  disabled={readOnly}
                  className="text-text-secondary hover:bg-surface-active hover:text-foreground"
                  onClick={() => mergeLayout({ featuredArticleIds: featured.filter((x) => x !== id) })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {featured.length < MAX_FEATURED ? (
            <Select
              value=""
              disabled={readOnly || !candidates.length}
              onValueChange={(id) => mergeLayout({ featuredArticleIds: [...featured, id] })}
            >
              <SelectTrigger className="w-72">
                <SelectValue placeholder={candidates.length ? "Add a featured article…" : "No more published articles here"} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title || "Untitled article"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Content Block">
        <div className="grid gap-4">
          <Field label="Title">
            <AutoInput
              value={layout.content.title}
              disabled={readOnly}
              onSave={(title) => mergeLayout({ content: { title } })}
            />
          </Field>
          <Field label="Description">
            <AutoInput
              multiline
              rows={2}
              value={layout.content.description}
              disabled={readOnly}
              onSave={(description) => mergeLayout({ content: { description } })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Button label">
              <AutoInput
                value={layout.content.ctaLabel}
                disabled={readOnly}
                onSave={(ctaLabel) => mergeLayout({ content: { ctaLabel } })}
              />
            </Field>
            <Field label="Button URL">
              <AutoInput
                value={layout.content.ctaUrl}
                disabled={readOnly}
                saveOn="blur"
                placeholder="https://…"
                validate={urlField}
                onSave={(ctaUrl) => mergeLayout({ content: { ctaUrl } })}
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Article Pages">
        <SettingsList>
          <SettingRow
            title="Show table of contents"
            description="Built from the article's headings."
            control={
              <Gated reason={reason}>
                <Switch
                  checked={layout.article.showToc}
                  disabled={readOnly}
                  aria-label="Show table of contents"
                  onCheckedChange={(showToc) => mergeLayout({ article: { showToc } })}
                />
              </Gated>
            }
          />
          <SettingRow
            title="Show related articles"
            description="Other articles from the same collection."
            control={
              <Gated reason={reason}>
                <Switch
                  checked={layout.article.showRelated}
                  disabled={readOnly}
                  aria-label="Show related articles"
                  onCheckedChange={(showRelated) => mergeLayout({ article: { showRelated } })}
                />
              </Gated>
            }
          />
        </SettingsList>
      </SectionCard>

      <SectionCard title="Footer">
        <div className="grid gap-5">
          <Field label="Template">
            <Gated reason={reason}>
              <SegmentedTabs
                tabs={[
                  { label: "Simple", value: "simple" },
                  { label: "Classic", value: "classic" },
                  { label: "Multi-level", value: "multi" },
                ]}
                value={theme.footer.template}
                className={readOnly ? LOCKED_TABS : undefined}
                onChange={(template) => !readOnly && hc.mergeCenter(center, { theme: { footer: { template } } })}
              />
            </Gated>
          </Field>
          <Field label="Links">
            <LinksEditor
              links={theme.footer.links}
              disabled={readOnly}
              onSave={(links) => hc.mergeCenter(center, { theme: { footer: { links } } })}
            />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

// ---- Danger zone -------------------------------------------------------------------

export function AdvancedSection({ center, readOnly, onDelete }) {
  return (
    <SectionCard
      title="Danger zone"
      description={
        center.isDefault
          ? "The default help center can't be deleted — make another one default first."
          : "Deleting removes its collections and takes its articles out of this help center. The articles are kept."
      }
    >
      <Gated reason={readOnly ? NEEDS_PUBLISH : null}>
        <Button
          type="button"
          className="bg-red-500/90 text-white hover:bg-red-500"
          disabled={readOnly || center.isDefault}
          onClick={() => onDelete(center)}
        >
          <Trash2 className="h-4 w-4" /> Delete help center
        </Button>
      </Gated>
    </SectionCard>
  );
}
