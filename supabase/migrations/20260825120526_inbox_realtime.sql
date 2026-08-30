-- Inbox realtime (inbox spec §2.4)
--
-- Puts conversations / messages / mentions on the supabase_realtime
-- publication and gives them full replica identity so UPDATE and DELETE
-- payloads carry the whole row (the inbox reconciles by id against optimistic
-- state, per spec §5.4). Each publication add is wrapped so a re-run is a
-- no-op; @down removes the tables from the publication.

-- @up

alter table comms.conversations replica identity full;
alter table comms.messages      replica identity full;
alter table comms.mentions      replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table comms.conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table comms.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table comms.mentions;
  exception when duplicate_object then null;
  end;
end $$;

-- @down

do $$
begin
  begin
    alter publication supabase_realtime drop table comms.conversations;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime drop table comms.messages;
  exception when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime drop table comms.mentions;
  exception when undefined_object then null;
  end;
end $$;

alter table comms.conversations replica identity default;
alter table comms.messages      replica identity default;
alter table comms.mentions      replica identity default;
