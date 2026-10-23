"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { Card, EmptyState } from "./ui";
import VideoPlayer, { MediaLink } from "./VideoPlayer";
import VideoFeedbackModal from "./VideoFeedbackModal";
import { raiseAlertReplacing, ALERT_KIND, ALERT_PAGE } from "../lib/alerts";
import { fetchCues } from "../lib/cues";
import { supabase } from "../lib/supabase";

/*
  Coach video review queue.

  Athlete videos used to live in one place only: a card near the bottom of each
  athlete's profile, below every baseline table. The bell's "View" dropped the coach
  at the top of that profile, and the program's exercise card - where a coach
  naturally goes looking for "his trap bar deadlift from today" - showed nothing.
  Videos were saved and invisible.

  This is the single place every submission lands, newest and unreviewed first, with
  the clip playing inline and feedback one tap away.
*/
const COACH_ID = "coach";

const STATUS = {
  pending: { label: "To review", color: "#F97316", bg: "#FFF7ED" },
  reviewed: { label: "Reviewed ✓", color: "#16A34A", bg: "#F0FDF4" },
  "needs-work": { label: "Needs work", color: "#DC2626", bg: "#FEF2F2" },
};

export function isAwaitingReview(v) {
  return (v.status || "pending") === "pending" && !(v.coach_feedback || "").trim();
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

// Clears the bell entry for this video, so reviewing it here and dismissing it there
// are the same act.
async function markBellRead(videoId) {
  const { error } = await supabase.from("coach_alert_reads")
    .upsert({ coach_id: COACH_ID, source_table: "video_submissions", source_id: String(videoId) }, { onConflict: "coach_id,source_table,source_id" });
  if (error) console.error("video review: bell dismiss failed", error);
}

export default function VideoReview({ videoSubs, athletes, programs, updateVideoSub, isMobile, focusTarget, onFocusClear, onOpenAthlete }) {
  const [filter, setFilter] = useState("todo"); // todo | all
  const [athleteFilter, setAthleteFilter] = useState("");
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [cuesByVideo, setCuesByVideo] = useState({});
  const [glow, setGlow] = useState(null);
  const focusRef = useRef(null);

  const nameOf = (id) => (athletes || []).find(a => a.id === id)?.name || "Athlete";

  const all = videoSubs || [];
  const todoCount = all.filter(isAwaitingReview).length;

  const shown = useMemo(() => {
    let list = all;
    if (filter === "todo") list = list.filter(isAwaitingReview);
    if (athleteFilter) list = list.filter(v => v.athlete_id === athleteFilter);
    return [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [all, filter, athleteFilter]);

  // Athletes who have ever sent a video, for the filter.
  const senders = useMemo(() => {
    const ids = Array.from(new Set(all.map(v => v.athlete_id)));
    return ids.map(id => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [all, athletes]);

  // Cues for every athlete with a video on screen, keyed by the video they came from.
  const reloadCues = async (athleteIds) => {
    const rows = (await Promise.all(athleteIds.map(id => fetchCues(id)))).flat();
    const m = {};
    rows.forEach(c => { if (c.source_video_id) m[c.source_video_id] = c; });
    setCuesByVideo(prev => ({ ...prev, ...m }));
  };
  const shownAthleteKey = Array.from(new Set(shown.map(v => v.athlete_id))).sort().join(",");
  useEffect(() => {
    if (!shownAthleteKey) return;
    reloadCues(shownAthleteKey.split(","));
  }, [shownAthleteKey]);

  // Arriving from the bell, a push notification or an exercise card: show that video.
  useEffect(() => {
    const id = focusTarget?.videoId;
    if (!id) return;
    const v = all.find(x => String(x.id) === String(id));
    if (v && !isAwaitingReview(v)) setFilter("all");
    setGlow(String(id));
    markBellRead(id);
    const t1 = setTimeout(() => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    const t2 = setTimeout(() => { setGlow(null); if (onFocusClear) onFocusClear(); }, 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [focusTarget?.videoId, all.length]);

  const saveFeedback = async (v, fb) => {
    await updateVideoSub(v.id, { coach_feedback: fb, status: "reviewed" });
    markBellRead(v.id);
    const alert_ = await raiseAlertReplacing({
      athleteId: v.athlete_id,
      kind: ALERT_KIND.VIDEO_FEEDBACK,
      title: `Coach feedback on your ${v.exercise_name || "video"}`,
      body: fb,
      refTable: "video_submissions",
      refId: v.id,
      linkPage: ALERT_PAGE.VIDEOS,
    });
    if (!alert_) window.alert("Feedback saved, but the notification to the athlete could not be sent. They will not see a bell for it.");
  };

  const setStatus = async (v, status) => {
    await updateVideoSub(v.id, { status });
    markBellRead(v.id);
  };

  const chip = (active) => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    border: `1px solid ${active ? "#18181B" : "#E4E4E7"}`, background: active ? "#18181B" : "#fff", color: active ? "#fff" : "#52525B",
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28 }}>Videos</h1>
          <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>
            {todoCount === 0 ? "Nothing waiting for review." : `${todoCount} waiting for review`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setFilter("todo")} style={chip(filter === "todo")}>To review{todoCount ? ` (${todoCount})` : ""}</button>
          <button onClick={() => setFilter("all")} style={chip(filter === "all")}>All ({all.length})</button>
          <select value={athleteFilter} onChange={e => setAthleteFilter(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #E4E4E7", borderRadius: 999, fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
            <option value="">All athletes</option>
            {senders.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon="▶" title={filter === "todo" ? "All caught up" : "No videos yet"} sub={filter === "todo" ? "Every submitted video has been reviewed." : "Videos athletes film from their sessions will land here."} />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {shown.map(v => {
            const st = STATUS[v.status] || STATUS.pending;
            const focused = glow === String(v.id);
            const session = [v.week_label ? v.week_label.split(/[·—]/)[0].trim() : "", v.day_label].filter(Boolean).join(" · ");
            const cue = cuesByVideo[v.id];
            return (
              <div key={v.id} ref={focused ? focusRef : null}>
                <Card style={{ padding: isMobile ? 14 : 18, border: focused ? "2px solid #2563EB" : "1px solid #E4E4E7", boxShadow: focused ? "0 0 0 4px #DBEAFE" : "none", transition: "box-shadow .3s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#2563EB", cursor: onOpenAthlete ? "pointer" : "default" }} onClick={() => onOpenAthlete && onOpenAthlete(v.athlete_id)}>
                        {v.athlete_name || nameOf(v.athlete_id)}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 17, marginTop: 1 }}>{v.exercise_name || "Movement video"}</div>
                      <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
                        {session ? `${session} · ` : ""}{timeAgo(v.created_at)}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: st.color, background: st.bg, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>{st.label}</span>
                  </div>

                  {v.notes && <div style={{ fontSize: 13, color: "#1E3A8A", marginTop: 8, padding: "6px 10px", background: "#EFF6FF", borderRadius: 6 }}><b>Asked:</b> {v.notes}</div>}

                  {/* Unreviewed clips play right here; reviewed ones stay folded behind Watch
                      so a long history does not load dozens of videos at once. */}
                  {isAwaitingReview(v) || focused ? (
                    <VideoPlayer url={v.video_url} title={v.exercise_name} wide={isMobile} />
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <MediaLink url={v.video_url} title={v.exercise_name} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#fff", background: "#2563EB", fontWeight: 700, padding: "5px 12px", borderRadius: 999 }}>▶ Watch</MediaLink>
                    </div>
                  )}

                  <div style={{ marginTop: 10 }}>
                    {v.coach_feedback ? (
                      <div style={{ padding: "8px 12px", background: "#F0FDF4", borderRadius: 6, border: "1px solid #4ADE80" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Your feedback</div>
                        <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{v.coach_feedback}</div>
                        {cue && (
                          <div style={{ marginTop: 8, padding: "6px 10px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 6 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: 0.5 }}>Cue on future sessions</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#78350F", marginTop: 2, whiteSpace: "pre-wrap" }}>{cue.cue}</div>
                          </div>
                        )}
                        <button onClick={() => setFeedbackFor(v)} style={{ fontSize: 12, color: "#16A34A", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", marginTop: 4, fontWeight: 700, padding: 0 }}>{cue ? "Edit feedback or cue" : "Edit feedback · add cue"}</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => setFeedbackFor(v)} style={{ padding: "8px 14px", background: "#18181B", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add feedback</button>
                        {v.status !== "reviewed" && <button onClick={() => setStatus(v, "reviewed")} style={{ padding: "8px 12px", background: "#F0FDF4", color: "#16A34A", border: "1px solid #4ADE80", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Mark reviewed</button>}
                        {v.status !== "needs-work" && <button onClick={() => setStatus(v, "needs-work")} style={{ padding: "8px 12px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FCA5A5", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Needs work</button>}
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
        video={feedbackFor}
        programs={feedbackFor ? (programs || []).filter(p => p.athlete_id === feedbackFor.athlete_id) : []}
        athleteName={feedbackFor ? (feedbackFor.athlete_name || nameOf(feedbackFor.athlete_id)) : ""}
        onSaveFeedback={async (text) => { if (feedbackFor) await saveFeedback(feedbackFor, text); }}
        onCueChanged={() => { if (feedbackFor) reloadCues([feedbackFor.athlete_id]); }}
        onClose={() => setFeedbackFor(null)}
      />
    </div>
  );
}
