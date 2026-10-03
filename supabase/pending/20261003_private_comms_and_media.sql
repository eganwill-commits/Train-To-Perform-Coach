-- ============================================================================
-- T2P — make coach/athlete communication and athlete videos private
-- STAGED: apply only when this branch goes live. Not applied yet.
--
-- What it does
--   * messages, athlete_notes, exercise_comments, athlete_alerts, video_submissions:
--     the coach sees everything; a signed-in athlete sees and writes only their own
--     rows; anyone else (the public anon key) sees nothing.
--   * videos + messages-media storage buckets become private. The app now reads them
--     through short-lived signed URLs (lib/media.js), so no stored URL is rewritten.
--     Coach demo videos under videos/library/ stay readable to every signed-in user.
--
-- What it does NOT touch
--   * No row in any table is changed or deleted. Policies and bucket flags only.
--   * athletes, programs, logs, baselines, exercises keep their current open access
--     (next phase - see the audit notes).
--   * voice-lines stays public (TV timer screens play it without a login).
--
-- Prerequisite (in this branch): legacy athlete logins upgrade themselves to real
-- sessions on next open (app/page.js). Checked 3 Oct 2026: all 14 athletes are
-- provisioned and every access code works as that athlete's password.
--
-- Rollback: supabase/pending/20261003_private_comms_and_media_ROLLBACK.sql
-- ============================================================================

begin;

-- Which athlete the signed-in user is. Security definer so it can read athletes
-- regardless of that table's own policies.
create or replace function public.current_athlete_id()
returns text language sql stable security definer set search_path = public as $$
  select id from public.athletes where auth_user_id = auth.uid() limit 1
$$;
revoke all on function public.current_athlete_id() from public;
grant execute on function public.current_athlete_id() to anon, authenticated;

-- ---------------------------------------------------------------- tables
do $$
declare t text;
begin
  foreach t in array array['messages','athlete_notes','exercise_comments','athlete_alerts','video_submissions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Allow all" on public.%I', t);
    execute format('drop policy if exists "coach: all" on public.%I', t);
    execute format('drop policy if exists "athlete: own rows" on public.%I', t);
    execute format($p$create policy "coach: all" on public.%I for all using (public.is_t2p_coach()) with check (public.is_t2p_coach())$p$, t);
    execute format($p$create policy "athlete: own rows" on public.%I for all to authenticated using (athlete_id = public.current_athlete_id()) with check (athlete_id = public.current_athlete_id())$p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- storage
update storage.buckets set public = false where id in ('videos', 'messages-media');

-- The old upload/read policies had `true` as their condition, which applied to every
-- bucket. Replaced by the specific ones below.
drop policy if exists "Allow Uploads 16dfwjc_0" on storage.objects;
drop policy if exists "Allow Uploads 16dfwjc_1" on storage.objects;
drop policy if exists "Allow all 16dfwjc_0" on storage.objects;
drop policy if exists "Allow all 16dfwjc_1" on storage.objects;
drop policy if exists "Allow all 1uswaj_0" on storage.objects;
drop policy if exists "Allow all 1uswaj_1" on storage.objects;
drop policy if exists "Allow reads" on storage.objects;
drop policy if exists "Allow uploads" on storage.objects;
-- These three allowed ANY write to any bucket other than voice-lines.
drop policy if exists "Only coach writes voice clips" on storage.objects;
drop policy if exists "Only coach updates voice clips" on storage.objects;
drop policy if exists "Only coach deletes voice clips" on storage.objects;

create policy "t2p storage: coach all" on storage.objects for all
  using (public.is_t2p_coach()) with check (public.is_t2p_coach());

create policy "t2p storage: voice clips readable" on storage.objects for select
  using (bucket_id = 'voice-lines');

create policy "t2p storage: demo library readable" on storage.objects for select to authenticated
  using (bucket_id = 'videos' and name like 'library/%');

-- An athlete can read a file when it is in their folder, or when a row of theirs
-- points at it (clips uploaded before files were foldered by athlete).
create policy "t2p storage: athlete reads own media" on storage.objects for select to authenticated
  using (
    bucket_id in ('videos', 'messages-media') and (
      split_part(name, '/', 1) = public.current_athlete_id()
      or exists (select 1 from public.video_submissions v where v.athlete_id = public.current_athlete_id() and v.video_url like '%/' || storage.objects.name)
      or exists (select 1 from public.messages m where m.athlete_id = public.current_athlete_id() and m.media_url like '%/' || storage.objects.name)
    )
  );

create policy "t2p storage: athlete uploads to own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('videos', 'messages-media') and split_part(name, '/', 1) = public.current_athlete_id());

create policy "t2p storage: athlete deletes own folder" on storage.objects for delete to authenticated
  using (bucket_id in ('videos', 'messages-media') and split_part(name, '/', 1) = public.current_athlete_id());

commit;
