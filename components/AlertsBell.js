"use client";
import { useState, useEffect, useRef } from "react";

const LS_KEY = "t2p_last_checked";

function getLastChecked() {
  if (typeof window === "undefined") return new Date().toISOString();
  return localStorage.getItem(LS_KEY) || new Date(Date.now() - 86400000).toISOString();
}

function setLastChecked() {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, new Date().toISOString());
}

export default function AlertsBell({ logs, videoSubs, athletes, isMobile, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [lastChecked, setLC] = useState(getLastChecked);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const getAthleteName = (id) => (athletes || []).find(a => a.id === id)?.name || "Unknown";

  // New logs since last checked
  const newLogs = (logs || []).filter(l => l.logged_at && l.logged_at > lastChecked);
  const newVideos = (videoSubs || []).filter(v => v.created_at && v.created_at > lastChecked);

  // Group logs by athlete + date + day
  const logGroups = {};
  newLogs.forEach(l => {
    const key = `${l.athlete_id}-${l.date}-${l.day_label || ""}`;
    if (!logGroups[key]) logGroups[key] = { athlete_id: l.athlete_id, date: l.date, week_label: l.week_label, day_label: l.day_label, count: 0, latest: l.logged_at };
    logGroups[key].count++;
    if (l.logged_at > logGroups[key].latest) logGroups[key].latest = l.logged_at;
  });
  const logAlerts = Object.values(logGroups).sort((a, b) => b.latest.localeCompare(a.latest));

  const totalNew = logAlerts.length + newVideos.length;

  const markRead = () => {
    setLastChecked();
    setLC(new Date().toISOString());
    setOpen(false);
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
            {totalNew === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#A1A1AA" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>All caught up!</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>No new activity since you last checked.</div>
              </div>
            ) : (
              <div>
                {/* Video submissions */}
                {newVideos.map(v => {
                  const name = v.athlete_name || getAthleteName(v.athlete_id);
                  const initial = name.charAt(0).toUpperCase();
                  return (
                  <div key={v.id} onClick={() => { if (onNavigate) { onNavigate(v.athlete_id); setOpen(false); } }} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "start", cursor: onNavigate ? "pointer" : "default" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: "#DBEAFE", color: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{initial}</div>
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
                  const initial = name.charAt(0).toUpperCase();
                  return (
                  <div key={i} onClick={() => { if (onNavigate) { onNavigate(g.athlete_id); setOpen(false); } }} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "start", cursor: onNavigate ? "pointer" : "default" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 18, background: "#F0FDF4", color: "#16A34A", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{initial}</div>
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
