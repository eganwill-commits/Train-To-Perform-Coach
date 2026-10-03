import { supabase } from "./supabase";
import { sessionKey, summariseMissing } from "./logging";
import { notifyAthlete } from "./push";

/*
  Nudges — the coach chasing ONE movement that has no numbers against it.

  It writes a normal row to `messages`, from the coach, into the athlete's existing
  thread. Deliberately not a new channel: the athlete already has one place where
  things the coach said to them live, they can reply to it there, and `messages`
  carries its own read_at that the athlete's bell already reads. A bespoke
  "nudge inbox" would be a second thing to check and a second unread state.

  `log_nudges` is not the message. It is the coach's own record that he already
  asked, so a page reload does not turn one chase into three. Re-nudging is allowed
  - an athlete who ignored the first one may need a second - it just moves sent_at
  and counts.
*/

export function nudgeKey(athleteId, weekLabel, dayLabel, movement) {
  return `${athleteId}::${sessionKey(weekLabel, dayLabel)}::${movement}`;
}

export async function fetchNudges() {
  const { data, error } = await supabase
    .from("log_nudges")
    .select("athlete_id,week_label,day_label,movement,sent_at,times_sent");
  if (error) {
    // Never fatal: the worst case is a chip that does not remember it was sent,
    // which is a nuisance. Failing the dashboard over it is not.
    console.error("fetchNudges failed", error);
    return new Map();
  }
  const map = new Map();
  (data || []).forEach(r => {
    map.set(nudgeKey(r.athlete_id, r.week_label, r.day_label, r.movement), r);
  });
  return map;
}

/*
  The wording the coach starts from, not the wording that gets sent.

  Every nudge is editable before it goes, because a canned line under a coach's own
  name is worse than no line - the athlete can tell, and the point of this is that a
  person noticed.
*/
export function draftNudge({ athleteName, movement, dayLabel, weekLabel }) {
  const first = (athleteName || "").trim().split(/\s+/)[0] || "there";
  const where = [weekLabel, dayLabel].filter(Boolean).join(" · ");
  return `Hey ${first} — ${where} is logged, but ${movement} has no numbers against it. `
    + `Can you drop in what you actually did? I set your next load off that one.`;
}

/*
  Returns { ok, message } — the caller shows the failure rather than assuming.
  The message is written first; the nudge record only follows a message that landed,
  so a chip never claims the athlete was told something they were not.
*/
export async function sendNudge({ athlete, movement, weekLabel, dayLabel, text, coachId = "coach", coachName = "Coach" }) {
  if (!athlete?.id || !movement || !(text || "").trim()) return { ok: false };

  const { data: msg, error: msgErr } = await supabase.from("messages").insert([{
    athlete_id: athlete.id,
    athlete_name: athlete.name,
    sender_id: coachId,
    sender_name: coachName,
    sender_role: "coach",
    content: text.trim(),
  }]).select().single();

  if (msgErr) { console.error("sendNudge: message insert failed", msgErr); return { ok: false }; }

  const { error: nudgeErr } = await supabase.from("log_nudges").upsert({
    athlete_id: athlete.id,
    week_label: weekLabel || "",
    day_label: dayLabel || "",
    movement,
    message_id: msg.id,
    sent_by: coachId,
    sent_at: new Date().toISOString(),
  }, { onConflict: "athlete_id,week_label,day_label,movement" });

  // The athlete HAS the message at this point. A failed bookkeeping write must not
  // read as a failed send.
  if (nudgeErr) console.error("sendNudge: log_nudges upsert failed", nudgeErr);

  notifyAthlete({ athleteId: athlete.id, title: `Message from ${coachName}`, body: text.trim(), page: "messages" });
  return { ok: true, message: msg };
}

/*
  ONE message for a whole session.

  51 of the first 57 coach messages were per-movement nudges - Brooks got five for one
  Tuesday, each a near-identical paragraph. Five messages read as noise and bury the
  ones that are not about logging. This drafts a single message that names every
  movement still missing, and records a nudge against each of them (all pointing at the
  same message) so the chips still remember they were chased.

  The per-movement chip still exists for the case where only one lift matters.
*/
export function draftSessionNudge({ athleteName, movements, dayLabel, weekLabel }) {
  const first = (athleteName || "").trim().split(/\s+/)[0] || "there";
  const where = [weekLabel, dayLabel].filter(Boolean).join(" · ");
  const list = summariseMissing((movements || []).map(name => ({ name })), 6);
  const one = (movements || []).length === 1;
  return `Hey ${first} — ${where} is logged, but ${list} ${one ? "has" : "have"} no numbers against ${one ? "it" : "them"}. `
    + `Can you drop in what you actually did? I set your next loads off ${one ? "that one" : "those"}.`;
}

export async function sendSessionNudge({ athlete, movements, weekLabel, dayLabel, text, coachId = "coach", coachName = "Coach" }) {
  const list = (movements || []).filter(Boolean);
  if (!athlete?.id || list.length === 0 || !(text || "").trim()) return { ok: false };

  const { data: msg, error: msgErr } = await supabase.from("messages").insert([{
    athlete_id: athlete.id,
    athlete_name: athlete.name,
    sender_id: coachId,
    sender_name: coachName,
    sender_role: "coach",
    content: text.trim(),
  }]).select().single();
  if (msgErr) { console.error("sendSessionNudge: message insert failed", msgErr); return { ok: false }; }

  const now = new Date().toISOString();
  const { error: nudgeErr } = await supabase.from("log_nudges").upsert(list.map(movement => ({
    athlete_id: athlete.id,
    week_label: weekLabel || "",
    day_label: dayLabel || "",
    movement,
    message_id: msg.id,
    sent_by: coachId,
    sent_at: now,
  })), { onConflict: "athlete_id,week_label,day_label,movement" });
  if (nudgeErr) console.error("sendSessionNudge: log_nudges upsert failed", nudgeErr);

  notifyAthlete({ athleteId: athlete.id, title: `Message from ${coachName}`, body: text.trim(), page: "messages" });
  return { ok: true, message: msg };
}
