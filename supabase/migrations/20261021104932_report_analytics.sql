-- Report analytics
--
-- Owns the aggregates behind Reports > Analytics and Quality & CSAT: comms.report_scope() (the one shared conversation predicate),
-- its time-bucket helpers, comms.report_first_responses(), and one jsonb-returning function per report section.
-- Every function is SECURITY INVOKER so comms.can_access_project() RLS decides which rows a caller aggregates; only authenticated may execute.
-- Filter keys (all optional): channel (conversations.channel), teamId (member_groups id via the assignee's project_members.group_ids, as
-- comms.assign_next reads it), teammateId (assignee).
-- First response is measured from the messages: post_message stamps conversations.first_response_at on the first agent comment even when the
-- agent opened the thread, which reads outbound conversations as instant. SLA grading still reads the engine's own columns.
-- Depends on the SLA columns re-declared by 20261021103039_adopt_business_hours_and_sla, so it must sort after it.

-- @up

-- Report queries scan one project's conversations at a time.
create index if not exists conversations_project_created_idx
  on comms.conversations (project_id, created_at)
  where deleted_at is null;

-- The caller's IANA zone when Postgres knows it, else UTC, so a bad client value can't fail a report.
create or replace function comms.report_tz(p_tz text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select z.name from pg_catalog.pg_timezone_names z where z.name = p_tz), 'UTC')
$$;

-- Chart bucket for a range: days up to a month, weeks up to about six months, months beyond.
create or replace function comms.report_unit(p_from timestamptz, p_to timestamptz)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_to - p_from < interval '32 days' then 'day'
    when p_to - p_from < interval '184 days' then 'week'
    else 'month'
  end
$$;

-- Every bucket start (a local date in p_tz) across [p_from, p_to), so quiet periods chart as zero instead of vanishing.
create or replace function comms.report_buckets(p_from timestamptz, p_to timestamptz, p_tz text)
returns setof date
language sql
stable
security invoker
set search_path = ''
as $$
  select generate_series(
    date_trunc(comms.report_unit(p_from, p_to), p_from at time zone comms.report_tz(p_tz)),
    date_trunc(comms.report_unit(p_from, p_to), (p_to - interval '1 microsecond') at time zone comms.report_tz(p_tz)),
    ('1 ' || comms.report_unit(p_from, p_to))::interval
  )::date
$$;

