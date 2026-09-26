// Timer engine: turns a saved timer config into an ordered list of segments.
// Pure functions only, so the runner, the builder preview and the TV page all agree.
//
// Segment shape:
//   { kind: "ready" | "work" | "rest" | "roundrest" | "cap" | "up",
//     dur: seconds (null = open-ended count-up),
//     label, sub, round, rounds, index (movement/station index or -1) }

export const FORMATS = [
  { value: "stations", label: "Stations", blurb: "Work at each station, move on the rest, repeat for rounds." },
  { value: "emom", label: "EMOM / E2MOM", blurb: "Start a new set every interval. Movements rotate each interval." },
  { value: "intervals", label: "Tabata / Intervals", blurb: "Work / rest for a set number of rounds. Tabata is 20/10 × 8." },
  { value: "amrap", label: "AMRAP", blurb: "As many rounds as possible before the clock hits zero." },
  { value: "fortime", label: "For Time", blurb: "Clock counts up. Optional time cap." },
  { value: "clock", label: "Running Clock", blurb: "A plain count-up clock. No rounds, no cap." },
];
export const FORMAT_LABEL = Object.fromEntries(FORMATS.map(f => [f.value, f.label]));

export const DEFAULT_CONFIG = {
  stations: { countdown: 10, work: 45, rest: 15, rounds: 5, roundRest: 0, movements: [{ name: "", detail: "" }], warmup: [] },
  emom: { countdown: 10, interval: 60, rounds: 10, movements: [{ name: "", detail: "" }], warmup: [] },
  intervals: { countdown: 10, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60, movements: [], warmup: [] },
  amrap: { countdown: 10, cap: 720, movements: [{ name: "", detail: "" }], warmup: [] },
  fortime: { countdown: 10, cap: 1200, movements: [{ name: "", detail: "" }], warmup: [] },
  clock: { countdown: 10, movements: [], warmup: [] },
};

export const PRESETS = [
  { name: "Tabata", format: "intervals", config: { ...DEFAULT_CONFIG.intervals, work: 20, rest: 10, rounds: 8 } },
  { name: "EMOM 10", format: "emom", config: { ...DEFAULT_CONFIG.emom, interval: 60, rounds: 10, movements: [] } },
  { name: "E2MOM 16", format: "emom", config: { ...DEFAULT_CONFIG.emom, interval: 120, rounds: 8, movements: [] } },
  { name: "AMRAP 12", format: "amrap", config: { ...DEFAULT_CONFIG.amrap, cap: 720, movements: [] } },
  { name: "For Time · 20 cap", format: "fortime", config: { ...DEFAULT_CONFIG.fortime, cap: 1200, movements: [] } },
  { name: "Stations 45/15", format: "stations", config: { ...DEFAULT_CONFIG.stations, movements: [] } },
  { name: "Running Clock", format: "clock", config: { ...DEFAULT_CONFIG.clock } },
];

const n = (v, d, min = 0) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= min ? x : d; };
const moves = (c) => (c.movements || []).filter(m => m && (m.name || "").trim());

export function normalizeConfig(format, config = {}) {
  const base = DEFAULT_CONFIG[format] || DEFAULT_CONFIG.clock;
  const c = { ...base, ...config };
  c.countdown = n(c.countdown, 10);
  c.movements = Array.isArray(c.movements) ? c.movements : [];
  c.warmup = Array.isArray(c.warmup) ? c.warmup : [];
  if (format === "stations") { c.work = n(c.work, 45, 1); c.rest = n(c.rest, 15); c.rounds = n(c.rounds, 5, 1); c.roundRest = n(c.roundRest, 0); }
  if (format === "emom") { c.interval = n(c.interval, 60, 5); c.rounds = n(c.rounds, 10, 1); }
  if (format === "intervals") { c.work = n(c.work, 20, 1); c.rest = n(c.rest, 10); c.rounds = n(c.rounds, 8, 1); c.sets = n(c.sets, 1, 1); c.setRest = n(c.setRest, 60); }
  if (format === "amrap") c.cap = n(c.cap, 720, 10);
  if (format === "fortime") c.cap = n(c.cap, 0);
  return c;
}

