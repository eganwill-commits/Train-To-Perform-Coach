/*
  Week and day helpers — ONE copy, imported by both the coach view and the athlete view.

  These used to be defined separately in Programs.js and AthleteView.js. The date maths
  stayed in step by luck; the week NUMBER did not. weekNumberLabel was fixed in the coach
  view and never added to the athlete's, so for a program that opens with Week 0 the
  athlete's app labelled every week one higher than the coach's, the workbook and the PDF:
  Mac's "W1" was the benchmark week, his "W2" was Week 1, and the last tab read W13 for a
  program that ends at Week 12. Coach and athlete were saying different numbers for the
  same session.

  Any rule that both sides must agree on belongs here, not copied into each view.
*/

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const WDAYS = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

/*
  A program week runs Monday to Sunday, so the week starts on the MONDAY of the week that
  holds start_date - not on start_date itself.

  Every day's date is "week start + weekday offset", and the offsets count from Monday
  (Mon 0, Tue 1 ...). The Hockey 13/14 block starts on a Tuesday (Oct 20), so counting
  from the start date put Tuesday's session on Wednesday and Wednesday's on Thursday: the
  day chips read Wed/Thu, "Today" lit the wrong session, and on a Wednesday the app opened
  Tuesday's workout. Snapping to Monday makes the offsets mean what they say for any start.
*/
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function weekStartFromLabel(label, idx, startDate) {
  if (startDate) {
    const p = String(startDate).split("-").map(Number);
    if (p[0] && p[1] && p[2]) { const d = mondayOf(new Date(p[0], p[1] - 1, p[2])); d.setDate(d.getDate() + idx * 7); return d; }
  }
  const m = (label || "").match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/i);
  if (m) return mondayOf(new Date(2026, MONTHS[m[1].slice(0, 3).toLowerCase()], parseInt(m[2], 10)));
  return new Date(2026, 3, 6 + idx * 7);
}

/*
  The chip shows the week's OWN number, taken from its label - not its position in the
  array. Position+1 is only the fallback for a program whose weeks are not numbered.
*/
export function weekNumberLabel(label, idx) {
  const m = (label || "").match(/week\s+(\d+)/i);
  return "W" + (m ? m[1] : idx + 1);
}

export function weekdayOffset(label) {
  const m = (label || "").toLowerCase().match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/);
  return m ? WDAYS[m[1]] : 0;
}

/*
  The calendar date of one session.

  A date written in the day's own label wins ("Tue Oct 27", "(Aug 31)", "Sunday Nov 15"),
  because some weeks hold a session outside their Monday-Sunday frame: the Freeride retest
  week opens on "Sunday Nov 15", the day before that week's Monday. The label date is only
  trusted when it sits within two weeks of where the program says this week is, so a
  program whose start_date was moved does not keep chasing its old label dates.
  Otherwise the date is week start + weekday. A label with neither ("In-Season A") has no
  date of its own: hasSessionDate() says so, and sessionDate() returns the week's Monday.
*/
const DAY_DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i;
const WEEKDAY_RE = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i;

// Every date written in a day label, in order. "Mon Oct 26 or Tue Oct 27" gives two.
function labelDates(dayLabel, weekStart) {
  const out = [];
  const re = new RegExp(DAY_DATE_RE.source, "gi");
  let m;
  while ((m = re.exec(dayLabel || ""))) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    const day = parseInt(m[2], 10);
    let best = null;
    for (const y of [weekStart.getFullYear() - 1, weekStart.getFullYear(), weekStart.getFullYear() + 1]) {
      const c = new Date(y, mon, day);
      if (c.getMonth() !== mon) continue;
      if (!best || Math.abs(c - weekStart) < Math.abs(best - weekStart)) best = c;
    }
    if (best && Math.abs(best - weekStart) <= 14 * 86400000) out.push(best);
  }
  return out;
}

export function hasSessionDate(dayLabel) {
  return DAY_DATE_RE.test(dayLabel || "") || WEEKDAY_RE.test(dayLabel || "");
}

export function sessionDate(weekLabel, wi, dayLabel, startDate) {
  const ws = weekStartFromLabel(weekLabel, wi, startDate);
  const fromLabel = labelDates(dayLabel, ws);
  if (fromLabel.length) return fromLabel[0];
  const d = new Date(ws);
  d.setDate(ws.getDate() + weekdayOffset(dayLabel));
  return d;
}

/*
  The last day a session is still "on". Remote sessions are often written as a choice
  ("Session 1 · Mon Oct 26 or Tue Oct 27"): on the Tuesday that session is still the one
  to do, not the next one.
*/
export function sessionEndDate(weekLabel, wi, dayLabel, startDate) {
  const ws = weekStartFromLabel(weekLabel, wi, startDate);
  const fromLabel = labelDates(dayLabel, ws);
  if (fromLabel.length) return fromLabel[fromLabel.length - 1];
  return sessionDate(weekLabel, wi, dayLabel, startDate);
}

