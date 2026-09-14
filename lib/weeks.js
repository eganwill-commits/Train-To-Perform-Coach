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

export function weekStartFromLabel(label, idx, startDate) {
  if (startDate) {
    const p = String(startDate).split("-").map(Number);
    if (p[0] && p[1] && p[2]) { const d = new Date(p[0], p[1] - 1, p[2]); d.setDate(d.getDate() + idx * 7); return d; }
  }
  const m = (label || "").match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/i);
  if (m) return new Date(2026, MONTHS[m[1].slice(0, 3).toLowerCase()], parseInt(m[2], 10));
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

  Clamps to the program: before day one you are in week 1, after the last week you stay
  on the last week rather than running off the end.
*/
export function currentWeekIndex(weeks, startDate, today = new Date()) {
  const list = weeks || [];
  if (list.length === 0) return 0;

  if (startDate) {
    const p = String(startDate).split("-").map(Number);
    if (p[0] && p[1] && p[2]) {
      const start = new Date(p[0], p[1] - 1, p[2]);
      const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const elapsedDays = Math.floor((t - start) / 86400000);
      if (elapsedDays < 0) return 0;
      return Math.min(Math.floor(elapsedDays / 7), list.length - 1);
    }
  }

  const wi = list.findIndex(w => {
    if (w.status === "completed" || w.status === "missed") return false;
    const days = w.days || [];
    if (days.length === 0) return true;
    return !days.every(d => d.status === "completed" || d.status === "missed");
  });
  return wi >= 0 ? wi : list.length - 1;
}
