"use client";

// The company editor: account header, section nav, and bodies for the people,
// threads and tickets rolled up under one account. A company is a lens over
// the people directory, so there are no direct writes here beyond navigation.

import { useMemo, useState } from "react";
import {
  Building2,
  History,
  IdCard,
  MessagesSquare,
  Ticket as TicketIcon,
  Users,
} from "lucide-react";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import {
  Avatar,
  AvatarFallback,
  Button,
} from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
} from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import {
  LIFECYCLE_MAP,
  buildTimeline,
  channelIcon,
  formatDate,
  formatRelativeTime,
  initialsOf,
} from "./constants";
import { TimelineDot } from "./person_sections";
import { StatusPill } from "@/components/internal/shared/screen_kit";

const NAV = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: IdCard,
        desc: "The account at a glance — ownership, people and recent activity.",
      },
    ],
  },
  {
    group: "Directory",
    items: [
      {
        key: "people",
        label: "People",
        icon: Users,
        desc: "Everyone at this company.",
      },
      {
        key: "conversations",
        label: "Conversations",
        icon: MessagesSquare,
        desc: "Threads across the whole account.",
      },
      {
        key: "tickets",
        label: "Tickets",
        icon: TicketIcon,
        desc: "Work tracked against the account.",
      },
    ],
  },
  {
    group: "History",
    items: [
      {
        key: "activity",
        label: "Activity",
        icon: History,
        desc: "The merged timeline of everyone at this company.",
      },
    ],
  },
];

