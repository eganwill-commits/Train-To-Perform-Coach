"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Card, EmptyState } from "./ui";
import VideoPlayer, { MediaLink } from "./VideoPlayer";
import VideoFeedbackModal from "./VideoFeedbackModal";
import { raiseAlertReplacing, ALERT_KIND, ALERT_PAGE } from "../lib/alerts";
import { fetchCues } from "../lib/cues";
import { supabase } from "../lib/supabase";
import { canExport, exportForReview } from "../lib/media";
import { AttachmentDisplay } from "./MediaAttachments";
import { withMedia, mediaSummary, mediaList } from "../lib/feedbackMedia";
import { explainTempo } from "../lib/tempo";
import { effortText } from "../lib/logging";

/*
  Coach video review queue.

  Athlete videos used to live in one place only: a card near the bottom of each
  athlete's profile, below every baseline table. The bell's "View" dropped the coach
  at the top of that profile, and the program's exercise card showed nothing.

  Athletes film one clip per set, so a single exercise often arrives as two or three
  clips. Reviewing them one by one meant feedback landed on one clip while its
  siblings still said "Add feedback", and the coach could not tell what was done.
  Clips are now grouped into one review: same athlete, same exercise in the program,
  same day. Feedback is written once, on the group, and every clip in it is marked
  reviewed.
*/
const COACH_ID = "coach";

const STATUS = {
  pending: { label: "To review", color: "#F97316", bg: "#FFF7ED" },
  reviewed: { label: "Feedback added ✓", color: "#16A34A", bg: "#F0FDF4" },
  "reviewed-silent": { label: "Reviewed ✓", color: "#16A34A", bg: "#F0FDF4" },
  "needs-work": { label: "Needs work", color: "#DC2626", bg: "#FEF2F2" },
};

// Photo-only feedback (a marked-up frame, no text) counts as feedback too.
const hasFeedback = (v) => !!(v.coach_feedback || "").trim() || mediaList(v.coach_feedback_media).length > 0;

// Single clip still untouched. Kept for callers that work clip by clip.
export function isAwaitingReview(v) {
  return (v.status || "pending") === "pending" && !hasFeedback(v);
}

