-- Geiger Notes project (ebcc7910-…): fills only what its Comms demo data is missing; existing rows and values always win.
-- Re-runnable: each block checks before it writes. Run with `npm run db:seed -- geiger_notes`.
-- The project's Messenger widget app is not seeded here — its signing secret is sealed with the server's WIDGET_SESSION_SECRET.

do $$
declare
  p constant uuid := 'ebcc7910-1a0e-4e91-8c3b-752f3c4292d3';
  note_lines constant text[] := array[
    'can you double-check the refund amount before I reply?',
    'this one is on the Enterprise plan — can you confirm the SLA we owe them?',
    'looks like the same SSO issue you fixed last week, mind taking a look?',
    'customer is asking for a call, are you free this afternoon?',
    'can you confirm whether this is a known bug before I promise a fix date?',
    'flagging for you since you own billing — they were double-charged.',
    'could you add the workaround to the help article once this is resolved?',
    'handing over for the evening shift, last reply is drafted below.'
  ];
  r record;
  msg uuid;
begin
  if not exists (select 1 from public.projects where id = p and deleted_at is null) then
    raise notice 'geiger_notes seed: project % not found, skipping', p;
    return;
  end if;

  -- Channel settings: give every settings-form field a value (components/internal/screens/channels/constants.js).
  update comms.channels
     set config = jsonb_build_object(
           'address', coalesce(config ->> 'from', 'support@geiger.studio'),
           'forwardingAddress', 'support@in.geiger.studio',
           'replyToName', 'Geiger Support',
           'signature', '— The Geiger Support team',
           'verified', true
         ) || config
   where project_id = p and kind = 'email' and deleted_at is null;

  update comms.channels
     set config = jsonb_build_object(
           'launcherColor', '#ffffff',
           'greeting', 'Hi there 👋 How can we help?',
           'position', 'right',
           'showAvatars', true,
           'officeHoursNote', 'We usually reply within a few minutes, Monday to Friday, 9am–6pm.'
         ) || config
   where project_id = p and kind = 'messenger' and deleted_at is null;

  update comms.channels
     set config = jsonb_build_object(
           'phoneNumber', coalesce(config ->> 'phone', '+1 (415) 555-0132'),
           'displayName', 'Geiger Studio',
           'businessAccountId', 'wa-4155550132'
         ) || config
   where project_id = p and kind = 'whatsapp' and deleted_at is null;

  update comms.channels
     set config = jsonb_build_object(
           'number', coalesce(config ->> 'phone', '+1 (415) 555-0148'),
           'provider', 'Twilio',
           'senderId', 'GEIGER'
         ) || config
   where project_id = p and kind = 'sms' and deleted_at is null;

  update comms.channels
     set config = jsonb_build_object(
           'accounts', jsonb_build_array(
             jsonb_build_object('network', 'instagram', 'handle', 'geiger'),
             jsonb_build_object('network', 'x', 'handle', 'geiger')
           )
         ) || config
   where project_id = p and kind = 'social' and deleted_at is null;

  update comms.channels
     set config = jsonb_build_object(
           'workspaceName', coalesce(config ->> 'workspace', 'geiger') || '.slack.com',
           'defaultChannel', '#support',
           'notifyOnAssign', true
         ) || config
   where project_id = p and kind = 'slack' and deleted_at is null;

  -- Link each conversation to its connected channel so the Inbox channel filter matches it.
  update comms.conversations c
     set channel_id = ch.id
    from comms.channels ch
   where c.project_id = p
     and c.channel_id is null
     and c.deleted_at is null
     and ch.project_id = p
     and ch.deleted_at is null
     and ch.kind = case c.channel
                     when 'Email' then 'email'
                     when 'Chat' then 'messenger'
                     when 'WhatsApp' then 'whatsapp'
                     when 'Slack' then 'slack'
                     when 'Instagram' then 'social'
                     when 'SMS' then 'sms'
                   end;

  -- First response = the first agent reply already in the thread.
  update comms.conversations c
     set first_response_at = fr.at
    from (
      select m.conversation_id, min(m.created_at) as at
        from comms.messages m
       where m.author_role = 'agent'
         and m.message_type = 'comment'
         and m.deleted_at is null
       group by m.conversation_id
    ) fr
   where fr.conversation_id = c.id
     and c.project_id = p
     and c.first_response_at is null;

  -- News posts light up the Messenger's News tab.
  if not exists (select 1 from comms.posts where project_id = p and deleted_at is null) then
    insert into comms.posts (id, title, body, published_at, project_id)
    values
      ('11a2d60e-2fa0-483a-85f3-9d13474551e2', 'Saved views for every inbox',
       E'Filter conversations by status, tag, assignee and channel, then save the result as a view your whole team can use.\n\nFind them under **Inbox → Views**.',
       now() - interval '2 days', p),
      ('302a66df-0a54-4243-a3ee-59102da8d9e1', 'WhatsApp Business is here',
       E'Customers can now reach you on WhatsApp. Messages land in the same inbox, next to email and chat, with the full history on the contact.',
       now() - interval '9 days', p),
      ('9cdc795a-9445-4dd3-915f-610d12a468aa', 'Single sign-on on every plan',
       E'SAML and OIDC single sign-on is now available to every workspace. See **Enable SSO (SAML/OIDC)** in the Help Center to set it up.',
       now() - interval '16 days', p),
      ('316f0dde-60df-43f7-95a1-2b87a2f3ef19', 'Reply faster with macros',
       E'Save the answers you send most often as macros and insert them with one click. Macros can also tag, assign and close the conversation.',
       now() - interval '24 days', p),
      ('97b6db8e-5809-42be-90f1-c9589857b141', 'CSAT after every conversation',
       E'When a conversation closes, customers can now rate the help they got. Track scores and comments under **Reports → Quality & CSAT**.',
       now() - interval '35 days', p)
    on conflict (id) do nothing;
  end if;

  -- @mentions: internal notes from the assignee to a teammate, so the Mentions inbox has rows (a third already read).
  if not exists (
    select 1 from comms.mentions mn
      join comms.conversations c on c.id = mn.conversation_id
     where c.project_id = p
  ) then
    for r in
      select c.id as conv, a.id as author_id, a.name as author_name, t.id as target_id, t.name as target_name,
             row_number() over (order by c.last_message_at desc nulls last) as n
        from (
          select id, assignee_id, last_message_at
            from comms.conversations
           where project_id = p and deleted_at is null and status = 'Open' and assignee_id is not null
           order by last_message_at desc nulls last
           limit 8
        ) c
        join comms.teammates a on a.id = c.assignee_id
        cross join lateral (
          select tm.id, tm.name
            from comms.teammates tm
           where tm.project_id = p and tm.deleted_at is null and tm.id <> a.id and tm.name <> ''
           order by md5(c.id::text || tm.id::text)
           limit 1
        ) t
    loop
      insert into comms.messages (conversation_id, author_role, author_name, author_id, message_type, body, created_at)
      values (r.conv, 'agent', r.author_name, r.author_id, 'note',
              '@' || r.target_name || ' ' || note_lines[1 + ((r.n - 1) % array_length(note_lines, 1))],
              now() - make_interval(hours => r.n::int))
      returning id into msg;

      insert into comms.mentions (conversation_id, message_id, teammate_id, read_at, created_at)
      values (r.conv, msg, r.target_id,
              case when r.n % 3 = 0 then now() - make_interval(mins => r.n::int * 10) end,
              now() - make_interval(hours => r.n::int));
    end loop;
  end if;
end
$$;