-- The conversations a report reads: live rows in p_project narrowed by p_filter, with the Messenger CSAT rating (metadata.rating) parsed.
create or replace function comms.report_scope(p_project uuid, p_filter jsonb default '{}'::jsonb)
returns table (
  id                    uuid,
  subject               text,
  channel               text,
  status                text,
  contact_id            uuid,
  contact_name          text,
  assignee_id           uuid,
  created_at            timestamptz,
  closed_at             timestamptz,
  sla_policy_id         uuid,
  first_response_at     timestamptz,
  first_response_due_at timestamptz,
  resolution_due_at     timestamptz,
  rating_score          integer,
  rating_comment        text,
  rated_at              timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.subject,
    coalesce(c.channel, 'Chat'),
    c.status,
    c.contact_id,
    c.contact_name,
    c.assignee_id,
    c.created_at,
    c.closed_at,
    c.sla_policy_id,
    c.first_response_at,
    c.first_response_due_at,
    c.resolution_due_at,
    case when v.rated then (c.metadata #>> '{rating,score}')::integer end,
    case when v.rated then coalesce(c.metadata #>> '{rating,comment}', '') end,
    case when v.rated then (c.metadata #>> '{rating,at}')::timestamptz end
  from comms.conversations c
  cross join lateral (
    select c.metadata #>> '{rating,score}' in ('1', '2', '3', '4', '5')
      and coalesce(c.metadata #>> '{rating,at}', '') ~ '^\d{4}-\d{2}-\d{2}T' as rated
  ) v
  where c.deleted_at is null
    and c.project_id = p_project
    and (nullif(p_filter ->> 'channel', '') is null or coalesce(c.channel, 'Chat') = p_filter ->> 'channel')
    and (nullif(p_filter ->> 'teammateId', '') is null or c.assignee_id = nullif(p_filter ->> 'teammateId', '')::uuid)
    and (
      nullif(p_filter ->> 'teamId', '') is null
      or exists (
        select 1
        from comms.teammates t
        join comms.project_members m on m.user_id = t.user_id and m.project_id = t.project_id
        where t.id = c.assignee_id
          and m.deleted_at is null
          and nullif(p_filter ->> 'teamId', '')::uuid = any (m.group_ids)
      )
    )
$$;

-- One row per scoped conversation whose first customer comment falls in [p_from, p_to): the next agent/AI comment, if any, and who sent it.
create or replace function comms.report_first_responses(
  p_project uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_filter  jsonb default '{}'::jsonb
)
returns table (
  conversation_id uuid,
  asked_at        timestamptz,
  replied_at      timestamptz,
  replier_role    text,
  replier_id      uuid,
  replier_name    text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, q.asked_at, r.created_at, r.author_role, r.author_id, r.author_name
  from comms.report_scope(p_project, p_filter) s
  cross join lateral (
    select min(m.created_at) as asked_at
    from comms.messages m
    where m.conversation_id = s.id
      and m.deleted_at is null
      and m.message_type = 'comment'
      and m.author_role = 'customer'
  ) q
  left join lateral (
    select m.created_at, m.author_role, m.author_id, m.author_name
    from comms.messages m
    where m.conversation_id = s.id
      and m.deleted_at is null
      and m.message_type = 'comment'
      and m.author_role in ('agent', 'ai_agent')
      and m.created_at > q.asked_at
    order by m.created_at
    limit 1
  ) r on true
  where q.asked_at >= p_from
    and q.asked_at < p_to
$$;

-- Conversations: new (created in range), closed (closed_at in range), the open and snoozed backlog right now, per channel and per bucket.
create or replace function comms.report_conversations(
  p_project uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_filter  jsonb default '{}'::jsonb,
  p_tz      text default 'UTC'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select comms.report_tz(p_tz) as tz, comms.report_unit(p_from, p_to) as unit
  ),
  scoped as materialized (
    select s.channel, s.status, s.created_at, s.closed_at
    from comms.report_scope(p_project, p_filter) s
  ),
  events as (
    select s.channel, 'new' as kind, s.created_at as at
    from scoped s
    where s.created_at >= p_from and s.created_at < p_to
    union all
    select s.channel, 'closed', s.closed_at
    from scoped s
    where s.closed_at >= p_from and s.closed_at < p_to
  ),
  by_bucket as (
    select
      date_trunc(p.unit, e.at at time zone p.tz)::date as bucket,
      count(*) filter (where e.kind = 'new') as n_new,
      count(*) filter (where e.kind = 'closed') as n_closed
    from events e
    cross join p
    group by 1
  ),
  by_channel as (
    select
      e.channel,
      count(*) filter (where e.kind = 'new') as n_new,
      count(*) filter (where e.kind = 'closed') as n_closed
    from events e
    group by e.channel
  )
  select jsonb_build_object(
    'unit', (select p.unit from p),
    'new', (select count(*) from events e where e.kind = 'new'),
    'closed', (select count(*) from events e where e.kind = 'closed'),
    'open', (select count(*) from scoped s where s.status = 'Open'),
    'snoozed', (select count(*) from scoped s where s.status = 'Snoozed'),
    'by_channel', coalesce((
      select jsonb_agg(
        jsonb_build_object('channel', c.channel, 'new', c.n_new, 'closed', c.n_closed)
        order by c.n_new desc, c.n_closed desc, c.channel
      )
      from by_channel c
    ), '[]'::jsonb),
    'series', coalesce((
      select jsonb_agg(
        jsonb_build_object('bucket', b.bucket, 'new', coalesce(x.n_new, 0), 'closed', coalesce(x.n_closed, 0))
        order by b.bucket
      )
      from comms.report_buckets(p_from, p_to, p_tz) as b(bucket)
      left join by_bucket x on x.bucket = b.bucket
    ), '[]'::jsonb)
  )
$$;

-- Responsiveness: first response (customer asked in range) and time to close (created -> closed, closed in range) as median / p90 seconds, plus the trend.
create or replace function comms.report_responsiveness(
  p_project uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_filter  jsonb default '{}'::jsonb,
  p_tz      text default 'UTC'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select comms.report_tz(p_tz) as tz, comms.report_unit(p_from, p_to) as unit
  ),
  asked as materialized (
    select f.asked_at, f.replied_at
    from comms.report_first_responses(p_project, p_from, p_to, p_filter) f
  ),
  frt as (
    select a.asked_at as at, extract(epoch from a.replied_at - a.asked_at)::float8 as secs
    from asked a
    where a.replied_at is not null
  ),
  -- A close stamped before the conversation began is bad data, not a negative duration.
  ttc as (
    select s.closed_at as at, extract(epoch from s.closed_at - s.created_at)::float8 as secs
    from comms.report_scope(p_project, p_filter) s
    where s.closed_at >= p_from and s.closed_at < p_to and s.closed_at >= s.created_at
  ),
  frt_buckets as (
    select date_trunc(p.unit, f.at at time zone p.tz)::date as bucket,
      percentile_cont(0.5) within group (order by f.secs) as median,
      count(*) as n
    from frt f
    cross join p
    group by 1
  ),
  ttc_buckets as (
    select date_trunc(p.unit, t.at at time zone p.tz)::date as bucket,
      percentile_cont(0.5) within group (order by t.secs) as median,
      count(*) as n
    from ttc t
    cross join p
    group by 1
  )
  select jsonb_build_object(
    'unit', (select p.unit from p),
    'first_response', (
      select jsonb_build_object(
        'median', percentile_cont(0.5) within group (order by f.secs),
        'p90', percentile_cont(0.9) within group (order by f.secs),
        'n', count(*)
      )
      from frt f
    ),
    'unanswered', (select count(*) from asked a where a.replied_at is null),
    'time_to_close', (
      select jsonb_build_object(
        'median', percentile_cont(0.5) within group (order by t.secs),
        'p90', percentile_cont(0.9) within group (order by t.secs),
        'n', count(*)
      )
      from ttc t
    ),
    'series', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'bucket', b.bucket,
          'first_response_median', f.median,
          'first_response_n', coalesce(f.n, 0),
          'time_to_close_median', t.median,
          'time_to_close_n', coalesce(t.n, 0)
        )
        order by b.bucket
      )
      from comms.report_buckets(p_from, p_to, p_tz) as b(bucket)
      left join frt_buckets f on f.bucket = b.bucket
      left join ttc_buckets t on t.bucket = b.bucket
    ), '[]'::jsonb)
  )
$$;

-- SLA compliance per policy for conversations created in range: each target is met, missed (late, or overdue and still open) or pending.
create or replace function comms.report_sla(
  p_project uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_filter  jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with graded as (
    select
      s.sla_policy_id,
      case
        when s.first_response_due_at is null then null
        when s.first_response_at is not null and s.first_response_at <= s.first_response_due_at then 'met'
        when s.first_response_at is not null or s.first_response_due_at <= now() then 'missed'
        else 'pending'
      end as first_response,
      case
        when s.resolution_due_at is null then null
        when s.closed_at is not null and s.closed_at <= s.resolution_due_at then 'met'
        when s.closed_at is not null or s.resolution_due_at <= now() then 'missed'
        else 'pending'
      end as resolution
    from comms.report_scope(p_project, p_filter) s
    where s.sla_policy_id is not null
      and s.created_at >= p_from
      and s.created_at < p_to
  ),
  tallies as (
    select
      g.sla_policy_id,
      count(*) as conversations,
      count(*) filter (where g.first_response = 'met') as first_response_met,
      count(*) filter (where g.first_response = 'missed') as first_response_missed,
      count(*) filter (where g.first_response = 'pending') as first_response_pending,
      count(*) filter (where g.resolution = 'met') as resolution_met,
      count(*) filter (where g.resolution = 'missed') as resolution_missed,
      count(*) filter (where g.resolution = 'pending') as resolution_pending
    from graded g
    group by g.sla_policy_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'policy_id', sp.id,
      'name', sp.name,
      'enabled', sp.enabled,
      'deleted', sp.deleted_at is not null,
      'conversations', coalesce(t.conversations, 0),
      'first_response_met', coalesce(t.first_response_met, 0),
      'first_response_missed', coalesce(t.first_response_missed, 0),
      'first_response_pending', coalesce(t.first_response_pending, 0),
      'resolution_met', coalesce(t.resolution_met, 0),
      'resolution_missed', coalesce(t.resolution_missed, 0),
      'resolution_pending', coalesce(t.resolution_pending, 0)
    )
    order by sp.deleted_at nulls first, sp.position, sp.created_at
  ), '[]'::jsonb)
  from comms.sla_policies sp
  left join tallies t on t.sla_policy_id = sp.id
  where sp.project_id = p_project
    and (sp.deleted_at is null or t.sla_policy_id is not null)
$$;

-- CSAT from ratings given in range: average, positive (4-5) count, the 1-5 distribution, the trend and the latest ratings with their comments.
create or replace function comms.report_csat(
  p_project uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_filter  jsonb default '{}'::jsonb,
  p_tz      text default 'UTC',
  p_limit   integer default 10
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select comms.report_tz(p_tz) as tz, comms.report_unit(p_from, p_to) as unit
  ),
  rated as materialized (
    select s.id, s.subject, s.channel, s.contact_id, s.contact_name, s.assignee_id, s.rating_score, s.rating_comment, s.rated_at
    from comms.report_scope(p_project, p_filter) s
    where s.rated_at >= p_from and s.rated_at < p_to
  ),
  by_bucket as (
    select date_trunc(p.unit, r.rated_at at time zone p.tz)::date as bucket,
      avg(r.rating_score)::float8 as average,
      count(*) as n
    from rated r
    cross join p
    group by 1
  ),
  latest as (
    select r.*, k.name as contact, t.name as teammate
    from rated r
    left join comms.contacts k on k.id = r.contact_id
    left join comms.teammates t on t.id = r.assignee_id
    order by r.rated_at desc
    limit least(greatest(coalesce(p_limit, 10), 1), 100)
  )
  select jsonb_build_object(
    'unit', (select p.unit from p),
    'n', (select count(*) from rated),
    'average', (select avg(r.rating_score)::float8 from rated r),
    'positive', (select count(*) from rated r where r.rating_score >= 4),
    'distribution', (
      select jsonb_agg(
        jsonb_build_object('score', d.score, 'n', (select count(*) from rated r where r.rating_score = d.score))
        order by d.score
      )
      from generate_series(1, 5) as d(score)
    ),
    'series', coalesce((
      select jsonb_agg(
        jsonb_build_object('bucket', b.bucket, 'average', x.average, 'n', coalesce(x.n, 0))
        order by b.bucket
      )
      from comms.report_buckets(p_from, p_to, p_tz) as b(bucket)
      left join by_bucket x on x.bucket = b.bucket
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'conversation_id', l.id,
          'subject', l.subject,
          'channel', l.channel,
          'contact_name', coalesce(l.contact, l.contact_name),
          'teammate_name', l.teammate,
          'score', l.rating_score,
          'comment', l.rating_comment,
          'rated_at', l.rated_at
        )
        order by l.rated_at desc
      )
      from latest l
    ), '[]'::jsonb)
  )
