"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@geiger/ui";

import { Notice } from "@/components/internal/shared/notice";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { AI_FEATURES, featureAvailability } from "@/lib/ai/features";

// The notice every disabled AI control shows (spec §6.5); setup actions link managers to AI Providers, others are told whom to ask.

const SETUP = "Set up AI";
const REVIEW = "Review data sharing";

function copyFor(reason, status, label) {
  switch (reason) {
    case "not_configured":
      return {
        text: "AI isn't set up for this workspace. Connect a provider in Settings → AI Providers — Comms uses your own key.",
        action: SETUP,
        ask: "Ask a workspace admin to connect one.",
      };
    case "no_default":
      return {
        text: "An AI provider is connected, but no default chat model is chosen. Choose one in Settings → AI Providers → Default Models.",
        action: SETUP,
        ask: "Ask a workspace admin to choose one.",
      };
    case "feature_disabled":
      return { text: `${label} is turned off in Settings → AI Providers → AI Features.` };
    case "provider_error": {
      const detail = (status?.chat?.error?.message || "it reported an error").replace(/\.$/, "");
      return { text: `Your AI provider isn't responding (${detail}). Check it in Settings → AI Providers.` };
    }
    case "consent_required":
      return {
        text: "Data sharing with your AI provider hasn't been confirmed. Confirm it in Settings → AI Providers → AI Features → Data sharing.",
        action: REVIEW,
        ask: "Ask a workspace admin to confirm it.",
      };
    case "quota_exceeded":
      return { text: `Today's AI limit for ${label} is used up. It resets within 24 hours, or an admin can raise it in Settings → AI Providers.` };
    default:
      return { text: "AI status couldn't be checked right now. Try again shortly." };
  }
}

export function AiUnavailableNotice({ status, feature, compact = false }) {
  const { setTab } = useWorkspaceUrl();
  const reason = feature ? featureAvailability(status, feature).reason : status?.chat?.available ? null : status?.chat?.reason || "unknown";
  if (!reason) return null;

  const label = AI_FEATURES[feature]?.label || "AI";
  const { text, action, ask } = copyFor(reason, status, label);
  const canAct = Boolean(action && status?.canManage);
  const button = canAct ? (
    <Button
      size="sm"
      variant={compact ? "link" : "outline"}
      className={compact ? "h-auto p-0 text-xs text-foreground" : "h-7 border-border bg-transparent text-xs text-foreground hover:bg-surface-active"}
      onClick={() => setTab("AI Providers")}
    >
      {action}
    </Button>
  ) : null;
  const message = action && !canAct ? `${text} ${ask}` : text;

  if (compact) {
    return (
      <div className="flex flex-col items-start gap-1.5 text-xs leading-relaxed text-text-secondary">
        <p>{message}</p>
        {button}
      </div>
    );
  }
  return (
    <Notice icon={Sparkles} action={button}>
      {message}
    </Notice>
  );
}

export default AiUnavailableNotice;
