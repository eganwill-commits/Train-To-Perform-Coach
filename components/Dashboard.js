"use client";
import { useMemo, useState } from "react";
import { Badge, Card } from "./ui";
import { findMissingNumberSessions } from "../lib/logging";
import { weekNumberLabel } from "../lib/weeks";

export default function Dashboard({ athletes, programs, logs, cats, colors, isMobile, onNavigate }) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const recent = [...logs].slice(0, 5);

  // Count exercises from all programs by category
  const programCounts = {};
  let totalProgramExercises = 0;
  cats.forEach(c => { programCounts[c] = 0; });
  programs.forEach(p => {
    (p.weeks || []).forEach(w => {
      (w.days || []).forEach(d => {
        (d.blocks || []).forEach(b => {
          if (b.category && programCounts[b.category] !== undefined) {
            programCounts[b.category]++;
            totalProgramExercises++;
          }
        });
      });
    });
  });

  // Count logged workouts by category
  const logCounts = {};
  cats.forEach(c => { logCounts[c] = 0; });
  logs.forEach(l => {
    if (l.category && logCounts[l.category] !== undefined) logCounts[l.category]++;
  });

  /*
    Who has trained recently without recording the numbers that matter.

    The athlete's own app nags them; this is the coach's side of it - one place to see the
    whole roster instead of opening each athlete to find out. Same rule, same module, so
    the two can never disagree about whose session is incomplete.
  */
  const missing = useMemo(() => {
    const rows = [];
    (programs || []).forEach(p => {
      const ath = (athletes || []).find(a => a.id === p.athlete_id);
      if (!ath) return;
      findMissingNumberSessions({
        program: p,
        logs,
        athleteId: p.athlete_id,
        displayName: (b) => b.exerciseName || "",
      }).forEach(g => rows.push({ ...g, athlete: ath, programName: p.name }));
    });
    return rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [programs, athletes, logs]);

  /*
    Grouped by athlete rather than a flat list. A stack of sessions ordered only by date
    reads as noise once more than one or two athletes are behind - the coach thinks in
    people ("has Gus logged anything?"), not in a chronological feed of days.
  */
  const byAthlete = useMemo(() => {
    const map = new Map();
    missing.forEach(m => {
      const e = map.get(m.athlete.id);
      if (e) e.sessions.push(m);
      else map.set(m.athlete.id, { athlete: m.athlete, sessions: [m] });
    });
    return [...map.values()].sort((a, b) =>
      b.sessions.length - a.sessions.length ||
      String(b.sessions[0].date || "").localeCompare(String(a.sessions[0].date || "")) ||
      a.athlete.name.localeCompare(b.athlete.name)
    );
  }, [missing]);

  // One athlete behind: no point making the coach click to see the one thing that matters.
  const [openAthlete, setOpenAthlete] = useState(null);
  const soleAthlete = byAthlete.length === 1 ? byAthlete[0].athlete.id : null;
  const isOpen = (id) => (openAthlete === null ? id === soleAthlete : openAthlete === id);

  return (
    <div>
      <div style={{ marginBottom: isMobile ? 20 : 32 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Dashboard</h2>
        <p style={{ margin: "4px 0 0", color: "#71717A", fontSize: 14 }}>{today}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 20 : 32 }}>
        {[{ l: "Athletes", v: athletes.length, i: "◎" }, { l: "Programs", v: programs.length, i: "▦" }, { l: "Logged", v: logs.length, i: "◇" }, { l: "This Week", v: logs.filter(x => (new Date() - new Date(x.date)) / 86400000 < 7).length, i: "↗" }].map(s => (
          <Card key={s.l} style={{ padding: isMobile ? 14 : 20, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: isMobile ? 36 : 44, height: isMobile ? 36 : 44, borderRadius: 10, background: "#F4F4F5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 16 : 20, flexShrink: 0 }}>{s.i}</div>
            <div><div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700 }}>{s.v}</div><div style={{ fontSize: 12, color: "#71717A" }}>{s.l}</div></div>
          </Card>
        ))}
      </div>

      {/* Who is missing numbers */}
      {missing.length > 0 && (
        <Card style={{ marginBottom: isMobile ? 16 : 24, border: "2px solid #FCA5A5", background: "#FEF2F2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{"\u26A0\uFE0F"}</span>
            <h3 style={{ margin: 0, fontSize: 16, color: "#991B1B" }}>Missing numbers</h3>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#7F1D1D" }}>
            {missing.length} session{missing.length !== 1 ? "s" : ""} across {byAthlete.length} athlete{byAthlete.length !== 1 ? "s" : ""} where
            no lift, power or finisher was recorded. Their own app is prompting them too.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byAthlete.map(({ athlete: ath, sessions }) => {
              const open = isOpen(ath.id);
              return (
                <div key={ath.id} style={{ background: "#fff", border: "1px solid #FCA5A5", borderRadius: 8, overflow: "hidden" }}>
                  <button
                    onClick={() => setOpenAthlete(open ? "" : ath.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                      padding: "11px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#18181B", flex: 1, minWidth: 0, wordBreak: "break-word" }}>
                      {ath.name}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 999, padding: "2px 9px" }}>
                      {sessions.length} session{sessions.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ flexShrink: 0, fontSize: 10, color: "#A1A1AA", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>{"\u25BC"}</span>
                  </button>
                  {open && (
                    <div style={{ borderTop: "1px solid #FEE2E2" }}>
                      {sessions.map((m, i) => (
                        <button
                          key={`${m.wi}-${m.day.id}-${i}`}
                          onClick={() => { if (onNavigate) onNavigate(ath.id, "programs", { weekLabel: m.weekLabel, dayLabel: m.day.label }); }}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                            width: "100%", textAlign: "left", padding: "9px 12px 9px 16px",
                            background: "none", border: "none", borderTop: i ? "1px solid #F4F4F5" : "none",
                            cursor: onNavigate ? "pointer" : "default", fontFamily: "inherit",
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#18181B", wordBreak: "break-word" }}>
                              {m.day.label}
                            </span>
                            <span style={{ display: "block", fontSize: 11, color: "#71717A", marginTop: 1 }}>
                              {weekNumberLabel(m.weekLabel, m.wi)} · {m.count} not recorded{m.date ? ` · ${m.date}` : ""}
                            </span>
                          </span>
                          {onNavigate && <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#DC2626", whiteSpace: "nowrap" }}>Open {"\u2192"}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Programming Distribution */}
      <Card style={{ marginBottom: isMobile ? 16 : 24 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Programming Distribution</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#A1A1AA" }}>{totalProgramExercises} total exercise blocks across {programs.length} program{programs.length !== 1 ? "s" : ""}</p>
        <div style={{ display: "flex", gap: isMobile ? 8 : 12, flexWrap: "wrap" }}>
          {cats.map(c => {
            const ct = programCounts[c] || 0;
            const pct = totalProgramExercises ? (ct / totalProgramExercises) * 100 : 0;
            return (
              <div key={c} style={{ flex: isMobile ? "1 1 40%" : 1, textAlign: "center", minWidth: 0 }}>
                <div style={{ height: 10, borderRadius: 5, background: colors[c]?.light, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: colors[c]?.bg, borderRadius: 5, transition: "width .4s" }} />
                </div>
                <Badge color={colors[c]?.bg}>{c}</Badge>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#18181B", marginTop: 4 }}>{ct}</div>
                <div style={{ fontSize: 11, color: "#A1A1AA" }}>{pct.toFixed(0)}%</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Logged Distribution */}
      {logs.length > 0 && (
        <Card style={{ marginBottom: isMobile ? 16 : 24 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Logged Workouts by Category</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#A1A1AA" }}>{logs.length} workouts logged</p>
          <div style={{ display: "flex", gap: isMobile ? 8 : 12, flexWrap: "wrap" }}>
            {cats.map(c => {
              const ct = logCounts[c] || 0;
              const pct = logs.length ? (ct / logs.length) * 100 : 0;
              return (
                <div key={c} style={{ flex: isMobile ? "1 1 40%" : 1, textAlign: "center", minWidth: 0 }}>
                  <div style={{ height: 10, borderRadius: 5, background: colors[c]?.light, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: colors[c]?.bg, borderRadius: 5, transition: "width .4s" }} />
                  </div>
                  <Badge color={colors[c]?.bg}>{c}</Badge>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#18181B", marginTop: 4 }}>{ct}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Recent Activity</h3>
        {recent.length === 0 ? <p style={{ color: "#A1A1AA", fontSize: 14 }}>No workouts logged yet.</p> : recent.map(l => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F4F4F5", fontSize: 14, gap: 8, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Badge color={colors[l.category]?.bg || "#71717A"}>{l.category}</Badge><span>{l.exercise_name}</span></span>
            <span style={{ color: "#71717A", fontSize: 12 }}>{l.athlete_name} · {new Date(l.date).toLocaleDateString()}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
