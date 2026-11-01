"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
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
} from "@geiger/ui";

import { SectionCard, SettingsList } from "@/components/internal/shared/screen_kit";
import { hasCapability, suggestedModelsFor } from "@/lib/ai/provider_kinds";

const NONE = "__none__";
const OTHER = "__other__";

// Title and description over its controls, so two selects fit at phone width (SettingRow keeps them on one line).
function DefaultRow({ title, description, children, footer }) {
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-text-secondary">{description}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{children}</div>
      {footer ? <div className="mt-2 text-xs">{footer}</div> : null}
    </div>
  );
}

function ProviderSelect({ label, value, options, disabled, onChange }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Free-text model id that commits on Enter or blur.
function ModelInput({ id, value, placeholder, list, disabled, onCommit }) {
  const [text, setText] = useState(value || "");
  const [seed, setSeed] = useState(value);
  if (value !== seed) {
    setSeed(value);
    setText(value || "");
  }
  const commit = () => {
    const next = text.trim();
    if (next && next !== (value || "")) onCommit(next);
  };
  return (
    <Input
      id={id}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      placeholder={placeholder}
      list={list}
      disabled={disabled}
      aria-label={placeholder}
    />
  );
}

// Settings → AI Providers → Default Models (spec §6.2 item 5): the chat and embedding defaults every AI feature uses.
// Embedding dimensions are detected before each save; a change while chunks exist asks to re-index first.
export function DefaultModelsCard({ status, providers, canManage, saveSettings, detectDims, reindexing, onReindex, onNeedsConsent }) {
  const [otherChat, setOtherChat] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState(null);
  const [reindexAsk, setReindexAsk] = useState(null); // { patch, chunks }
  const [confirming, setConfirming] = useState(false);

  const chat = status?.chat || {};
  const embed = status?.embed || {};
  const chatProvider = providers.find((p) => p.id === chat.providerId) || null;
  const embedProvider = providers.find((p) => p.id === embed.providerId) || null;
  const chatOptions = providers.filter((p) => hasCapability(p, "chat") && (p.status !== "error" || p.id === chat.providerId));
  const embedOptions = providers.filter((p) => hasCapability(p, "embed"));
  const chatModels = chatProvider?.models || [];
  const chatModelValue = otherChat || (chat.model && !chatModels.includes(chat.model)) ? OTHER : chat.model || NONE;
  const embedSuggestions = embedProvider ? suggestedModelsFor(embedProvider, "embed") : [];
  const locked = !canManage || detecting || Boolean(reindexing);

  const afterSave = (res, assignsDefault) => {
    if (res.ok && assignsDefault && !res.status.dataSharingAcknowledged) onNeedsConsent();
  };

  const saveChat = async (patch, preview) => {
    const res = await saveSettings(patch, (s) => ({ ...s, chat: { ...s.chat, ...preview } }));
    afterSave(res, "chatProviderId" in patch && patch.chatProviderId);
  };

  const pickChatProvider = (id) => {
    const provider = providers.find((p) => p.id === id);
    setOtherChat(false);
    void saveChat({ chatProviderId: id, chatModel: provider?.models[0] ?? null }, { providerId: id, providerName: provider?.name ?? null, model: provider?.models[0] ?? null });
  };

  const pickChatModel = (value) => {
    if (value === OTHER) {
      setOtherChat(true);
      return;
    }
    setOtherChat(false);
    void saveChat({ chatModel: value === NONE ? null : value }, { model: value === NONE ? null : value });
  };

  const saveEmbedding = async (patch) => {
    const res = await saveSettings(patch, (s) => ({ ...s, embed: { ...s.embed, model: patch.embedModel ?? s.embed.model, dims: patch.embedDims ?? s.embed.dims } }));
    if (res.code === "embedding_in_use") setReindexAsk({ patch, chunks: res.chunks });
    afterSave(res, Boolean(patch.embedProviderId));
  };

  // Detect first, then save the embedding default with its dimensions in the same call. A failed detect keeps the previous value.
  const changeEmbedding = async (providerId, model) => {
    setDetectError(null);
    if (!providerId) {
      await saveEmbedding({ embedProviderId: null });
      return;
    }
    if (!model) {
      setDetectError("Choose an embedding model for this provider.");
      return;
    }
    setDetecting(true);
    const detected = await detectDims(providerId, model);
    setDetecting(false);
    if (!detected.ok) {
      setDetectError(detected.message);
      return;
    }
    await saveEmbedding({ embedProviderId: providerId, embedModel: model, embedDims: detected.dims });
  };

  const pickEmbedProvider = (id) => {
    const provider = providers.find((p) => p.id === id);
    void changeEmbedding(id, provider ? suggestedModelsFor(provider, "embed")[0]?.id : null);
  };

  const confirmReindex = async () => {
    setConfirming(true);
    const res = await saveSettings({ ...reindexAsk.patch, confirmReindex: true });
    setConfirming(false);
    if (!res.ok) return;
    setReindexAsk(null);
    if (res.status.reindex?.pending > 0) void onReindex(res.status.reindex.pending);
  };

  const pending = status?.reindex?.pending || 0;
  const embedFooter = detecting ? (
    <span className="inline-flex items-center gap-1.5 text-text-secondary">
      <Loader2 className="h-3 w-3 animate-spin" /> Detecting dimensions…
    </span>
  ) : reindexing ? (
    <span className="inline-flex items-center gap-1.5 text-text-secondary">
      <Loader2 className="h-3 w-3 animate-spin" /> Re-indexing… {reindexing.done} of {reindexing.total}
    </span>
  ) : (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-text-secondary">{embed.dims ? `${embed.dims} dimensions` : "Dimensions not detected"}</span>
      {detectError ? <span className="text-red-400">{detectError}</span> : null}
      {pending > 0 ? <span className="text-text-tertiary">{pending} articles are waiting to be re-indexed; the next publish continues it.</span> : null}
    </div>
  );

  return (
    <SectionCard title="Default Models" description="The models every AI feature in this workspace uses.">
      <SettingsList>
        <DefaultRow title="Chat" description="Drafting, translation and knowledge-gap clustering.">
          <ProviderSelect label="Chat provider" value={chat.providerId} options={chatOptions} disabled={locked} onChange={pickChatProvider} />
          {chatModelValue === OTHER ? (
            <ModelInput id="ai-chat-model" value={chat.model} placeholder="Model id" disabled={locked || !chatProvider} onCommit={(m) => saveChat({ chatModel: m }, { model: m })} />
          ) : (
            <Select value={chatModelValue} onValueChange={pickChatModel} disabled={locked || !chatProvider}>
              <SelectTrigger aria-label="Chat model">
                <SelectValue placeholder="Choose a model" />
              </SelectTrigger>
              <SelectContent>
                {chatModels.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
                {!chatModels.length ? <SelectItem value={NONE}>No models on this provider</SelectItem> : null}
                <SelectItem value={OTHER}>Other…</SelectItem>
              </SelectContent>
            </Select>
          )}
        </DefaultRow>
        <DefaultRow title="Embeddings" description="Indexes articles for AI answers and knowledge-gap matching." footer={embedFooter}>
          <ProviderSelect label="Embedding provider" value={embed.providerId} options={embedOptions} disabled={locked} onChange={pickEmbedProvider} />
          <div className="flex gap-2">
            <ModelInput
              id="ai-embed-model"
              value={embed.model}
              placeholder="Embedding model id"
              list="ai-embed-model-suggestions"
              disabled={locked || !embedProvider}
              onCommit={(m) => changeEmbedding(embed.providerId, m)}
            />
            <datalist id="ai-embed-model-suggestions">
              {embedSuggestions.map((m) => (
                <option key={m.id} value={m.id} />
              ))}
            </datalist>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
              disabled={locked || !embedProvider || !embed.model}
              onClick={() => changeEmbedding(embed.providerId, embed.model)}
            >
              <RefreshCw className="h-4 w-4" /> Re-detect
            </Button>
          </div>
        </DefaultRow>
      </SettingsList>

      <Dialog open={Boolean(reindexAsk)} onOpenChange={(open) => !open && !confirming && setReindexAsk(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Re-index knowledge?</DialogTitle>
            <DialogDescription>
              Switching the embedding model deletes the {reindexAsk?.chunks} indexed chunks and rebuilds them with the new model. AI
              answers fall back to keyword search until it finishes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReindexAsk(null)} disabled={confirming}>
              Cancel
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={confirmReindex} disabled={confirming}>
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Re-index
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

export default DefaultModelsCard;
