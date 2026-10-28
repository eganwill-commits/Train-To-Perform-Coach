-- In Person / Remote split for the coach Programs page.
-- Additive: every existing program defaults to in_person, then the remote
-- and hybrid clients are moved to remote (hybrid lives under Remote for now).
alter table public.programs
  add column if not exists delivery text not null default 'in_person';

alter table public.programs
  drop constraint if exists programs_delivery_check;
alter table public.programs
  add constraint programs_delivery_check check (delivery in ('in_person', 'remote'));

update public.programs set delivery = 'remote'
where athlete_id in (
  'bc-athlete-baker-cashel',
  'mb-athlete-mac-bertelson',
  'mc-athlete-mark-cashel',
  'tc-athlete-tucker-carr',
  'ae-athlete-ali-egan',
  'sw-athlete-scott-wisenbaker'
)
or group_id = 'dh-selfguided-fall2026'          -- self-guided
or group_id = '81f27a78-8be3-4810-8e82-7632caa90953' -- July Hypertrophy (self-guided)
or name = 'Custom Hybrid Fall Preseason';

-- Rollback: alter table public.programs drop column delivery;
