/*
  Tempo, in words.

  "3-0-1 (accum) / smooth (peak)" is coach shorthand. A 14-year-old reads it as three
  numbers and moves on. This turns the first tempo it finds into the sentence the coach
  would say out loud, and leaves whatever else was written (phase notes, "smooth") alone.

  Convention used across T2P programs (3-digit in-app, 4-digit in the PDF/xlsx):
    1st = lowering (eccentric)
    2nd = pause at the bottom
    3rd = lifting (concentric)
    4th = pause at the top (optional)
  "X" means as fast as possible - explode.
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

// Returns null when there is nothing recognisable to explain.
export function explainTempo(raw) {
  const s = (raw || "").toString();
  const m = s.match(/(?:^|[^\d])([\dxX])\s*[-–.]\s*([\dxX])\s*[-–.]\s*([\dxX])(?:\s*[-–.]\s*([\dxX]))?/);
  if (!m) return null;
  const parts = [m[1], m[2], m[3], m[4]].filter(v => v !== undefined);
  const words = parts.map((p, i) => phrase(p, i)).filter(Boolean);
  if (words.length < 3) return null;
  const code = parts.join("-");
  // Anything else the coach wrote ("(accum) / smooth (peak)") is kept as a note.
  const rest = s.replace(m[0].replace(/^[^\dxX]/, ""), "").replace(/^[\s/,;]+|[\s/,;]+$/g, "").trim();
  return { code, sentence: words.join(" · "), extra: rest };
}
