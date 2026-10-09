/*
  Circuits and supersets.

  Every block is its own card, so "2 x 6/side" on each of six warm-up drills reads as
  "do both sets of this, then move on" - the opposite of a warm-up circuit, and it doubles
  the time between drills. The same trap sits on every pair (Box Jump + Med Ball Pass,
  Split Squat + Hamstring Curl): run literally, the athlete rests between sets of the same
  exercise instead of alternating.

  A block opts into a group with two optional fields:
    group:     any string; CONSECUTIVE blocks with the same value form one group
    groupType: "circuit"  -> one set of each in order, then repeat for the rounds
               "superset" -> alternate the exercises, rest after each pair
  Blocks without `group` are untouched, so every existing program renders as before.
*/

export const GROUP_TYPES = [
  { value: "", label: "No grouping" },
  { value: "circuit", label: "Circuit (1 set of each, repeat)" },
  { value: "superset", label: "Superset / pair (alternate)" },
];

function sameGroup(a, b) {
  return !!(a && b && a.group && b.group && a.group === b.group && (a.groupType || "circuit") === (b.groupType || "circuit"));
}

// The run of blocks around index i that share its group: { start, end } (inclusive), or null.
export function groupSpan(blocks, i) {
  const list = blocks || [];
  const b = list[i];
  if (!b || !b.group) return null;
  let start = i, end = i;
  while (start > 0 && sameGroup(list[start - 1], b)) start--;
  while (end < list.length - 1 && sameGroup(list[end + 1], b)) end++;
  if (end === start) return null; // a group of one is not a group
  return { start, end };
}

function firstNumber(v) {
  const m = String(v || "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

// Header text shown above the first block of a group, or null for every other block.
export function groupHeader(blocks, i) {
  const span = groupSpan(blocks, i);
  if (!span || span.start !== i) return null;
  const list = blocks.slice(span.start, span.end + 1);
  const n = list.length;
  const type = list[0].groupType || "circuit";
  // "1-2" (a review week) stays a range rather than collapsing to "1 round".
  const range = list.map(b => String(b.sets || "")).find(v => /^\s*\d+\s*-\s*\d+\s*$/.test(v));
  const rounds = Math.max(...list.map(b => firstNumber(b.sets) || 1));
  const roundsTxt = range ? `${range.replace(/\s/g, "")} rounds` : `${rounds} ${rounds === 1 ? "round" : "rounds"}`;
  if (type === "superset") {
    const restSecs = firstNumber(list[list.length - 1].rest);
    const restTxt = restSecs ? (restSecs >= 60 ? `${Math.floor(restSecs / 60)}:${String(restSecs % 60).padStart(2, "0")}` : `${restSecs}s`) : null;
    return {
      type,
      title: `Superset: ${n} exercises, ${roundsTxt}`,
      how: restTxt
        ? `Alternate: one set of each, then rest ${restTxt}. Don't finish all the sets of the first one before starting the next.`
        : "Alternate: one set of each with no rest between, then a short breather. Don't finish all the sets of the first one before starting the next.",
    };
  }
  return {
    type,
    title: `Circuit: ${n} exercises, ${roundsTxt}`,
    how: "One set of each, in order, then go round again. Don't do all the sets of one before moving on.",
  };
}

// Short tag for a card inside a group, e.g. "Circuit 2/6", or null.
export function groupTag(blocks, i) {
  const span = groupSpan(blocks, i);
  if (!span) return null;
  const type = (blocks[i].groupType || "circuit") === "superset" ? "Superset" : "Circuit";
  return `${type} ${i - span.start + 1}/${span.end - span.start + 1}`;
}

export function isInGroup(blocks, i) {
  return !!groupSpan(blocks, i);
}
