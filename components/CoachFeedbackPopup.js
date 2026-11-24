"use client";
import { useState, useEffect, useCallback, Component } from "react";
import { supabase } from "../lib/supabase";
import { markAlertRead, ALERT_KIND, ALERT_PAGE } from "../lib/alerts";
import { AttachmentDisplay } from "./MediaAttachments";

/*
  Coach feedback popup.

  The bell already lists unread feedback, but a red number in the corner is easy to
  ignore - and the feedback is the most valuable thing the coach sends. So when the
  athlete opens the app with unread feedback waiting, it is put in front of them, one
  piece at a time, in full.

  What counts as feedback: video feedback, replies to a note they typed while logging,
  and replies in an exercise thread. Program notes and messages stay in the bell.

  Read state is the same athlete_alerts.read_at the bell uses, so "Got it" here clears
  it there and the coach's read receipt shows it was opened. It also stamps
  video_submissions.feedback_read_at / logs.coach_reply_read_at on the source row.

  "Later" only hides the popup for this visit. Nothing is marked read, the bell keeps
  the count, and the popup comes back next time the app opens.

  The alert body is cut at 400 characters, so the full text (and any attached photos or
  clips) is read from the source row. If that row is gone, the alert body is shown.
*/

const FEEDBACK_KINDS = [ALERT_KIND.VIDEO_FEEDBACK, ALERT_KIND.NOTE_REPLY, ALERT_KIND.EXERCISE_COMMENT];
const SNOOZE_KEY = "t2p-feedback-popup-later";

const LABEL = {
  [ALERT_KIND.VIDEO_FEEDBACK]: "Video feedback",
  [ALERT_KIND.NOTE_REPLY]: "Reply to your note",
  [ALERT_KIND.EXERCISE_COMMENT]: "Reply on your exercise",
};

function snoozedIds() {
  try { return JSON.parse(sessionStorage.getItem(SNOOZE_KEY) || "[]"); } catch { return []; }
}
function snooze(ids) {
  try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify([...new Set([...snoozedIds(), ...ids])])); } catch { /* private mode: popup just returns next load */ }
}

