"use client";

// Help center editor (KB spec §10.3): EditorShell with the section in the URL (?center=<id>&section=…). The list
// screen keys this by center id and owns the delete dialog.

import { useMemo } from "react";
import { Eye, Star } from "lucide-react";
import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from "@geiger/ui";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Notice } from "@/components/internal/shared/notice";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { HELP_CENTER_STATUS_MAP, NEEDS_PUBLISH, VISIBILITY_MAP, formatRelative, themeOf } from "./constants";
import {
  AdvancedSection,
  BrandingSection,
  DomainSection,
  GeneralSection,
  HELP_CENTER_NAV,
  LanguagesSection,
  LayoutSection,
  OverviewSection,
  VisibilitySection,
} from "./help_center_sections";
import { CollectionsSection } from "./collections_section";
import { HelpCenterPreview } from "./help_center_preview";
import { Gated } from "@/components/internal/shared/gated";

const OUTLINE_ACTION =
  "border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground";

const SECTIONS = {
  overview: OverviewSection,
  general: GeneralSection,
  languages: LanguagesSection,
  domain: DomainSection,
  visibility: VisibilitySection,
  content: CollectionsSection,
  branding: BrandingSection,
  layout: LayoutSection,
  preview: HelpCenterPreview,
  advanced: AdvancedSection,
};

export function HelpCenterDetailScreen({ center, hc, onBack, onDelete }) {
  const { section, setSection } = useWorkspaceUrl();
  const theme = useMemo(() => themeOf(center), [center]);
  const readOnly = !hc.canPublish;

  const meta = [
    center.domain || center.slug || null,
    `${center.locales.length} ${center.locales.length === 1 ? "language" : "languages"}`,
    `Updated ${formatRelative(center.updatedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <EditorShell
      back={{ label: "Help Centers", onClick: onBack }}
      title={center.name || "Untitled help center"}
      status={center.isLive ? "live" : "not_live"}
      statusMap={HELP_CENTER_STATUS_MAP}
      badges={
        <>
          {center.isDefault ? (
            <Badge variant="info">Default</Badge>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  <Badge variant="neutral">Not used by the Messenger</Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                The Messenger shows your default help center. Make this one default to use it there.
              </TooltipContent>
            </Tooltip>
          )}
          <Badge variant="neutral">Website not served</Badge>
          <StatusPill status={center.visibility} map={VISIBILITY_MAP} />
        </>
      }
      meta={meta}
      actions={
        <>
          {!center.isDefault ? (
            <Gated reason={readOnly ? NEEDS_PUBLISH : null}>
              <Button variant="outline" className={OUTLINE_ACTION} disabled={readOnly} onClick={() => hc.setDefault(center)}>
                <Star className="h-4 w-4" /> Set as default
              </Button>
            </Gated>
          ) : null}
          <Button variant="outline" className={OUTLINE_ACTION} onClick={() => setSection("preview")}>
            <Eye className="h-4 w-4" /> Preview
          </Button>
        </>
      }
      beforeBody={
        readOnly ? (
          <Notice>You can see this help center. Changing it needs the Publish articles permission.</Notice>
        ) : null
      }
      nav={HELP_CENTER_NAV}
      subject={center}
      active={section}
      onActiveChange={setSection}
    >
      {({ active }) => {
        const Section = SECTIONS[active] ?? OverviewSection;
        return <Section center={center} hc={hc} theme={theme} readOnly={readOnly} onDelete={onDelete} />;
      }}
    </EditorShell>
  );
}

export default HelpCenterDetailScreen;
