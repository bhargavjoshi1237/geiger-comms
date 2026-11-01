"use client";

// The company editor (?company=<id>): inline-editable account record, linked people, and their rolled-up threads and tickets.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  History,
  IdCard,
  MessagesSquare,
  SlidersHorizontal,
  Ticket as TicketIcon,
  Trash2,
  Users,
} from "lucide-react";
import { EditorShell } from "@/components/internal/shared/editor_shell";
import { Avatar, AvatarFallback, AvatarImage, Button } from "@geiger/ui";
import {
  DataTable,
  EmptyState,
  SectionCard,
  SettingRow,
  SettingsList,
  StatGrid,
  StatusPill,
} from "@/components/internal/shared/screen_kit";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { normalizeDomain } from "@/lib/supabase/companies";
import {
  LIFECYCLE_MAP,
  buildTimeline,
  channelIcon,
  coerceAttribute,
  formatDate,
  formatRelativeTime,
  initialsOf,
} from "./constants";
import {
  AttributeControl,
  CommitInput,
  NewAttributeForm,
  TimelineDot,
} from "./person_sections";

const NAV = [
  {
    group: null,
    items: [
      {
        key: "overview",
        label: "Overview",
        icon: IdCard,
        desc: "The account at a glance — record, people and recent activity.",
      },
      {
        key: "attributes",
        label: "Attributes",
        icon: SlidersHorizontal,
        desc: "Custom attributes on this company record.",
      },
    ],
  },
  {
    group: "Directory",
    items: [
      { key: "people", label: "People", icon: Users, desc: "Everyone linked to this company." },
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

// Standard account fields: [key, label, placeholder, kind].
const ACCOUNT_FIELDS = [
  ["name", "Name", "Acme Inc", "text"],
  ["domain", "Domain", "acme.com", "domain"],
  ["externalId", "Company ID", "Your system's ID", "text"],
  ["website", "Website", "https://acme.com", "text"],
  ["industry", "Industry", "Software", "text"],
  ["size", "Company size", "Employees", "number"],
  ["plan", "Plan", "Pro", "text"],
  ["monthlySpend", "Monthly spend", "0", "number"],
  ["owner", "Owner", "Teammate", "text"],
];

export function CompanyDetailScreen({
  company,
  attributes,
  onAttributeCreated,
  onBack,
  onUpdate,
  onDelete,
}) {
  const [active, setActive] = useState("overview");
  const { openPersonInTab, openConversationInTab, openTicketInTab } = useWorkspaceUrl();

  const timeline = useMemo(() => {
    const events = (company.people || []).flatMap((p) =>
      buildTimeline({ person: p }).filter((e) => e.kind !== "conversation" && e.kind !== "tag"),
    );
    events.push(
      ...buildTimeline({ conversations: company.conversations, tickets: company.tickets }).filter(
        (e) => e.kind !== "person",
      ),
    );
    return events.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [company]);

  const defs = (attributes || []).filter((a) => a.entity === "company");
  const openPerson = (id) => openPersonInTab(id, "People");

  function commitField(key, kind, raw) {
    if (key === "name" && !raw.trim()) {
      toast.error("A company needs a name.");
      return;
    }
    if (kind === "number" && raw.trim() !== "" && coerceAttribute("number", raw) === undefined) {
      toast.error(`“${raw}” isn't a number.`);
      return;
    }
    onUpdate({ [key]: kind === "domain" ? normalizeDomain(raw) : raw });
  }

  const handleCustom = (key, value) => {
    const next = { ...(company.custom || {}) };
    if (value === null || value === undefined) delete next[key];
    else next[key] = value;
    onUpdate({ custom: next });
  };

  const peopleTable = (rows) =>
    rows.length ? (
      <DataTable
        columns={peopleColumns}
        data={rows}
        getRowKey={(row) => row.id}
        onRowClick={(row) => openPerson(row.id)}
      />
    ) : (
      <EmptyState
        icon={Users}
        title="Nobody linked yet"
        description="Link people from their record in People, or import them with a company name."
      />
    );

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
        company.domain || company.website,
        `${company.contactCount} ${company.contactCount === 1 ? "person" : "people"}`,
        company.owner ? `Owned by ${company.owner}` : "No owner",
        company.lastActivityAt ? `Active ${formatRelativeTime(company.lastActivityAt)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <Button
          variant="outline"
          className="border-border bg-transparent text-muted-foreground hover:bg-surface-active hover:text-foreground"
          onClick={() => onDelete?.(company)}
        >
          <Trash2 className="h-4 w-4" /> Delete
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
              { label: "People", value: String(company.contactCount) },
              { label: "Conversations", value: String(company.conversationCount) },
              { label: "Open", value: String(company.openCount) },
              { label: "Tickets", value: String(company.tickets.length) },
            ]}
          />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-6">
              <SectionCard title="Account" description="Saved as you leave each field.">
                <SettingsList>
                  {ACCOUNT_FIELDS.map(([key, label, placeholder, kind]) => (
                    <SettingRow
                      key={key}
                      title={label}
                      control={
                        <CommitInput
                          value={company[key] === null || company[key] === undefined ? "" : String(company[key])}
                          onCommit={(v) => commitField(key, kind, v)}
                          placeholder={placeholder}
                          inputMode={kind === "number" ? "decimal" : undefined}
                          className="h-8 w-52 text-xs"
                          aria-label={label}
                        />
                      }
                    />
                  ))}
                  <SettingRow title="Created" description={formatDate(company.createdAt)} control={null} />
                </SettingsList>
              </SectionCard>
              <SectionCard
                title={`People (${company.people.length})`}
                description="Everyone linked to this company."
                action={
                  company.people.length > 5 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setActive("people")}
                    >
                      View all
                    </Button>
                  ) : null
                }
                bodyPadding={company.people.length === 0}
              >
                {peopleTable(company.people.slice(0, 5))}
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
                      <TimelineDot key={e.id} event={e} compact />
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

      {active === "attributes" ? (
        <SectionCard
          title="Custom attributes"
          description="Workspace-defined fields on every company."
        >
          {defs.length ? (
            <div className="mb-4">
              <SettingsList>
                {defs.map((a) => (
                  <SettingRow
                    key={a.id}
                    title={a.label}
                    description={a.key}
                    control={
                      <AttributeControl
                        attribute={a}
                        value={company.custom?.[a.key]}
                        onChange={(v) => handleCustom(a.key, v)}
                      />
                    }
                  />
                ))}
              </SettingsList>
            </div>
          ) : (
            <EmptyState
              icon={SlidersHorizontal}
              title="No custom attributes"
              description="Define the first one below; it appears on every company."
            />
          )}
          <NewAttributeForm
            projectId={company.projectId}
            entity="company"
            position={defs.length}
            onCreated={onAttributeCreated}
          />
        </SectionCard>
      ) : null}

      {active === "people" ? (
        <SectionCard
          title={`People (${company.people.length})`}
          bodyPadding={company.people.length === 0}
        >
          {peopleTable(company.people)}
        </SectionCard>
      ) : null}

      {active === "conversations" ? (
        <SectionCard
          title={`Conversations (${company.conversations.length})`}
          bodyPadding={company.conversations.length === 0}
        >
          {company.conversations.length ? (
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
              data={[...company.conversations].sort(
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
          title={`Tickets (${company.tickets.length})`}
          bodyPadding={company.tickets.length === 0}
        >
          {company.tickets.length ? (
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
              data={company.tickets}
              getRowKey={(row) => row.id}
              onRowClick={(row) => openTicketInTab(row.id, "Tickets")}
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
                <TimelineDot key={e.id} event={e} />
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

const peopleColumns = [
  {
    key: "person",
    header: "Person",
    render: (row) => (
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="h-8 w-8 shrink-0">
          {row.avatarUrl ? <AvatarImage src={row.avatarUrl} alt={row.name} /> : null}
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
    render: (row) => <StatusPill status={row.lifecycle || "lead"} map={LIFECYCLE_MAP} />,
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

export default CompanyDetailScreen;