function when(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "Coach feedback on your Goblet Squat" -> "Goblet Squat"
function exerciseFromTitle(title) {
  const m = /(?:on your|about)\s+(.+)$/i.exec(title || "");
  return m ? m[1] : "";
}

async function loadItems(athleteId) {
  const { data: alerts, error } = await supabase.from("athlete_alerts").select("*")
    .eq("athlete_id", athleteId).is("read_at", null).in("kind", FEEDBACK_KINDS)
    .order("created_at", { ascending: true }).limit(20);
  if (error) { console.error("feedback popup: alerts fetch failed", error); return []; }
  if (!alerts?.length) return [];

  const ids = (t) => alerts.filter(a => a.ref_table === t && a.ref_id).map(a => a.ref_id);
  const vidIds = ids("video_submissions");
  const logIds = ids("log_replies");
  const [vRes, lRes] = await Promise.all([
    vidIds.length ? supabase.from("video_submissions").select("*").in("id", vidIds) : { data: [] },
    logIds.length ? supabase.from("logs").select("*").in("id", logIds) : { data: [] },
  ]);
  const vids = new Map((vRes.data || []).map(v => [String(v.id), v]));
  const logs = new Map((lRes.data || []).map(l => [String(l.id), l]));

  return alerts.map(a => {
    const base = {
      alert: a, kind: a.kind, at: a.created_at,
      exercise: exerciseFromTitle(a.title), text: a.body, media: null,
      theirs: null, page: a.link_page, focus: null,
    };
    if (a.ref_table === "video_submissions") {
      const v = vids.get(String(a.ref_id));
      if (v) Object.assign(base, {
        exercise: v.exercise_name || base.exercise,
        text: v.coach_feedback || base.text,
        media: v.coach_feedback_media,
        theirs: v.notes || null,
        at: v.coach_feedback_at || base.at,
      });
      return { ...base, page: ALERT_PAGE.VIDEOS, focus: a.ref_id, source: v ? { table: "video_submissions", id: v.id, col: "feedback_read_at" } : null };
    }
    if (a.ref_table === "log_replies") {
      const l = logs.get(String(a.ref_id));
      if (l) Object.assign(base, {
        exercise: l.exercise_name || base.exercise,
        text: l.coach_reply || base.text,
        media: l.coach_reply_media,
        theirs: l.notes || null,
        at: l.coach_reply_at || base.at,
      });
      return { ...base, page: ALERT_PAGE.PROGRAM, source: l ? { table: "logs", id: l.id, col: "coach_reply_read_at" } : null };
    }
    if (a.ref_table === "exercise_block") return { ...base, page: a.link_page || ALERT_PAGE.PROGRAM, focus: a.ref_id };
    return base;
  });
}

async function markItemRead(item) {
  await markAlertRead(item.alert.id);
  if (item.source) {
    const { error } = await supabase.from(item.source.table)
      .update({ [item.source.col]: new Date().toISOString() })
      .eq("id", item.source.id).is(item.source.col, null);
    if (error) console.error("feedback popup: source read stamp failed", error);
  }
}

function CoachFeedbackPopupInner({ athlete, isMobile, onNavigate, readOnly }) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const athleteId = athlete?.id;

  useEffect(() => {
    // The coach's "View as athlete" preview must not pop this up or mark anything read.
    if (!athleteId || readOnly) return;
    let live = true;
    (async () => {
      const all = await loadItems(athleteId);
      const later = new Set(snoozedIds());
      const fresh = all.filter(i => !later.has(i.alert.id));
      if (!live || !fresh.length) return;
      setItems(fresh); setIdx(0); setOpen(true);
    })();
    return () => { live = false; };
  }, [athleteId, readOnly]);

  const close = useCallback(() => setOpen(false), []);

  const later = () => { snooze(items.slice(idx).map(i => i.alert.id)); close(); };

  const gotIt = async () => {
    if (busy) return;
    setBusy(true);
    await markItemRead(items[idx]);
    setBusy(false);
    if (idx + 1 < items.length) setIdx(idx + 1); else close();
  };

  const view = async () => {
    if (busy) return;
    const item = items[idx];
    setBusy(true);
    await markItemRead(item);
    setBusy(false);
    // Anything still unread waits for the next visit instead of re-opening on top of the page.
    snooze(items.slice(idx + 1).map(i => i.alert.id));
    close();
    if (onNavigate && item.page) onNavigate(item.page, item.focus || null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") later(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open || !items[idx]) return null;
  const item = items[idx];
  const total = items.length;
  const isVideo = item.kind === ALERT_KIND.VIDEO_FEEDBACK;
  const viewLabel = isVideo ? "See my video" : "Open in program";

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Feedback from your coach"
      onClick={later}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(9,9,11,.6)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16, fontFamily: "'DM Sans', sans-serif" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "#fff", width: isMobile ? "100%" : 440, maxWidth: "100%", maxHeight: isMobile ? "88vh" : "85vh", borderRadius: isMobile ? "18px 18px 0 0" : 16, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.35)", color: "#18181B", paddingBottom: isMobile ? "env(safe-area-inset-bottom)" : 0 }}
      >
        {/* Header: dark band with the brand red rule, like the app's sidebar */}
        <div style={{ background: "#18181B", color: "#fff", padding: "16px 20px 14px", borderBottom: "3px solid #DC2626", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontFamily: "'Bebas Neue', 'DM Sans', sans-serif", fontSize: 24, letterSpacing: "0.06em", lineHeight: 1 }}>
              FROM YOUR <span style={{ color: "#DC2626" }}>COACH</span>
            </div>
            <button onClick={later} aria-label="Close" style={{ background: "none", border: "none", color: "#A1A1AA", fontSize: 20, cursor: "pointer", padding: 2, lineHeight: 1 }}>{"✕"}</button>
          </div>
          <div style={{ fontSize: 12, color: "#A1A1AA", marginTop: 6 }}>
            {total === 1 ? "You have new feedback." : `You have ${total} new pieces of feedback.`}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 20px 6px", overflowY: "auto", WebkitOverflowScrolling: "touch", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ background: isVideo ? "#F0FDF4" : "#EFF6FF", color: isVideo ? "#16A34A" : "#1E40AF", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, padding: "3px 9px", borderRadius: 999 }}>
              {isVideo ? "\u{1F3A5} " : "\u{1F4AC} "}{LABEL[item.kind] || "Feedback"}
            </span>
            <span style={{ fontSize: 12, color: "#A1A1AA" }}>{when(item.at)}</span>
          </div>
          {item.exercise && <div style={{ fontSize: 20, fontWeight: 700, marginTop: 10, lineHeight: 1.25 }}>{item.exercise}</div>}

          {item.theirs && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#F4F4F5", borderRadius: 8, fontSize: 13, color: "#52525B" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#A1A1AA", marginBottom: 2 }}>You wrote</div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.theirs}</div>
            </div>
          )}

          <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: "3px solid #DC2626" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#DC2626", marginBottom: 4 }}>Coach</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.text}</div>
            <AttachmentDisplay media={item.media} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 20px 18px", flexShrink: 0 }}>
          {total > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 12 }} aria-label={`${idx + 1} of ${total}`}>
              {items.map((_, i) => (
                <span key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, background: i === idx ? "#DC2626" : i < idx ? "#71717A" : "#E4E4E7", transition: "width .2s" }} />
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={view} disabled={busy} style={{ flex: 1, padding: "12px 10px", borderRadius: 10, border: "1px solid #E4E4E7", background: "#fff", color: "#18181B", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {viewLabel}
            </button>
            <button onClick={gotIt} disabled={busy} style={{ flex: 1, padding: "12px 10px", borderRadius: 10, border: "none", background: "#18181B", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
              {idx + 1 < total ? `Got it · Next (${idx + 1}/${total})` : "Got it"}
            </button>
          </div>
          <button onClick={later} style={{ display: "block", margin: "10px auto 0", background: "none", border: "none", color: "#71717A", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Read later
          </button>
        </div>
      </div>
    </div>
  );
}

// A fault here must never cost the athlete their program (same rule as the bell).
class CoachFeedbackPopup extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error("CoachFeedbackPopup crashed", error, info); }
  render() {
    if (this.state.failed) return null;
    return <CoachFeedbackPopupInner {...this.props} />;
  }
}

export default CoachFeedbackPopup;
