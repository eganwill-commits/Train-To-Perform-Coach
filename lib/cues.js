import { supabase } from "./supabase";

/*
  Coach cues: the short, mid-set version of video feedback, carried forward.

  Video feedback is anchored to the one block the athlete filmed. The next time he does
  that lift the fix is nowhere on the card, so it only lands if he remembers it. A cue
  is attached to exercises, not to a session, so it appears on every later session of
  that movement until the coach changes or removes it.

  A cue can name several exercises. That is how it follows a movement that has been
  swapped in the program: feedback on Chest-Supported DB Row also applies to the Single
  Arm DB Row that replaced it.
*/

export async function fetchCues(athleteId) {
  if (!athleteId) return [];
  const { data, error } = await supabase
    .from("exercise_cues")
    .select("*")
    .eq("athlete_id", athleteId)
    .eq("active", true)
    .order("updated_at", { ascending: false });
  if (error) { console.error("fetchCues failed", error); return []; }
  return data || [];
}

export async function fetchCueForVideo(videoId) {
  if (!videoId) return null;
  const { data, error } = await supabase
    .from("exercise_cues")
    .select("*")
    .eq("source_video_id", videoId)
    .maybeSingle();
  if (error) { console.error("fetchCueForVideo failed", error); return null; }
  return data || null;
}

/*
  One cue per video. Saving again for the same video replaces it, so editing the cue
  never leaves an old version showing alongside the new one.
  Throws on failure so the editor can keep the text on screen.
*/
export async function saveCueForVideo({ athleteId, video, cue, exercises }) {
  const text = (cue || "").trim();
  if (!text) throw new Error("Cue is empty");
  const list = (exercises || []).filter(e => e && (e.id || e.name));
  if (!list.length) throw new Error("Pick at least one exercise");
  const row = {
    athlete_id: athleteId,
    exercise_ids: list.map(e => e.id).filter(Boolean),
    exercise_names: list.map(e => e.name).filter(Boolean),
    cue: text,
    source_video_id: video?.id || null,
    source_block_id: video?.block_id || null,
    source_label: sourceLabel(video),
    active: true,
    updated_at: new Date().toISOString(),
  };
  const existing = video?.id ? await fetchCueForVideo(video.id) : null;
  const q = existing
    ? supabase.from("exercise_cues").update(row).eq("id", existing.id).select().single()
    : supabase.from("exercise_cues").insert(row).select().single();
  const { data, error } = await q;
  if (error) { console.error("saveCueForVideo failed", error, row); throw error; }
  return data;
}

export async function removeCue(id) {
  if (!id) return;
  const { error } = await supabase
    .from("exercise_cues")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) { console.error("removeCue failed", error); throw error; }
}

export function sourceLabel(video) {
  if (!video) return null;
  const wk = video.week_label ? video.week_label.split(/[·—]/)[0].trim() : "";
  // Day labels run long ("Upper · Bench + Rows + Skill · Tue"); keep just the weekday.
  const tail = video.day_label ? video.day_label.split("·").pop().trim() : "";
  const day = tail && tail.length <= 4 ? tail : "";
  return [wk, day].filter(Boolean).join(" ") || null;
}

const norm = (s) => String(s || "").trim().toLowerCase();

// Does this cue belong on this exercise card? Library id, or the same exercise name
// (covers blocks that were never linked to the library).
export function cueMatchesBlock(cue, block, displayName) {
  if (!cue || !block) return false;
  if (block.exerciseId && (cue.exercise_ids || []).includes(block.exerciseId)) return true;
  const names = (cue.exercise_names || []).map(norm);
  return names.includes(norm(block.exerciseName)) || (!!displayName && names.includes(norm(displayName)));
}

export function cuesForBlock(cues, block, displayName) {
  return (cues || []).filter(c => cueMatchesBlock(c, block, displayName) && c.source_block_id !== block.id);
}

/*
  Every distinct exercise in the athlete's programs, in program order, with where it
  first and last appears. This is the list the coach picks from when deciding which
  exercises a cue follows.
*/
export function programExercises(programs) {
  const seen = new Map();
  (programs || []).forEach(p => {
    (p.weeks || []).forEach((w, wi) => {
      (w.days || []).forEach(d => {
        (d.blocks || []).forEach(b => {
          const name = (b.exerciseName || "").trim();
          if (!name) return;
          const key = b.exerciseId || `name:${norm(name)}`;
          const wk = (w.label || `Week ${wi + 1}`).split(/[·—]/)[0].trim();
          if (!seen.has(key)) {
            seen.set(key, { id: b.exerciseId || null, name, category: b.category || "", firstWeek: wk, lastWeek: wk, count: 1 });
          } else {
            const e = seen.get(key);
            e.lastWeek = wk; e.count += 1;
          }
        });
      });
    });
  });
  return [...seen.values()];
}

export function findBlock(programs, blockId) {
  if (!blockId) return null;
  for (const p of programs || []) for (const w of p.weeks || []) for (const d of w.days || []) for (const b of d.blocks || []) {
    if (b.id === blockId) return b;
  }
  return null;
}

/*
  Asks the T2P Assistant for a one-to-two line cue and for which exercises it applies
  to. Never throws: if the suggestion fails, the coach still gets an editable box
  pre-filled from the feedback itself.
*/
export async function suggestCue({ feedback, exerciseName, candidates }) {
  try {
    const res = await fetch("/api/cue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feedback,
        exerciseName,
        candidates: (candidates || []).map(c => ({ key: c.id || `name:${c.name}`, name: c.name, category: c.category, weeks: c.firstWeek === c.lastWeek ? c.firstWeek : `${c.firstWeek} to ${c.lastWeek}` })),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.cue) throw new Error(data.error || `HTTP ${res.status}`);
    return { cue: data.cue, appliesTo: Array.isArray(data.applies_to) ? data.applies_to : [], ai: true };
  } catch (e) {
    console.error("suggestCue failed", e);
    return { cue: fallbackCue(feedback), appliesTo: [], ai: false };
  }
}

// First sentence or two that read like an instruction, trimmed to something glanceable.
function fallbackCue(feedback) {
  const sentences = String(feedback || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);
  const praise = /^(good|great|solid|nice|awesome|love|well done)/i;
  const picked = sentences.filter(s => !praise.test(s)).slice(0, 2).join(" ");
  return (picked || sentences.slice(0, 2).join(" ")).slice(0, 200);
}
