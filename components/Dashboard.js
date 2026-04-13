"use client";
import { Badge, Card } from "./ui";

export default function Dashboard({ athletes, programs, logs, cats, colors, isMobile }) {
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
