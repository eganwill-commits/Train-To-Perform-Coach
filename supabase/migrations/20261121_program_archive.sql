-- Program archive flag.
--
-- The coach Board (components/Board.js) shows every athlete's current program. A block
-- that has ended and has no follow-up shows as "Block ended, next block not built"
-- until the coach either builds the next one or archives it. archived_at is that switch:
-- null = live, a timestamp = archived. Nothing else reads it, so archiving only takes a
-- program off the Board; the program, its weeks and its logs are untouched.
--
-- Reversible: update programs set archived_at = null where id = '...';
-- Covered by the existing "coach: all" policy on programs.

alter table public.programs add column if not exists archived_at timestamptz;
