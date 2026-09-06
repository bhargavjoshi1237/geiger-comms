"use client";

// Loads everything the Customers area needs: people (comms.contacts),
// conversations + tickets for counts and the unified timeline, and tags.
// Falls back to rich demo data when Supabase is unconfigured or empty so the
// screens still demonstrate the full surface.

import { useEffect, useMemo, useState } from "react";
import { listContacts } from "@/lib/supabase/customers";
import { listConversations } from "@/lib/supabase/comms";
import { listTickets } from "@/lib/supabase/tickets";
import { listTags, listTagsForConversations } from "@/lib/supabase/tags";
import { useOptionalProject } from "@/context/project-context";
import { DEMO_PEOPLE } from "./constants";

export function useCustomers() {
  const { projectId } = useOptionalProject() ?? {};
  const [people, setPeople] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagsByConversation, setTagsByConversation] = useState({});
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listContacts({ projectId }),
      listConversations({ projectId }),
      listTickets({ projectId }),
      listTags({ projectId }),
    ]).then(async ([contacts, convos, ticketRows, tagRows]) => {
      if (!alive) return;
      const rows = contacts && contacts.length ? contacts : null;
      setPeople(rows || DEMO_PEOPLE);
      setDemo(!rows);
      setConversations(convos || []);
      setTickets(ticketRows || []);
      setTags(tagRows || []);
      const ids = (convos || []).map((c) => c.id).filter(Boolean);
      if (ids.length) {
        const map = await listTagsForConversations(ids);
        if (alive) setTagsByConversation(map || {});
      } else {
        setTagsByConversation({});
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Conversations touching a person — by contact_id first, email fallback for
  // legacy rows that were never back-filled.
  const conversationsOf = useMemo(() => {
    const byId = new Map();
    const byEmail = new Map();
    for (const c of conversations) {
      if (c.contactId) {
        if (!byId.has(c.contactId)) byId.set(c.contactId, []);
        byId.get(c.contactId).push(c);
      }
      const email = (c.contactEmail || "").toLowerCase();
      if (email) {
        if (!byEmail.has(email)) byEmail.set(email, []);
        byEmail.get(email).push(c);
      }
    }
    return (person) => {
      const direct = byId.get(person.id) || [];
      const viaEmail = person.email
        ? byEmail.get(person.email.toLowerCase()) || []
        : [];
      const seen = new Set();
      return [...direct, ...viaEmail].filter((c) =>
        seen.has(c.id) ? false : (seen.add(c.id), true),
      );
    };
  }, [conversations]);

  // Tickets touching a person — through the linked conversation.
  const ticketsOf = useMemo(() => {
    const convToPerson = new Map();
    return (person, personConvos) => {
      const convIds = new Set((personConvos || []).map((c) => c.id));
      return tickets.filter(
        (t) => convIds.has(t.conversationId) || (t.description || "").includes(person.name),
      );
    };
  }, [tickets]);

  return {
    projectId,
    people,
    setPeople,
    conversations,
    tickets,
    tags,
    tagsByConversation,
    loading,
    demo,
    conversationsOf,
    ticketsOf,
  };
}

export default useCustomers;