export function sessionDateISO(weekLabel, wi, dayLabel, startDate) {
  const d = sessionDate(weekLabel, wi, dayLabel, startDate);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Sessions that count for "which day is it": days with exercises in them.
function sessionDays(week) {
  const all = (week && week.days) || [];
  const real = all.filter(d => (d.blocks || []).length > 0);
  return real.length ? real : all;
}

/*
  The session to open a week on.

  On a calendar program (start_date set) and in the current week: today's session, else
  the next one coming up, else the last one in the week. Whether anything was ticked off
  does not enter into it - the group trains the session on the calendar.
  Any other week, or a self-paced program: the first session nobody has marked yet, else
  the first.
*/
export function defaultDayId(week, wi, isCurrentWeek, startDate, today = new Date()) {
  const days = sessionDays(week);
  if (days.length === 0) return null;
  if (isCurrentWeek && startDate) {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dated = days
      .filter(d => hasSessionDate(d.label))
      .map(d => ({ d, dt: sessionDate(week.label, wi, d.label, startDate), end: sessionEndDate(week.label, wi, d.label, startDate) }))
      .sort((a, b) => a.dt - b.dt);
    if (dated.length) {
      const next = dated.find(x => x.end >= t);
      return (next || dated[dated.length - 1]).d.id;
    }
  }
  const open = days.find(d => !d.status);
  return (open || days[0]).id;
}

/*
  Which week is "now".

  This used to be copied into five places - twice in the athlete view, twice in the
  coach view, and once more inside the week-tab render - and every copy said the same
  thing: the current week is the first week with a day nobody has ticked off yet.

  That rule is wrong for a team program. The boys train the same session on the same
  day whether or not every box from last week got filled in, so one unmarked Thursday
  pinned an athlete's app to an old week indefinitely. On the Monday of Week 3, four of
  five athletes opened the app and were pointed at Week 2 - Gus had one day marked in
  Week 1 and was still stuck behind it.

  So: if the program has a start_date it runs on the calendar, and today's date decides
  the week. Completion has nothing to do with it. Only a program with NO start_date -
  a self-paced remote block - falls back to the progress rule.

  On the calendar, "now" is the week holding the next session (today's counts). Counting
  whole weeks from start_date was wrong two ways: a block that starts on a Tuesday flipped
  to the new week on Tuesday, so on Monday night the app still showed last week; and once
  a week's last session was done (Wednesday for hockey, Friday for most) the app sat on a
  finished week until the weekend was over. A week whose sessions carry no day or date
  ("In-Season A") stays current until its Sunday.

  Clamps to the program: before day one you are in week 1, after the last session you stay
  on the last week rather than running off the end.
*/
export function currentWeekIndex(weeks, startDate, today = new Date()) {
  const list = weeks || [];
  if (list.length === 0) return 0;

  if (startDate && String(startDate).split("-").map(Number).every(n => n)) {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      const days = sessionDays(w);
      const dated = days.filter(d => hasSessionDate(d.label)).map(d => sessionEndDate(w.label, i, d.label, startDate));
      if (dated.length) {
        if (dated.some(dt => dt >= t)) return i;
      } else {
        const sunday = weekStartFromLabel(w.label, i, startDate);
        sunday.setDate(sunday.getDate() + 6);
        if (sunday >= t) return i;
      }
    }
    return list.length - 1;
  }

  const wi = list.findIndex(w => {
    if (w.status === "completed" || w.status === "missed") return false;
    const days = w.days || [];
    if (days.length === 0) return true;
    return !days.every(d => d.status === "completed" || d.status === "missed");
  });
  return wi >= 0 ? wi : list.length - 1;
}

/*
  What to call the two baseline columns.

  The columns are stored as week1_* and week12_* (unchanged - every existing result stays
  where it is). Only the LABEL follows the program: a 4-week block retests in Week 4, the
  Fall 2026 block opens with a Week 0 benchmark. Reads the program(s) in the baseline's
  group for that athlete; falls back to "Start" / "Retest" when there is no program.
*/
export function baselineColumnLabels(programs, groupId, athleteId) {
  const progs = (programs || []).filter(p => groupId && p.group_id === groupId && (!athleteId || p.athlete_id === athleteId));
  const p = progs.sort((a, b) => ((b.weeks || []).length - (a.weeks || []).length))[0];
  const weeks = (p && p.weeks) || [];
  if (weeks.length === 0) return { start: "Start", end: "Retest" };
  const first = weekNumberLabel(weeks[0].label, 0).replace(/^W/, "Week ");
  const last = weekNumberLabel(weeks[weeks.length - 1].label, weeks.length - 1).replace(/^W/, "Week ");
  return { start: first, end: first === last ? "Retest" : last };
}
