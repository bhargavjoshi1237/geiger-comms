<div align="center">

# Geiger Comms

**Customer conversations, handled.**

A shared inbox with AI assistance, routing, SLAs, and a help centre — support that scales without a bigger team.

Part of the [Geiger](#the-geiger-suite) suite.

</div>

---

## Overview

Geiger Comms is the customer communication and support application of the Geiger suite. Every conversation — from any channel — lands in one shared inbox, gets routed by rules, answered with the help of an AI agent and copilot, and measured against SLA and quality targets.

Around the inbox sit the things a support team actually needs: a contact and company record, self-serve help-centre articles, macros and workflows for the repetitive work, and reporting on team performance, response times, AI contribution, and CSAT.

## Highlights

| Area | What it does |
| --- | --- |
| **Inbox** | One shared inbox for every conversation, with assignment and triage. |
| **Conversations** | All conversations, unassigned, mentions, snoozed, and closed views. |
| **AI & automation** | An AI agent that answers, a copilot that drafts for agents, workflows, macros, routing rules, and SLA policies. |
| **Contacts** | Leads, people, companies, and segments — the customer record behind each conversation. |
| **Help Center** | Articles and collections for self-serve support and deflection. |
| **Reports** | Reports overview, team performance, SLA and response times, AI performance, and CSAT and quality. |
| **Settings** | General workspace settings, channels, teammates, integrations, and billing. |

## Status

The workspace navigation covers the full product surface above and the Inbox overview screen is built. Remaining areas render a consistent coming-soon state and are being implemented one at a time against the suite's shared screen kit and data-layer conventions.

## Tech stack

- **Framework** — Next.js 16 (App Router, SSR/SSG) and React 19
- **Styling** — Tailwind CSS v4 and shadcn/ui, with the shared [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library
- **Icons** — Lucide
- **Backend** — Supabase (Postgres, Auth, Storage)
- **Charts** — Recharts

## Getting started

### Prerequisites

- Node.js 20 or later
- A Supabase project (the shared Geiger project)

### Installation

```bash
npm install
```

### Environment

Create a `.env` file in the project root:

```bash
# Runtime (browser)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Server-only
STRING_URI=your-direct-postgres-connection-string    # migrations only
```

### Database

Schema changes are timestamped SQL migrations in `supabase/migrations/`, applied
in version order by [`@geiger/orm`](https://github.com/bhargavjoshi1237/geiger-orm)
and recorded in `comms.geiger_migrations`:

```bash
npm run db:status                     # applied vs pending
npm run db:new -- <name>              # scaffold a migration
npm run db:push                       # apply everything pending
npm run db:seed                       # re-runnable data
```

See [`MIGRATION_CONVENTIONS.md`](MIGRATION_CONVENTIONS.md) before writing any DDL.

### Develop

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. In production the app is served under the `/comms` base path behind the suite hub. Every suite app shares one origin, so the Supabase session is shared across products.

## Project structure

```
app/
  project/[projectId]/   Project-scoped support workspace
components/
  internal/screens/      Workspace screens and the screen registry
  internal/sidebar/      Navigation — titles are the registry keys
  internal/shared/       Shared screen kit (headers, tables, stats, dialogs)
  ui/                    shadcn primitives
lib/supabase/            Data-access layer (comms)
supabase/migrations/     Timestamped @up/@down migrations (npm run db:push)
```

## Conventions

This codebase follows a consistent set of patterns. Read these before contributing:

- [`AGENTS.md`](AGENTS.md) — working notes for this Next.js version
- [`MODULE_CONVENTIONS.md`](MODULE_CONVENTIONS.md) — how to build a workspace screen
- [`SUPABASE_CONVENTIONS.md`](SUPABASE_CONVENTIONS.md) — the data-layer playbook
- [`MIGRATION_CONVENTIONS.md`](MIGRATION_CONVENTIONS.md) — schema changes and `@geiger/orm`
- [`crafting.md`](crafting.md) — UI craft and quality bar

## The Geiger suite

Geiger Comms is one application in the broader Geiger suite, alongside Geiger Flow, Geiger Events, and Geiger Chat. Every product shares one Supabase project, a common design language, and the [`@geiger/ui`](https://github.com/bhargavjoshi1237/geiger-ui) component library, so each app feels native to the whole.

## License

Private and unpublished. All rights reserved.
