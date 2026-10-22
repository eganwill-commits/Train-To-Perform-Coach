-- Tempo standardised to four parts (down-pause-up-pause) on 2026-10-22. Already applied.
-- Backups taken first: public._programs_backup_20261022_tempo (full programs rows) and
-- public._exercises_backup_20261022_tempo (id, tempo). Result: 26 programs (1,989 block
-- tempos) and 40 library exercises updated; every other field verified unchanged.
-- Only pure codes change; free text ("Hold", "controlled", "3-5s lower") is untouched.
-- Mirrors normalizeTempo() in lib/tempo.js, which the program builder now runs on save.

create or replace function pg_temp.nt(t text) returns text language sql immutable as $$
  select case
    when t ~ '^[0-9xX]-[0-9xX]-[0-9xX]-[0-9xX]$' then upper(t)
    when t ~ '^[0-9xX]-[0-9xX]-[0-9xX]$' then upper(t) || '-0'
    when t ~ '^[0-9xX]{4}$' then upper(substr(t,1,1)||'-'||substr(t,2,1)||'-'||substr(t,3,1)||'-'||substr(t,4,1))
    when t ~ '^[0-9xX]{3}$' then upper(substr(t,1,1)||'-'||substr(t,2,1)||'-'||substr(t,3,1)) || '-0'
    when t ~ '^[0-9xX]-[0-9xX]-[0-9xX] ' then upper(substr(t,1,5)) || '-0' || substr(t,6)
    else t end $$;

create or replace function pg_temp.fix_blocks(a jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(case when jsonb_typeof(blk->'tempo')='string'
    then jsonb_set(blk,'{tempo}',to_jsonb(pg_temp.nt(blk->>'tempo'))) else blk end order by i),'[]'::jsonb)
  from jsonb_array_elements(a) with ordinality x(blk,i) $$;
create or replace function pg_temp.fix_days(a jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(case when jsonb_typeof(d->'blocks')='array'
    then jsonb_set(d,'{blocks}',pg_temp.fix_blocks(d->'blocks')) else d end order by i),'[]'::jsonb)
  from jsonb_array_elements(a) with ordinality x(d,i) $$;
create or replace function pg_temp.fix_weeks(a jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(case when jsonb_typeof(w->'days')='array'
    then jsonb_set(w,'{days}',pg_temp.fix_days(w->'days')) else w end order by i),'[]'::jsonb)
  from jsonb_array_elements(a) with ordinality x(w,i) $$;

update public.programs set weeks = pg_temp.fix_weeks(weeks)
where jsonb_typeof(weeks)='array' and weeks <> pg_temp.fix_weeks(weeks);
update public.exercises set tempo = pg_temp.nt(tempo)
where coalesce(tempo,'')<>'' and tempo <> pg_temp.nt(tempo);

-- Rollback:
-- update public.programs p set weeks = b.weeks from public._programs_backup_20261022_tempo b where p.id = b.id;
-- update public.exercises e set tempo = b.tempo from public._exercises_backup_20261022_tempo b where e.id = b.id;
