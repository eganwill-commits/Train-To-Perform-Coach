-- Coach cues that follow a movement through the rest of a program.
--
-- Video feedback is anchored to the one block the athlete filmed, so the fix the coach
-- asked for was invisible the next time the athlete did that lift. A cue is the short,
-- mid-set version of that feedback, attached to one or more exercises (exercise_ids),
-- so it shows on every later session of that movement - including a movement that has
-- since replaced the one that was filmed (Chest-Supported DB Row -> Single Arm DB Row).
--
-- Access matches the other coach/athlete conversation tables today ("Allow all").
-- It is listed with them in pending/20261003_private_comms_and_media.sql so it is
-- tightened in the same pass.

create table if not exists public.exercise_cues (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       text not null,
  exercise_ids     text[] not null default '{}',
  exercise_names   text[] not null default '{}',
  cue              text not null,
  source_video_id  text,
  source_block_id  text,
  source_label     text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists exercise_cues_athlete_idx on public.exercise_cues (athlete_id) where active;
create unique index if not exists exercise_cues_source_video_uq on public.exercise_cues (source_video_id) where source_video_id is not null;

alter table public.exercise_cues enable row level security;
drop policy if exists "Allow all" on public.exercise_cues;
create policy "Allow all" on public.exercise_cues for all using (true) with check (true);
