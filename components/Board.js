"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, EmptyState } from "./ui";
import { buildBoard, fetchBoardExtras, closeItem, STATUS, ITEM, shortDate } from "../lib/board";

/*
  Board: every athlete, what is waiting on the coach, and what their program needs next.

  Read top to bottom once a day. Overdue and Action rows need something today; Plan rows
  need a block built soon; Clear rows need nothing. The rules behind each column live in
  lib/board.js so they can be checked without the UI.
*/

const ITEM_ICON = {
  [ITEM.VIDEO]: "▶",
  [ITEM.MESSAGE]: "✉",
  [ITEM.NOTE]: "✎",
  [ITEM.COMMENT]: "💬",
  [ITEM.LOG_NOTE]: "◇",
};

const ago = (at) => {
  const h = Math.floor((Date.now() - at) / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

function Pill({ level }) {
  const s = STATUS[level];
  return <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: s.color, background: s.bg, border: `1px solid ${s.color}33`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>{s.label}</span>;
}

const linkBtn = { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" };
const smallBtn = { background: "#F4F4F5", border: "1px solid #E4E4E7", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#52525B", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };

export default function Board({ athletes, programs, logs, videoSubs, updateVideoSub, updateProgram, isMobile, onNavigate }) {
  const [extras, setExtras] = useState(null);
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState("needs");   // "needs" | "all"
  const [showInactive, setShowInactive] = useState(false);

  const reload = useCallback(async () => { setExtras(await fetchBoardExtras()); }, []);
  useEffect(() => {
    reload();
    const iv = setInterval(() => { if (!document.hidden) reload(); }, 60000);
    return () => clearInterval(iv);
  }, [reload]);

  const board = useMemo(() => extras ? buildBoard({ athletes, programs, logs, videoSubs, extras }) : null,
    [athletes, programs, logs, videoSubs, extras]);

  if (!board) return <p style={{ color: "#71717A" }}>Loading board…</p>;

  const counts = board.rows.reduce((m, r) => { m[r.level] = (m[r.level] || 0) + 1; return m; }, {});
  const shown = filter === "all" ? board.rows : board.rows.filter(r => r.level !== "clear");

  const open = (athleteId, item) => {
    if (!onNavigate) return;
    if (item.kind === ITEM.VIDEO) onNavigate(null, "videos", { videoId: item.id });
    else if (item.kind === ITEM.MESSAGE) onNavigate(athleteId, "messages");
    else if (item.kind === ITEM.COMMENT) onNavigate(athleteId, "programs", { weekLabel: item.row.week_label, dayLabel: item.row.day_label, blockId: item.row.block_id });
    else if (item.kind === ITEM.LOG_NOTE) onNavigate(athleteId, "programs", { weekLabel: item.row.week_label, dayLabel: item.row.day_label, logId: item.id });
    else onNavigate(athleteId, "programs", { notes: true });
  };

  // Handled outside the app: take it off the board without replying.
  const close = async (item) => {
    setBusy(item.kind + item.id);
    try {
      if (item.kind === ITEM.VIDEO) {
        const res = await Promise.all(item.group.clips.map(c => updateVideoSub(c.id, { status: "reviewed" })));
        if (res.some(r => r?.error)) throw new Error("video update failed");
      } else {
        const key = await closeItem(item.table, item.id);
        setExtras(prev => ({ ...prev, keys: new Set([...prev.keys, key]) }));
      }
    } catch (e) {
      console.error("board: close failed", e);
      window.alert("That item could not be closed. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const archive = async (p) => {
    if (!window.confirm(`Archive "${p.name}"? It comes off the Board. The program and its logs are kept.`)) return;
    setBusy("prog" + p.id);
    const { error } = await updateProgram(p.id, { archived_at: new Date().toISOString() });
    setBusy(null);
    if (error) window.alert("Could not archive the program. Try again.");
  };

  const chip = (key, label, active, onClick) => (
    <button key={key} onClick={onClick} style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${active ? "#18181B" : "#E4E4E7"}`, background: active ? "#18181B" : "#fff", color: active ? "#fff" : "#52525B", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
  );

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Board</h2>
        <span style={{ fontSize: 13, color: "#71717A" }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: "#52525B" }}>
        {["overdue", "action", "plan", "clear"].map(l => `${counts[l] || 0} ${STATUS[l].label.toLowerCase()}`).join(" · ")}
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {chip("needs", `Needs you (${board.rows.length - (counts.clear || 0)})`, filter === "needs", () => setFilter("needs"))}
        {chip("all", `All athletes (${board.rows.length})`, filter === "all", () => setFilter("all"))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="✓" title="Nothing waiting" sub="Every athlete is clear. Tap All athletes to see the full roster." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shown.map(r => {
            const p = r.prog?.program;
            return (
              <Card key={r.athlete.id} style={{ padding: isMobile ? 14 : 16, borderLeft: `4px solid ${STATUS[r.level].color}` }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "220px 1fr 240px", gap: isMobile ? 10 : 20, alignItems: "start" }}>
                  {/* Who */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => onNavigate?.(r.athlete.id, "programs")} style={{ ...linkBtn, fontSize: 15, fontWeight: 700, color: "#18181B" }}>{r.athlete.name}</button>
                      <Pill level={r.level} />
                    </div>
                    <div style={{ fontSize: 12, color: "#71717A", marginTop: 4, lineHeight: 1.45 }}>
                      {p ? <>{p.name}<br />{r.prog.remote ? "Remote" : "In person"} · {r.prog.weekText}</> : "No active program"}
                      <br />Last log: {r.lastLog ? shortDate(r.lastLog) : "never"}
                    </div>
                  </div>

                  {/* Waiting on you */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Waiting on you</div>
                    {r.items.length === 0 && !(r.prog?.missed >= 2) ? <div style={{ fontSize: 13, color: "#A1A1AA" }}>Nothing</div> : null}
                    {r.prog?.missed >= 2 && (
                      <div style={{ fontSize: 13, color: "#B45309", marginBottom: 6 }}>{r.prog.missed} scheduled sessions with no log since {r.lastLog ? shortDate(r.lastLog) : "the start"}</div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {r.items.map(item => (
                        <div key={item.kind + item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <span style={{ width: 16, textAlign: "center", color: "#71717A" }}>{ITEM_ICON[item.kind]}</span>
                          <button onClick={() => open(r.athlete.id, item)} style={{ ...linkBtn, flex: 1, minWidth: 0, color: "#18181B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.text}>{item.text}</button>
                          <span style={{ fontSize: 11, color: "#A1A1AA", whiteSpace: "nowrap" }}>{ago(item.at)}</span>
                          {item.kind !== ITEM.MESSAGE && (
                            <button onClick={() => close(item)} disabled={busy === item.kind + item.id} title="Handled outside the app: take it off the board" style={smallBtn}>{busy === item.kind + item.id ? "…" : "Close"}</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Program next */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Program next</div>
                    <div style={{ fontSize: 13, color: "#18181B" }}>{r.prog?.next || "Build or assign a program"}</div>
                    {p && r.prog.ended && (
                      <button onClick={() => archive(p)} disabled={busy === "prog" + p.id} style={{ ...smallBtn, marginTop: 8 }}>{busy === "prog" + p.id ? "…" : "Archive program"}</button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {board.inactive.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button onClick={() => setShowInactive(v => !v)} style={{ ...linkBtn, fontSize: 13, fontWeight: 600, color: "#71717A" }}>
            {showInactive ? "▾" : "▸"} No active program ({board.inactive.length})
          </button>
          {showInactive && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {board.inactive.map(x => (
                <div key={x.athlete.id} style={{ fontSize: 13, color: "#52525B" }}>
                  <button onClick={() => onNavigate?.(x.athlete.id, "programs")} style={{ ...linkBtn, fontWeight: 600 }}>{x.athlete.name}</button>
                  <span style={{ color: "#A1A1AA" }}> · last log {x.lastLog ? shortDate(x.lastLog) : "never"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
