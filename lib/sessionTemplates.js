import { supabase } from "./supabase";
import { weekStartFromLabel, weekdayOffset } from "./weeks";

/*
  Session Library: floating sessions the coach can drop into any program.

  A template is one day of programming with no owner and no date: a name, a coach note
  and its blocks. It is not linked to the programs it is inserted into. Inserting COPIES
  the blocks, so editing or deleting a template later never changes a session an athlete
  already has (or has already logged against).

  Stored as one JSON object in app_settings under "session_templates", keyed by slug.
  There is one coach, so read-modify-write is safe; a table would be overkill for a
  handful of rows.
*/

const KEY = "session_templates";
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_RE = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i;

const uid = () => Math.random().toString(36).slice(2, 10);

export const slugify = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

async function readAll() {
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  if (error) throw error;
  return (data?.value && typeof data.value === "object") ? data.value : {};
}

async function writeAll(value) {
  const { error } = await supabase.from("app_settings").upsert({ key: KEY, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function fetchTemplates() {
  const all = await readAll();
  return Object.entries(all)
    .map(([slug, t]) => ({ slug, ...t, blocks: Array.isArray(t?.blocks) ? t.blocks : [] }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

/*
  A block saved into a template keeps its prescription and cues, and loses anything that
  belongs to the session it came from: its id (re-made on every insert) and nothing else
  is per-athlete on a block, so the rest is copied as-is.
*/
const cleanBlock = (b) => { const { id, ...rest } = b || {}; void id; return rest; };

export async function saveTemplate({ slug, name, coachNotes, minutes, blocks }) {
  const s = slug || slugify(name);
  if (!s) throw new Error("A template needs a name.");
  const all = await readAll();
  all[s] = {
    name: (name || "").trim(),
    coachNotes: coachNotes || "",
    ...(minutes ? { minutes: String(minutes) } : {}),
    blocks: (blocks || []).map(cleanBlock),
    updated_at: new Date().toISOString(),
  };
  await writeAll(all);
  return s;
}

export async function deleteTemplate(slug) {
  const all = await readAll();
  delete all[slug];
  await writeAll(all);
}

export async function templateExists(slug) {
  const all = await readAll();
  return !!all[slug];
}

// "Mobility · Full Menu Stretch · Wed Oct 28" -> "Mobility · Full Menu Stretch"
export function nameFromDayLabel(label) {
  return (label || "")
    .split("·")
    .map(s => s.trim())
    .filter(s => s && !WEEKDAY_RE.test(s) && !/^optional$/i.test(s))
    .join(" · ");
}

// The calendar date of a weekday inside a program week.
export function dateInWeek(program, weekIndex, weekday) {
  const week = (program.weeks || [])[weekIndex];
  const ws = weekStartFromLabel(week?.label, weekIndex, program.start_date);
  const d = new Date(ws);
  d.setDate(ws.getDate() + WEEKDAYS.indexOf(weekday));
  return d;
}

/*
  Which week of ANOTHER program holds a given date. Programs start on different Mondays,
  so "Week 3" in one is not Week 3 in another: placing by date is the only way the
  session lands on the same real day for everyone it is added to.
*/
export function weekIndexForDate(program, date) {
  const weeks = program.weeks || [];
  for (let i = 0; i < weeks.length; i++) {
    const ws = weekStartFromLabel(weeks[i].label, i, program.start_date);
    const we = new Date(ws); we.setDate(ws.getDate() + 7);
    if (date >= ws && date < we) return i;
  }
  return -1;
}

export function buildLabel({ name, weekday, date, optional }) {
  const when = `${weekday} ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return [optional ? "Optional" : null, name, when].filter(Boolean).join(" · ");
}

export function dayFromTemplate(tpl, { label, coachNotes, shared }) {
  return {
    id: uid(),
    label,
    status: "",
    blocks: (tpl.blocks || []).map(b => ({ ...cleanBlock(b), id: uid() })),
    coachNotes: coachNotes || "",
    coachNotesShared: !!shared,
  };
}

/*
  Slot the new day in calendar order: before the first dated day that falls later in
  the week. Days with no weekday in their label (a "Travel Only" alternative) stay at
  the end where they already sit.
*/
export function insertDay(days, newDay, weekday) {
  const target = WEEKDAYS.indexOf(weekday);
  const out = [...days];
  let at = out.findIndex(d => WEEKDAY_RE.test(d.label || "") && weekdayOffset(d.label) > target);
  if (at < 0) at = out.findIndex(d => !WEEKDAY_RE.test(d.label || ""));
  if (at < 0) at = out.length;
  out.splice(at, 0, newDay);
  return out;
}

/*
  A week already has this session on this date if any day carries the template's name
  and the same weekday. Inserting twice is almost always a double tap, never intent.
*/
export function alreadyHas(days, name, weekday) {
  const n = (name || "").toLowerCase();
  return (days || []).some(d => {
    const l = (d.label || "").toLowerCase();
    return n && l.includes(n) && WEEKDAY_RE.test(l) && weekdayOffset(l) === WEEKDAYS.indexOf(weekday);
  });
}

/*
  Insert one template into several programs on one calendar date. Returns what happened
  per program so the coach is told about every skip instead of trusting a silent loop.
*/
export async function insertIntoPrograms({ tpl, targets, date, weekday, optional, coachNotes, shared, updateProgram }) {
  const results = [];
  for (const p of targets) {
    const wi = weekIndexForDate(p, date);
    if (wi < 0) { results.push({ program: p, ok: false, reason: "no week on that date" }); continue; }
    const weeks = JSON.parse(JSON.stringify(p.weeks || []));
    const days = weeks[wi].days || [];
    if (alreadyHas(days, tpl.name, weekday)) { results.push({ program: p, ok: false, reason: "already has it that day" }); continue; }
    const label = buildLabel({ name: tpl.name, weekday, date, optional });
    const day = dayFromTemplate(tpl, { label, coachNotes, shared });
    weeks[wi].days = insertDay(days, day, weekday);
    try {
      const res = await updateProgram(p.id, { weeks });
      if (res?.error) throw res.error;
      results.push({ program: p, ok: true, weekIndex: wi, label });
    } catch (e) {
      console.error("insert session failed", e);
      results.push({ program: p, ok: false, reason: "save failed" });
    }
  }
  return results;
}
