# supabase/sqls — additive migrations

`npm run db:push` (`scripts/run-sqls.js`) runs every `*.sql` here in filename
order. **A normal run never resets an existing table** — the runner:

- forces `create table` / `create index` to `if not exists` and **skips** them
  when the object already exists;
- **blocks** destructive statements (`drop table`, `drop schema`, `truncate`,
  `delete from`) unless you explicitly pass `--clean`.

So adding a new `.sql` file later can only create or extend — never wipe data.

## Writing a new .sql file (additive rules)

- `create schema if not exists comms;`
- `create table if not exists comms.<name> ( … );`
- Add fields to an existing table with `alter table comms.<name> add column if
  not exists <col> …;` — never recreate the table.
- Re-create triggers/policies idempotently: `drop trigger/policy if exists …`
  then `create …` (these hold no data, so they are allowed and expected).
- Seed with stable UUIDs + `insert … on conflict (id) do nothing;` so re-runs
  don't duplicate or overwrite edited rows.

## The one escape hatch

`npm run db:push -- --clean` drops **this app's** `comms.*` tables first, then
rebuilds. Destructive and manual only — never part of a normal push.
