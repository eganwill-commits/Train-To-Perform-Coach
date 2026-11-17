-- Make sure coach feedback actually gets seen.
--
-- 1. exercise_cues.show_full_note: the coach can choose to show the whole video note
--    under the cue on the athlete's exercise card, not just behind a "Full video feedback" tap.
-- 2. video_submissions.feedback_read_at / logs.coach_reply_read_at: when the athlete has
--    opened the coach's video feedback / reply to a log note on an exercise card. Until then
--    it counts as new, so feedback from an earlier week opens itself on the current card
--    instead of sitting collapsed under "earlier".
--
-- Existing feedback is backfilled as read so the deploy doesn't light up every old note.
--
-- Additive only. Rollback:
--   alter table public.exercise_cues     drop column if exists show_full_note;
--   alter table public.video_submissions drop column if exists feedback_read_at;
--   alter table public.logs              drop column if exists coach_reply_read_at;

alter table public.exercise_cues     add column if not exists show_full_note boolean not null default false;
alter table public.video_submissions add column if not exists feedback_read_at timestamptz;
alter table public.logs              add column if not exists coach_reply_read_at timestamptz;

update public.video_submissions
   set feedback_read_at = now()
 where feedback_read_at is null
   and (coalesce(trim(coach_feedback), '') <> '' or (jsonb_typeof(coach_feedback_media) = 'array' and jsonb_array_length(coach_feedback_media) > 0));

update public.logs
   set coach_reply_read_at = now()
 where coach_reply_read_at is null
   and (coalesce(trim(coach_reply), '') <> '' or (jsonb_typeof(coach_reply_media) = 'array' and jsonb_array_length(coach_reply_media) > 0));
