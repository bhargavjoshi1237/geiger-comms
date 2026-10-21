"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui";

import { Field } from "@/components/internal/shared/screen_kit";
import { TagInput } from "@/components/internal/shared/tag_input";
import { CAPABILITY_LABELS, PROVIDER_KINDS, capabilitiesOf, keyRequired, providerKindLabel, suggestedModelsFor } from "@/lib/ai/provider_kinds";
import { PROVIDER_TEMPLATES } from "../constants";

const CAPABILITY_HINTS = {
  chat: "Drafting, translation and knowledge-gap clustering (/chat/completions).",
  embed: "Indexes articles for AI answers and gap matching (/embeddings).",
};

const TITLES = {
  create: "Connect AI provider",
  edit: "Edit AI provider",
  rotate: "Rotate API key",
  view: "AI provider details",
};

const findTemplate = (value) => PROVIDER_TEMPLATES.find((t) => t.value === value) || PROVIDER_TEMPLATES[0];

const draftFromTemplate = (template) => ({
  template: template.value,
  provider: template.kind,
  preset: template.preset,
  name: template.label,
  // Presets carry their server URL; kinds with an editable URL start blank (= the kind's default).
  baseUrl: template.preset ? template.baseUrl : "",
  capabilities: template.capabilities,
  models: template.models,
});

const draftFromProvider = (provider) => ({
  template: provider.preset ? `preset:${provider.preset}` : provider.provider,
  provider: provider.provider,
  preset: provider.preset,
  name: provider.name,
  baseUrl: provider.baseUrl || "",
  capabilities: provider.capabilities,
  models: provider.models,
});

const sameList = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);

