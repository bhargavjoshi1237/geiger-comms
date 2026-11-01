"use client";

// Quality & CSAT: the satisfaction report in full (trend plus the latest 50 rated conversations); QA scorecards are not built yet.

import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader } from "@/components/internal/shared/screen_kit";
import { useOptionalProject } from "@/context/project-context";
import { ReportToolbar, useReportFilters } from "./report_filters";
import { CsatReport } from "./csat_report";

export function QualityCsatScreen() {
  const { projectId } = useOptionalProject() ?? {};
  const filters = useReportFilters(projectId);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Quality & CSAT"
        description="How customers rate their conversations, over time and by score, with their comments."
      />
      <ReportToolbar filters={filters} />
      <CsatReport query={filters.query} range={filters.range} detailed />
    </MainScreenWrapper>
  );
}

export default QualityCsatScreen;
