/*
  What the athlete did last time, and how their numbers have moved.

  Read-only over `logs`. Nothing here writes, and nothing here invents a number: a
  "last time" is a row the athlete actually typed, and the progress series only uses
  loads that parse as a number.

  No suggested next load on purpose. RPE has never been logged (0 of ~1,300 rows), and
  programs carry deload/consolidate weeks; a formula that says "+5 lb" would tell an
  athlete to go heavier in a week the coach wrote lighter. The prescription on the
  block stays the target.
*/

const norm = (x) => (x || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

function hasNumber(l) {
  return (l.load || "") !== "" || (l.sets || "") !== "" || (l.reps || "") !== "";
}

function sameMovement(log, block, displayName) {
  if (log.exercise_id && block.exerciseId && log.exercise_id === block.exerciseId) return true;
  const n = norm(log.exercise_name);
  return n !== "" && (n === norm(displayName) || n === norm(block.exerciseName));
}

/*
  Most recent log of the same movement from a DIFFERENT session than the one on screen.
  Sorted by date, then by logged_at/created_at so two entries on one day resolve.
*/
export function lastPerformance(logs, block, { displayName, weekLabel, dayLabel, onOrBefore } = {}) {
  if (!block) return null;
  const rows = (logs || []).filter(l =>
    hasNumber(l) &&
    (!onOrBefore || !l.date || l.date <= onOrBefore) &&
    sameMovement(l, block, displayName) &&
    !(l.week_label === weekLabel && l.day_label === dayLabel)
  );
  if (rows.length === 0) return null;
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ta = a.logged_at || a.created_at || "";
    const tb = b.logged_at || b.created_at || "";
    return ta < tb ? 1 : -1;
  });
  return rows[0];
}

export function describeLog(l) {
  if (!l) return "";
  const sr = l.sets && l.reps ? `${l.sets}×${l.reps}` : (l.reps || l.sets || "");
  const load = (l.load || "").toString().trim();
  return [sr, load ? `@ ${load}` : ""].filter(Boolean).join(" ");
}

export function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/*
  The top number in a load string, in the unit it was written in - shaped by what
  athletes actually type (checked against the live logs on 3 Oct 2026):
    "155", "155 lbs", "45s", "25 each"          -> the number
    "185,205,225,245" (ramping sets)             -> 245, the top set
    "135 x 2, 155 x 2", "30x2,35x2", "95(6) x 4" -> rep counts dropped -> 155 / 35 / 95
    "25 for 2 20 for 2"                          -> 25
    "BW", "Light", "Red Band", "2x Green Band"   -> null (not a load)
    "L: 51  R: 60"                               -> null (two-sided score, not one number)
    anything mentioning RPE / RIR / %            -> null (a prescription, not a result)
*/
export function parseLoad(v) {
  let s = (v == null ? "" : String(v)).trim();
  if (!s || /^L\s*:/i.test(s)) return null;
  if (/\b(RPE|RIR)\b|%/i.test(s)) return null;
  if (/band/i.test(s)) return null;
  if (/^\s*\d{1,2}\s*[x×]\s*\d{1,2}\s*$/i.test(s)) return null; // "5x5" typed in the load box is sets×reps
  s = s
    .replace(/\b2\s*[x×]\s*(\d{2,}(?:\.\d+)?)/gi, " $1 ")  // "2x50" = a pair of 50s
    .replace(/\(\s*\d+\s*\)/g, " ")              // "(6)" rep counts
    .replace(/[x×]\s*\d+(?:\.\d+)?/gi, " ")      // "x 2", "×4"
    .replace(/\bfor\s+\d+\b/gi, " ");            // "for 2"
  const nums = (s.match(/\d+(?:\.\d+)?/g) || []).map(parseFloat).filter(n => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

/*
  Per-movement series for the progress screen: one point per session day, the best
  number that day. Only movements with at least two numeric days are returned - a single
  point is not progress, it is a data point.
*/
export function progressSeries(logs, { categories = ["STR", "FIN", "PWR"], minPoints = 2 } = {}) {
  const byMove = new Map();
  (logs || []).forEach(l => {
    if (!categories.includes(l.category)) return;
    const v = parseLoad(l.load);
    if (v == null || !l.date) return;
    const key = norm(l.exercise_name);
    if (!key) return;
    let m = byMove.get(key);
    if (!m) { m = { name: l.exercise_name, category: l.category, days: new Map() }; byMove.set(key, m); }
    const prev = m.days.get(l.date);
    if (prev == null || v > prev) m.days.set(l.date, v);
  });
  const out = [];
  byMove.forEach(m => {
    const points = [...m.days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, value]) => ({ date, value }));
    if (points.length < minPoints) return;
    const first = points[0].value;
    const best = Math.max(...points.map(p => p.value));
    const last = points[points.length - 1];
    const bestPoint = points.find(p => p.value === best);
    out.push({
      name: m.name, category: m.category, points,
      first, best, last: last.value, lastDate: last.date, bestDate: bestPoint.date,
      change: best - first,
      isRecentPR: last.value === best && points.length > 1 && points.slice(0, -1).every(p => p.value < best),
    });
  });
  // Most-logged movements first: those are the main lifts.
  out.sort((a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name));
  return out;
}

/*
  Attendance across every program, read from the same day.status the coach and athlete
  both write. Streak = consecutive Completed sessions, most recent first, ignoring
  sessions that have not happened yet (no status). A Missed breaks it.
*/
export function attendanceStats(programs) {
  const sessions = [];
  (programs || []).forEach(p => (p.weeks || []).forEach((w, wi) => (w.days || []).forEach((d, di) => {
    if (!(d.blocks && d.blocks.length)) return;
    const st = d.status || w.status || "";
    if (st === "completed" || st === "missed") sessions.push({ st, order: `${p.start_date || ""}|${String(wi).padStart(3, "0")}|${String(di).padStart(2, "0")}` });
  })));
  sessions.sort((a, b) => (a.order < b.order ? 1 : -1));
  let streak = 0;
  for (const s of sessions) { if (s.st === "completed") streak++; else break; }
  const completed = sessions.filter(s => s.st === "completed").length;
  const tracked = sessions.length;
  return { streak, completed, tracked, pct: tracked ? Math.round((completed / tracked) * 100) : null };
}
