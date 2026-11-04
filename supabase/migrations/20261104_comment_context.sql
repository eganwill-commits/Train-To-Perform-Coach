-- Two-way conversation on everything the coach and athlete say about a movement.
--
-- Before this, coach video feedback and coach replies to log notes were one-way: the
-- athlete could read them but had nowhere to answer, so answers went to Messages and
-- lost the exercise they were about. Now a reply to a video or to a log note is an
-- exercise comment that points back at what it answers. The comment thread on the
-- exercise is the one place the whole back-and-forth lives.
--
-- Additive only. Rollback:
--   alter table public.exercise_comments drop column if exists video_id;
--   alter table public.exercise_comments drop column if exists log_id;

alter table public.exercise_comments add column if not exists video_id text;
alter table public.exercise_comments add column if not exists log_id   text;

create index if not exists exercise_comments_video_idx on public.exercise_comments (athlete_id, video_id) where video_id is not null;
create index if not exists exercise_comments_log_idx   on public.exercise_comments (athlete_id, log_id)   where log_id   is not null;

-- The coach's phone says what the athlete is answering, not just "commented on".
create or replace function private.coach_push_on_comment()
returns trigger language plpgsql security definer set search_path = public, private as $$
declare
  who  text := coalesce(nullif(new.author_name, ''), private.athlete_name_of(new.athlete_id));
  what text := coalesce(new.exercise_name, 'an exercise');
begin
  if new.author_role is distinct from 'athlete' then return new; end if;
  perform private.send_coach_push(
    case
      when new.video_id is not null then who || ' replied to your video feedback on ' || what
      when new.log_id   is not null then who || ' replied about their log on ' || what
      else who || ' commented on ' || what
    end,
    coalesce(nullif(new.body, ''), 'Sent an attachment'),
    'programs', new.block_id,
    jsonb_build_object('athleteId', new.athlete_id, 'weekLabel', new.week_label, 'dayLabel', new.day_label, 'blockId', new.block_id, 'videoId', new.video_id)
  );
  return new;
exception when others then
  raise warning 'coach_push_on_comment: %', sqlerrm;
  return new;
end;
$$;
