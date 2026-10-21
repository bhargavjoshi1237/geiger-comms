"use client";

import { useCallback } from "react";
import {
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
} from "next/navigation";
import { tabToSlug, slugToTab } from "@/lib/workspace/tabs";

// Workspace navigation mirrored to the URL (/project/<uuid>/<tabSlug>?<entity>=<id>&section=<s>, defaults omitted); callers need a <Suspense> parent for useSearchParams.
export const DEFAULT_TAB = "Overview";
export const DEFAULT_SECTION = "overview";

export function useWorkspaceUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();

  const projectId = params?.projectId || null;
  // The catch-all segment after the project id ([[...rest]]); rest[0] is the tab.
  const rest = params?.rest;
  const tabSlug = Array.isArray(rest) ? rest[0] : rest || null;
  const tab = (tabSlug && slugToTab(tabSlug)) || DEFAULT_TAB;

  const eventId = searchParams.get("event") || null;
  const section = searchParams.get("section") || DEFAULT_SECTION;
  // The open workflow in the Workflows area (mirrors `event` for All Events).
  const workflowId = searchParams.get("workflow") || null;
  // The open venue in the Venues area (mirrors `event` for All Events).
  const venueId = searchParams.get("venue") || null;
  // The open channel in the Channels area (mirrors `event`).
  const channelId = searchParams.get("channel") || null;
  // The open ticket in the Tickets area (mirrors `event`).
  const ticketId = searchParams.get("ticket") || null;
  // The open teammate / role in Settings. Both areas keep their row-click
  // drawer for a quick look; these back the full editor behind "Edit".
  const memberId = searchParams.get("member") || null;
  const roleId = searchParams.get("role") || null;
  // The open person / company / segment in the Customers area.
  const personId = searchParams.get("person") || null;
  const companyId = searchParams.get("company") || null;
  const segmentId = searchParams.get("segment") || null;
  // The open thread in the Inbox area (mirrors `event`).
  const conversationId = searchParams.get("conversation") || null;
  // The active saved view in the Views area / applied to All Conversations.
  const viewId = searchParams.get("view") || null;
  // The open macro in the Macros area (mirrors `ticket`).
  const macroId = searchParams.get("macro") || null;
  // The open article / help center in the Knowledge Base area.
  const articleId = searchParams.get("article") || null;
  const centerId = searchParams.get("center") || null;
  const gapId = searchParams.get("gap") || null;

  // Next URL from a partial patch: `undefined` keeps a key, any explicit value (incl. null) replaces it; defaults and empties drop.
  const buildUrl = useCallback(
    (next) => {
      const pid = next.project !== undefined ? next.project : projectId;
      if (!pid) return pathname; // no active project — nothing to navigate to
      const nextTab = next.tab !== undefined ? next.tab : tab;
      const slug =
        nextTab && nextTab !== DEFAULT_TAB ? tabToSlug(nextTab) : "";
      let path = `/project/${pid}`;
      if (slug) path += `/${slug}`;

      const qp = new URLSearchParams();
      const ev = next.event !== undefined ? next.event : eventId;
      const sec = next.section !== undefined ? next.section : section;
      const wf = next.workflow !== undefined ? next.workflow : workflowId;
      const vn = next.venue !== undefined ? next.venue : venueId;
      const cv = next.conversation !== undefined ? next.conversation : conversationId;
      const vw = next.view !== undefined ? next.view : viewId;
      const ch = next.channel !== undefined ? next.channel : channelId;
      const tk = next.ticket !== undefined ? next.ticket : ticketId;
      const mb = next.member !== undefined ? next.member : memberId;
      const rl = next.role !== undefined ? next.role : roleId;
      const ps = next.person !== undefined ? next.person : personId;
      const co = next.company !== undefined ? next.company : companyId;
      const sg = next.segment !== undefined ? next.segment : segmentId;
      const mc = next.macro !== undefined ? next.macro : macroId;
      const ar = next.article !== undefined ? next.article : articleId;
      const hc = next.center !== undefined ? next.center : centerId;
      const gp = next.gap !== undefined ? next.gap : gapId;
      if (ev) qp.set("event", ev);
      if (vn) qp.set("venue", vn);
      if (ch) qp.set("channel", ch);
      if (tk) qp.set("ticket", tk);
      if (mb) qp.set("member", mb);
      if (rl) qp.set("role", rl);
      if (ps) qp.set("person", ps);
      if (co) qp.set("company", co);
      if (sg) qp.set("segment", sg);
      if (mc) qp.set("macro", mc);
      if (ar) qp.set("article", ar);
      if (hc) qp.set("center", hc);
      if (gp) qp.set("gap", gp);
      if (sec && sec !== DEFAULT_SECTION) qp.set("section", sec);
      if (wf) qp.set("workflow", wf);
      if (cv) qp.set("conversation", cv);
      if (vw) qp.set("view", vw);

      const qs = qp.toString();
      return qs ? `${path}?${qs}` : path;
    },
    [
      projectId,
      tab,
      eventId,
      section,
      workflowId,
      venueId,
      channelId,
      ticketId,
      memberId,
      roleId,
      personId,
      companyId,
      segmentId,
      conversationId,
      viewId,
      macroId,
      articleId,
      centerId,
      gapId,
      pathname,
    ],
  );

  const apply = useCallback(
    (next) => router.push(buildUrl(next), { scroll: false }),
    [router, buildUrl],
  );

  // Switching project clears every open entity (their ids belong to the old project) but keeps the tab.
  const setProject = useCallback(
    (id) =>
      apply({
        project: id,
        event: null,
        section: null,
        workflow: null,
        venue: null,
        channel: null,
        ticket: null,
        member: null,
        role: null,
        person: null,
        company: null,
        segment: null,
        conversation: null,
        view: null,
        macro: null,
        article: null,
        center: null,
        gap: null,
      }),
    [apply],
  );
  // Switching tabs clears every open entity and section.
  const setTab = useCallback(
    (next) =>
      apply({
        tab: next,
        event: null,
        section: null,
        workflow: null,
        venue: null,
        channel: null,
        ticket: null,
        member: null,
        role: null,
        person: null,
        company: null,
        segment: null,
        conversation: null,
        view: null,
        macro: null,
        article: null,
        center: null,
        gap: null,
      }),
    [apply],
  );
  // Opening an event keeps the tab but resets to its default section.
  const openEvent = useCallback(
    (id) => apply({ event: id, section: null }),
    [apply],
  );
  // Switch to another tab and open an event there in one navigation — used when
  // a different screen (e.g. Templates) hands off to the event editor.
  const openEventInTab = useCallback(
    (id, nextTab) => apply({ tab: nextTab, event: id, section: null }),
    [apply],
  );
  const closeEvent = useCallback(
    () => apply({ event: null, section: null }),
    [apply],
  );
  const setSection = useCallback((next) => apply({ section: next }), [apply]);

  // Open / close a workflow in the Workflows area (mirrors openEvent/closeEvent).
  const openWorkflow = useCallback((id) => apply({ workflow: id }), [apply]);
  const closeWorkflow = useCallback(() => apply({ workflow: null }), [apply]);
  // Hand off to the builder from another tab (Workflow Templates → Workflows).
  const openWorkflowInTab = useCallback(
    (id, nextTab) => apply({ tab: nextTab, workflow: id }),
    [apply],
  );

  // Open / close a macro in the Macros area (mirrors openTicket).
  const openMacro = useCallback((id) => apply({ macro: id, section: null }), [apply]);
  const closeMacro = useCallback(
    () => apply({ macro: null, section: null }),
    [apply],
  );

  // Open / close a venue in the Venues area. Opening resets to its default
  // section (mirrors openEvent).
  const openVenue = useCallback(
    (id) => apply({ venue: id, section: null }),
    [apply],
  );
  const closeVenue = useCallback(
    () => apply({ venue: null, section: null }),
    [apply],
  );

  // Open / close a channel in the Channels area. Opening resets to its default
  // section (mirrors openEvent).
  const openChannel = useCallback(
    (id) => apply({ channel: id, section: null }),
    [apply],
  );
  const closeChannel = useCallback(
    () => apply({ channel: null, section: null }),
    [apply],
  );

  // Open / close a ticket in the Tickets area (mirrors openEvent).
  const openTicket = useCallback(
    (id) => apply({ ticket: id, section: null }),
    [apply],
  );
  const closeTicket = useCallback(
    () => apply({ ticket: null, section: null }),
    [apply],
  );
  // Hand off from another screen (a person's tickets → Tickets) in one hop.
  const openTicketInTab = useCallback(
    (id, nextTab) =>
      apply({ tab: nextTab, ticket: id, person: null, company: null, segment: null, section: null }),
    [apply],
  );

  // Open / close the full teammate and role editors reached from the row's
  // action menu; the row click still opens the lighter drawer.
  const openMember = useCallback(
    (id) => apply({ member: id, section: null }),
    [apply],
  );
  const closeMember = useCallback(
    () => apply({ member: null, section: null }),
    [apply],
  );
  const openRole = useCallback((id) => apply({ role: id, section: null }), [apply]);
  const closeRole = useCallback(
    () => apply({ role: null, section: null }),
    [apply],
  );

  // Open / close a person in the Customers area (mirrors openTicket).
  const openPerson = useCallback(
    (id) => apply({ person: id, section: null }),
    [apply],
  );
  const closePerson = useCallback(
    () => apply({ person: null, section: null }),
    [apply],
  );
  // Hand off from Companies / Segments to the person's record in People.
  const openPersonInTab = useCallback(
    (id, nextTab) =>
      apply({ tab: nextTab, person: id, company: null, segment: null, section: null }),
    [apply],
  );

  // Open / close a company in the Customers area.
  const openCompany = useCallback(
    (id) => apply({ company: id, section: null }),
    [apply],
  );
  const closeCompany = useCallback(
    () => apply({ company: null, section: null }),
    [apply],
  );

  // Open / close a segment in the Customers area.
  const openSegment = useCallback(
    (id) => apply({ segment: id, section: null }),
    [apply],
  );
  const closeSegment = useCallback(
    () => apply({ segment: null, section: null }),
    [apply],
  );

  // Open / close a saved view in the Views editor. Distinct from setView, which
  // *applies* a view's filters on All Conversations.
  const openView = useCallback((id) => apply({ view: id, section: null }), [apply]);
  const closeView = useCallback(
    () => apply({ view: null, section: null }),
    [apply],
  );

  // Open / close a conversation thread in the Inbox area (mirrors openEvent).
  const openConversation = useCallback(
    (id) => apply({ conversation: id }),
    [apply],
  );
  const closeConversation = useCallback(
    () => apply({ conversation: null }),
    [apply],
  );
  // Hand off from another screen (Tickets → the linked thread) in one hop.
  const openConversationInTab = useCallback(
    (id, nextTab) => apply({ tab: nextTab, conversation: id }),
    [apply],
  );

  // Apply a saved view on a given tab (Views row click → All Conversations)
  // in one navigation — setTab alone would clear the view param.
  const openViewInTab = useCallback(
    (id, nextTab) => apply({ view: id, tab: nextTab }),
    [apply],
  );

  // The active saved view (Views screen / applied to All Conversations).
  const setView = useCallback((id) => apply({ view: id }), [apply]);

  // Open / close an article in Articles; a translation opens by its own id, so the locale lives in the URL.
  const openArticle = useCallback(
    (id) => apply({ article: id, section: null }),
    [apply],
  );
  const closeArticle = useCallback(
    () => apply({ article: null, section: null }),
    [apply],
  );
  // Hand off from another screen (a help center's collections, Knowledge Gaps) in one hop.
  const openArticleInTab = useCallback(
    (id, nextTab) => apply({ tab: nextTab, article: id, center: null, gap: null, section: null }),
    [apply],
  );

  // Open / close a help center in Help Centers; openCenterInTab can land on a section.
  const openCenter = useCallback(
    (id) => apply({ center: id, section: null }),
    [apply],
  );
  const closeCenter = useCallback(
    () => apply({ center: null, section: null }),
    [apply],
  );
  const openCenterInTab = useCallback(
    (id, nextTab, nextSection) =>
      apply({ tab: nextTab, center: id, article: null, gap: null, section: nextSection ?? null }),
    [apply],
  );

  // Open / close a knowledge gap's drawer in Knowledge Gaps.
  const openGap = useCallback((id) => apply({ gap: id }), [apply]);
  const closeGap = useCallback(() => apply({ gap: null }), [apply]);

  return {
    projectId,
    tab,
    eventId,
    section,
    workflowId,
    venueId,
    channelId,
    ticketId,
    memberId,
    roleId,
    personId,
    companyId,
    segmentId,
    conversationId,
    viewId,
    macroId,
    articleId,
    centerId,
    gapId,
    setProject,
    setTab,
    openEvent,
    openEventInTab,
    closeEvent,
    setSection,
    openWorkflow,
    closeWorkflow,
    openWorkflowInTab,
    openMacro,
    closeMacro,
    openVenue,
    closeVenue,
    openChannel,
    closeChannel,
    openTicket,
    closeTicket,
    openTicketInTab,
    openMember,
    closeMember,
    openRole,
    closeRole,
    openPerson,
    closePerson,
    openPersonInTab,
    openCompany,
    closeCompany,
    openSegment,
    closeSegment,
    openView,
    closeView,
    openConversation,
    openConversationInTab,
    closeConversation,
    openViewInTab,
    setView,
    openArticle,
    closeArticle,
    openArticleInTab,
    openCenter,
    closeCenter,
    openCenterInTab,
    openGap,
    closeGap,
  };
}
