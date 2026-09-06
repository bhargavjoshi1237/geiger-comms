"use client";

import { useCallback } from "react";
import {
  useRouter,
  usePathname,
  useSearchParams,
  useParams,
} from "next/navigation";
import { tabToSlug, slugToTab } from "@/lib/workspace/tabs";

// Persistent workspace navigation, mirrored to the URL so a refresh (or a shared
// link) lands the user on the exact same place — the active project, sidebar
// tab, the open event, and the editor section. Matches the suite pattern
// (Geiger Flow): the project and tab live in the PATH, the transient
// per-event/workflow selection stays in the query string.
//
// Schema:  /project/<uuid>/<tabSlug>?event=evt_123&section=tickets
//   - <uuid>    → active project (public.projects). Scopes all data.
//   - <tabSlug> → sidebar tab, lowercased with no spaces/caps
//                 ("All Events" → "allevents"). The default tab (Overview) is
//                 omitted, so a bare /project/<uuid> is the Overview.
//   - event     → id of the open event in All Events. None ⇒ omitted.
//   - section   → editor section inside an event. Default "overview" ⇒ omitted.
//   - workflow  → the open workflow in the Workflows area.
//   - venue     → the open venue in the Venues area.
//   - channel   → the open channel in the Channels area.
//   - ticket    → the open ticket in the Tickets area.
//   - member    → the teammate open in the full Settings editor.
//   - role      → the role open in the full Settings editor.
//   - conversation → the open thread in the Inbox area.
//   - view      → the active saved view (Views / All Conversations).
//
// Components reading this hook must sit under a <Suspense> boundary (required by
// `useSearchParams`); the project shell provides one.
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

  // Build the next URL from a partial patch. For each key: `undefined` keeps the
  // current value; an explicit value (incl. null) replaces it. Defaults and
  // empties drop from the URL so it stays clean.
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
      if (ev) qp.set("event", ev);
      if (vn) qp.set("venue", vn);
      if (ch) qp.set("channel", ch);
      if (tk) qp.set("ticket", tk);
      if (mb) qp.set("member", mb);
      if (rl) qp.set("role", rl);
      if (ps) qp.set("person", ps);
      if (co) qp.set("company", co);
      if (sg) qp.set("segment", sg);
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
      pathname,
    ],
  );

  const apply = useCallback(
    (next) => router.push(buildUrl(next), { scroll: false }),
    [router, buildUrl],
  );

  // Switching the active project resets any open event/section/workflow/venue
  // and any open conversation/view (their ids belong to the previous project);
  // the sidebar tab is kept.
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
      }),
    [apply],
  );
  // Switching workspace tabs exits any open event/section/workflow/venue/channel
  // and any open conversation/view.
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
    setProject,
    setTab,
    openEvent,
    openEventInTab,
    closeEvent,
    setSection,
    openWorkflow,
    closeWorkflow,
    openVenue,
    closeVenue,
    openChannel,
    closeChannel,
    openTicket,
    closeTicket,
    openMember,
    closeMember,
    openRole,
    closeRole,
    openPerson,
    closePerson,
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
  };
}
