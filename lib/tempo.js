/*
  Tempo, in words.

  "3-0-1 (accum) / smooth (peak)" is coach shorthand. A 14-year-old reads it as three
  numbers and moves on. This turns the first tempo it finds into the sentence the coach
  would say out loud, and leaves whatever else was written (phase notes, "smooth") alone.

  Convention used across T2P programs, the app, the PDF/xlsx and the client guide
  alike: always FOUR parts (standardised 22 Oct 2026).
    1st = lowering (eccentric)
    2nd = pause at the bottom
    3rd = lifting (concentric)
    4th = pause at the top
  "X" means as fast as possible - explode. Example: 3-1-X-0.
  Older 3-part codes (3-0-1) and compact ones (21X1) are normalised to four parts by
  normalizeTempo below, which the program builder runs on save.
*/

const PART_LABELS = ["down", "pause at the bottom", "up", "pause at the top"];

function phrase(token, i) {
  const t = String(token).trim().toUpperCase();
  if (t === "X") return i === 2 ? "explode up" : `explode (${PART_LABELS[i]})`;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n === 0) {
    if (i === 1) return "no pause at the bottom";
    if (i === 3) return "no pause at the top";
    return `${PART_LABELS[i]} with no hold`;
  }
  const s = n === 1 ? "1 second" : `${n} seconds`;
  if (i === 0) return `${s} down`;
  if (i === 1) return `${s} pause at the bottom`;
  if (i === 2) return `${s} up`;
  return `${s} pause at the top`;
}

/*
  Normalise a tempo code to the four-part house format. Only pure codes are touched:
    "3-0-1"  -> "3-0-1-0"      (a missing top pause is 0)
    "21x1"   -> "2-1-X-1"      (compact form, x upper-cased)
    "311"    -> "3-1-1-0"
    "3-0-1 (accum) / smooth (peak)" -> "3-0-1-0 (accum) / smooth (peak)"
  Free text ("Hold", "controlled", "3-5s lower") comes back unchanged. This mirrors the
  one-off data migration of 22 Oct 2026 (backup: _programs_backup_20261022_tempo).
*/
export function normalizeTempo(raw) {
  if (typeof raw !== "string") return raw;
  const t = raw.trim();
  const P = "[\\dxX]";
  if (new RegExp(`^${P}-${P}-${P}-${P}$`).test(t)) return t.toUpperCase();
  if (new RegExp(`^${P}-${P}-${P}$`).test(t)) return t.toUpperCase() + "-0";
  if (new RegExp(`^${P}{4}$`).test(t)) return t.toUpperCase().split("").join("-");
  if (new RegExp(`^${P}{3}$`).test(t)) return t.toUpperCase().split("").join("-") + "-0";
  if (new RegExp(`^${P}-${P}-${P} `).test(t)) return t.slice(0, 5).toUpperCase() + "-0" + t.slice(5);
  return raw;
}

// Returns null when there is nothing recognisable to explain.
export function explainTempo(raw) {
  const s = (raw || "").toString();
  const m = s.match(/(?:^|[^\d.])([\dxX])\s*[-–.]\s*([\dxX])\s*[-–.]\s*([\dxX])(?:\s*[-–.]\s*([\dxX]))?/);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].filter(v => v !== undefined);
  const words = parts.map((p, i) => phrase(p, i)).filter(Boolean);
  if (words.length < 3) return null;
  const code = parts.join("-");
  // Anything else the coach wrote ("(accum) / smooth (peak)") is kept as a note.
  const rest = s.replace(m[0].replace(/^[^\dxX]/, ""), "").replace(/^[\s/,;]+|[\s/,;]+$/g, "").trim();
  return { code, sentence: words.join(" · "), extra: rest };
}
