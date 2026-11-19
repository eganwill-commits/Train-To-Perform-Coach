-- Coach note read receipts.
--
-- A shared day note (programs.weeks[].days[].coachNotes with coachNotesShared = true)
-- is flagged on the athlete's program until they tap "Got it". One row per
-- (athlete, program, day). note_hash is a hash of the note text at the moment it was
-- read: when the coach edits the note the hash no longer matches, so it flags again.
--
-- Same access pattern as log_gap_dismissals: coach sees everything, an athlete only
-- their own rows. The coach reads it to show "Read ✓" next to the share toggle.

create table if not exists public.coach_note_reads (
  athlete_id text not null,
  program_id text not null,
  day_id     text not null,
  note_hash  text not null,
  read_at    timestamptz not null default now(),
  primary key (athlete_id, program_id, day_id)
);

alter table public.coach_note_reads enable row level security;

drop policy if exists "coach: all" on public.coach_note_reads;
create policy "coach: all" on public.coach_note_reads
  for all using (is_t2p_coach()) with check (is_t2p_coach());

drop policy if exists "athlete: own rows" on public.coach_note_reads;
create policy "athlete: own rows" on public.coach_note_reads
  for all to authenticated
  using (athlete_id = current_athlete_id())
  with check (athlete_id = current_athlete_id());
