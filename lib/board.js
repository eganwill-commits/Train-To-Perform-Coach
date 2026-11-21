import { supabase } from "./supabase";
import { groupVideos } from "../components/VideoReview";
import { weekStartFromLabel, sessionEndDate, hasSessionDate } from "./weeks";

/*
  The coach Board: one row per athlete, two questions per row.

    1. What is waiting on the coach?   (videos, notes, comments, log notes, messages)
    2. What does the program need next? (start date, end of block, next block built?)

  Nothing here is new data. Every answer is computed from tables the app already writes,
  so the Board can never disagree with the bell, the Videos page or the program.

  "Seen" and "closed" are different things. The bell's "Mark all read" clears an alert,
  but a question the athlete asked is still unanswered. So the Board uses each item's
  own closing rule:

    - Video:          the review group has feedback, or was marked reviewed / needs work
                      on the Videos page (same rule as the Videos badge).
    - Log note:       replied to, or marked "no reply needed" in the bell (same rule as the
                      bell). Log notes are mostly running commentary ("ran out of time"),
                      so seeing one is enough to close it.
    - Athlete note:   the coach wrote a note for that athlete after it, or tapped Close.
    - Exercise comment: the coach replied in that exercise's thread after it, or tapped Close.
    - Message:        read (the Messages page marks it read when opened).

  Close is for something handled outside the app (in person, by text). It is stored in
  coach_alert_reads under its own source_table ("closed:<table>"), so it never collides
  with the bell's read receipts and needs no new table.
*/

export const COACH_ID = "coach";
const LOG_NOTE_DAYS = 21;      // same window as the bell
const OVERDUE_HOURS = 48;      // an open item older than this makes the row Overdue
const DAY = 86400000;

export const STATUS = {
  overdue: { rank: 0, label: "Overdue", color: "#DC2626", bg: "#FEF2F2" },
  action: { rank: 1, label: "Action", color: "#EA580C", bg: "#FFF7ED" },
  plan: { rank: 2, label: "Plan", color: "#2563EB", bg: "#EFF6FF" },
  clear: { rank: 3, label: "Clear", color: "#16A34A", bg: "#F0FDF4" },
};

