-- ============================================================================
-- T2P: photo / video attachments on coaching feedback
--
-- Adds one jsonb column per place coaching text lives:
--   video_submissions.coach_feedback_media  - feedback on an athlete's video
--   logs.coach_reply_media                  - reply to a note on a logged exercise
--   exercise_comments.media                 - either side, in an exercise thread
-- Each holds an array of { url, type: "image" | "video", name }.
--
-- Additive only: no existing row or policy changes. Files live in the existing
-- messages-media bucket under <athleteId>/feedback/, which the staged private-storage
-- policy (supabase/pending/20261003_private_comms_and_media.sql) already covers:
-- athletes read their own folder, the coach reads/writes everything.
--
-- The app only writes these columns when attachments are present, so text-only
-- feedback keeps working whether or not this has been run.
--
-- Rollback:
--   alter table public.video_submissions drop column if exists coach_feedback_media;
--   alter table public.logs              drop column if exists coach_reply_media;
--   alter table public.exercise_comments drop column if exists media;
-- ============================================================================

alter table public.video_submissions add column if not exists coach_feedback_media jsonb;
alter table public.logs              add column if not exists coach_reply_media    jsonb;
alter table public.exercise_comments add column if not exists media                jsonb;

-- PostgREST caches the schema; tell it the columns exist now.
notify pgrst, 'reload schema';
