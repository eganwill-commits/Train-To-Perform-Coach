import { weekStartFromLabel, weekdayOffset } from "./weeks";

/*
  What counts as a missing log — ONE definition, used by the athlete's banner and the
  coach's roster panel.

  Deliberately shared. Three times in this project a rule kept in two places has drifted
  (the week number, the SLOT regex, blockLogMap). Coach and athlete must never disagree
  about whose session is incomplete.
*/

/*
  The work whose numbers drive programming decisions, and therefore the only work that
  raises the red flag:
    STR - the lifts
    FIN - carries, loaded trunk work; these carry real load and progress like a lift

  PWR was in this set until 2026-09-02 and is not any more. A box-jump height or a bound
  distance is worth having, but a missing one is not a reason to tell a coach an athlete
  skipped their session — and while it was in here it was the category most likely to be
  the *only* thing missing, which made the alert mean less than it should. PWR keeps its
  inline nudge (see NUDGE_CATS); it just no longer speaks for the whole session.
*/
// REC (cool-down) and MVT are deliberately absent: nothing to log, so never a nudge.
export const MUST_LOG_CATS = new Set(["STR", "FIN"]);

// Categories that get the small per-exercise pill inside a day. Wider than the alert
// set on purpose: a nudge at the moment of logging is cheap, a roster alert is not.
export const NUDGE_CATS = new Set(["STR", "PWR", "FIN"]);

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

/*
  When a session was meant to happen, from the program's own calendar.

  Needed because a day can now be marked Completed with no log rows at all - the athlete
  says "I trained this" without typing a number - and the flagging cutoff still has to
  know whether that day is recent work or closed history. With log rows the answer is the
  row's date; without them it is the day the program scheduled.
*/
function scheduledDateISO(weekLabel, wi, dayLabel, startDate) {
  try {
    const d = weekStartFromLabel(weekLabel, wi, startDate);
    if (!d || isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + weekdayOffset(dayLabel));
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  } catch (e) { return ""; }
}

function hasNumbers(l) {
  return (l.load || "") !== "" || (l.sets || "") !== "" || (l.reps || "") !== "" || (l.rpe || "") !== "";
}

/*
  How a session is identified everywhere outside the program JSON.

  Block ids move when the program is re-rendered; `week_label` + `day_label` is what
  `logs` already keys on and what a dismissal is stored against, so the two can be
  compared directly.
*/
export function sessionKey(weekLabel, dayLabel) {
  return `${weekLabel || ""}||${dayLabel || ""}`;
}

/*
  Sessions the athlete trained but did not record the must-log numbers for.

  Each result carries `missing` — the actual movements with nothing against them — so the
  banner and the dashboard can name them instead of saying "3 exercises". Before this the
  athlete was told a session was incomplete and left to work out which part of it was.

  A session is flagged when ANY must-log movement is empty, not only when all of them are.
  Under the old all-or-nothing rule a day where four of five lifts were logged looked
  identical to a day where all five were, and the one missing lift was never asked for.

  `displayName(block)` is passed in because the athlete's app resolves an exercise name
  through their chosen equipment room and the coach's does not - the matching has to use
  whichever name that side would show.

  `dismissed` is a Set of sessionKey()s the coach has waved off; those never come back.
*/
export function findMissingNumberSessions({ program, logs, athleteId, displayName, since = FLAGGING_STARTS_ON, dismissed }) {
  if (!program || !athleteId) return [];
  const cutoff = since;

  const byDay = new Map();
  (logs || []).forEach(l => {
    if (l.athlete_id !== athleteId) return;
    const k = sessionKey(l.week_label, l.day_label);
    const arr = byDay.get(k);
    if (arr) arr.push(l); else byDay.set(k, [l]);
  });

  const out = [];
  (program.weeks || []).forEach((w, wi) => {
    (w.days || []).forEach(d => {
      const key = sessionKey(w.label, d.label);
      if (dismissed && dismissed.has(key)) return;
      // A day the athlete marked Missed is not a logging gap. It is an answer.
      if (d.status === "missed") return;

      const rows = byDay.get(key) || [];

      /*
        What counts as "they trained this".

        Log rows used to be the only evidence, because the old Log-day button wrote a row
        for every block in the session whether or not anything was typed into it. Those
        blank rows were the signal - and they were also noise, and fabricated data.

        Now the athlete marks the DAY Completed and only types numbers into the movements
        that want them, so a session they genuinely trained can have two rows or none. An
        explicit Completed is better evidence than a blank row ever was: it is the athlete
        saying they were there. Without it, a day trained and logged with nothing would be
        indistinguishable from a day never opened, and would never be asked about.
      */
      const markedDone = d.status === "completed";
      if (rows.length === 0 && !markedDone) return;   // never trained: not a gap, just not done

      const latest = rows.reduce((a, l) => (l.date > a ? l.date : a), "")
        || scheduledDateISO(w.label, wi, d.label, program.start_date);
      // No date at all - an undated program with no rows. Stay quiet rather than guess.
      if (!latest || latest < cutoff) return;    // before flagging began: closed history

      const targets = (d.blocks || []).filter(b => MUST_LOG_CATS.has(b.category));
      if (targets.length === 0) return;

      const missing = [];
      targets.forEach(b => {
        const dn = displayName ? displayName(b, d.id) : (b.exerciseName || "");
        const m = rows.find(l =>
          (l.exercise_id && b.exerciseId && l.exercise_id === b.exerciseId) ||
          l.exercise_name === dn || norm(l.exercise_name) === norm(dn)
        );
        if (!m || !hasNumbers(m)) missing.push({ id: b.id, name: dn || "—", category: b.category });
      });

      if (missing.length === 0) return;
      out.push({
        wi, weekLabel: w.label, day: d, key,
        missing,
        count: missing.length,   // how many still need numbers
        total: targets.length,   // out of how many must-log movements in the session
        date: latest,
      });
    });
  });
  return out;
}

