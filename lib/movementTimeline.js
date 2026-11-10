/*
  Everything the coach and athlete have said about one movement, in one place.

  Feedback used to live in four places that never met: coach feedback on a video, a coach
  reply to a log note, the comment thread on an exercise, and Messages. An athlete who
  wanted to answer video feedback had nowhere to do it, and a conversation about bench in
  Week 2 was invisible when bench came round again in Week 5.

  This builds one list of "topics" for an exercise card. A topic is the thing being
  talked about - a filmed set, a log note, or a plain question on a session - with every
  reply that answers it underneath. Topics from this session come first; topics from
  earlier sessions of the same movement come after, newest first, so the history follows
  the movement instead of staying behind in an old week.
*/

export const normName = (s) =>
  (s || "").toLowerCase().replace(/[-–—_/]/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

// "Week 3 · Oct 27" -> "Week 3". Day labels are short already.
export const shortWeek = (w) => (w || "").split(/[·—|]/)[0].trim();

// "Upper · Bench + Rows + Skill · Tue" -> "Tue". The session name is long and the
// card already says what the exercise is; the weekday is what places it.
export const shortDay = (d) => {
  const parts = (d || "").split(/[·—|]/).map(x => x.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
};

export function whereLabel(weekLabel, dayLabel) {
  return [shortWeek(weekLabel), shortDay(dayLabel)].filter(Boolean).join(" · ");
}

const ts = (x) => {
  const t = x ? new Date(x).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

/*
  athleteId     whose conversation
  blockId       the exercise card being shown
  names         every name this movement goes by on this card (display name, library
                name, substitutes, names carried on a cue) - history matches on these
  weekLabel/dayLabel   where this card sits, for labelling its own topics
  comments      every exercise_comments row for the athlete
  videos        every video_submissions row for the athlete
  logs          every logs row for the athlete
  currentLogId  the log row for this card, if logged
*/
/*
  Two exercise names describe the same movement when they share a run of two or more
  words: "Elevated Pistol Squat" and "Counterweight Pistol Squat" share "pistol squat",
  "Goblet Cossack Squat" and "Cossack Squat" share "cossack squat". One shared word
  is not enough - "Front Squat" and "Goblet Cossack Squat" only share "squat" and are
  different movements.
*/
const phrases = (n) => {
  const w = normName(n).split(" ").filter(Boolean);
  const out = new Set();
  for (let i = 0; i + 1 < w.length; i++) out.add(w[i] + " " + w[i + 1]);
  return out;
};
export function sameFamily(a, b) {
  if (normName(a) === normName(b)) return true;
  const pa = phrases(a);
  for (const x of phrases(b)) if (pa.has(x)) return true;
  return false;
}

/*
  relatedNames  other exercises a coach cue on this card also applies to. A cue can be
                shared by different movements ("knees over toes" on Front Squat, Goblet
                Squat and Goblet Cossack Squat), so only the ones that are the same
                movement family as this card join its history. Before this, every
                exercise on a shared cue pulled its whole conversation onto the card:
                Cossack feedback showed up under Front Squat.
*/
export function buildMovementTopics({ athleteId, blockId, names, relatedNames, weekLabel, dayLabel, comments, videos, logs, currentLogId }) {
  const own = (names || []).filter(Boolean);
  const related = (relatedNames || []).filter(n => own.some(o => sameFamily(o, n)));
  const nameSet = new Set([...own, ...related].map(normName).filter(Boolean));
  const sameMovement = (n) => nameSet.has(normName(n));

  const mine = (rows) => (rows || []).filter(r => !athleteId || r.athlete_id === athleteId);
  const allComments = mine(comments);
  const repliesTo = (key, id) =>
    allComments.filter(c => c[key] != null && String(c[key]) === String(id)).sort((a, b) => ts(a.created_at) - ts(b.created_at));

  const topics = [];
  const claimed = new Set();

  // Filmed sets. Several clips of one exercise in one session (set 2 and set 4) are
  // one topic: the coach reviews them together and gives one piece of feedback.
  const groups = {};
  mine(videos).forEach(v => {
    const here = v.block_id ? v.block_id === blockId : false;
    if (!here && !sameMovement(v.exercise_name)) return;
    const k = v.block_id || "solo-" + v.id;
    (groups[k] = groups[k] || []).push(v);
  });
  Object.values(groups).forEach(clips => {
    clips.sort((a, b) => ts(a.created_at) - ts(b.created_at));
    const ids = new Set(clips.map(c => String(c.id)));
    const replies = allComments
      .filter(c => c.video_id != null && ids.has(String(c.video_id)))
      .sort((a, b) => ts(a.created_at) - ts(b.created_at));
    replies.forEach(r => claimed.add(r.id));
    // The clip carrying the feedback stands for the group; the latest one if several do.
    const withFb = clips.filter(c => (c.coach_feedback || "").trim() || (c.coach_feedback_media || []).length);
    const lead = withFb[withFb.length - 1] || clips[0];
    const first = clips[0];
    topics.push({
      key: "video-" + (first.block_id || first.id),
      kind: "video",
      current: !!first.block_id && first.block_id === blockId,
      video: lead,
      clips,
      blockId: first.block_id || null,
      weekLabel: first.week_label || null,
      dayLabel: first.day_label || null,
      exerciseName: first.exercise_name,
      at: ts(first.created_at),
      lastAt: Math.max(...clips.map(c => ts(c.created_at)), ...replies.map(r => ts(r.created_at))),
      replies,
    });
  });

  // Log notes, and the coach's answer to them. A log with neither is just numbers.
  mine(logs).forEach(l => {
    const here = currentLogId != null && String(l.id) === String(currentLogId);
    if (!here && !sameMovement(l.exercise_name)) return;
    const replies = repliesTo("log_id", l.id);
    // A log becomes a conversation once the coach has answered it. Until then the note
    // already shows in the log itself on this card, and an unanswered "easy" from three
    // weeks ago is not a conversation worth scrolling past.
    const answered = (l.coach_reply || "").trim() || (l.coach_reply_media || []).length || replies.length;
    if (!answered) return;
    replies.forEach(r => claimed.add(r.id));
    const at = ts(l.logged_at) || ts(l.date ? l.date + "T12:00:00" : null);
    topics.push({
      key: "log-" + l.id,
      kind: "log",
      current: here,
      log: l,
      // The reply lands on the card the log came from. Logs don't carry a block id, so
      // a reply to this card's own log uses this card; an older log's reply falls back
      // to this card too, labelled with where the log came from.
      blockId: here ? blockId : null,
      weekLabel: l.week_label || null,
      dayLabel: l.day_label || null,
      exerciseName: l.exercise_name,
      at,
      lastAt: Math.max(at, ts(l.coach_reply_at), ...replies.map(r => ts(r.created_at))),
      replies,
    });
  });

  // Plain questions on a session, grouped by the session they were asked on.
  const bySession = {};
  allComments.forEach(c => {
    if (claimed.has(c.id) || c.video_id || c.log_id) return;
    const here = c.block_id === blockId;
    if (!here && !sameMovement(c.exercise_name)) return;
    const k = c.block_id || "none";
    (bySession[k] = bySession[k] || []).push(c);
  });
  Object.entries(bySession).forEach(([k, rows]) => {
    rows.sort((a, b) => ts(a.created_at) - ts(b.created_at));
    const first = rows[0];
    const here = k === blockId;
    topics.push({
      key: "session-" + k,
      kind: "session",
      current: here,
      blockId: k === "none" ? null : k,
      weekLabel: first.week_label || (here ? weekLabel : null),
      dayLabel: first.day_label || (here ? dayLabel : null),
      exerciseName: first.exercise_name,
      at: ts(first.created_at),
      lastAt: ts(rows[rows.length - 1].created_at),
      replies: rows,
    });
  });

  const current = topics.filter(t => t.current).sort((a, b) => a.at - b.at);
  const earlier = topics.filter(t => !t.current).sort((a, b) => b.lastAt - a.lastAt);
  return { current, earlier };
}

// Messages from the other side that the reader has not opened yet.
export function unreadIn(topics, readerRole) {
  const other = readerRole === "coach" ? "athlete" : "coach";
  const ids = [];
  (topics || []).forEach(t => t.replies.forEach(r => { if (r.author_role === other && !r.read_at) ids.push(r.id); }));
  return ids;
}
