-- Restores the exact access rules in place before 20261003_private_comms_and_media.sql.
-- Policies and bucket flags only; no data is touched.
begin;

do $$
declare t text;
begin
  foreach t in array array['messages','athlete_notes','exercise_comments','athlete_alerts','video_submissions'] loop
    execute format('drop policy if exists "coach: all" on public.%I', t);
    execute format('drop policy if exists "athlete: own rows" on public.%I', t);
  end loop;
end $$;

-- messages and athlete_notes had RLS off; the other three had RLS on with "Allow all".
alter table public.messages disable row level security;
alter table public.athlete_notes disable row level security;
create policy "Allow all" on public.exercise_comments for all using (true) with check (true);
create policy "Allow all" on public.athlete_alerts for all using (true) with check (true);
create policy "Allow all" on public.video_submissions for all using (true) with check (true);

drop policy if exists "coach: all" on public.athletes;
drop policy if exists "athlete: read own row" on public.athletes;
create policy "Allow all" on public.athletes for all using (true) with check (true);

update storage.buckets set public = true where id in ('videos', 'messages-media');

drop policy if exists "t2p storage: coach all" on storage.objects;
drop policy if exists "t2p storage: voice clips readable" on storage.objects;
drop policy if exists "t2p storage: demo library readable" on storage.objects;
drop policy if exists "t2p storage: athlete reads own media" on storage.objects;
drop policy if exists "t2p storage: athlete uploads to own folder" on storage.objects;
drop policy if exists "t2p storage: athlete deletes own folder" on storage.objects;

create policy "Allow Uploads 16dfwjc_0" on storage.objects for select using (true);
create policy "Allow Uploads 16dfwjc_1" on storage.objects for insert with check (true);
create policy "Allow all 16dfwjc_0" on storage.objects for select using (true);
create policy "Allow all 16dfwjc_1" on storage.objects for insert with check (true);
create policy "Allow all 1uswaj_0" on storage.objects for select using (true);
create policy "Allow all 1uswaj_1" on storage.objects for insert with check (true);
create policy "Allow reads" on storage.objects for select using (bucket_id = 'videos');
create policy "Allow uploads" on storage.objects for insert with check (bucket_id = 'videos');
create policy "Only coach writes voice clips" on storage.objects for insert with check ((bucket_id <> 'voice-lines') or public.is_t2p_coach());
create policy "Only coach updates voice clips" on storage.objects for update using ((bucket_id <> 'voice-lines') or public.is_t2p_coach());
create policy "Only coach deletes voice clips" on storage.objects for delete using ((bucket_id <> 'voice-lines') or public.is_t2p_coach());

commit;
