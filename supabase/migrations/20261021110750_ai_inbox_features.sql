-- Inbox copilot feature switches
--
-- Adds the inboxAssist (conversation summaries and reply rewrites, 300 a day) and inboxTranslation (100 a day) switches
-- to the comms.ai_settings column defaults, so new rows match lib/ai/features.js. Existing rows need no backfill:
-- readAiSettings fills a missing key from the same defaults.
-- Depends on: comms.ai_settings (20261021102015_ai_providers).

-- @up

alter table comms.ai_settings alter column features set default
  '{"articleAssist":true,"translation":true,"gapClustering":true,"inboxAssist":true,"inboxTranslation":true,"messengerAnswers":false}'::jsonb;
alter table comms.ai_settings alter column limits set default
  '{"articleAssist":300,"translation":100,"gapClustering":40,"inboxAssist":300,"inboxTranslation":100,"messengerAnswers":0,"perUserPerMinute":10}'::jsonb;

-- @down

alter table comms.ai_settings alter column features set default
  '{"articleAssist":true,"translation":true,"gapClustering":true,"messengerAnswers":false}'::jsonb;
alter table comms.ai_settings alter column limits set default
  '{"articleAssist":300,"translation":100,"gapClustering":40,"messengerAnswers":0,"perUserPerMinute":10}'::jsonb;