// Connect (create), edit, rotate the key of, or view one provider. The key never round-trips: it is sent once,
// cleared from state as soon as it is handed off, and a blank key on edit keeps the stored one.
export function ProviderDialog({ open, mode = "create", provider, localProvidersAllowed, onOpenChange, onSubmit, onFetchModels }) {
  const [draft, setDraft] = useState(() => draftFromTemplate(PROVIDER_TEMPLATES[0]));
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetched, setFetched] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [seedKey, setSeedKey] = useState(null);

  // Re-seed whenever the dialog opens or switches rows/modes (during render, like the editor screens).
  const currentKey = open ? `${mode}:${provider?.id || "new"}` : null;
  if (currentKey !== seedKey) {
    setSeedKey(currentKey);
    if (open) {
      setDraft(provider ? draftFromProvider(provider) : draftFromTemplate(PROVIDER_TEMPLATES[0]));
      setSecret("");
      setFetched(null);
    }
  }

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const readOnly = mode === "view";
  const kind = PROVIDER_KINDS[draft.provider] || null;
  const userPicksCapabilities = kind?.capabilities === "user";
  const shape = { provider: draft.provider, baseUrl: draft.baseUrl, metadata: { preset: draft.preset, capabilities: draft.capabilities } };
  const capabilities = capabilitiesOf(shape);
  const servesChat = capabilities.includes("chat");
  const needsKey = keyRequired(shape);
  const vendor = providerKindLabel(draft.provider, draft.preset);
  const baseUrlChanged = mode === "edit" && draft.baseUrl.trim() !== (provider?.baseUrl || "");
  const keyMandatory = mode === "rotate" || (needsKey && (mode === "create" || baseUrlChanged));
  const templates = PROVIDER_TEMPLATES.filter((t) => !t.local || localProvidersAllowed || t.value === draft.template);
  const suggestions = [...new Set([...suggestedModelsFor(shape, "chat").map((m) => m.id), ...(fetched || [])])];

  const handleOpenChange = (next) => {
    if (busy) return; // keep the dialog up until the write settles
    onOpenChange(next);
  };

  const pickTemplate = (value) => {
    const next = findTemplate(value);
    setDraft((d) => {
      const current = findTemplate(d.template);
      return {
        ...draftFromTemplate(next),
        // Keep what the user typed; replace only what still matches the old template.
        name: d.name === current.label ? next.label : d.name,
        models: !d.models.length || sameList(d.models, current.models) ? next.models : d.models,
      };
    });
  };

  const toggleCapability = (capability, checked) =>
    setDraft((d) => ({
      ...d,
      capabilities: checked ? [...new Set([...d.capabilities, capability])] : d.capabilities.filter((c) => c !== capability),
    }));

  const fetchModels = async () => {
    setFetching(true);
    const res = await onFetchModels(provider.id);
    setFetching(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setFetched(res.chat);
    if (!res.chat.length) toast("The provider listed no chat models.");
  };

  const problemWith = (apiKey) => {
    if (mode !== "rotate") {
      if (!draft.name.trim()) return "Give the provider a name.";
      if (kind?.baseUrlMode === "required" && !draft.baseUrl.trim()) return "Add the server's base URL.";
      if (userPicksCapabilities && !draft.capabilities.length) return "Pick at least one capability.";
    }
    if (keyMandatory && !apiKey) return baseUrlChanged ? "Enter the API key again for the new base URL." : "Paste the API key.";
    return null;
  };

  const submit = async () => {
    const apiKey = secret.trim();
    const problem = problemWith(apiKey);
    if (problem) {
      toast.error(problem);
      return;
    }

    const payload =
      mode === "rotate"
        ? { apiKey }
        : {
            ...(mode === "create" ? { provider: draft.provider, preset: draft.preset } : {}),
            name: draft.name.trim(),
            ...(kind?.baseUrlMode === "fixed" ? {} : { baseUrl: draft.baseUrl.trim() }),
            ...(userPicksCapabilities ? { capabilities: draft.capabilities } : {}),
            models: servesChat ? draft.models : [],
            ...(apiKey ? { apiKey } : {}),
          };
    // The raw key only lives in this field long enough to hand it off.
    setSecret("");
    setBusy(true);
    const ok = await onSubmit(payload, { retested: Boolean(apiKey) || baseUrlChanged });
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  const keyHint =
    mode === "edit" || mode === "rotate"
      ? provider?.hasKey
        ? `Leave blank to keep the current key${provider.keyLast4 ? ` (•••• ${provider.keyLast4})` : ""}.`
        : "No key is saved yet."
      : userPicksCapabilities
        ? "Optional for local servers."
        : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "rotate" ? `Rotate key for ${provider?.name}` : TITLES[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "rotate"
              ? "The new key replaces the stored one and the connection is tested right away."
              : "Comms calls this provider with your own key. Its capabilities decide which AI features can use it."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) void submit();
          }}
        >
          {mode !== "rotate" ? (
            <>
              <Field label="Provider">
                <Select value={draft.template} onValueChange={pickTemplate} disabled={mode !== "create" || busy}>
                  <SelectTrigger aria-label="Provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Providers</SelectLabel>
                      {templates.filter((t) => !t.preset).map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Presets</SelectLabel>
                      {templates.filter((t) => t.preset).map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {!userPicksCapabilities ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {capabilities.map((c) => (
                      <Badge key={c} variant="neutral">
                        {CAPABILITY_LABELS[c]}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </Field>

              <Field label="Name" htmlFor="ai-provider-name">
                <Input
                  id="ai-provider-name"
                  value={draft.name}
                  onChange={(e) => set("name")(e.target.value)}
                  placeholder="e.g. Production OpenAI"
                  maxLength={80}
                  disabled={readOnly || busy}
                />
              </Field>

              {kind && kind.baseUrlMode !== "fixed" ? (
                <Field
                  label="Base URL"
                  htmlFor="ai-provider-base-url"
                  hint={
                    baseUrlChanged && (needsKey || provider?.hasKey) ? (
                      <span className="text-amber-400">Changing the base URL removes the saved key — enter it again.</span>
                    ) : kind.baseUrlMode === "required" ? (
                      "Required, e.g. https://api.groq.com/openai/v1"
                    ) : (
                      `Leave blank to use ${kind.baseUrl}`
                    )
                  }
                >
                  <Input
                    id="ai-provider-base-url"
                    value={draft.baseUrl}
                    onChange={(e) => set("baseUrl")(e.target.value)}
                    placeholder={kind.baseUrl || "https://"}
                    inputMode="url"
                    disabled={readOnly || busy}
                  />
                </Field>
              ) : null}

              {userPicksCapabilities ? (
                <Field label="Capabilities" hint="What this server can do. Pick at least one.">
                  <div className="space-y-2 rounded-lg border border-border bg-surface-card p-3">
                    {kind.userCapabilities.map((c) => (
                      <label key={c} className="flex items-start gap-3 text-sm">
                        <Checkbox
                          checked={draft.capabilities.includes(c)}
                          onCheckedChange={(v) => toggleCapability(c, Boolean(v))}
                          disabled={readOnly || busy}
                          className="mt-0.5"
                          aria-label={CAPABILITY_LABELS[c]}
                        />
                        <span>
                          <span className="block font-medium text-foreground">{CAPABILITY_LABELS[c]}</span>
                          <span className="block text-xs text-text-secondary">{CAPABILITY_HINTS[c]}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </Field>
              ) : null}
            </>
          ) : null}

          {readOnly ? (
            <Field label="API key">
              <p className="font-mono text-sm text-text-secondary">
                {provider?.keyLast4 ? `•••• ${provider.keyLast4}` : provider?.hasKey ? "Key saved" : "No key"}
              </p>
            </Field>
          ) : (
            <Field label="API key" htmlFor="ai-provider-key" hint={keyHint}>
              <Input
                id="ai-provider-key"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Paste API key"
                autoComplete="off"
                disabled={busy}
              />
            </Field>
          )}

          {mode !== "rotate" && servesChat ? (
            <Field
              label="Chat models"
              hint={fetched?.length ? `${fetched.length} models found — start typing to pick one. The first model is the default.` : "The first model is this provider's default."}
            >
              {readOnly ? (
                <div className="flex flex-wrap gap-1">
                  {draft.models.length ? draft.models.map((m) => <Badge key={m} variant="neutral">{m}</Badge>) : <span className="text-sm text-text-tertiary">None</span>}
                </div>
              ) : (
                <>
                  <TagInput value={draft.models} onChange={set("models")} placeholder="Add a model id…" list="ai-provider-model-suggestions" aria-label="Chat models" />
                  <datalist id="ai-provider-model-suggestions">
                    {suggestions.filter((m) => !draft.models.includes(m)).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  {mode === "edit" ? (
                    <Button type="button" variant="link" size="sm" className="h-auto justify-start p-0 text-xs" onClick={fetchModels} disabled={fetching || busy}>
                      {fetching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      Fetch models
                    </Button>
                  ) : null}
                </>
              )}
            </Field>
          ) : null}

          {!readOnly ? (
            <p className="text-xs text-text-tertiary">
              Your key is sent once to the server, encrypted in Vault, and never shown again. {vendor} bills usage to your account.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly ? (
              <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {mode === "create" ? "Connect" : mode === "rotate" ? "Rotate key" : "Save changes"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ProviderDialog;
