import { supabase } from "./supabase";
import { raiseAlert, ALERT_KIND, ALERT_PAGE } from "./alerts";

/*
  Per-exercise conversation.

  A coach could review a session and see that the athlete used a Smith machine for a
  chest-supported dumbbell row - and had nowhere to ask why. Feedback existed only on
  videos, and replies existed only where the athlete had already written a note. This is
  the general case: either side can raise a question against one exercise in one session,
  and it is anchored to that exercise so the answer arrives with its context attached.

  Anchored on block_id, which is unique within a program, so the athlete's app can find
  the exercise from the id alone - no need to encode week and day into the alert.
*/

export const COMMENT_ROLE = { COACH: "coach", ATHLETE: "athlete" };

export async function fetchThread(athleteId, blockId) {
  if (!athleteId || !blockId) return [];
  const { data, error } = await supabase
    .from("exercise_comments")
    .select("*")
    .eq("athlete_id", athleteId)
    .eq("block_id", blockId)
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchThread failed", error); return []; }
  return data || [];
}

// Every comment on an athlete's program, for badge counts without a query per exercise.
export async function fetchAllComments(athleteId) {
  if (!athleteId) return [];
  const { data, error } = await supabase
    .from("exercise_comments")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchAllComments failed", error); return []; }
  return data || [];
}

/*
  Posts a comment and, when the coach is the author, rings the athlete's bell.

  Throws on a failed insert so the composer can keep the text on screen. A question that
  silently failed to send is worse than no question at all - the coach would wait for an
  answer that was never asked for.
*/
export async function postComment({
  athleteId, programId, weekLabel, dayLabel, dayId, blockId, exerciseName,
  authorRole, authorName, body,
}) {
  const text = (body || "").trim();
  if (!text) return null;
  const row = {
    athlete_id: athleteId,
    program_id: programId || null,
    week_label: weekLabel || null,
    day_label: dayLabel || null,
    day_id: dayId || null,
    block_id: blockId,
    exercise_name: exerciseName || null,
    author_role: authorRole,
    author_name: authorName || (authorRole === COMMENT_ROLE.COACH ? "Coach" : "Athlete"),
    body: text,
  };
  const { data, error } = await supabase.from("exercise_comments").insert(row).select().single();
  if (error) { console.error("postComment failed", error, row); throw error; }

  if (authorRole === COMMENT_ROLE.COACH) {
    // ref_id is the block id: the athlete's app locates the exercise from that alone,
    // then selects the right week and opens the card.
    const raised = await raiseAlert({
      athleteId,
      kind: ALERT_KIND.EXERCISE_COMMENT,
      title: `Question on ${exerciseName || "an exercise"}`,
      body: text,
      refTable: "exercise_block",
      refId: blockId,
      linkPage: ALERT_PAGE.PROGRAM,
    });
    if (!raised) {
      // The comment is saved; only the notification failed. Say so rather than let the
      // coach wait on an answer to a question the athlete was never told about.
      if (typeof window !== "undefined") {
        window.alert("Comment saved, but the notification to the athlete could not be sent.");
      }
    }
  }
  return data;
}

// Mark the other party's comments in this thread as read.
export async function markThreadRead(athleteId, blockId, readerRole) {
  if (!athleteId || !blockId) return;
  const otherRole = readerRole === COMMENT_ROLE.COACH ? COMMENT_ROLE.ATHLETE : COMMENT_ROLE.COACH;
  const { error } = await supabase
    .from("exercise_comments")
    .update({ read_at: new Date().toISOString() })
    .eq("athlete_id", athleteId)
    .eq("block_id", blockId)
    .eq("author_role", otherRole)
    .is("read_at", null);
  if (error) console.error("markThreadRead failed", error);
}
