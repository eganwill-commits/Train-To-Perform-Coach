import { supabase } from "./supabase";

/*
  Athlete alerts.

  Every coach touchpoint that the athlete should KNOW about writes a row here.
  Before this existed, "Add Feedback" on a video wrote coach_feedback and nothing
  else happened - the athlete only found out if they happened to go looking, which
  meant the most valuable coaching in the app was the least likely to be seen.

  read_at is the receipt. It is why this is a table and not a per-device
  "last checked" timestamp: the coach can see whether the athlete actually opened
  their feedback, and it survives the athlete switching phones.

  Messages are deliberately NOT mirrored here - `messages` already carries its own
  read_at, and duplicating it would give two sources of truth for one unread state.
  The bell reads both.
*/

export const ALERT_KIND = {
  VIDEO_FEEDBACK: "video_feedback",
  NOTE: "note",
  DAY_NOTE: "day_note",
  NOTE_REPLY: "note_reply",
  EXERCISE_COMMENT: "exercise_comment",
};

// Where tapping the alert should take the athlete.
export const ALERT_PAGE = {
  VIDEOS: "my-videos",
  PROGRAM: "my-program",
  MESSAGES: "messages",
};

/*
  Returns the created row, or null if it could not be written.

  Deliberately does NOT throw. The coach action that triggered it (saving feedback,
  posting a note) has already succeeded by this point, and failing the whole thing
  would lose their work. But it must not fail *silently* either - a coach who thinks
  the athlete was notified when they weren't is exactly the problem this fixes. The
  caller checks the return value and tells them.
*/
export async function raiseAlert({ athleteId, kind, title, body, refTable, refId, linkPage }) {
  if (!athleteId || !kind || !title) {
    console.error("raiseAlert: missing athleteId, kind or title", { athleteId, kind, title });
    return null;
  }
  const row = {
    athlete_id: athleteId,
    kind,
    title,
    body: (body || "").slice(0, 400),
    ref_table: refTable || null,
    ref_id: refId != null ? String(refId) : null,
    link_page: linkPage || null,
  };
  const { data, error } = await supabase.from("athlete_alerts").insert(row).select().single();
  if (error) {
    console.error("raiseAlert failed", error, row);
    return null;
  }
  return data;
}

/*
  One alert per source row. Editing feedback on a video the athlete has already read
  should re-notify them (the feedback changed), so this clears the old alert and
  raises a fresh one rather than leaving a stale read receipt attached to new text.
*/
export async function raiseAlertReplacing({ refTable, refId, ...rest }) {
  if (refTable && refId != null) {
    await supabase.from("athlete_alerts").delete().eq("ref_table", refTable).eq("ref_id", String(refId));
  }
  return raiseAlert({ refTable, refId, ...rest });
}

export async function markAlertRead(id) {
  const { error } = await supabase
    .from("athlete_alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("markAlertRead failed", error);
  return !error;
}

export async function markAllAlertsRead(athleteId) {
  const { error } = await supabase
    .from("athlete_alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("athlete_id", athleteId)
    .is("read_at", null);
  if (error) console.error("markAllAlertsRead failed", error);
  return !error;
}

// Coach-side read receipts: { [refId]: alertRow } for one source table.
export async function fetchAlertReceipts(athleteId, refTable) {
  const { data, error } = await supabase
    .from("athlete_alerts")
    .select("*")
    .eq("athlete_id", athleteId)
    .eq("ref_table", refTable);
  if (error) { console.error("fetchAlertReceipts failed", error); return {}; }
  const map = {};
  (data || []).forEach(a => { if (a.ref_id) map[a.ref_id] = a; });
  return map;
}
