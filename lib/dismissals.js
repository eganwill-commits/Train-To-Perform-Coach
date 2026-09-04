import { supabase } from "./supabase";
import { sessionKey } from "./logging";

/*
  Dismissed log gaps.

  A flagged session is a question — "where are these numbers?" — and some of those
  questions have an answer that is not "go and log them". An athlete taps into Week 9 to
  look ahead and the warm-up saves; a session genuinely happened without the lifts; the
  coach already has the numbers on paper. Before this the only way to clear one of those
  was to type fake numbers into the athlete's log, which is worse than the alert.

  In the database, not localStorage, and shared by both sides on purpose. A dismissal is a
  coaching decision about a session, not a per-device preference: dismissing it on the
  dashboard also takes the red banner off the athlete's phone, which is the point for a
  session that is never going to be filled in.

  Keyed by (athlete, week_label, day_label) — see sessionKey(). Deliberately NOT the block
  ids: those change whenever the program JSON is re-rendered, and a dismissal that quietly
  came undone after a program edit would be worse than no dismissal at all.
*/

export async function fetchDismissals(athleteId) {
  let q = supabase.from("log_gap_dismissals").select("athlete_id,week_label,day_label");
  if (athleteId) q = q.eq("athlete_id", athleteId);
  const { data, error } = await q;
  if (error) {
    // Never fatal. A failed read means the coach sees a gap he had already dismissed,
    // which is annoying; throwing would take down the whole dashboard, which is not.
    console.error("fetchDismissals failed", error);
    return { keys: new Set(), byAthlete: new Map(), ok: false };
  }
  const keys = new Set();
  const byAthlete = new Map();
  (data || []).forEach(r => {
    const k = sessionKey(r.week_label, r.day_label);
    keys.add(`${r.athlete_id}::${k}`);
    const s = byAthlete.get(r.athlete_id) || new Set();
    s.add(k);
    byAthlete.set(r.athlete_id, s);
  });
  return { keys, byAthlete, ok: true };
}

export function dismissedSetFor(byAthlete, athleteId) {
  return byAthlete?.get(athleteId) || new Set();
}

/*
  Returns true on success. The caller re-reads rather than assuming, so a dismissal that
  did not land shows up again instead of vanishing from the coach's view while the
  athlete keeps being nagged.
*/
export async function dismissGap({ athleteId, weekLabel, dayLabel, movements, by = "coach" }) {
  if (!athleteId) return false;
  const { error } = await supabase.from("log_gap_dismissals").upsert({
    athlete_id: athleteId,
    week_label: weekLabel || "",
    day_label: dayLabel || "",
    movements: (movements || []).map(m => m.name).join(", ").slice(0, 500) || null,
    dismissed_by: by,
  }, { onConflict: "athlete_id,week_label,day_label" });
  if (error) { console.error("dismissGap failed", error); return false; }
  return true;
}

export async function undismissGap({ athleteId, weekLabel, dayLabel }) {
  if (!athleteId) return false;
  const { error } = await supabase.from("log_gap_dismissals")
    .delete()
    .eq("athlete_id", athleteId)
    .eq("week_label", weekLabel || "")
    .eq("day_label", dayLabel || "");
  if (error) { console.error("undismissGap failed", error); return false; }
  return true;
}
