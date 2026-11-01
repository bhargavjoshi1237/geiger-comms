"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Input, Switch } from "@geiger/ui";

import { SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { AI_FEATURES, MAX_DAILY_LIMIT } from "@/lib/ai/features";
import { formatDate } from "../constants";

const DESCRIPTIONS = {
  articleAssist: "Draft, rephrase, shorten, expand and summarize in the article editor.",
  translation: "Machine-translate articles into your help center's languages as drafts.",
  gapClustering: "Group unanswered customer questions into topics. Without it, gaps are grouped by keywords.",
  inboxAssist: "Summarize conversations and rephrase, shorten, expand or fix reply drafts in the inbox.",
  inboxTranslation: "Translate reply drafts into the customer's language, and customer messages into yours.",
  messengerAnswers: "Answer visitors in the Messenger from your published articles.",
};

// Daily cap for one switch (0 = off), committed on blur or Enter.
function LimitInput({ feature, value, disabled, onCommit }) {
  const [text, setText] = useState(String(value));
  const [seed, setSeed] = useState(value);
  if (value !== seed) {
    setSeed(value);
    setText(String(value));
  }
  const commit = () => {
    const n = Number(text);
    if (!Number.isInteger(n) || n < 0 || n > MAX_DAILY_LIMIT) {
      setText(String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={MAX_DAILY_LIMIT}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      disabled={disabled}
      aria-label={`Daily limit for ${AI_FEATURES[feature].label}`}
      className="h-8 w-20 text-right tabular-nums"
    />
  );
}

// Settings → AI Providers → AI Features (spec §6.2 item 6): the data-sharing consent, then one switch and daily cap per feature.
export function AiFeaturesCard({ status, canManage, saveSettings, onReviewConsent }) {
  const acknowledged = Boolean(status?.dataSharingAcknowledged);
  const vendor = status?.chat?.providerName || status?.embed?.providerName || "your AI provider";
  const hasChatDefault = Boolean(status?.chat?.providerId);

  const withdraw = () => saveSettings({ acknowledgeDataSharing: false }, (s) => ({ ...s, dataSharingAcknowledged: false }));

  const toggle = async (key, on) => {
    const res = await saveSettings({ features: { [key]: on } }, (s) => ({ ...s, features: { ...s.features, [key]: on } }));
    if (res.ok && on && !res.status.dataSharingAcknowledged) onReviewConsent();
  };

  const setLimit = (key, n) => saveSettings({ limits: { [key]: n } }, (s) => ({ ...s, limits: { ...s.limits, [key]: n } }));

  const consentDescription = acknowledged
    ? `Confirmed${status.dataSharingAcknowledgedBy ? ` by ${status.dataSharingAcknowledgedBy}` : ""} · ${formatDate(status.dataSharingAcknowledgedAt)}`
    : `Article text, redacted customer questions and the inbox conversations teammates use AI on are sent to ${vendor} to generate results. AI features stay off until you confirm.`;

  return (
    <SectionCard title="AI Features" description="Each feature calls your default chat model and counts against its own daily limit.">
      <SettingsList>
        <SettingRow
          icon={ShieldCheck}
          title="Data sharing"
          description={consentDescription}
          control={
            acknowledged ? (
              <Button variant="ghost" size="sm" onClick={withdraw} disabled={!canManage}>
                Withdraw
              </Button>
            ) : (
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={onReviewConsent} disabled={!canManage}>
                Review &amp; confirm
              </Button>
            )
          }
        />
        {Object.entries(AI_FEATURES).map(([key, feature]) => {
          const pendingPhase = key === "messengerAnswers";
          const hint = pendingPhase ? "Arrives with the Messenger update." : !hasChatDefault ? "Set a default chat model first." : null;
          const used = status?.usageToday?.[key] ?? 0;
          return (
            <SettingRow
              key={key}
              title={feature.label}
              description={
                <>
                  {DESCRIPTIONS[key]}
                  <span className="mt-0.5 block text-text-tertiary">{hint || `${used.toLocaleString("en-US")} used today`}</span>
                </>
              }
              control={
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-text-tertiary">
                    <span className="hidden sm:inline">Daily limit</span>
                    <LimitInput
                      feature={key}
                      value={status?.limits?.[key] ?? 0}
                      disabled={!canManage || pendingPhase}
                      onCommit={(n) => setLimit(key, n)}
                    />
                  </label>
                  <Switch
                    checked={Boolean(status?.features?.[key]) && !pendingPhase}
                    onCheckedChange={(on) => toggle(key, on)}
                    disabled={!canManage || Boolean(hint)}
                    aria-label={feature.label}
                  />
                </div>
              }
            />
          );
        })}
      </SettingsList>
    </SectionCard>
  );
}

export default AiFeaturesCard;