$$;

-- Per teammate in range: conversations started that are theirs now, closed while theirs, replies sent, median first response and CSAT.
create or replace function comms.report_teammates(
  p_project uuid,
  p_from    timestamptz,
  p_to      timestamptz,
  p_filter  jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with roster as (
    select t.id, t.name, t.email, t.avatar_url
    from comms.teammates t
    where t.project_id = p_project
      and t.deleted_at is null
      and (nullif(p_filter ->> 'teammateId', '') is null or t.id = nullif(p_filter ->> 'teammateId', '')::uuid)
      and (
        nullif(p_filter ->> 'teamId', '') is null
        or exists (
          select 1
          from comms.project_members m
          where m.user_id = t.user_id
            and m.project_id = t.project_id
            and m.deleted_at is null
            and nullif(p_filter ->> 'teamId', '')::uuid = any (m.group_ids)
        )
      )
  ),
  -- Channel only: replies and first responses count wherever a teammate sent them, not just on their own assignments.
  channel_filter as (
    select jsonb_build_object('channel', p_filter -> 'channel') as f
  ),
  scoped as materialized (
    select s.id, s.assignee_id, s.created_at, s.closed_at, s.rating_score, s.rated_at
    from channel_filter cf
    cross join lateral comms.report_scope(p_project, cf.f) s
  ),
  -- The composer stamps author_id; older replies carry only the teammate's name, matched within the project.
  names as (
    select distinct on (t.name) t.id, t.name
    from comms.teammates t
    where t.project_id = p_project and t.deleted_at is null and t.name <> ''
    order by t.name, t.created_at
  ),
  replies as (
    select coalesce(m.author_id, n.id) as teammate_id, count(*) as n
    from scoped s
    join comms.messages m on m.conversation_id = s.id
    left join names n on m.author_id is null and n.name = m.author_name
    where m.deleted_at is null
      and m.message_type = 'comment'
      and m.author_role = 'agent'
      and m.created_at >= p_from
      and m.created_at < p_to
    group by 1
  ),
  first_responses as (
    select coalesce(f.replier_id, n.id) as teammate_id,
      percentile_cont(0.5) within group (order by extract(epoch from f.replied_at - f.asked_at)::float8) as median,
      count(*) as n
    from channel_filter cf
    cross join lateral comms.report_first_responses(p_project, p_from, p_to, cf.f) f
    left join names n on f.replier_id is null and n.name = f.replier_name
    where f.replier_role = 'agent'
    group by 1
  ),
  owned as (
    select
      s.assignee_id as teammate_id,
      count(*) filter (where s.created_at >= p_from and s.created_at < p_to) as assigned,
      count(*) filter (where s.closed_at >= p_from and s.closed_at < p_to) as closed,
      (avg(s.rating_score) filter (where s.rated_at >= p_from and s.rated_at < p_to))::float8 as csat_average,
      count(*) filter (where s.rated_at >= p_from and s.rated_at < p_to) as csat_n
    from scoped s
    where s.assignee_id is not null
    group by 1
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'teammate_id', r.id,
      'name', r.name,
      'email', r.email,
      'avatar_url', r.avatar_url,
      'assigned', coalesce(o.assigned, 0),
      'closed', coalesce(o.closed, 0),
      'replies', coalesce(rp.n, 0),
      'first_response_median', fr.median,
      'first_response_n', coalesce(fr.n, 0),
      'csat_average', o.csat_average,
      'csat_n', coalesce(o.csat_n, 0)
    )
    order by coalesce(o.closed, 0) desc, coalesce(o.assigned, 0) desc, r.name
  ), '[]'::jsonb)
  from roster r
  left join owned o on o.teammate_id = r.id
  left join replies rp on rp.teammate_id = r.id
  left join first_responses fr on fr.teammate_id = r.id
