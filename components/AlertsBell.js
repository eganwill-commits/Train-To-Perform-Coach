"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { saveNoteReply } from "../lib/noteReplies";

/*
  Read state lives in `coach_alert_reads`, not localStorage.

  It used to be a single "last checked" timestamp in the browser. That meant hitting
  "Mark all read" buried an athlete note the coach had never actually opened, the list
  only ever looked back 24 hours, and signing in on another device produced a different
  set of alerts. An athlete writing "knee felt off on set 3" deserves better than a
  marker that lives in one browser's storage.

  Now every alert is dismissed individually and durably, keyed by the row it came from.
  LOOKBACK bounds the window so the bell can never surface months of history at once.
*/
const COACH_ID = "coach";
const LOOKBACK_DAYS = 21;

// Stable key for a day's worth of logs, which are alerted as one grouped entry.
const dayKey = (l) => `${l.athlete_id}|${l.week_label || ""}|${l.day_label || ""}`;

export default function AlertsBell({ logs, setLogs, videoSubs, athletes, isMobile, onNavigate }) {
  const [open, setOpen] = useState(false);
  // Set of "<source_table>:<source_id>" the coach has already dismissed.
  const [readKeys, setReadKeys] = useState(() => new Set());
  const [unreadMsgs, setUnreadMsgs] = useState([]);
  const [recentNotes, setRecentNotes] = useState([]);
  // Questions and replies an athlete wrote on an exercise card. These were never in
  // the bell: a comment only surfaced if the coach happened to open that exact card.
  const [athleteComments, setAthleteComments] = useState([]);
  const ref = useRef(null);
  // Inline reply to an exercise note, right in the bell.
  const [replyOpen, setReplyOpen] = useState(null); // log id
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState("");
  // Brief confirmation left in place of a note that was just handled: { [logId]: "replied" | "done" }.
  const [handled, setHandled] = useState({});
  const [showReplied, setShowReplied] = useState(false);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const isRead = (table, id) => readKeys.has(`${table}:${id}`);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const pull = async () => {
      const [msgRes, noteRes, readRes, comRes] = await Promise.all([
        supabase.from("messages").select("*").eq("sender_role", "athlete").is("read_at", null).order("created_at", { ascending: false }).limit(10),
        supabase.from("athlete_notes").select("*").eq("author_role", "athlete").gt("created_at", since).order("created_at", { ascending: false }).limit(30),
        supabase.from("coach_alert_reads").select("source_table,source_id").eq("coach_id", COACH_ID),
        supabase.from("exercise_comments").select("*").eq("author_role", "athlete").is("read_at", null).gt("created_at", since).order("created_at", { ascending: false }).limit(30),
      ]);
      if (comRes.error) console.error("alerts: exercise comments", comRes.error); else setAthleteComments(comRes.data || []);
      if (msgRes.error) console.error("alerts: messages", msgRes.error); else setUnreadMsgs(msgRes.data || []);
      if (noteRes.error) console.error("alerts: notes", noteRes.error); else setRecentNotes(noteRes.data || []);
      if (readRes.error) console.error("alerts: reads", readRes.error);
      else setReadKeys(new Set((readRes.data || []).map(r => `${r.source_table}:${r.source_id}`)));
    };
    pull();
    const iv = setInterval(pull, 15000);
    return () => clearInterval(iv);
  }, [since]);

  // Dismiss one alert, durably. Optimistic so the list responds immediately.
  const dismiss = async (table, id) => {
    setReadKeys(prev => new Set(prev).add(`${table}:${id}`));
    const { error } = await supabase.from("coach_alert_reads")
      .upsert({ coach_id: COACH_ID, source_table: table, source_id: String(id) }, { onConflict: "coach_id,source_table,source_id" });
    if (error) console.error("dismiss alert failed", error);
  };

  const getAthleteName = (id) => (athletes || []).find(a => a.id === id)?.name || "Unknown";
  const getInitials = (name) => {
    const parts = (name || "").trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0]?.[0] || "?").toUpperCase();
  };

  // Within the lookback window and not yet dismissed.
  const newLogs = (logs || []).filter(l => l.logged_at && l.logged_at > since && !isRead("log_day", dayKey(l)));

  /*
    Notes the athlete wrote on an individual exercise inside their workout.

    These used to be invisible here. They were swallowed into the "logged N exercises"
    line, so "I don't like this" or "knee felt off on set 3" read exactly the same as a
    routine session - the coach only found it by opening the day and reading every card.
    A note is the athlete telling you something; it gets its own alert.
  */
  // A note is handled once the coach replies to it (from here or from the program) or
  // marks it as needing no reply. Replied notes used to stay in the bell forever.
  const newLogNotes = (logs || [])
    .filter(l => l.logged_at && l.logged_at > since && (l.notes || "").trim() && ((!(l.coach_reply || "").trim() && !isRead("logs", l.id)) || handled[l.id]))
    .sort((a, b) => String(b.logged_at).localeCompare(String(a.logged_at)));
  const newVideos = (videoSubs || []).filter(v => v.created_at && v.created_at > since && !isRead("video_submissions", v.id));
  const freshNotes = (recentNotes || []).filter(n => !isRead("athlete_notes", n.id));
  const freshComments = (athleteComments || []).filter(c => !isRead("exercise_comments", c.id));

  // Group logs by athlete + date + day
  const logGroups = {};
  newLogs.forEach(l => {
    const key = dayKey(l);
    if (!logGroups[key]) logGroups[key] = { key, athlete_id: l.athlete_id, date: l.date, week_label: l.week_label, day_label: l.day_label, count: 0, latest: l.logged_at };
    logGroups[key].count++;
    if (l.logged_at > logGroups[key].latest) logGroups[key].latest = l.logged_at;
  });
  const logAlerts = Object.values(logGroups).sort((a, b) => b.latest.localeCompare(a.latest));

  const openNotes = newLogNotes.filter(l => !handled[l.id]);
  const totalNew = logAlerts.length + newVideos.length + unreadMsgs.length + freshNotes.length + openNotes.length + freshComments.length;

  // Replies sent in the last week, newest first, so the coach can see what was answered.
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentReplies = (logs || [])
    .filter(l => (l.coach_reply || "").trim() && l.coach_reply_at && l.coach_reply_at > weekAgo)
    .sort((a, b) => String(b.coach_reply_at).localeCompare(String(a.coach_reply_at)));

  const flashHandled = (id, kind) => {
    setHandled(h => ({ ...h, [id]: kind }));
    setTimeout(() => setHandled(h => { const n = { ...h }; delete n[id]; return n; }), 2500);
  };

  const sendReply = async (l) => {
    if (replySending || !replyText.trim()) return;
    setReplySending(true);
    setReplyError("");
    try {
      const { row, notified } = await saveNoteReply(l, replyText);
      setReadKeys(prev => new Set(prev).add(`logs:${l.id}`));
      if (row && setLogs) setLogs(prev => prev.map(x => (x.id === row.id ? row : x)));
      setReplyOpen(null);
      setReplyText("");
      flashHandled(l.id, notified ? "replied" : "replied-no-alert");
    } catch (e) {
      console.error("bell reply failed", e);
      setReplyError("Reply could not be saved. Try again.");
    }
    setReplySending(false);
  };

  const noReplyNeeded = (l) => {
    dismiss("logs", l.id);
    if (replyOpen === l.id) { setReplyOpen(null); setReplyText(""); }
    flashHandled(l.id, "done");
  };

  /*
    Marking all read now records each visible alert individually rather than moving one
    timestamp forward. Messages are untouched - they carry their own read_at and are
    cleared by opening the thread, not by tidying the bell.
  */
  const markRead = async () => {
    const rows = [
      ...logAlerts.map(g => ({ source_table: "log_day", source_id: g.key })),
      ...openNotes.map(l => ({ source_table: "logs", source_id: String(l.id) })),
      ...newVideos.map(v => ({ source_table: "video_submissions", source_id: String(v.id) })),
      ...freshComments.map(c => ({ source_table: "exercise_comments", source_id: String(c.id) })),
      ...freshNotes.map(n => ({ source_table: "athlete_notes", source_id: String(n.id) })),
    ].map(r => ({ coach_id: COACH_ID, ...r }));
    setReadKeys(prev => {
      const next = new Set(prev);
      rows.forEach(r => next.add(`${r.source_table}:${r.source_id}`));
      return next;
    });
    setOpen(false);
    if (rows.length) {
      const { error } = await supabase.from("coach_alert_reads")
        .upsert(rows, { onConflict: "coach_id,source_table,source_id" });
      if (error) console.error("mark all read failed", error);
    }
  };

  const timeAgo = (ts) => {
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, position: "relative", display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 18 }}>🔔</span>
        {totalNew > 0 && (
          <span style={{ position: "absolute", top: -2, right: -4, background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 700, width: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {totalNew > 9 ? "9+" : totalNew}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "fixed", top: isMobile ? 50 : 20, right: isMobile ? 10 : 20, width: isMobile ? "calc(100vw - 20px)" : 360, maxHeight: "70vh", background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,.15)", zIndex: 9999, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #E4E4E7", flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Alerts</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {totalNew > 0 && (
                <button onClick={markRead} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#2563EB", fontWeight: 600, fontFamily: "inherit" }}>Mark all read</button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#A1A1AA", fontSize: 18 }}>✕</button>
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
            {totalNew === 0 && newLogNotes.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#A1A1AA" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>All caught up!</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>No new activity since you last checked.</div>
              </div>
            ) : (
              <div>
                {/* Notes the athlete left on an exercise - most actionable, so first */}
                {newLogNotes.map(l => {
                  const name = l.athlete_name || getAthleteName(l.athlete_id);
                  const initials = getInitials(name);
                  const first = (name || "").split(/\s+/)[0] || "athlete";
                  const done = handled[l.id];
                  if (done) {
                    return (
                      <div key={"ln-" + l.id} style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "center", background: "#F0FDF4" }}>
                        <span style={{ fontSize: 16 }}>{"✓"}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#15803D" }}>
                          {done === "done" ? `Cleared: ${l.exercise_name || "note"}` : done === "replied" ? `Reply sent to ${first} · ${l.exercise_name || "note"}` : `Reply saved, but ${first} could not be notified`}
                        </span>
                      </div>
                    );
                  }
                  const isReplying = replyOpen === l.id;
                  const goView = () => { if (onNavigate) { onNavigate(l.athlete_id, "programs", { weekLabel: l.week_label, dayLabel: l.day_label, logId: l.id }); setOpen(false); } };
                  return (
                  <div key={"ln-" + l.id} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "start" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: "#FEF2F2", color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                        <span style={{ fontSize: 11, color: "#A1A1AA" }}>{timeAgo(l.logged_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#52525B", marginTop: 1 }}>
                        {"💬"} Note on <strong>{l.exercise_name || "an exercise"}</strong>
                        {l.day_label ? <span style={{ color: "#A1A1AA" }}> · {l.day_label.split("·").pop().trim()}</span> : null}
                      </div>
                      <div style={{ fontSize: 13, color: "#18181B", marginTop: 3, background: "#FAFAFA", border: "1px solid #E4E4E7", borderRadius: 6, padding: "5px 8px", wordBreak: "break-word" }}>
                        {l.notes}
                      </div>
                      {isReplying ? (
                        <div style={{ marginTop: 6 }}>
                          <textarea
                            autoFocus
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); sendReply(l); } }}
                            placeholder={`Reply to ${first}…`}
                            rows={3}
                            style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", border: "1px solid #93C5FD", borderRadius: 6, fontSize: 16, fontFamily: "inherit", resize: "vertical" }}
                          />
                          {replyError && <div style={{ fontSize: 12, color: "#DC2626", marginTop: 2 }}>{replyError}</div>}
                          <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                            <button onClick={() => sendReply(l)} disabled={replySending || !replyText.trim()} style={{ padding: "5px 12px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: replySending || !replyText.trim() ? 0.5 : 1 }}>{replySending ? "Sending…" : "Send reply"}</button>
                            <button onClick={() => { setReplyOpen(null); setReplyText(""); setReplyError(""); }} disabled={replySending} style={{ background: "none", border: "none", color: "#71717A", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 10, marginTop: 5, alignItems: "center", flexWrap: "wrap" }}>
                          <button onClick={() => { setReplyOpen(l.id); setReplyText(""); setReplyError(""); }} style={{ padding: "4px 12px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Reply</button>
                          <button onClick={() => noReplyNeeded(l)} style={{ padding: "4px 10px", background: "#fff", color: "#15803D", border: "1px solid #86EFAC", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{"✓"} No reply needed</button>
                          {onNavigate && <button onClick={goView} style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#2563EB", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>View session {"→"}</button>}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}

                {/* Comments an athlete left on an exercise card */}
                {freshComments.map(c => {
                  const name = c.author_name || getAthleteName(c.athlete_id);
                  const initials = getInitials(name);
                  return (
                  <div key={"ec-" + c.id} onClick={() => { dismiss("exercise_comments", c.id); if (onNavigate) { onNavigate(c.athlete_id, "programs", { weekLabel: c.week_label, dayLabel: c.day_label, blockId: c.block_id }); setOpen(false); } }} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "start", cursor: onNavigate ? "pointer" : "default" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: "#F5F3FF", color: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                        <span style={{ fontSize: 11, color: "#A1A1AA" }}>{timeAgo(c.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#52525B", marginTop: 1 }}>
                        {"💬"} Comment on <strong>{c.exercise_name || "an exercise"}</strong>
                      </div>
                      <div style={{ fontSize: 13, color: "#18181B", marginTop: 3, background: "#FAFAFA", border: "1px solid #E4E4E7", borderRadius: 6, padding: "5px 8px", wordBreak: "break-word" }}>
                        {c.body}
                      </div>
                      {onNavigate && <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, marginTop: 3 }}>View {"→"}</div>}
                    </div>
                  </div>
                  );
                })}

                {/* Video submissions */}
                {newVideos.map(v => {
                  const name = v.athlete_name || getAthleteName(v.athlete_id);
                  const initials = getInitials(name);
                  return (
                  <div key={v.id} onClick={() => { dismiss("video_submissions", v.id); if (onNavigate) { onNavigate(null, "videos", { videoId: v.id }); setOpen(false); } }} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "start", cursor: onNavigate ? "pointer" : "default" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: "#DBEAFE", color: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                        <span style={{ fontSize: 11, color: "#A1A1AA" }}>{timeAgo(v.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#52525B", marginTop: 1 }}>🎥 Submitted video: <strong>{v.exercise_name || "Movement"}</strong></div>
                      {v.notes && <div style={{ fontSize: 12, color: "#71717A", fontStyle: "italic", marginTop: 2 }}>{v.notes}</div>}
                      {onNavigate && <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, marginTop: 3 }}>View →</div>}
                    </div>
                  </div>
                  );
                })}

                {/* Workout logs */}
                {logAlerts.map((g, i) => {
                  const name = getAthleteName(g.athlete_id);
                  const initials = getInitials(name);
                  return (
                  <div key={g.key || i} onClick={() => { dismiss("log_day", g.key); if (onNavigate) { onNavigate(g.athlete_id, "programs", { weekLabel: g.week_label, dayLabel: g.day_label }); setOpen(false); } }} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "start", cursor: onNavigate ? "pointer" : "default" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: "#F0FDF4", color: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                        <span style={{ fontSize: 11, color: "#A1A1AA" }}>{timeAgo(g.latest)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#52525B", marginTop: 1 }}>
                        💪 Logged <strong>{g.count} exercises</strong>
                        {g.week_label || g.day_label ? ` — ${g.week_label ? g.week_label.replace(/WEEK\s*/i, "W").split("—")[0].trim() : ""} ${g.day_label || ""}` : ""}
                      </div>
                      {onNavigate && <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, marginTop: 3 }}>View →</div>}
                    </div>
                  </div>
                  );
                })}

                {/* Messages */}
                {unreadMsgs.map(msg => {
                  const name = msg.sender_name || msg.athlete_name || "Unknown";
                  const initials = getInitials(name);
                  return (
                  <div key={msg.id} onClick={() => { if (onNavigate) { onNavigate(msg.athlete_id, "messages"); setOpen(false); } }} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "start", cursor: onNavigate ? "pointer" : "default" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: "#EFF6FF", color: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                        <span style={{ fontSize: 11, color: "#A1A1AA" }}>{timeAgo(msg.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#52525B", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        ✉ {msg.content || (msg.media_url ? "Sent a photo/video" : msg.video_url ? "Shared a link" : "New message")}
                      </div>
                      {onNavigate && <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, marginTop: 3 }}>View →</div>}
                    </div>
                  </div>
                  );
                })}

                {/* Notes */}
                {freshNotes.map(note => {
                  const name = note.author_name || "Unknown";
                  const initials = getInitials(name);
                  return (
                  <div key={note.id} onClick={() => { dismiss("athlete_notes", note.id); if (onNavigate) { onNavigate(note.athlete_id, "programs"); setOpen(false); } }} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "start", cursor: onNavigate ? "pointer" : "default" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: "#FFFBEB", color: "#D97706", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
                        <span style={{ fontSize: 11, color: "#A1A1AA" }}>{timeAgo(note.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#52525B", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        📋 {note.content?.slice(0, 80) || "New note"}
                      </div>
                      {onNavigate && <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, marginTop: 3 }}>View →</div>}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* What you have already answered, so nothing is replied to twice or lost. */}
            {recentReplies.length > 0 && (
              <div style={{ borderTop: "1px solid #E4E4E7", background: "#FAFAFA" }}>
                <button onClick={() => setShowReplied(v => !v)} style={{ width: "100%", textAlign: "left", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#15803D" }}>
                  {"✓"} Replied this week ({recentReplies.length}) {showReplied ? "▴" : "▾"}
                </button>
                {showReplied && recentReplies.map(l => (
                  <div key={"rr-" + l.id} onClick={() => { if (onNavigate) { onNavigate(l.athlete_id, "programs", { weekLabel: l.week_label, dayLabel: l.day_label, logId: l.id }); setOpen(false); } }} style={{ padding: "8px 16px 10px", borderTop: "1px solid #F4F4F5", cursor: onNavigate ? "pointer" : "default" }}>
                    <div style={{ fontSize: 12, color: "#52525B" }}>
                      <strong>{l.athlete_name || getAthleteName(l.athlete_id)}</strong> · {l.exercise_name || "Exercise"} <span style={{ color: "#A1A1AA" }}>· replied {timeAgo(l.coach_reply_at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#71717A", marginTop: 2, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>"{(l.notes || "").trim()}"</div>
                    <div style={{ fontSize: 12, color: "#1E3A8A", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>You: {l.coach_reply}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
