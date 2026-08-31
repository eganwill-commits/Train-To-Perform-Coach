"use client";
import { useState, useEffect, useCallback, useRef, Component } from "react";
import { fetchThread, postComment, markThreadRead, COMMENT_ROLE } from "../lib/comments";

/*
  The conversation attached to one exercise in one session.

  Same component on both sides - the coach asks, the athlete answers, and neither has to
  describe which exercise they mean because the thread lives on it.

  Wrapped in a boundary at the bottom of this file. A notification component that threw
  during mount once took every athlete's program down with it; a comment box is a
  convenience and must never be able to do that again.
*/
function ExerciseThreadInner({
  athleteId, programId, weekLabel, dayLabel, dayId, blockId, exerciseName,
  role, authorName, compact, autoOpen,
  // Comments for THIS block, already fetched by the parent in one query. A week can hold
  // fifty exercises; each mounting its own fetch would be fifty round trips per render.
  // The parent loads them all once and hands each thread its slice.
  preloaded, onChanged,
}) {
  const [open, setOpen] = useState(!!autoOpen);
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const areaRef = useRef(null);

  // Refetches just this thread - used after posting or marking read, where we need the
  // authoritative rows back immediately rather than waiting for the parent's next pass.
  const load = useCallback(async () => {
    const rows = await fetchThread(athleteId, blockId);
    setItems(rows);
    setLoaded(true);
    if (onChanged) onChanged();
  }, [athleteId, blockId, onChanged]);

  useEffect(() => {
    if (preloaded) { setItems(preloaded); setLoaded(true); return; }
    load();
  }, [preloaded, load]);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);

  // Opening the thread is what marks the other side's messages read.
  useEffect(() => {
    if (!open || !loaded) return;
    const otherRole = role === COMMENT_ROLE.COACH ? COMMENT_ROLE.ATHLETE : COMMENT_ROLE.COACH;
    if (items.some(c => c.author_role === otherRole && !c.read_at)) {
      markThreadRead(athleteId, blockId, role).then(load);
    }
  }, [open, loaded, items, role, athleteId, blockId, load]);

  const otherRole = role === COMMENT_ROLE.COACH ? COMMENT_ROLE.ATHLETE : COMMENT_ROLE.COACH;
  const unread = items.filter(c => c.author_role === otherRole && !c.read_at).length;

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await postComment({
        athleteId, programId, weekLabel, dayLabel, dayId, blockId, exerciseName,
        authorRole: role, authorName, body,
      });
      setText("");
      await load();
    } catch (e) {
      // Keep what they wrote on screen.
      window.alert("That comment could not be sent. Your text is still here - try again.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); }
  };

  const when = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
           d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const label = role === COMMENT_ROLE.COACH
    ? (items.length ? `Discussion (${items.length})` : "Ask about this exercise")
    : (items.length ? `Coach discussion (${items.length})` : "Ask your coach");

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #D4D4D8" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          padding: 0, cursor: "pointer", fontFamily: "inherit",
          fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          color: unread > 0 ? "#B45309" : "#71717A",
        }}
      >
        <span>{"💬"}</span>
        <span>{label}</span>
        {unread > 0 && (
          <span style={{ background: "#DC2626", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 9, padding: "1px 6px" }}>
            {unread} new
          </span>
        )}
        <span style={{ fontSize: 9, color: "#A1A1AA" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 6 }}>
          {items.map(c => {
            const mine = c.author_role === role;
            return (
              <div
                key={c.id}
                style={{
                  marginBottom: 6, padding: "6px 9px", borderRadius: 8,
                  background: c.author_role === COMMENT_ROLE.COACH ? "#EFF6FF" : "#F4F4F5",
                  border: `1px solid ${c.author_role === COMMENT_ROLE.COACH ? "#BFDBFE" : "#E4E4E7"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.author_role === COMMENT_ROLE.COACH ? "#1E40AF" : "#3F3F46" }}>
                    {mine ? "You" : (c.author_name || (c.author_role === COMMENT_ROLE.COACH ? "Coach" : "Athlete"))}
                  </span>
                  <span style={{ fontSize: 10, color: "#A1A1AA" }}>{when(c.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: "#18181B", whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2 }}>
                  {c.body}
                </div>
              </div>
            );
          })}

          <textarea
            ref={areaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={role === COMMENT_ROLE.COACH
              ? "Ask about this exercise — they'll get a notification."
              : "Reply to your coach…"}
            rows={compact ? 2 : 3}
            style={{
              width: "100%", padding: "8px 10px", border: "1px solid #E4E4E7", borderRadius: 8,
              fontSize: 14, fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
              resize: "vertical", color: "#18181B", minHeight: 56,
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
            <button
              onClick={send}
              disabled={busy || !text.trim()}
              style={{
                padding: "6px 14px", background: "#18181B", color: "#fff", border: "none",
                borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                cursor: busy || !text.trim() ? "default" : "pointer",
                opacity: busy || !text.trim() ? 0.4 : 1,
              }}
            >{busy ? "Sending…" : role === COMMENT_ROLE.COACH ? "Send question" : "Send"}</button>
            <span style={{ fontSize: 10, color: "#A1A1AA" }}>{"⌘↵"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

class ExerciseThread extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error("ExerciseThread crashed", error, info); }
  render() {
    if (this.state.failed) return null;
    return <ExerciseThreadInner {...this.props} />;
  }
}

export default ExerciseThread;
