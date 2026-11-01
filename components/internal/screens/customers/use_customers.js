"use client";

// Loads People/Companies data (people, companies, attributes, conversations, tickets, tags); a failed people read sets error, a failed companies read clears companiesAvailable.

import { useCallback, useEffect, useMemo, useState } from "react";
import { listAttributes, listContacts } from "@/lib/supabase/customers";
import { listCompanies } from "@/lib/supabase/companies";
import { listConversations } from "@/lib/supabase/comms";
import { listTickets, ticketConversationIds } from "@/lib/supabase/tickets";
import { listTags } from "@/lib/supabase/tags";
import { useOptionalProject } from "@/context/project-context";

export function useCustomers() {
  const { projectId } = useOptionalProject() ?? {};
  const [people, setPeople] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [companiesAvailable, setCompaniesAvailable] = useState(true);
  const [attributes, setAttributes] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listContacts({ projectId }),
      listCompanies({ projectId }),
      listAttributes({ projectId }),
      listConversations({ projectId }),
      listTickets({ projectId }),
      listTags({ projectId }),
    ]).then(([contacts, companyRows, attributeRows, convos, ticketRows, tagRows]) => {
      if (!alive) return;
      setPeople(contacts ?? []);
      setError(contacts === null);
      setCompanies(companyRows ?? []);
      setCompaniesAvailable(companyRows !== null);
      setAttributes(attributeRows ?? []);
      setConversations(convos || []);
      setTickets(ticketRows || []);
      setTags(tagRows || []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, version]);

  const reload = useCallback(() => {
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);

  // Conversations touching a person: by contact_id, with an email fallback for legacy rows never back-filled.
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

  // Tickets touching a set of conversations, through the origin thread or a ticket_links link.
  const ticketsOf = useMemo(
    () => (personConvos) => {
      const convIds = new Set((personConvos || []).map((c) => c.id));
      return tickets.filter((t) => ticketConversationIds(t).some((id) => convIds.has(id)));
    },
    [tickets],
  );

  return {
    projectId,
    people,
    setPeople,
    companies,
    setCompanies,
    companiesAvailable,
    attributes,
    setAttributes,
    conversations,
    tickets,
    tags,
    loading,
    error,
    reload,
    conversationsOf,
    ticketsOf,
  };
}

export default useCustomers;
