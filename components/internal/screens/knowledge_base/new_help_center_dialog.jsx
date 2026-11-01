"use client";

// New help center (KB spec §10.2). The first center becomes the default automatically; later ones are told the
// Messenger only shows the default. Closes only once the create succeeds.

import { useState } from "react";
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
  Switch,
} from "@geiger/ui";
import { Field } from "@/components/internal/shared/screen_kit";
import { slugify } from "@/lib/kb/slug";
import { DEFAULT_LOCALE, HELP_CENTER_SLUG_RE, LOCALE_OPTIONS } from "./constants";

const NO_BRAND = "__none__";

export function NewHelpCenterDialog({ open, onOpenChange, centers, brands, onCreate }) {
  const first = centers.length === 0;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [brandId, setBrandId] = useState(NO_BRAND);
  const [isLive, setIsLive] = useState(first);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const taken = (field, value) =>
    centers.some((c) => (c[field] || "").toLowerCase() === value.trim().toLowerCase());
  const nameError = !name.trim() ? "A name is required." : taken("name", name) ? "Another help center has this name." : null;
  const slugError = !HELP_CENTER_SLUG_RE.test(slug)
    ? "Use lowercase letters, numbers and hyphens (1–64 characters)."
    : taken("slug", slug)
      ? "Another help center uses this identifier."
      : null;

  function close(next) {
    if (busy) return;
    onOpenChange(next);
  }

  function changeName(value) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value).slice(0, 64).replace(/-+$/, ""));
  }

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (nameError || slugError) return;
    setBusy(true);
    const created = await onCreate({
      name: name.trim(),
      slug,
      locale,
      brandId: brandId === NO_BRAND ? null : brandId,
      isLive,
    });
    setBusy(false);
    if (created) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New help center</DialogTitle>
            <DialogDescription>
              {first
                ? "Your first help center becomes the default — its articles appear in the Messenger's Help space."
                : "The Messenger shows your default help center. This one won't appear there unless you make it the default."}
            </DialogDescription>
          </DialogHeader>

          <Field label="Name" hint={touched && nameError ? <span className="text-red-400">{nameError}</span> : null}>
            <Input value={name} onChange={(e) => changeName(e.target.value)} placeholder="Acme Help" autoFocus />
          </Field>
          <Field
            label="URL identifier"
            hint={touched && slugError ? <span className="text-red-400">{slugError}</span> : "Used in the help center's address once websites ship."}
          >
            <Input
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase());
              }}
              placeholder="help"
              className="font-mono"
            />
          </Field>
          <Field label="Default language">
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALE_OPTIONS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {brands.length ? (
            <Field label="Brand" hint="Optional.">
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BRAND}>No brand</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name || b.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <label className="flex items-center justify-between gap-4 text-sm text-foreground">
            <span>
              Set live
              <span className="block text-xs text-text-secondary">
                A live default help center&apos;s articles show in the Messenger.
              </span>
            </span>
            <Switch checked={isLive} onCheckedChange={setIsLive} />
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create help center
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default NewHelpCenterDialog;