export const ITEM = {
  VIDEO: "video",
  MESSAGE: "message",
  NOTE: "note",
  COMMENT: "comment",
  LOG_NOTE: "log_note",
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseISODate = (s) => {
  const p = String(s || "").split("-").map(Number);
  return p[0] && p[1] && p[2] ? new Date(p[0], p[1] - 1, p[2]) : null;
};
const ts = (x) => { const t = x ? new Date(x).getTime() : NaN; return Number.isFinite(t) ? t : 0; };
export const shortDate = (d) => d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

/* ---------- data the Board needs beyond what CoachApp already holds ---------- */

export async function fetchBoardExtras() {
  const since = new Date(Date.now() - 120 * DAY).toISOString();
  // Log-note dismissals can only post-date the note, so the same window as the notes keeps
  // this well under PostgREST's 1,000-row cap (the whole table already passed it).
  const logSince = new Date(Date.now() - LOG_NOTE_DAYS * DAY).toISOString();
  const [notes, comments, msgs, logReads, closes] = await Promise.all([
    supabase.from("athlete_notes").select("id,athlete_id,author_role,content,created_at").gt("created_at", since),
    supabase.from("exercise_comments").select("id,athlete_id,author_role,body,exercise_name,block_id,week_label,day_label,created_at").gt("created_at", since),
    supabase.from("messages").select("id,athlete_id,content,created_at").eq("sender_role", "athlete").is("read_at", null),
    supabase.from("coach_alert_reads").select("source_table,source_id").eq("coach_id", COACH_ID).eq("source_table", "logs").gte("read_at", logSince).limit(1000),
    supabase.from("coach_alert_reads").select("source_table,source_id").eq("coach_id", COACH_ID).like("source_table", "closed:%").gte("read_at", since).limit(1000),
  ]);
  [notes, comments, msgs, logReads, closes].forEach(r => { if (r.error) console.error("board: fetch failed", r.error); });
  const keys = new Set([...(logReads.data || []), ...(closes.data || [])].map(r => `${r.source_table}:${r.source_id}`));
  return { notes: notes.data || [], comments: comments.data || [], messages: msgs.data || [], keys };
}

// Mark an item handled outside the app. Throws on failure so the row stays put.
// Log notes close the way the bell closes them ("logs"), so closing one here also clears
// it from the bell; everything else gets its own "closed:<table>" key.
export async function closeItem(table, id) {
  const source_table = table === "logs" ? "logs" : `closed:${table}`;
  const { error } = await supabase.from("coach_alert_reads")
    .upsert({ coach_id: COACH_ID, source_table, source_id: String(id) }, { onConflict: "coach_id,source_table,source_id" });
  if (error) throw error;
  return `${source_table}:${id}`;
}

/* ---------- program side ---------- */

// Week window of one program: first Monday and the Sunday of its last week.
function programWindow(p) {
  const weeks = p.weeks || [];
  if (!p.start_date || !weeks.length || !parseISODate(p.start_date)) return null;
  const start = weekStartFromLabel(weeks[0].label, 0, p.start_date);
  const end = weekStartFromLabel(weeks[weeks.length - 1].label, weeks.length - 1, p.start_date);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

// Index of the week holding today (or -1 before the start, weeks.length after the end).
function weekIndexOn(p, today) {
  const weeks = p.weeks || [];
  for (let i = 0; i < weeks.length; i++) {
    const s = weekStartFromLabel(weeks[i].label, i, p.start_date);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    if (today < s) return i === 0 ? -1 : i;   // in a break: count the week we are heading into
    if (today <= e) return i;
  }
  return weeks.length;
}

/*
  Which of an athlete's programs the Board talks about: the one running today (newest
  start wins), else the next one coming up, else the most recent one that ended, else a
  lone self-paced (undated) program.
*/
function pickProgram(list, today) {
  const dated = list.map(p => ({ p, w: programWindow(p) })).filter(x => x.w);
  const running = dated.filter(x => x.w.start <= today && today <= x.w.end).sort((a, b) => b.w.start - a.w.start);
  const upcoming = dated.filter(x => x.w.start > today).sort((a, b) => a.w.start - b.w.start);
  const ended = dated.filter(x => x.w.end < today).sort((a, b) => b.w.end - a.w.end);
  const undated = list.filter(p => !programWindow(p));
  return {
    current: running[0]?.p || upcoming[0]?.p || ended[0]?.p || undated[0] || null,
    next: running[0] ? upcoming.find(x => x.w.start > running[0].w.end)?.p || null : null,
  };
}

// Scheduled sessions whose date has passed since the athlete last logged.
function unloggedSessions(p, lastLogDate, today) {
  const weeks = p.weeks || [];
  const from = lastLogDate ? startOfDay(lastLogDate) : null;
  let n = 0;
  weeks.forEach((w, wi) => {
    (w.days || []).forEach(d => {
      if (!(d.blocks || []).length || !hasSessionDate(d.label)) return;
      const end = sessionEndDate(w.label, wi, d.label, p.start_date);
      if (end < today && (!from || end > from)) n++;
    });
  });
  return n;
}

function programState(athletePrograms, lastLogDate, today) {
  const list = athletePrograms.filter(p => !p.archived_at && (p.weeks || []).length);
  if (!list.length) return null;
  const { current: p, next } = pickProgram(list, today);
  if (!p) return null;
  const weeks = p.weeks || [];
  const remote = (p.delivery || "in_person") === "remote";
  const out = { program: p, remote, weeksTotal: weeks.length, missed: 0 };

  const win = programWindow(p);
  if (!win) {
    out.weekText = `${weeks.length} weeks built`;
    out.next = lastLogDate ? "Self-paced, no start date" : "No start date set";
    out.level = lastLogDate ? "clear" : "action";
    return out;
  }
  out.end = win.end;
  if (today < win.start) {
    out.weekText = `Starts ${shortDate(win.start)}`;
    out.next = `${weeks.length} weeks built`;
    out.level = "clear";
    return out;
  }
  if (today > win.end) {
    out.weekText = `Ended ${shortDate(win.end)}`;
    out.ended = true;
    out.next = "Block ended, next block not built";
    out.level = "plan";
    return out;
  }
  const wi = weekIndexOn(p, today);
  const wkStart = weekStartFromLabel(weeks[Math.min(wi, weeks.length - 1)].label, Math.min(wi, weeks.length - 1), p.start_date);
  const onBreak = today < wkStart;
  out.weekText = onBreak ? `W${wi + 1} of ${weeks.length}, resumes ${shortDate(wkStart)}` : `W${wi + 1} of ${weeks.length}`;

  const daysLeft = Math.round((win.end - today) / DAY);
  if (next) {
    out.next = `Ends ${shortDate(win.end)}, next block built`;
    out.level = "clear";
  } else if (daysLeft <= 7) {
    out.next = `Ends ${shortDate(win.end)}, next block not built`;
    out.level = "action";
  } else if (daysLeft <= 21) {
    out.next = `Ends ${shortDate(win.end)}, build next block`;
    out.level = "plan";
  } else {
    out.next = `Built through ${shortDate(win.end)}`;
    out.level = "clear";
  }

  // Counted on a break too: a break adds no new sessions, but the ones before it that
  // were never logged are still missing.
  out.missed = unloggedSessions(p, lastLogDate, today);
  return out;
}

/* ---------- waiting items ---------- */

function waitingItems({ athleteId, videoGroups, logs, extras, now }) {
  const items = [];
  const closed = (table, id) => extras.keys.has(`closed:${table}:${id}`);

  videoGroups.filter(g => g.waiting && g.lead.athlete_id === athleteId).forEach(g => {
    items.push({ kind: ITEM.VIDEO, id: g.lead.id, group: g, at: ts(g.latest.created_at),
      text: `Video: ${g.lead.exercise_name || "clip"}${g.clips.length > 1 ? ` (${g.clips.length} clips)` : ""}` });
  });

  extras.messages.filter(m => m.athlete_id === athleteId).forEach(m => {
    items.push({ kind: ITEM.MESSAGE, id: m.id, at: ts(m.created_at), text: `Message: ${(m.content || "media").slice(0, 60)}` });
  });

  const notes = extras.notes.filter(n => n.athlete_id === athleteId);
  const lastCoachNote = Math.max(0, ...notes.filter(n => n.author_role === "coach").map(n => ts(n.created_at)));
  notes.filter(n => n.author_role === "athlete" && ts(n.created_at) > lastCoachNote && !closed("athlete_notes", n.id)).forEach(n => {
    items.push({ kind: ITEM.NOTE, id: n.id, table: "athlete_notes", at: ts(n.created_at), text: `Note: ${(n.content || "").slice(0, 70)}` });
  });

  const comments = extras.comments.filter(c => c.athlete_id === athleteId);
  const threadKey = (c) => c.block_id || `name:${(c.exercise_name || "").toLowerCase()}`;
  comments.filter(c => c.author_role === "athlete" && !closed("exercise_comments", c.id)).forEach(c => {
    const answered = comments.some(r => r.author_role === "coach" && threadKey(r) === threadKey(c) && ts(r.created_at) > ts(c.created_at));
    if (answered) return;
    items.push({ kind: ITEM.COMMENT, id: c.id, table: "exercise_comments", row: c, at: ts(c.created_at),
      text: `Comment on ${c.exercise_name || "exercise"}: ${(c.body || "").slice(0, 50)}` });
  });

  const cutoff = now - LOG_NOTE_DAYS * DAY;
  logs.filter(l => l.athlete_id === athleteId && (l.notes || "").trim() && !(l.coach_reply || "").trim()
    && ts(l.logged_at) > cutoff && !extras.keys.has(`logs:${l.id}`)).forEach(l => {
    items.push({ kind: ITEM.LOG_NOTE, id: l.id, table: "logs", row: l, at: ts(l.logged_at),
      text: `Log note on ${l.exercise_name || "exercise"}: ${(l.notes || "").slice(0, 50)}` });
  });

  return items.sort((a, b) => a.at - b.at);
}

/* ---------- the board ---------- */

export function buildBoard({ athletes, programs, logs, videoSubs, extras, today = new Date() }) {
  const t = startOfDay(today);
  const now = today.getTime();
  const videoGroups = groupVideos(videoSubs);

  const lastLogBy = new Map();
  (logs || []).forEach(l => {
    const d = parseISODate(l.date);
    if (!d) return;
    const prev = lastLogBy.get(l.athlete_id);
    if (!prev || d > prev) lastLogBy.set(l.athlete_id, d);
  });

  const rows = [];
  const inactive = [];
  (athletes || []).forEach(a => {
    const lastLog = lastLogBy.get(a.id) || null;
    const prog = programState((programs || []).filter(p => p.athlete_id === a.id), lastLog, t);
    const items = waitingItems({ athleteId: a.id, videoGroups, logs: logs || [], extras, now });

    if (!prog && !items.length) { inactive.push({ athlete: a, lastLog }); return; }

    let level = prog?.level || "clear";
    const bump = (l) => { if (STATUS[l].rank < STATUS[level].rank) level = l; };
    if (items.length) bump(items.some(i => now - i.at > OVERDUE_HOURS * 3600000) ? "overdue" : "action");
    if (prog?.missed >= 2) bump(prog.missed >= 4 && prog.remote ? "overdue" : "action");
    if (!prog) bump("plan");

    rows.push({ athlete: a, lastLog, prog, items, level });
  });

  rows.sort((x, y) => STATUS[x.level].rank - STATUS[y.level].rank
    || (y.items.length - x.items.length)
    || String(x.athlete.name).localeCompare(String(y.athlete.name)));
  inactive.sort((x, y) => String(x.athlete.name).localeCompare(String(y.athlete.name)));
  return { rows, inactive };
}
