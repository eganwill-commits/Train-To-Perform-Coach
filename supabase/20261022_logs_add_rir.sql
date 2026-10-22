-- Effort switches from RPE to RIR (reps in reserve) on 2026-10-22.
-- Additive only: logs.rpe keeps its history untouched; new entries write logs.rir.
alter table public.logs add column if not exists rir text;
comment on column public.logs.rir is 'Reps in reserve (clean-form reps left), logged from 2026-10-22. Replaces rpe for new entries.';
comment on column public.logs.rpe is 'Legacy: RPE logged before 2026-10-22. Read-only history; new entries use rir.';
