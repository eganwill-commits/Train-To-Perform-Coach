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
