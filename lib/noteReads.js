import { supabase } from "./supabase";

/*
  Coach note read receipts.

  A shared day note used to sit at the bottom of the session, under 20-odd exercises,
  with nothing to say it was there. Now it is flagged until the athlete taps "Got it".

  Keyed by (athlete, program, day) with a hash of the note text. Editing the note
  changes the hash, so an updated note flags again - the athlete has not read the new
  version just because they read the old one.

  In the database rather than localStorage so it follows the athlete across devices and
  so the coach can see "Read ✓" against the note in Programs.
*/

export function noteHash(text) {
  const t = (text || "").trim();
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${t.length}:${(h >>> 0).toString(36)}`;
}

export const sharedNote = (day) =>
  day && day.coachNotesShared && (day.coachNotes || "").trim() ? day.coachNotes : "";

// Map of `${programId}:${dayId}` -> { note_hash, read_at }. Never throws.
export async function fetchNoteReads({ athleteId, programId } = {}) {
  let q = supabase.from("coach_note_reads").select("athlete_id,program_id,day_id,note_hash,read_at");
  if (athleteId) q = q.eq("athlete_id", athleteId);
  if (programId) q = q.eq("program_id", programId);
  const { data, error } = await q;
  if (error) { console.error("fetchNoteReads failed", error); return {}; }
  const m = {};
  (data || []).forEach(r => { m[`${r.program_id}:${r.day_id}`] = r; });
  return m;
}

export function isNoteUnread(reads, programId, day) {
  const text = sharedNote(day);
  if (!text) return false;
  const r = reads?.[`${programId}:${day.id}`];
  return !r || r.note_hash !== noteHash(text);
}

// Returns the saved row, or null on failure.
export async function markNoteRead({ athleteId, programId, day }) {
  const text = sharedNote(day);
  if (!athleteId || !programId || !day?.id || !text) return null;
  const row = { athlete_id: athleteId, program_id: programId, day_id: day.id, note_hash: noteHash(text), read_at: new Date().toISOString() };
  const { error } = await supabase.from("coach_note_reads").upsert(row, { onConflict: "athlete_id,program_id,day_id" });
  if (error) { console.error("markNoteRead failed", error); return null; }
  return row;
}
