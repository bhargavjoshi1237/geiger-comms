"use client";

// Analytics: Intercom-style prebuilt reports over one date range and filter set; each section aggregates in the database and loads on its own.

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";
import { useOptionalProject } from "@/context/project-context";
import { ReportToolbar, useReportFilters } from "./report_filters";
import { ConversationsReport } from "./conversations_report";
import { ResponsivenessReport } from "./responsiveness_report";
import { SlaReport } from "./sla_report";
import { CsatReport } from "./csat_report";
import { TeammatesReport } from "./teammates_report";

export function AnalyticsScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const filters = useReportFilters(projectId);
  const { query, range } = filters;

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Analytics"
        description="Conversation volume, responsiveness, SLA compliance, satisfaction and teammate performance for the selected range."
      />
      <ReportToolbar filters={filters} />
      <ConversationsReport query={query} range={range} />
      <ResponsivenessReport query={query} />
      <SlaReport query={query} range={range} />
      <CsatReport query={query} range={range} />
      <TeammatesReport query={query} range={range} />
    </MainScreenWrapper>
  );
}

export default AnalyticsScreen;