export function CompanyDetailScreen({
  company,
  conversationsOf,
  ticketsOf,
  onBack,
  onDelete,
}) {
  const [active, setActive] = useState("overview");
  const { openPerson, openConversationInTab, openTicket } = useWorkspaceUrl();

  const companyConvos = useMemo(() => {
    const seen = new Set();
    return (company.people || []).flatMap((p) =>
      (conversationsOf(p) || []).filter((c) =>
        seen.has(c.id) ? false : (seen.add(c.id), true),
      ),
    );
  }, [company, conversationsOf]);

  const companyTickets = useMemo(() => {
    const seen = new Set();
    return (company.people || []).flatMap((p) =>
      (ticketsOf(p, conversationsOf(p)) || []).filter((t) =>
        seen.has(t.id) ? false : (seen.add(t.id), true),
      ),
    );
  }, [company, conversationsOf, ticketsOf]);

  const timeline = useMemo(() => {
    const events = (company.people || []).flatMap((p) =>
      buildTimeline({
        person: p,
        conversations: conversationsOf(p),
        tickets: ticketsOf(p, conversationsOf(p)),
      }),
    );
    return events.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [company, conversationsOf, ticketsOf]);

  if (!company) return null;

  const open = companyConvos.filter(
    (c) => (c.status || "").toLowerCase() !== "closed",
  ).length;

  return (
    <EditorShell
      back={{ label: "Companies", onClick: onBack }}
      title={
        <span className="flex items-center gap-3">
          <Avatar className="h-10 w-10 rounded-xl">
            <AvatarFallback className="rounded-xl bg-surface-card text-sm text-text-secondary">
              {company.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          {company.name}
        </span>
      }
      meta={[
        company.website,
        `${company.contactCount} contact${company.contactCount === 1 ? "" : "s"}`,
        company.owner ? `Owned by ${company.owner}` : "No owner",
        company.lastActivityAt
          ? `Active ${formatRelativeTime(company.lastActivityAt)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <Button
          variant="outline"
          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
          onClick={() => onDelete?.(company)}
        >
          Delete
        </Button>
      }
      nav={NAV}
      subject={company}
      active={active}
      onActiveChange={setActive}
    >
      {active === "overview" ? (
        <div className="space-y-6">
          <StatGrid
            stats={[
              { label: "Contacts", value: String(company.contactCount) },
              { label: "Conversations", value: String(companyConvos.length) },
              { label: "Open", value: String(open) },
              { label: "Tickets", value: String(companyTickets.length) },
            ]}
          />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-6">
              <SectionCard title="Account">
                <SettingsList>
                  <SettingRow title="Domain" description={company.domain || "—"} />
                  <SettingRow title="Website" description={company.website || "—"} />
                  <SettingRow
                    title="Owner"
                    description={company.owner || "Unassigned"}
                  />
                  <SettingRow
                    title="First seen"
                    description={formatDate(company.createdAt)}
                  />
                </SettingsList>
              </SectionCard>
              <SectionCard
                title={`People (${company.people.length})`}
                description="Everyone carrying this company name."
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setActive("people")}
                  >
                    View all
                  </Button>
                }
                bodyPadding={company.people.length > 0}
              >
                {company.people.length ? (
                  <DataTable
                    columns={peopleColumns(openPerson)}
                    data={company.people.slice(0, 5)}
                    getRowKey={(row) => row.id}
                    onRowClick={(row) => openPerson(row.id)}
                  />
                ) : (
                  <EmptyState icon={Users} title="Nobody here yet" description="" />
                )}
              </SectionCard>
            </div>
            <div className="min-w-0">
              <SectionCard
                title="Recent activity"
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setActive("activity")}
                  >
                    View all
                  </Button>
                }
              >
                {timeline.length ? (
                  <ol className="relative space-y-5 border-l border-border pl-5">
                    {timeline.slice(0, 6).map((e) => (
                      <TimelineDot key={`${company.id}-${e.id}`} event={e} compact />
                    ))}
                  </ol>
                ) : (
                  <EmptyState
                    icon={History}
                    title="No activity yet"
                    description="Threads and tickets from this account land here."
                  />
                )}
              </SectionCard>
            </div>
          </div>
        </div>
      ) : null}

      {active === "people" ? (
        <SectionCard
          title={`People (${company.people.length})`}
          bodyPadding={company.people.length > 0}
        >
          {company.people.length ? (
            <DataTable
              columns={peopleColumns(openPerson)}
              data={company.people}
              getRowKey={(row) => row.id}
              onRowClick={(row) => openPerson(row.id)}
            />
          ) : (
            <EmptyState icon={Users} title="Nobody here yet" description="" />
          )}
        </SectionCard>
      ) : null}

      {active === "conversations" ? (
        <SectionCard
          title={`Conversations (${companyConvos.length})`}
          bodyPadding={companyConvos.length > 0}
        >
          {companyConvos.length ? (
            <DataTable
              columns={[
                {
                  key: "subject",
                  header: "Conversation",
                  render: (row) => {
                    const Icon = channelIcon(row.channel);
                    return (
                      <div className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-text-tertiary" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {row.subject || "Conversation"}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {row.contactName} · {row.preview}
                          </p>
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "status",
                  header: "Status",
                  render: (row) => (
                    <span className="text-sm text-text-secondary">{row.status}</span>
                  ),
                },
                {
                  key: "updated",
                  header: "Last message",
                  render: (row) => (
                    <span className="whitespace-nowrap text-sm text-text-secondary">
                      {formatRelativeTime(row.lastMessageAt || row.createdAt)}
                    </span>
                  ),
                },
              ]}
              data={[...companyConvos].sort(
                (a, b) =>
                  new Date(b.lastMessageAt || b.createdAt) -
                  new Date(a.lastMessageAt || a.createdAt),
              )}
              getRowKey={(row) => row.id}
              onRowClick={(row) => openConversationInTab(row.id, "All Conversations")}
            />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations yet"
              description="Threads from anyone at this company appear here."
            />
          )}
        </SectionCard>
      ) : null}

      {active === "tickets" ? (
        <SectionCard
          title={`Tickets (${companyTickets.length})`}
          bodyPadding={companyTickets.length > 0}
        >
          {companyTickets.length ? (
            <DataTable
              columns={[
                {
                  key: "title",
                  header: "Ticket",
                  render: (row) => (
                    <p className="truncate font-medium text-foreground">{row.title}</p>
                  ),
                },
                {
                  key: "state",
                  header: "State",
                  render: (row) => (
                    <span className="text-sm capitalize text-text-secondary">
                      {(row.state || "").replace("_", " ")}
                    </span>
                  ),
                },
                {
                  key: "updated",
                  header: "Updated",
                  render: (row) => (
                    <span className="whitespace-nowrap text-sm text-text-secondary">
                      {formatRelativeTime(row.updatedAt || row.createdAt)}
                    </span>
                  ),
                },
              ]}
              data={companyTickets}
              getRowKey={(row) => row.id}
              onRowClick={(row) => openTicket(row.id)}
            />
          ) : (
            <EmptyState
              icon={Building2}
              title="No tickets yet"
              description="Work tracked against this account appears here."
            />
          )}
        </SectionCard>
      ) : null}

      {active === "activity" ? (
        <SectionCard
          title="Account timeline"
          description="The merged lifelong thread of everyone at this company."
        >
          {timeline.length ? (
            <ol className="relative space-y-6 border-l border-border pl-6">
              {timeline.map((e) => (
                <TimelineDot key={`${company.id}-${e.id}`} event={e} />
              ))}
            </ol>
          ) : (
            <EmptyState
              icon={History}
              title="No activity yet"
              description="Threads and tickets from this account land here."
            />
          )}
        </SectionCard>
      ) : null}
    </EditorShell>
  );
}

function peopleColumns(openPerson) {
  return [
    {
      key: "person",
      header: "Person",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="h-8 w-8 shrink-0">
            {row.avatarUrl ? null : null}
            <AvatarFallback className="bg-surface-card text-xs text-text-secondary">
              {initialsOf(row.name, row.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.name}</p>
            <p className="truncate text-xs text-text-secondary">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "lifecycle",
      header: "Lifecycle",
      render: (row) => (
        <StatusPill status={row.lifecycle || "lead"} map={LIFECYCLE_MAP} />
      ),
    },
    {
      key: "seen",
      header: "Last seen",
      render: (row) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatRelativeTime(row.updatedAt)}
        </span>
      ),
    },
  ];
}

export default CompanyDetailScreen;