// The local calendar day a clip was sent, so a session filmed in the evening does not
// split across UTC midnight.
function localDay(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function reviewGroupKey(v) {
  return [v.athlete_id, v.block_id || `name:${(v.exercise_name || "").trim().toLowerCase()}`, localDay(v.created_at)].join("|");
}

/*
  Clips grouped into reviews, newest first. A group is waiting only when nothing in it
  has been touched: one piece of feedback, or a Mark reviewed, covers the whole set.
*/
export function groupVideos(videoSubs) {
  const map = new Map();
  (videoSubs || []).forEach(v => {
    const k = reviewGroupKey(v);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(v);
  });
  return Array.from(map.entries()).map(([key, clips]) => {
    // Filming order: first set is Clip 1.
    clips.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const withFeedback = clips.filter(hasFeedback);
    // The clip feedback is stored on: the one that already has it, else the first clip.
    const lead = withFeedback[withFeedback.length - 1] || clips[0];
    const latest = clips[clips.length - 1];
    let state;
    if (withFeedback.length) state = "reviewed";
    else if (clips.some(c => c.status === "needs-work")) state = "needs-work";
    else if (clips.some(c => c.status === "reviewed")) state = "reviewed-silent";
    else state = "pending";
    return { key, clips, lead, latest, state, waiting: state === "pending" };
  }).sort((a, b) => String(b.latest.created_at).localeCompare(String(a.latest.created_at)));
}

export function pendingReviewCount(videoSubs) {
  return groupVideos(videoSubs).filter(g => g.waiting).length;
}

const normName = (s) => (s || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

// The prescribed block a clip was filmed from, with the program, week and day around it.
function findPrescription(programs, v) {
  if (!v?.block_id) return null;
  for (const p of programs || []) {
    if (p.athlete_id && p.athlete_id !== v.athlete_id) continue;
    for (const w of p.weeks || []) for (const d of w.days || []) for (const b of d.blocks || []) {
      if (b.id === v.block_id) return { program: p, week: w, day: d, block: b };
    }
  }
  return null;
}

// What the athlete logged for this exercise in that session, if anything.
function findLogged(logs, v, rx) {
  const wl = rx?.week?.label || v.week_label;
  const dl = rx?.day?.label || v.day_label;
  const exId = rx?.block?.exerciseId;
  const names = [v.exercise_name, rx?.block?.exerciseName].filter(Boolean).map(normName);
  return (logs || []).find(l =>
    l.athlete_id === v.athlete_id && l.week_label === wl && l.day_label === dl &&
    ((exId && l.exercise_id === exId) || names.includes(normName(l.exercise_name)))
  ) || null;
}

function ProgramPanel({ rx, logged }) {
  if (!rx) {
    return <div style={{ marginTop: 10, fontSize: 12, color: "#A1A1AA" }}>Not linked to a program session, so there is no prescription to show.</div>;
  }
  const b = rx.block;
  const t = explainTempo(b.tempo);
  const line = [b.sets && b.reps ? `${b.sets} × ${b.reps}` : b.sets ? `${b.sets} sets` : b.reps ? `${b.reps} reps` : null, b.load ? `@ ${b.load}` : null].filter(Boolean).join(" ");
  const cell = (label, value) => value ? (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: "#71717A", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#18181B", wordBreak: "break-word" }}>{value}</div>
    </div>
  ) : null;
  const loggedLine = logged ? [
    logged.sets && logged.reps ? `${logged.sets} × ${logged.reps}` : logged.reps || logged.sets || null,
    logged.load ? `@ ${logged.load}` : null,
    effortText(logged) || null,
  ].filter(Boolean).join("  ·  ") : "";
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Programmed · {rx.week.label.split(/[·—]/)[0].trim()} · {rx.day.label}
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
        {cell("SETS", b.sets)}
        {cell("REPS", b.reps)}
        {cell("LOAD", b.load)}
        {cell("TEMPO", b.tempo)}
        {cell("REST", b.rest ? `${b.rest}${/^\d+$/.test(String(b.rest)) ? "s" : ""}` : "")}
      </div>
      {!line && !b.tempo && !b.rest && <div style={{ fontSize: 12, color: "#71717A", marginTop: 4 }}>No sets, reps or load written on this block.</div>}
      {t && <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>Tempo: {t.sentence}{t.extra ? ` (${t.extra})` : ""}</div>}
      {b.cue && <div style={{ fontSize: 12, color: "#1E3A8A", marginTop: 6 }}><b>Athlete cue:</b> {b.cue}</div>}
      {b.notes && <div style={{ fontSize: 12, color: "#52525B", marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{b.notes}</div>}
      {b.coachNote && <div style={{ fontSize: 12, color: "#92400E", marginTop: 6, padding: "4px 8px", background: "#FFFBEB", borderRadius: 6, whiteSpace: "pre-wrap" }}><b>Your note:</b> {b.coachNote}</div>}
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #E2E8F0", fontSize: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#15803D", textTransform: "uppercase", letterSpacing: 0.5 }}>Logged </span>
        {logged ? (
          <>
            <span style={{ fontWeight: 700, color: "#18181B" }}>{loggedLine || "Logged, no numbers entered"}</span>
            {(logged.notes || "").trim() && <div style={{ color: "#52525B", marginTop: 3, fontStyle: "italic" }}>"{logged.notes.trim()}"</div>}
          </>
        ) : <span style={{ color: "#A1A1AA" }}>Nothing logged for this exercise yet</span>}
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Clears the bell entries for these clips, so reviewing here and dismissing there are
// the same act.
async function markBellRead(videoIds) {
  const rows = videoIds.map(id => ({ coach_id: COACH_ID, source_table: "video_submissions", source_id: String(id) }));
  if (!rows.length) return;
  const { error } = await supabase.from("coach_alert_reads").upsert(rows, { onConflict: "coach_id,source_table,source_id" });
  if (error) console.error("video review: bell dismiss failed", error);
}

export default function VideoReview({ videoSubs, athletes, programs, logs, updateVideoSub, isMobile, focusTarget, onFocusClear, onOpenAthlete }) {
  const [filter, setFilter] = useState("todo"); // todo | all
  const [athleteFilter, setAthleteFilter] = useState("");
  const [feedbackFor, setFeedbackFor] = useState(null); // review group
  const [cuesByVideo, setCuesByVideo] = useState({});
  const [glow, setGlow] = useState(null); // group key
  const [saveState, setSaveState] = useState({}); // clip id -> busy | done | error
  const [justSaved, setJustSaved] = useState(null); // group key, for the confirmation flash
  const focusRef = useRef(null);

  const nameOf = (id) => (athletes || []).find(a => a.id === id)?.name || "Athlete";

  const all = videoSubs || [];
  const groups = useMemo(() => groupVideos(all), [all]);
  const todoCount = groups.filter(g => g.waiting).length;

  const shown = useMemo(() => {
    let list = groups;
    // Keep a just-reviewed group on screen briefly so the coach sees it flip to done.
    if (filter === "todo") list = list.filter(g => g.waiting || g.key === justSaved || g.key === glow);
    if (athleteFilter) list = list.filter(g => g.lead.athlete_id === athleteFilter);
    return list;
  }, [groups, filter, athleteFilter, justSaved, glow]);

  const senders = useMemo(() => {
    const ids = Array.from(new Set(all.map(v => v.athlete_id)));
    return ids.map(id => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [all, athletes]);

  const reloadCues = async (athleteIds) => {
    const rows = (await Promise.all(athleteIds.map(id => fetchCues(id)))).flat();
    const m = {};
    rows.forEach(c => { if (c.source_video_id) m[c.source_video_id] = c; });
    setCuesByVideo(prev => ({ ...prev, ...m }));
  };
  const shownAthleteKey = Array.from(new Set(shown.map(g => g.lead.athlete_id))).sort().join(",");
  useEffect(() => {
    if (!shownAthleteKey) return;
    reloadCues(shownAthleteKey.split(","));
  }, [shownAthleteKey]);

  // Arriving from the bell, a push notification or an exercise card: show that clip's review.
  useEffect(() => {
    const id = focusTarget?.videoId;
    if (!id) return;
    const g = groups.find(x => x.clips.some(c => String(c.id) === String(id)));
    if (!g) return;
    if (!g.waiting) setFilter("all");
    setGlow(g.key);
    markBellRead(g.clips.map(c => c.id));
    const t1 = setTimeout(() => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    const t2 = setTimeout(() => { setGlow(null); if (onFocusClear) onFocusClear(); }, 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [focusTarget?.videoId, groups.length]);

  const flashSaved = (key) => {
    setJustSaved(key);
    setTimeout(() => setJustSaved(k => (k === key ? null : k)), 4000);
  };

  // Feedback goes on the lead clip (one alert to the athlete), and every other clip in
  // the set is marked reviewed so nothing in the group still reads "Add feedback".
  const saveFeedback = async (g, fb, media) => {
    const v = g.lead;
    const res = await updateVideoSub(v.id, withMedia({ coach_feedback: fb, status: "reviewed" }, "coach_feedback_media", media, v.coach_feedback_media));
    if (res?.error) throw res.error;
    await Promise.all(g.clips.filter(c => c.id !== v.id && c.status !== "reviewed").map(c => updateVideoSub(c.id, { status: "reviewed" })));
    markBellRead(g.clips.map(c => c.id));
    flashSaved(g.key);
    const alert_ = await raiseAlertReplacing({
      athleteId: v.athlete_id,
      kind: ALERT_KIND.VIDEO_FEEDBACK,
      title: `Coach feedback on your ${v.exercise_name || "video"}`,
      body: fb || `Sent ${mediaSummary(media)}`,
      refTable: "video_submissions",
      refId: v.id,
      linkPage: ALERT_PAGE.VIDEOS,
    });
    if (!alert_) window.alert("Feedback saved, but the notification to the athlete could not be sent. They will not see a bell for it.");
  };

  const setGroupStatus = async (g, status) => {
    await Promise.all(g.clips.map(c => updateVideoSub(c.id, { status })));
    markBellRead(g.clips.map(c => c.id));
    flashSaved(g.key);
  };

  const saveClip = async (v) => {
    setSaveState(s => ({ ...s, [v.id]: "busy" }));
    try {
      await exportForReview(v, v.athlete_name || nameOf(v.athlete_id));
      setSaveState(s => ({ ...s, [v.id]: "done" }));
      setTimeout(() => setSaveState(s => ({ ...s, [v.id]: undefined })), 4000);
    } catch (e) {
      console.error("save clip failed", e);
      setSaveState(s => ({ ...s, [v.id]: "error" }));
    }
  };

  const chip = (active) => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${active ? "#18181B" : "#E4E4E7"}`, background: active ? "#18181B" : "#fff", color: active ? "#fff" : "#52525B",
  });
  const pill = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28 }}>Videos</h1>
          <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>
            {todoCount === 0 ? "Nothing waiting for review." : `${todoCount} ${todoCount === 1 ? "exercise" : "exercises"} waiting for review`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setFilter("todo")} style={chip(filter === "todo")}>To review{todoCount ? ` (${todoCount})` : ""}</button>
          <button onClick={() => setFilter("all")} style={chip(filter === "all")}>All ({groups.length})</button>
          <select value={athleteFilter} onChange={e => setAthleteFilter(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #E4E4E7", borderRadius: 999, fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
            <option value="">All athletes</option>
            {senders.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon="▶" title={filter === "todo" ? "All caught up" : "No videos yet"} sub={filter === "todo" ? "Every submitted video has been reviewed. Tap All to see past feedback." : "Videos athletes film from their sessions will land here."} />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {shown.map(g => {
            const v = g.lead;
            const st = STATUS[g.state] || STATUS.pending;
            const focused = glow === g.key;
            const flashed = justSaved === g.key;
            const session = [v.week_label ? v.week_label.split(/[·—]/)[0].trim() : "", v.day_label].filter(Boolean).join(" · ");
            const cue = cuesByVideo[v.id];
            const asked = g.clips.map(c => (c.notes || "").trim()).filter(Boolean);
            const multi = g.clips.length > 1;
            const playInline = g.waiting || focused;
            return (
              <div key={g.key} ref={focused ? focusRef : null}>
                <Card style={{ padding: isMobile ? 14 : 18, border: focused ? "2px solid #2563EB" : flashed ? "2px solid #4ADE80" : "1px solid #E4E4E7", boxShadow: focused ? "0 0 0 4px #DBEAFE" : flashed ? "0 0 0 4px #DCFCE7" : "none", transition: "box-shadow .3s, border .3s", background: g.waiting ? "#fff" : "#FCFCFD" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#2563EB", cursor: onOpenAthlete ? "pointer" : "default" }} onClick={() => onOpenAthlete && onOpenAthlete(v.athlete_id)}>
                        {v.athlete_name || nameOf(v.athlete_id)}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 17, marginTop: 1 }}>
                        {v.exercise_name || "Movement video"}
                        {multi && <span style={{ fontSize: 12, fontWeight: 700, color: "#71717A", marginLeft: 6 }}>{g.clips.length} clips</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
                        {session ? `${session} · ` : ""}{timeAgo(g.latest.created_at)}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: st.color, background: st.bg, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{st.label}</span>
                  </div>

                  <ProgramPanel rx={findPrescription(programs, v)} logged={findLogged(logs, v, findPrescription(programs, v))} />

                  {asked.length > 0 && <div style={{ fontSize: 13, color: "#1E3A8A", marginTop: 8, padding: "6px 10px", background: "#EFF6FF", borderRadius: 6 }}><b>Asked:</b> {asked.join(" · ")}</div>}

                  {/* Every clip in the set. Waiting reviews play inline; done ones stay folded
                      behind Watch so a long history does not load dozens of videos. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                    {g.clips.map((c, i) => (
                      <div key={c.id}>
                        {multi && playInline && <div style={{ fontSize: 11, fontWeight: 800, color: "#52525B", marginTop: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Clip {i + 1}</div>}
                        {playInline ? (
                          <VideoPlayer url={c.video_url} title={`${c.exercise_name || "Video"}${multi ? ` · clip ${i + 1}` : ""}`} wide={isMobile} />
                        ) : null}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: playInline ? 6 : 8 }}>
                          {!playInline && (
                            <MediaLink url={c.video_url} title={`${c.exercise_name || "Video"}${multi ? ` · clip ${i + 1}` : ""}`} style={{ ...pill, color: "#fff", background: "#2563EB" }}>▶ Watch{multi ? ` clip ${i + 1}` : ""}</MediaLink>
                          )}
                          {canExport(c.video_url) && (
                            <button onClick={() => saveClip(c)} disabled={saveState[c.id] === "busy"} style={{ ...pill, background: saveState[c.id] === "done" ? "#F0FDF4" : "#fff", color: saveState[c.id] === "error" ? "#DC2626" : "#18181B", border: `1px solid ${saveState[c.id] === "done" ? "#4ADE80" : saveState[c.id] === "error" ? "#FCA5A5" : "#D4D4D8"}` }}>
                              {saveState[c.id] === "busy" ? "Saving…" : saveState[c.id] === "done" ? "✓ Downloaded" : saveState[c.id] === "error" ? "Save failed - retry" : `⬇ Save${multi ? ` clip ${i + 1}` : " video"}`}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {g.state === "reviewed" ? (
                      <div style={{ padding: "8px 12px", background: "#F0FDF4", borderRadius: 6, border: "1px solid #4ADE80" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>✓ Feedback added{multi ? ` · covers all ${g.clips.length} clips` : ""}</div>
                        <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{v.coach_feedback}</div>
                        <AttachmentDisplay media={v.coach_feedback_media} size={72} />
                        {cue && (
                          <div style={{ marginTop: 8, padding: "6px 10px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5 }}>Cue on future sessions</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#78350F", marginTop: 2, whiteSpace: "pre-wrap" }}>{cue.cue}</div>
                          </div>
                        )}
                        <button onClick={() => setFeedbackFor(g)} style={{ fontSize: 12, color: "#16A34A", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", marginTop: 4, fontWeight: 700, padding: 0 }}>{cue ? "Edit feedback or cue" : "Edit feedback · add cue"}</button>
                      </div>
                    ) : g.state === "pending" ? (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => setFeedbackFor(g)} style={{ padding: "8px 14px", background: "#18181B", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add feedback{multi ? ` (all ${g.clips.length} clips)` : ""}</button>
                        <button onClick={() => setGroupStatus(g, "reviewed")} style={{ padding: "8px 12px", background: "#F0FDF4", color: "#16A34A", border: "1px solid #4ADE80", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Mark reviewed</button>
                        <button onClick={() => setGroupStatus(g, "needs-work")} style={{ padding: "8px 12px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FCA5A5", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Needs work</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: st.color }}>{g.state === "needs-work" ? "Marked needs work, no written feedback" : "Reviewed, no written feedback"}</span>
                        <button onClick={() => setFeedbackFor(g)} style={{ background: "none", border: "none", padding: 0, color: "#2563EB", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Add feedback</button>
                        <button onClick={() => setGroupStatus(g, "pending")} style={{ background: "none", border: "none", padding: 0, color: "#71717A", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Undo</button>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      )}

      <VideoFeedbackModal
        open={!!feedbackFor}
        video={feedbackFor?.lead || null}
        programs={feedbackFor ? (programs || []).filter(p => p.athlete_id === feedbackFor.lead.athlete_id) : []}
        athleteName={feedbackFor ? (feedbackFor.lead.athlete_name || nameOf(feedbackFor.lead.athlete_id)) : ""}
        onSaveFeedback={async (text, media) => { if (feedbackFor) await saveFeedback(feedbackFor, text, media); }}
        onCueChanged={() => { if (feedbackFor) reloadCues([feedbackFor.lead.athlete_id]); }}
        onClose={() => setFeedbackFor(null)}
      />
    </div>
  );
}
