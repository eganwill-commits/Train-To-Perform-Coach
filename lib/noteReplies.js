import { supabase } from "./supabase";
import { raiseAlertReplacing, ALERT_KIND, ALERT_PAGE } from "./alerts";

/*
  Replying to a note an athlete typed on an exercise while logging.

  One function for every place the coach can reply (the program card and the bell), so
  a reply always does the same three things: stores the reply on the log row it
  answers, tells the athlete, and clears the note from the coach's bell. Before this,
  replying from the program left the note sitting in the bell as if it had never been
  answered.

  Returns the updated log row. Throws if the reply itself could not be saved, so the
  caller can keep the text on screen.
*/
const COACH_ID = "coach";

export async function dismissNoteAlert(logId) {
  const { error } = await supabase.from("coach_alert_reads")
    .upsert({ coach_id: COACH_ID, source_table: "logs", source_id: String(logId) }, { onConflict: "coach_id,source_table,source_id" });
  if (error) console.error("dismissNoteAlert failed", error);
}

export async function saveNoteReply(logRow, text) {
  const body = (text || "").trim();
  if (!body) throw new Error("Reply is empty");
  const { data, error } = await supabase.from("logs")
    .update({ coach_reply: body, coach_reply_at: new Date().toISOString() })
    .eq("id", logRow.id).select().single();
  if (error) throw error;
  dismissNoteAlert(logRow.id);
  const raised = await raiseAlertReplacing({
    athleteId: logRow.athlete_id,
    kind: ALERT_KIND.NOTE_REPLY,
    title: `Coach replied about ${logRow.exercise_name || "your note"}`,
    body,
    refTable: "log_replies",
    refId: logRow.id,
    linkPage: ALERT_PAGE.PROGRAM,
  });
  return { row: data, notified: !!raised };
}
