"use client";
import { useState, useEffect, useRef, useCallback, Component } from "react";
import { supabase } from "../lib/supabase";
import { markAlertRead, markAllAlertsRead } from "../lib/alerts";

/*
  The athlete's notification bell - the mirror of the coach's AlertsBell.

  Difference that matters: the coach's bell tracks "read" with a localStorage
  timestamp. This one reads and writes `athlete_alerts.read_at` in the database, so
  the state survives the athlete switching phones or clearing their browser, and the
  coach can see whether their feedback was actually opened.

  Two sources feed it:
    - athlete_alerts  (video feedback, notes, shared session notes)
    - messages        (already has its own read_at; not duplicated into alerts)
*/

const ICON = {
  video_feedback: "\u{1F3A5}",
  note: "\u{1F4CB}",
  day_note: "\u{1F4DD}",
  note_reply: "\u{1F4AC}",
  message: "✉",
};

const TINT = {
  video_feedback: { bg: "#F0FDF4", fg: "#16A34A" },
  note: { bg: "#FFFBEB", fg: "#D97706" },
  day_note: { bg: "#EFF6FF", fg: "#2563EB" },
  note_reply: { bg: "#EFF6FF", fg: "#1E40AF" },
  message: { bg: "#EFF6FF", fg: "#2563EB" },
};

function timeAgo(ts) {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/*
  The bell renders in two places at once - the sidebar and the mobile header. Both
  instances mount, so anything keyed by athlete id alone collides between them.

  That collision took the whole athlete app down: supabase.channel(name) returns the
  SAME channel for the same name, and calling .on() on a channel that has already
  subscribed throws ("cannot add postgres_changes callbacks after subscribe"). The throw
  happened during mount of the second instance, so React tore down the tree and every
  athlete got "a client-side exception has occurred" instead of their program. The coach
  bell was untouched because it polls rather than subscribing.

  Two defences: a per-instance channel name, and a boundary so a fault in notifications
  can never again cost an athlete access to their training.
*/
function AthleteAlertsBellInner({ athlete, isMobile, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const ref = useRef(null);
  const athleteId = athlete?.id;
  // Unique per mounted instance, so the sidebar and mobile-header bells never share a
  // realtime channel.
  const instanceId = useRef(null);
  if (instanceId.current === null) instanceId.current = Math.random().toString(36).slice(2, 10);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const load = useCallback(async () => {
    if (!athleteId) return;
    const [aRes, mRes] = await Promise.all([
      supabase.from("athlete_alerts").select("*").eq("athlete_id", athleteId)
        .is("read_at", null).order("created_at", { ascending: false }).limit(30),
      supabase.from("messages").select("*").eq("athlete_id", athleteId)
        .eq("sender_role", "coach").is("read_at", null)
        .order("created_at", { ascending: false }).limit(20),
    ]);
    if (aRes.error) console.error("alerts fetch failed", aRes.error); else setAlerts(aRes.data || []);
    if (mRes.error) console.error("alert messages fetch failed", mRes.error); else setMsgs(mRes.data || []);
  }, [athleteId]);

  useEffect(() => {
    load();
    // Realtime, so feedback lands on the athlete's screen while they are in the app.
    // The poll is the backstop for a dropped socket - the coach must not be able to
    // leave feedback that simply never surfaces.
    let ch = null;
    try {
      ch = supabase.channel(`athlete-alerts-${athleteId}-${instanceId.current}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "athlete_alerts", filter: `athlete_id=eq.${athleteId}` }, load)
        .subscribe();
    } catch (e) {
      // Live updates are a convenience; the poll below is the guarantee. Never let a
      // realtime problem reach the render tree.
      console.error("alerts realtime subscribe failed", e);
    }
    const iv = setInterval(load, 20000);
    return () => {
      if (ch) { try { supabase.removeChannel(ch); } catch (e) { console.error("removeChannel failed", e); } }
      clearInterval(iv);
    };
  }, [athleteId, load]);

  const items = [
    ...alerts.map(a => ({
      key: `a-${a.id}`, id: a.id, source: "alert", kind: a.kind,
      title: a.title, body: a.body, at: a.created_at, page: a.link_page,
      // The exact row the alert is about, so the page can scroll straight to it
      // instead of dropping the athlete on a list to hunt through.
      focus: a.ref_table === "video_submissions" ? a.ref_id : null,
    })),
    ...msgs.map(m => ({
      key: `m-${m.id}`, id: m.id, source: "message", kind: "message",
      title: `Message from ${m.sender_name || "your coach"}`,
      body: m.content || (m.media_url ? "Sent a photo/video" : m.video_url ? "Shared a link" : "New message"),
      at: m.created_at, page: "messages",
    })),
  ].sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));

  const total = items.length;

  const openItem = async (item) => {
    if (item.source === "alert") {
      await markAlertRead(item.id);
      setAlerts(prev => prev.filter(a => a.id !== item.id));
    }
    // Messages are marked read by the Messages page itself when it opens the thread.
    setOpen(false);
    if (onNavigate && item.page) onNavigate(item.page, item.focus || null);
  };

  const markAll = async () => {
    if (athleteId) await markAllAlertsRead(athleteId);
    setAlerts([]);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={total > 0 ? `${total} new notifications` : "Notifications"}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 4, position: "relative", display: "flex", alignItems: "center" }}
      >
        <span style={{ fontSize: 18 }}>{"\u{1F514}"}</span>
        {total > 0 && (
          <span style={{ position: "absolute", top: -2, right: -4, background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 700, width: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: "fixed", top: isMobile ? 50 : 20, right: isMobile ? 10 : 20, width: isMobile ? "calc(100vw - 20px)" : 360, maxHeight: "70vh", background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,.15)", zIndex: 9999, display: "flex", flexDirection: "column", overflow: "hidden", color: "#18181B" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #E4E4E7", flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>From your coach</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {alerts.length > 0 && (
                <button onClick={markAll} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#2563EB", fontWeight: 600, fontFamily: "inherit" }}>Mark all read</button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#A1A1AA", fontSize: 18 }}>{"✕"}</button>
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1, WebkitOverflowScrolling: "touch" }}>
            {total === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#A1A1AA" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>{"✓"}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>All caught up</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Nothing new from your coach.</div>
              </div>
            ) : items.map(item => {
              const tint = TINT[item.kind] || TINT.note;
              return (
                <div
                  key={item.key}
                  onClick={() => openItem(item)}
                  style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: "1px solid #F4F4F5", alignItems: "flex-start", cursor: "pointer" }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 18, background: tint.bg, color: tint.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                    {ICON[item.kind] || "\u{1F514}"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, wordBreak: "break-word" }}>{item.title}</span>
                      <span style={{ fontSize: 11, color: "#A1A1AA" }}>{timeAgo(item.at)}</span>
                    </div>
                    {item.body && (
                      <div style={{ fontSize: 13, color: "#52525B", marginTop: 2, wordBreak: "break-word" }}>{item.body}</div>
                    )}
                    <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, marginTop: 3 }}>View {"→"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/*
  If the bell throws, the athlete loses the bell - not their program.
*/
class AthleteAlertsBell extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error("AthleteAlertsBell crashed", error, info); }
  render() {
    if (this.state.failed) return null;
    return <AthleteAlertsBellInner {...this.props} />;
  }
}

export default AthleteAlertsBell;