$$;

revoke all on function comms.report_tz(text) from public, anon;
revoke all on function comms.report_unit(timestamptz, timestamptz) from public, anon;
revoke all on function comms.report_buckets(timestamptz, timestamptz, text) from public, anon;
revoke all on function comms.report_scope(uuid, jsonb) from public, anon;
revoke all on function comms.report_first_responses(uuid, timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function comms.report_conversations(uuid, timestamptz, timestamptz, jsonb, text) from public, anon;
revoke all on function comms.report_responsiveness(uuid, timestamptz, timestamptz, jsonb, text) from public, anon;
revoke all on function comms.report_sla(uuid, timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function comms.report_csat(uuid, timestamptz, timestamptz, jsonb, text, integer) from public, anon;
revoke all on function comms.report_teammates(uuid, timestamptz, timestamptz, jsonb) from public, anon;

grant execute on function comms.report_tz(text) to authenticated;
grant execute on function comms.report_unit(timestamptz, timestamptz) to authenticated;
grant execute on function comms.report_buckets(timestamptz, timestamptz, text) to authenticated;
grant execute on function comms.report_scope(uuid, jsonb) to authenticated;
grant execute on function comms.report_first_responses(uuid, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function comms.report_conversations(uuid, timestamptz, timestamptz, jsonb, text) to authenticated;
grant execute on function comms.report_responsiveness(uuid, timestamptz, timestamptz, jsonb, text) to authenticated;
grant execute on function comms.report_sla(uuid, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function comms.report_csat(uuid, timestamptz, timestamptz, jsonb, text, integer) to authenticated;
grant execute on function comms.report_teammates(uuid, timestamptz, timestamptz, jsonb) to authenticated;

-- @down

drop function if exists comms.report_teammates(uuid, timestamptz, timestamptz, jsonb);
drop function if exists comms.report_csat(uuid, timestamptz, timestamptz, jsonb, text, integer);
drop function if exists comms.report_sla(uuid, timestamptz, timestamptz, jsonb);
drop function if exists comms.report_responsiveness(uuid, timestamptz, timestamptz, jsonb, text);
drop function if exists comms.report_conversations(uuid, timestamptz, timestamptz, jsonb, text);
drop function if exists comms.report_first_responses(uuid, timestamptz, timestamptz, jsonb);
drop function if exists comms.report_scope(uuid, jsonb);
drop function if exists comms.report_buckets(timestamptz, timestamptz, text);
drop function if exists comms.report_unit(timestamptz, timestamptz);
drop function if exists comms.report_tz(text);
drop index if exists comms.conversations_project_created_idx;
