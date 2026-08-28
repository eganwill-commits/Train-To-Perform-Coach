/*
  What counts as a missing log — ONE definition, used by the athlete's banner and the
  coach's roster panel.

  Deliberately shared. Three times in this project a rule kept in two places has drifted
  (the week number, the SLOT regex, blockLogMap). Coach and athlete must never disagree
  about whose session is incomplete.
*/

// The work whose numbers drive programming decisions:
//   STR - the lifts
//   PWR - measurable power (box jump height, bound distance, throw distance, box height)
//   FIN - carries, loaded trunk work; these carry real load and progress like a lift
// MVT, SKL and COND still deserve to be logged, but they are the habit tier, not chased.
export const MUST_LOG_CATS = new Set(["STR", "PWR", "FIN"]);

/*
  Flagging starts here and never looks further back.

  Mac's Week 1 opened Mon 24 Aug 2026 and the Fall 2026 Freeride Prep block opens 31 Aug.
  Everything before that - the spring 12-week block, the July hypertrophy block, Mac's
  Week 0 benchmark - is closed history. Nineteen of the twenty-one sessions the rule first
  matched were Week 5-10 of a block that finished in June; flagging those would only teach
  an athlete that the banner is noise.

  A fixed floor, deliberately not a rolling window. A rolling window would quietly stop
  asking for Mac's Monday in three weeks' time while the numbers were still missing. A gap
  stops being flagged when it is filled in, not when it gets old.
*/
export const FLAGGING_STARTS_ON = "2026-08-24";

const norm = (x) => (x || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

function hasNumbers(l) {
  return (l.load || "") !== "" || (l.sets || "") !== "" || (l.reps || "") !== "" || (l.rpe || "") !== "";
}

/*
  Sessions the athlete logged but recorded none of the must-log work for.

  `displayName(block)` is passed in because the athlete's app resolves an exercise name
  through their chosen equipment room and the coach's does not - the matching has to use
  whichever name that side would show.
*/
export function findMissingNumberSessions({ program, logs, athleteId, displayName, since = FLAGGING_STARTS_ON }) {
  if (!program || !athleteId) return [];
  const cutoff = since;

  const byDay = new Map();
  (logs || []).forEach(l => {
    if (l.athlete_id !== athleteId) return;
    const k = `${l.week_label || ""}||${l.day_label || ""}`;
    const arr = byDay.get(k);
    if (arr) arr.push(l); else byDay.set(k, [l]);
  });

  const out = [];
  (program.weeks || []).forEach((w, wi) => {
    (w.days || []).forEach(d => {
      const rows = byDay.get(`${w.label || ""}||${d.label || ""}`) || [];
      if (rows.length === 0) return;             // never trained: not a gap, just not done
      const latest = rows.reduce((a, l) => (l.date > a ? l.date : a), "");
      if (!latest || latest < cutoff) return;    // before flagging began: closed history
      const targets = (d.blocks || []).filter(b => MUST_LOG_CATS.has(b.category));
      if (targets.length === 0) return;
      const recorded = targets.filter(b => {
        const dn = displayName ? displayName(b, d.id) : (b.exerciseName || "");
        const m = rows.find(l =>
          (l.exercise_id && b.exerciseId && l.exercise_id === b.exerciseId) ||
          l.exercise_name === dn || norm(l.exercise_name) === norm(dn)
        );
        return m && hasNumbers(m);
      }).length;
      if (recorded === 0) out.push({ wi, weekLabel: w.label, day: d, count: targets.length, date: latest });
    });
  });
  return out;
}

// How much of a session has any number against it — the habit measure.
export function sessionLogProgress(day, blockLogMap) {
  const blocks = day?.blocks || [];
  const done = blocks.filter(b => {
    const m = blockLogMap[b.id];
    return m && hasNumbers(m);
  }).length;
  return { done, total: blocks.length, complete: blocks.length > 0 && done === blocks.length };
}