export function buildSegments(format, rawConfig) {
  const c = normalizeConfig(format, rawConfig);
  const m = moves(c);
  const segs = [];
  if (c.countdown > 0) segs.push({ kind: "ready", dur: c.countdown, label: "Get ready", sub: m[0] ? m[0].name : "", round: 1, rounds: 1, index: -1 });

  if (format === "stations") {
    const list = m.length ? m : [{ name: "Work" }];
    for (let r = 1; r <= c.rounds; r++) {
      list.forEach((st, i) => {
        segs.push({ kind: "work", dur: c.work, label: st.name, sub: st.detail || "", round: r, rounds: c.rounds, index: i });
        const lastInRound = i === list.length - 1;
        const lastOverall = lastInRound && r === c.rounds;
        if (lastOverall) return;
        if (lastInRound && c.roundRest > 0) segs.push({ kind: "roundrest", dur: c.roundRest, label: "Round rest", sub: "Next: " + list[0].name, round: r, rounds: c.rounds, index: -1 });
        else if (c.rest > 0) { const next = list[(i + 1) % list.length]; segs.push({ kind: "rest", dur: c.rest, label: list.length > 1 ? "Move to next station" : "Rest", sub: "Next: " + next.name, round: r, rounds: c.rounds, index: (i + 1) % list.length }); }
      });
    }
  } else if (format === "emom") {
    for (let r = 1; r <= c.rounds; r++) {
      const mv = m.length ? m[(r - 1) % m.length] : null;
      segs.push({ kind: "work", dur: c.interval, label: mv ? mv.name : "Go", sub: mv ? (mv.detail || "") : "", round: r, rounds: c.rounds, index: mv ? (r - 1) % m.length : -1 });
    }
  } else if (format === "intervals") {
    for (let s = 1; s <= c.sets; s++) {
      for (let r = 1; r <= c.rounds; r++) {
        const mv = m.length ? m[(r - 1) % m.length] : null;
        segs.push({ kind: "work", dur: c.work, label: mv ? mv.name : "Work", sub: mv ? (mv.detail || "") : (c.sets > 1 ? "Set " + s + " of " + c.sets : ""), round: r, rounds: c.rounds, set: s, sets: c.sets, index: mv ? (r - 1) % m.length : -1 });
        const last = r === c.rounds;
        if (last && s === c.sets) continue;
        if (last) { if (c.setRest > 0) segs.push({ kind: "roundrest", dur: c.setRest, label: "Set rest", sub: "Next: set " + (s + 1), round: r, rounds: c.rounds, set: s, sets: c.sets, index: -1 }); }
        else if (c.rest > 0) segs.push({ kind: "rest", dur: c.rest, label: "Rest", sub: m.length ? "Next: " + m[r % m.length].name : "", round: r, rounds: c.rounds, set: s, sets: c.sets, index: -1 });
      }
    }
  } else if (format === "amrap") {
    segs.push({ kind: "cap", dur: c.cap, label: "AMRAP", sub: "", round: 1, rounds: 0, index: -1 });
  } else if (format === "fortime") {
    segs.push({ kind: "up", dur: c.cap > 0 ? c.cap : null, label: "For time", sub: c.cap > 0 ? "Cap " + fmt(c.cap) : "", round: 1, rounds: 0, index: -1 });
  } else {
    segs.push({ kind: "up", dur: null, label: "Running clock", sub: "", round: 1, rounds: 0, index: -1 });
  }

  let t = 0;
  for (const s of segs) { s.start = t; if (s.dur != null) t += s.dur; }
  return segs;
}

// Total length in seconds, excluding the get-ready countdown. null = open-ended.
export function totalSeconds(format, config) {
  const segs = buildSegments(format, config).filter(s => s.kind !== "ready");
  if (segs.some(s => s.dur == null)) return null;
  return segs.reduce((a, s) => a + s.dur, 0);
}

export function fmt(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(r).padStart(2, "0");
}

export function summarize(format, raw) {
  const c = normalizeConfig(format, raw);
  const mv = moves(c).length;
  const tot = totalSeconds(format, c);
  const tail = tot != null ? " · " + fmt(tot) : "";
  if (format === "stations") return `${mv || 1} station${mv === 1 ? "" : "s"} × ${c.rounds} rounds · ${c.work}/${c.rest}${tail}`;
  if (format === "emom") return `${c.interval === 60 ? "EMOM" : "E" + (c.interval % 60 === 0 ? c.interval / 60 : c.interval + "s") + "MOM"} × ${c.rounds}${tail}`;
  if (format === "intervals") return `${c.work}/${c.rest} × ${c.rounds}${c.sets > 1 ? " × " + c.sets + " sets" : ""}${tail}`;
  if (format === "amrap") return `AMRAP ${fmt(c.cap)}`;
  if (format === "fortime") return c.cap > 0 ? `For time · ${fmt(c.cap)} cap` : "For time · no cap";
  return "Running clock";
}

// Short, readable code for TV links: no 0/o/1/l/i.
export function makeSlug(len = 5) {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  const buf = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(len)) : null;
  for (let i = 0; i < len; i++) s += a[(buf ? buf[i] : Math.floor(Math.random() * 256)) % a.length];
  return s;
}