// "Back Squat, Trap Bar Deadlift and 2 more" — for a one-line summary.
export function summariseMissing(missing, max = 3) {
  const names = (missing || []).map(m => m.name);
  if (names.length === 0) return "";
  if (names.length <= max) {
    return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/*
  How many of the session's MUST-LOG movements have a number against them.

  The habit measure used to count every block in the day, which made sense when the
  athlete ticked each exercise off. It does not any more: they mark the day Completed and
  type numbers only where numbers are wanted, so "3 of 24" would be the normal, correct
  state of a well-logged session and would read as failure. This counts the lifts and
  finishers - the ones carrying a LOG IT pill - and nothing else.
*/
export function mustLogProgress(day, blockLogMap) {
  const blocks = (day?.blocks || []).filter(b => MUST_LOG_CATS.has(b.category));
  const done = blocks.filter(b => {
    const m = blockLogMap[b.id];
    return m && hasNumbers(m);
  }).length;
  return { done, total: blocks.length, complete: blocks.length > 0 && done === blocks.length };
}

// How much of a session has any number against it — every block, the old habit measure.
export function sessionLogProgress(day, blockLogMap) {
  const blocks = day?.blocks || [];
  const done = blocks.filter(b => {
    const m = blockLogMap[b.id];
    return m && hasNumbers(m);
  }).length;
  return { done, total: blocks.length, complete: blocks.length > 0 && done === blocks.length };
}

/*
  WHERE THE SCORE GOES.

  Week 1 of the Fall 2026 block produced five athletes recording the same test five
  different ways: the number in `load` for some, in `reps` for others, typed into
  `notes` for two of them ("35.8 cal", "41"), with units baked into the string
  ("78in", "27 cals", "Bw") - and every left/right pair crammed into a single box in
  five different formats ("78 both", "50 left 54 right", "79, 79.5", "78L,81R",
  "R55,L50"). All of it had to be parsed by hand before a Week 1 vs Week 12
  comparison could exist at all, and Week 12 would have produced the same mess again.

  The fix is not a new column. It is telling the athlete, on the block itself, exactly
  which number is wanted and in what unit - and, when a test has a left and a right,
  giving them two boxes instead of one. The value still lands in `load`, so nothing
  downstream changes. It just lands there in ONE shape.
*/

const TEST_HEAD = /^\s*(TEST|RETEST|BENCHMARK|SCREEN)\b/i;

// A block whose whole point is to produce a number for the record.
export function isTestBlock(block) {
  const n = (block && block.notes) || "";
  return TEST_HEAD.test(n) || /\b(TEST|RETEST|BENCHMARK)\b/.test(n.slice(0, 90));
}

// A test measured separately on each side. The gap between the sides is the
// finding, so it can never be allowed to collapse into one box.
export function isTwoSided(block) {
  const name = (block && block.exerciseName) || "";
  const reps = (block && block.reps) || "";
  const notes = (block && block.notes) || "";
  return /L\s*vs\.?\s*R/i.test(name)
      || /\bper side\b|\/side\b|each side/i.test(reps)
      || /record left and right|left and right separately|log left and right/i.test(notes);
}

// What unit the number is in. Order matters: a 30-second hop test is scored in
// hops, not seconds, so the movement name is read before the prescription.
function unitFor(block) {
  const name = (block && block.exerciseName) || "";
  const reps = (block && block.reps) || "";
  const cat = (block && block.category) || "";
  if (/\bcal/i.test(name + " " + reps)) return "calories";
  if (/\bhops?\b/i.test(name)) return "reps";
  if (/burpee|amrap|pull-?up/i.test(name)) return "reps";
  if (/broad jump|vertical jump|\bjump\b/i.test(name)) return "inches";
  if (/copenhagen|plank|wall sit|\bhold\b/i.test(name)) return "seconds";
  if (/\d+\s*RM\b/i.test(name) || /build to/i.test(reps)) return "lbs";
  if (/^SCREEN/i.test(name) || /score/i.test(reps)) return "P / L / F";
  if (cat === "STR") return "lbs";
  if (cat === "PWR") return "inches";
  return "";
}

/*
  Everything the card needs to show one unmistakable score field.
  `isTest` blocks get the prominent box; everything else keeps the ordinary Load
  field, with the unit added to its label when we can work one out.
*/
/*
  What a conditioning piece is scored in, read from its FORMAT before anything else.

  "AMRAP 10:00 - 12 cal bike OR 200m run - ..." used to be labelled "Load (calories)"
  because the unit lookup saw "cal" in the movement list. An AMRAP is scored in rounds +
  reps, whatever the movements are. 2 of 80 COND logs in a month had any score, and a
  field asking the wrong question is part of why.

  Returns null when the format is not recognisable; the caller then falls back to the
  generic "Score" label rather than guessing a unit.
*/
export function condScoreSpec(block) {
  const text = [(block && block.exerciseName) || "", (block && block.reps) || "", ((block && block.notes) || "").slice(0, 160)].join(" ");
  if (/\bAMRAP\b/i.test(text)) return { unit: "rounds + reps", placeholder: "e.g. 5 + 12" };
  if (/\b(for time|RFT|rounds? for time|race to|time cap)\b/i.test(text)) return { unit: "time (mm:ss)", placeholder: "e.g. 8:42" };
  if (/\bE\d*MOM\b|\bEMOM\b/i.test(text)) return { unit: "rounds completed", placeholder: "e.g. 10" };
  if (/\bmax\s+(cal|calories)\b|\bcal(orie)?s?\s+(in|total)\b/i.test(text)) return { unit: "calories", placeholder: "e.g. 42" };
  if (/\bmax\s+(meters|metres|distance)\b|\btotal (meters|metres|distance)\b/i.test(text)) return { unit: "meters", placeholder: "e.g. 1450" };
  if (/\bTabata\b/i.test(text)) return { unit: "lowest round reps", placeholder: "e.g. 14" };
  return null;
}

export function scoreSpecFor(block) {
  const test = isTestBlock(block);
  const sides = test && isTwoSided(block);
  const isCond = !test && (block && block.category) === "COND";
  if (isCond) {
    const c = condScoreSpec(block);
    return { isTest: false, sides: false, isCond: true, unit: c ? c.unit : "", placeholder: c ? c.placeholder : "Your score", label: "Score" };
  }
  const unit = unitFor(block);
  return {
    isTest: test,
    sides,
    isCond: false,
    unit,
    label: test ? "Score" : ((block && block.category) === "PWR" ? "Height / dist / load" : "Load"),
  };
}

// The one canonical shape for a two-sided result. Read back by parseSides below
// and by anything transcribing into `baselines`.
export function formatSides(l, r) {
  const L = (l == null ? "" : String(l)).trim();
  const R = (r == null ? "" : String(r)).trim();
  if (!L && !R) return "";
  return "L: " + (L || "-") + "  R: " + (R || "-");
}

/*
  Reads a two-sided value back out of `load`.

  Deliberately tolerant of the formats Week 1 actually produced, so an entry made
  before the two-box field existed still displays in the right boxes instead of
  looking blank and inviting someone to retype it.
*/
export function parseSides(v) {
  const s = (v == null ? "" : String(v)).trim();
  if (!s) return { left: "", right: "" };
  let m;
  m = s.match(/L\s*[:=]?\s*([\d.]+)[^\d]*?R\s*[:=]?\s*([\d.]+)/i);      // "L: 51  R: 60"
  if (m) return { left: m[1], right: m[2] };
  m = s.match(/R\s*[:=]?\s*([\d.]+)[^\d]*?L\s*[:=]?\s*([\d.]+)/i);      // "R55,L50"
  if (m) return { left: m[2], right: m[1] };
  m = s.match(/([\d.]+)\s*L\b[^\d]*?([\d.]+)\s*R\b/i);                 // "78L,81R"
  if (m) return { left: m[1], right: m[2] };
  m = s.match(/([\d.]+)\s*left[^\d]*?([\d.]+)\s*right/i);                // "51 left 60 right"
  if (m) return { left: m[1], right: m[2] };
  m = s.match(/([\d.]+)\s*right[^\d]*?([\d.]+)\s*left/i);                // "38 right 22 left"
  if (m) return { left: m[2], right: m[1] };
  m = s.match(/^([\d.]+)\s*both$/i);                                      // "78 both"
  if (m) return { left: m[1], right: m[1] };
  m = s.match(/^([\d.]+)\s*[,\/]\s*([\d.]+)$/);                          // "79, 79.5"
  if (m) return { left: m[1], right: m[2] };
  return { left: "", right: "", raw: s };
}
