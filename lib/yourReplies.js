import { supabase } from "./supabase";
import { raiseAlert, raiseAlertReplacing, ALERT_KIND, ALERT_PAGE } from "./alerts";
import { saveNoteReply } from "./noteReplies";
import { mediaList } from "./feedbackMedia";

/*
  "Your replies": everything the coach has said back to athletes, in one list, editable.

  A coach answers in three places - feedback on a video, a reply to a log note, and a
  reply in an exercise's conversation - and each used to be editable (if at all) only
  from wherever it was written. This gathers them by recency and gives every one the same
  Edit, and every edit tells the athlete, so a changed answer is never sitting there
  unseen.
*/

export const REPLY_KIND = { LOG: "log", VIDEO: "video", COMMENT: "comment" };

const ts = (x) => {
  const t = x ? new Date(x).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

// The coach's own exercise-conversation replies inside the window.
export async function fetchCoachComments(since) {
  const { data, error } = await supabase
    .from("exercise_comments")
    .select("*")
    .eq("author_role", "coach")
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) { console.error("fetchCoachComments failed", error); return []; }
  return data || [];
}

/*
  One list, newest first. Video feedback written before coach_feedback_at existed has no
  timestamp of its own, so it falls back to when the clip was sent.
*/
export function buildYourReplies({ logs, videos, comments, since }) {
  const cutoff = ts(since);
  const out = [];
  (logs || []).forEach(l => {
    if (!(l.coach_reply || "").trim()) return;
    const at = ts(l.coach_reply_at);
    if (at < cutoff) return;
    out.push({ key: "log-" + l.id, kind: REPLY_KIND.LOG, row: l, athleteId: l.athlete_id, athleteName: l.athlete_name,
      exercise: l.exercise_name, weekLabel: l.week_label, dayLabel: l.day_label,
      context: (l.notes || "").trim(), contextLabel: "Note", text: l.coach_reply, at });
  });
  (videos || []).forEach(v => {
    if (!(v.coach_feedback || "").trim()) return;
    const at = ts(v.coach_feedback_at) || ts(v.created_at);
    if (at < cutoff) return;
    out.push({ key: "video-" + v.id, kind: REPLY_KIND.VIDEO, row: v, athleteId: v.athlete_id, athleteName: v.athlete_name,
      exercise: v.exercise_name, weekLabel: v.week_label, dayLabel: v.day_label,
      context: (v.notes || "").trim(), contextLabel: "Video", text: v.coach_feedback, at });
  });
  (comments || []).forEach(c => {
    if (!(c.body || "").trim()) return;
    const at = ts(c.edited_at) || ts(c.created_at);
    if (at < cutoff) return;
    out.push({ key: "comment-" + c.id, kind: REPLY_KIND.COMMENT, row: c, athleteId: c.athlete_id, athleteName: null,
      exercise: c.exercise_name, weekLabel: c.week_label, dayLabel: c.day_label,
      context: "", contextLabel: c.video_id ? "Reply on video" : c.log_id ? "Reply on log" : "Conversation",
      text: c.body, at });
  });
  return out.sort((a, b) => b.at - a.at);
}

// Video feedback, edited from the list. Media stays as it was.
async function updateVideoFeedback(v, text) {
  const update = { coach_feedback: text, coach_feedback_at: new Date().toISOString(), status: "reviewed" };
  const { data, error } = await supabase.from("video_submissions").update(update).eq("id", v.id).select().single();
  if (error) throw error;
  const raised = await raiseAlertReplacing({
    athleteId: v.athlete_id,
    kind: ALERT_KIND.VIDEO_FEEDBACK,
    title: `Coach updated feedback on your ${v.exercise_name || "video"}`,
    body: text,
    refTable: "video_submissions",
    refId: v.id,
    linkPage: ALERT_PAGE.VIDEOS,
  });
  return { row: data, notified: !!raised };
}

// A reply in an exercise conversation, edited in place and marked edited.
async function updateComment(c, text) {
  const { data, error } = await supabase.from("exercise_comments")
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq("id", c.id).select().single();
  if (error) throw error;
  const raised = await raiseAlert({
    athleteId: c.athlete_id,
    kind: ALERT_KIND.EXERCISE_COMMENT,
    title: `Coach updated a reply about ${c.exercise_name || "an exercise"}`,
    body: text,
    refTable: "exercise_block",
    refId: c.block_id,
    linkPage: ALERT_PAGE.PROGRAM,
  });
  return { row: data, notified: !!raised };
}

/*
  Saves an edit and re-notifies the athlete. Throws if the edit itself was not saved,
  so the editor can keep the text on screen.
*/
export async function saveReplyEdit(item, text) {
  const body = (text || "").trim();
  if (!body) throw new Error("Reply is empty");
  if (item.kind === REPLY_KIND.LOG) return saveNoteReply(item.row, body, mediaList(item.row.coach_reply_media));
  if (item.kind === REPLY_KIND.VIDEO) return updateVideoFeedback(item.row, body);
  return updateComment(item.row, body);
}
