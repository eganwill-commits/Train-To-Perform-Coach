-- Coach phone notifications.
--
-- Until now notifications only went one way: coach -> athlete. When an athlete sent a
-- video, a comment, a message or a note, the coach found out only by opening the app.
--
-- These triggers fire inside the database the moment an athlete-authored row lands and
-- post it, through pg_net, to /api/push/coach, which sends a Web Push to every device
-- the coach turned notifications on for. Doing it here (rather than in the athlete's
-- browser) covers every screen and every cached app version.
--
-- Security: the request carries a random secret that lives only in private.coach_push.
-- The route passes it to coach_push_targets(), which checks it before returning the
-- coach's subscriptions. Without the secret the RPC returns an error.
--
-- A trigger must never block an athlete's save: every call is wrapped so a failure is
-- logged as a warning and the insert carries on.

create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.coach_push (
  id int primary key default 1 check (id = 1),
  secret text not null,
  endpoint text not null,
  enabled boolean not null default true
);

insert into private.coach_push (id, secret, endpoint)
values (1, encode(extensions.gen_random_bytes(32), 'hex'), 'https://train-to-perform-coach.vercel.app/api/push/coach')
on conflict (id) do nothing;

-- Subscriptions for the coach, only for a caller holding the secret.
create or replace function public.coach_push_targets(p_secret text)
returns table (id uuid, endpoint text, p256dh text, auth text)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if p_secret is null or not exists (select 1 from private.coach_push c where c.secret = p_secret) then
    raise exception 'not authorised';
  end if;
  return query
    select s.id, s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    where s.role = 'coach';
end;
$$;

-- Bookkeeping after a send: stamp last_sent_at, drop dead subscriptions.
create or replace function public.coach_push_sent(p_secret text, p_sent boolean, p_gone uuid[])
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if p_secret is null or not exists (select 1 from private.coach_push c where c.secret = p_secret) then
    raise exception 'not authorised';
  end if;
  if p_gone is not null and array_length(p_gone, 1) > 0 then
    delete from public.push_subscriptions where role = 'coach' and id = any(p_gone);
  end if;
  if p_sent then
    update public.push_subscriptions set last_sent_at = now() where role = 'coach';
  end if;
end;
$$;

revoke all on function public.coach_push_targets(text) from public;
revoke all on function public.coach_push_sent(text, boolean, uuid[]) from public;
grant execute on function public.coach_push_targets(text) to anon, authenticated;
grant execute on function public.coach_push_sent(text, boolean, uuid[]) to anon, authenticated;

-- Post one notification. Never raises.
create or replace function private.send_coach_push(p_title text, p_body text, p_page text, p_ref text, p_target jsonb)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  cfg private.coach_push;
begin
  select * into cfg from private.coach_push where id = 1;
  if cfg is null or not cfg.enabled then return; end if;
  perform net.http_post(
    url := cfg.endpoint,
    body := jsonb_build_object(
      'secret', cfg.secret,
      'title', left(coalesce(p_title, 'Train To Perform'), 80),
      'body', left(coalesce(p_body, ''), 180),
      'page', p_page,
      'refId', p_ref,
      'target', p_target
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'send_coach_push failed: %', sqlerrm;
end;
$$;

create or replace function private.athlete_name_of(p_id text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.athletes where id = p_id), 'An athlete');
$$;

-- Each source table gets its own small trigger function.

create or replace function private.coach_push_on_video()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  perform private.send_coach_push(
    coalesce(nullif(new.athlete_name, ''), private.athlete_name_of(new.athlete_id)) || ' sent a video',
    coalesce(new.exercise_name, 'Movement video')
      || coalesce(' · ' || nullif(new.day_label, ''), '')
      || coalesce(' — "' || nullif(trim(new.notes), '') || '"', ''),
    'videos', new.id::text,
    jsonb_build_object('videoId', new.id::text, 'athleteId', new.athlete_id)
  );
  return new;
exception when others then
  raise warning 'coach_push_on_video: %', sqlerrm;
  return new;
end;
$$;

create or replace function private.coach_push_on_comment()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.author_role is distinct from 'athlete' then return new; end if;
  perform private.send_coach_push(
    coalesce(nullif(new.author_name, ''), private.athlete_name_of(new.athlete_id)) || ' commented on ' || coalesce(new.exercise_name, 'an exercise'),
    new.body,
    'programs', new.block_id,
    jsonb_build_object('athleteId', new.athlete_id, 'weekLabel', new.week_label, 'dayLabel', new.day_label, 'blockId', new.block_id)
  );
  return new;
exception when others then
  raise warning 'coach_push_on_comment: %', sqlerrm;
  return new;
end;
$$;

create or replace function private.coach_push_on_message()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.sender_role is distinct from 'athlete' then return new; end if;
  perform private.send_coach_push(
    'Message from ' || coalesce(nullif(new.sender_name, ''), nullif(new.athlete_name, ''), private.athlete_name_of(new.athlete_id)),
    coalesce(nullif(new.content, ''), case when new.media_url is not null then 'Sent a photo/video' when new.video_url is not null then 'Shared a link' else 'New message' end),
    'messages', new.id::text,
    jsonb_build_object('athleteId', new.athlete_id)
  );
  return new;
exception when others then
  raise warning 'coach_push_on_message: %', sqlerrm;
  return new;
end;
$$;

create or replace function private.coach_push_on_note()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if new.author_role is distinct from 'athlete' then return new; end if;
  perform private.send_coach_push(
    'Note from ' || coalesce(nullif(new.author_name, ''), private.athlete_name_of(new.athlete_id)),
    new.content,
    'programs', new.id::text,
    jsonb_build_object('athleteId', new.athlete_id)
  );
  return new;
exception when others then
  raise warning 'coach_push_on_note: %', sqlerrm;
  return new;
end;
$$;

-- A note the athlete typed on an exercise while logging ("knee felt off on set 3").
-- Only when the note is new or changed, and only for recent sessions, so a bulk data
-- fix to old logs never sets the coach's phone off.
create or replace function private.coach_push_on_log_note()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  if coalesce(trim(new.notes), '') = '' then return new; end if;
  if tg_op = 'UPDATE' and coalesce(new.notes, '') = coalesce(old.notes, '') then return new; end if;
  if new.logged_at is not null and new.logged_at < now() - interval '2 days' then return new; end if;
  perform private.send_coach_push(
    coalesce(nullif(new.athlete_name, ''), private.athlete_name_of(new.athlete_id)) || ' left a note on ' || coalesce(new.exercise_name, 'an exercise'),
    new.notes,
    'programs', new.id,
    jsonb_build_object('athleteId', new.athlete_id, 'weekLabel', new.week_label, 'dayLabel', new.day_label)
  );
  return new;
exception when others then
  raise warning 'coach_push_on_log_note: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists coach_push_video on public.video_submissions;
create trigger coach_push_video after insert on public.video_submissions
  for each row execute function private.coach_push_on_video();

drop trigger if exists coach_push_comment on public.exercise_comments;
create trigger coach_push_comment after insert on public.exercise_comments
  for each row execute function private.coach_push_on_comment();

drop trigger if exists coach_push_message on public.messages;
create trigger coach_push_message after insert on public.messages
  for each row execute function private.coach_push_on_message();

drop trigger if exists coach_push_note on public.athlete_notes;
create trigger coach_push_note after insert on public.athlete_notes
  for each row execute function private.coach_push_on_note();

drop trigger if exists coach_push_log_note on public.logs;
create trigger coach_push_log_note after insert or update of notes on public.logs
  for each row execute function private.coach_push_on_log_note();
