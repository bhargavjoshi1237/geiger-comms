-- Messenger channels live
--
-- Data-only: flips config.simulated to false on comms.channels rows of kind 'messenger' (channels spec §1.1 point 3).
-- Messenger runs end to end through the widget; the other five kinds stay simulated. No schema change.
-- Also marks messenger channels with a live widget app 'connected': 20261017181523 stops a disconnected channel's widget,
-- and every channel was created 'disconnected' by default, so installed widgets would otherwise go dark on push.

-- @up

do $$
begin
  if to_regclass('comms.channels') is not null then
    update comms.channels
       set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('simulated', false)
     where kind = 'messenger'
       and (config ->> 'simulated') is distinct from 'false';
  end if;

  if to_regclass('comms.channels') is not null and to_regclass('comms.widget_apps') is not null then
    update comms.channels c
       set status = 'connected'
     where c.kind = 'messenger'
       and c.deleted_at is null
       and c.status = 'disconnected'
       and exists (
         select 1 from comms.widget_apps w
         where w.channel_id = c.id and w.deleted_at is null
       );
  end if;
end;
$$;

-- @down

-- Status goes back to the pre-migration default for installed messenger channels (a manual 'connected' is not distinguishable).
do $$
begin
  if to_regclass('comms.channels') is not null and to_regclass('comms.widget_apps') is not null then
    update comms.channels c
       set status = 'disconnected'
     where c.kind = 'messenger'
       and c.deleted_at is null
       and c.status = 'connected'
       and exists (
         select 1 from comms.widget_apps w
         where w.channel_id = c.id and w.deleted_at is null
       );
  end if;

  if to_regclass('comms.channels') is not null then
    update comms.channels
       set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('simulated', true)
     where kind = 'messenger'
       and (config ->> 'simulated') is distinct from 'true';
  end if;
end;
$$;
