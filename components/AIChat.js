"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { Btn } from "./ui";

const ATHLETE_PROMPTS = [
  "What's my workout for this week?",
  "How has my back squat progressed?",
  "What's coming up next week?",
  "Summarize my training so far",
  "What should I focus on improving?",
  "What does my coach want me to work on?",
];

const COACH_PROMPTS = [
  "Analyze my athletes' progress so far",
  "Which athlete needs the most attention right now?",
  "How should I adjust programming for missed sessions?",
  "Suggest progression for next week based on current loads",
  "What are the biggest strength gaps across my athletes?",
  "How should I modify workouts for an athlete with knee issues?",
];

function buildAthleteContext(athlete, programs, logs, baselines, videoSubs) {
  if (!athlete) return "";
  let ctx = "\n\n--- YOUR TRAINING DATA ---\n";
  ctx += `Athlete: ${athlete.name} | Age: ${athlete.age || "?"} | Sport: ${athlete.sport || "?"}\n`;
  if (athlete.notes) ctx += `Coach notes on you: ${athlete.notes}\n`;

  // Baselines
  const ab = (baselines || []).filter(b => b.athlete_id === athlete.id);
  if (ab.length > 0) {
    ctx += "\n## Your Baselines\n";
    ab.forEach(b => {
      ctx += `  ${b.movement}: Week 1 = ${b.week1_result || "—"}, Week 12 = ${b.week12_result || "—"} (Target: ${b.target} ${b.units})`;
      if (b.week1_notes) ctx += ` [${b.week1_notes}]`;
      if (b.week12_notes) ctx += ` [${b.week12_notes}]`;
      ctx += "\n";
    });
  }

  // Programs — ALL weeks with full exercise detail
  const ap = (programs || []).filter(p => p.athlete_id === athlete.id);
  ap.forEach(p => {
    const weeks = p.weeks || [];
    // Find current week
    const currentWi = weeks.findIndex(w => {
      if (w.status === "completed" || w.status === "missed") return false;
      const days = w.days || [];
      if (days.length === 0) return true;
      return !days.every(d => d.status === "completed" || d.status === "missed");
    });
    ctx += `\n## Program: ${p.name} (${weeks.length} weeks total, currently on Week ${currentWi >= 0 ? currentWi + 1 : "?"})\n`;
    weeks.forEach((w, wi) => {
      const wStatus = w.status || "";
      const isCurrent = wi === currentWi;
      const isUpcoming = currentWi >= 0 && wi > currentWi;
      const tag = isCurrent ? " ← CURRENT WEEK" : isUpcoming ? " [UPCOMING]" : wStatus ? ` [${wStatus}]` : "";
      ctx += `\n### ${w.label || `Week ${wi + 1}`}${tag}\n`;
      if (w.coachRecap) ctx += `Coach Recap: ${w.coachRecap}\n`;
      (w.days || []).forEach(d => {
        if (!d.blocks || d.blocks.length === 0) return;
        const ds = d.status || wStatus || "";
        const dayTag = ds === "completed" ? " ✓" : ds === "missed" ? " ✗" : isUpcoming || isCurrent ? " [PLANNED]" : "";
        ctx += `  ${d.label}${dayTag}: `;
        ctx += d.blocks.map(b => {
          const name = b.exerciseName || "?";
          let detail = `${b.category} ${name}`;
          if (b.sets || b.reps) detail += ` ${b.sets || ""}×${b.reps || ""}`;
          if (b.load) detail += ` @${b.load}`;
          if (b.tempo) detail += ` tempo:${b.tempo}`;
          if (b.notes) detail += ` (${b.notes.slice(0, 80)})`;
          return detail;
        }).join(" | ");
        if (d.coachNotes && d.coachNotesShared) ctx += ` [Coach: ${d.coachNotes}]`;
        ctx += "\n";
      });
    });
  });

  // ALL logs — grouped by week and day for progression tracking
  const athleteLogs = (logs || []).filter(l => l.athlete_id === athlete.id);
  if (athleteLogs.length > 0) {
    ctx += "\n## Your Workout Log (ALL logged results)\n";
    // Group by week_label then day_label
    const byWeek = {};
    athleteLogs.forEach(l => {
      const wk = l.week_label || "Unknown Week";
      if (!byWeek[wk]) byWeek[wk] = {};
      const dy = l.day_label || l.date;
      if (!byWeek[wk][dy]) byWeek[wk][dy] = [];
      byWeek[wk][dy].push(l);
    });
    Object.entries(byWeek).forEach(([weekLabel, days]) => {
      ctx += `\n  ${weekLabel}:\n`;
      Object.entries(days).forEach(([dayLabel, entries]) => {
        const date = entries[0]?.date || "";
        ctx += `    ${dayLabel} (${date}): `;
        // Dedup
        const seen = {};
        const deduped = [];
        entries.sort((a, b) => new Date(b.logged_at || b.date) - new Date(a.logged_at || a.date));
        entries.forEach(l => {
          const n = (l.exercise_name || "").toLowerCase().trim();
          if (!seen[n]) { seen[n] = true; deduped.push(l); }
        });
        ctx += deduped.map(l =>
          `${l.exercise_name} ${l.sets || ""}×${l.reps || ""}${l.load ? ` @${l.load}` : ""}${l.rpe ? ` RPE${l.rpe}` : ""}${l.notes ? ` "${l.notes}"` : ""}`
        ).join(" | ");
        ctx += "\n";
      });
    });

    // Build exercise progression summary for key lifts
    ctx += "\n## Exercise Progression Summary (load over time)\n";
    const liftMap = {};
    athleteLogs.forEach(l => {
      if (!l.load || !l.exercise_name) return;
      const name = l.exercise_name;
      if (!liftMap[name]) liftMap[name] = [];
      liftMap[name].push({ date: l.date, week: l.week_label, load: l.load, sets: l.sets, reps: l.reps, notes: l.notes });
    });
    Object.entries(liftMap).forEach(([name, entries]) => {
      if (entries.length < 1) return;
      entries.sort((a, b) => new Date(a.date) - new Date(b.date));
      ctx += `  ${name}: `;
      ctx += entries.map(e => `${e.week?.replace(/WEEK \d+ — /, "W") || e.date} ${e.sets || ""}×${e.reps || ""} @${e.load}`).join(" → ");
      ctx += "\n";
    });
  }

  // Videos
  const av = (videoSubs || []).filter(v => v.athlete_id === athlete.id);
  if (av.length > 0) {
    ctx += `\n## Video Submissions: ${av.length} total\n`;
    av.forEach(v => {
      ctx += `  ${v.exercise_name || "?"}: ${v.status}${v.coach_feedback ? ` — "${v.coach_feedback}"` : ""}\n`;
    });
  }

  return ctx;
}

function buildCoachContext(athletes, programs, logs, exercises, baselines, videoSubs) {
  if (!athletes || athletes.length === 0) return "";
  let ctx = "\n\n--- COACH DATA: YOUR ATHLETES ---\n";
  athletes.forEach(a => {
    ctx += `\n## ${a.name} (Age: ${a.age || "?"}, Sport: ${a.sport || "?"})${a.notes ? ` — ${a.notes}` : ""}\n`;
    const ab = (baselines || []).filter(b => b.athlete_id === a.id);
    if (ab.length > 0) {
      ctx += "Baselines:\n";
      ab.forEach(b => {
        ctx += `  - ${b.movement}: W1=${b.week1_result || "—"} W12=${b.week12_result || "—"} (${b.target} ${b.units})`;
        if (b.week1_notes) ctx += ` [${b.week1_notes}]`;
        ctx += "\n";
      });
    }
    const ap = (programs || []).filter(p => p.athlete_id === a.id);
    ap.forEach(p => {
      const weeks = p.weeks || [];
      const compWeeks = weeks.filter(w => w.status === "completed").length;
      const missWeeks = weeks.filter(w => w.status === "missed").length;
      let compDays = 0, missDays = 0, totalDays = 0;
      weeks.forEach(w => {
        (w.days || []).forEach(d => {
          if (d.blocks && d.blocks.length > 0) {
            totalDays++;
            const ds = d.status || w.status || "";
            if (ds === "completed") compDays++;
            else if (ds === "missed") missDays++;
          }
        });
      });
      ctx += `Program: ${p.name} — ${weeks.length} weeks, ${compWeeks} wk completed, ${missWeeks} wk missed`;
      ctx += ` | Sessions: ${compDays}/${totalDays} done, ${missDays} missed\n`;
      const currentWi = weeks.findIndex(w => w.status !== "completed" && w.status !== "missed");
      if (currentWi >= 0) {
        const cw = weeks[currentWi];
        ctx += `  Current: ${cw.label || `Week ${currentWi + 1}`}\n`;
        (cw.days || []).forEach(d => {
          if (d.blocks && d.blocks.length > 0) {
            ctx += `    ${d.label}${d.status ? ` [${d.status}]` : ""}: `;
            ctx += d.blocks.map(b => {
              const exName = b.exerciseName || (exercises || []).find(e => e.id === b.exerciseId)?.name || "?";
              return `${b.category} ${exName} ${b.sets || ""}×${b.reps || ""}${b.load ? ` @${b.load}` : ""}`;
            }).join(" | ");
            if (d.coachNotes) ctx += ` [Coach: ${d.coachNotes}]`;
            ctx += "\n";
          }
        });
        if (cw.coachRecap) ctx += `  Weekly Recap: ${cw.coachRecap}\n`;
      }
    });
    const recentLogs = (logs || []).filter(l => l.athlete_id === a.id && (new Date() - new Date(l.date)) / 86400000 < 14);
    if (recentLogs.length > 0) {
      ctx += `Recent activity (last 14 days): ${recentLogs.length} exercises logged\n`;
      const byDate = {};
      recentLogs.forEach(l => {
        const key = `${l.date} ${l.week_label || ""} ${l.day_label || ""}`.trim();
        if (!byDate[key]) byDate[key] = [];
        byDate[key].push(l);
      });
      Object.entries(byDate).slice(0, 6).forEach(([dateKey, entries]) => {
        ctx += `  ${dateKey}: `;
        ctx += entries.map(l => `${l.category} ${l.exercise_name} ${l.sets}×${l.reps}${l.load ? ` @${l.load}` : ""}${l.rpe ? ` RPE${l.rpe}` : ""}${l.notes ? ` "${l.notes}"` : ""}`).join(" | ");
        ctx += "\n";
      });
    }
    const av = (videoSubs || []).filter(v => v.athlete_id === a.id);
    if (av.length > 0) {
      const pending = av.filter(v => v.status === "pending").length;
      const needsWork = av.filter(v => v.status === "needs-work").length;
      ctx += `Videos: ${av.length} submitted`;
      if (pending > 0) ctx += `, ${pending} pending review`;
      if (needsWork > 0) ctx += `, ${needsWork} need work`;
      ctx += "\n";
    }
  });
  return ctx;
}

export default function AIChat({ isMobile, athleteName, isCoach, athletes, programs, logs, exercises, baselines, videoSubs, athlete }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const coachContext = useMemo(() => {
    if (!isCoach) return "";
    return buildCoachContext(athletes, programs, logs, exercises, baselines, videoSubs);
  }, [isCoach, athletes, programs, logs, exercises, baselines, videoSubs]);

  const athleteContext = useMemo(() => {
    if (isCoach || !athlete) return "";
    return buildAthleteContext(athlete, programs, logs, baselines, videoSubs);
  }, [isCoach, athlete, programs, logs, baselines, videoSubs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, coachContext: coachContext || undefined, athleteContext: athleteContext || undefined }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages([...newMessages, { role: "assistant", content: "⚠️ " + data.error }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.text }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setLoading(false);
  };

  const quickPrompts = isCoach ? COACH_PROMPTS : ATHLETE_PROMPTS;

  return (
    <div style={{ maxWidth: "100%", overflowX: "hidden", display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 60px)" : "calc(100dvh - 64px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 28, fontFamily: "'Space Mono', monospace" }}>T2P Assistant</h2>
          <p style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
            {isCoach ? "Analyze athletes, plan progressions, get coaching insights" : athlete ? "Your program, logs, and progress data are loaded" : "Ask about movements, form, scaling, recovery & more"}
          </p>
        </div>
        {messages.length > 0 && <Btn small variant="secondary" onClick={() => setMessages([])}>Clear</Btn>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", marginBottom: 8 }}>
        {messages.length === 0 ? (
          <div style={{ padding: isMobile ? "20px 0" : "40px 0" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{isCoach ? "🧠" : "💪"}</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#18181B" }}>
                {isCoach ? "Your coaching assistant" : `How can I help${athleteName ? `, ${athleteName}` : ""}?`}
              </div>
              <p style={{ fontSize: 13, color: "#71717A", marginTop: 4 }}>
                {isCoach
                  ? `I have access to ${(athletes || []).length} athlete${(athletes || []).length !== 1 ? "s" : ""}, their programs, logs, baselines, and video submissions.`
                  : athlete
                    ? `I have access to your ${(programs || []).length} program${(programs || []).length !== 1 ? "s" : ""}, ${(logs || []).length} logged exercises, and ${(baselines || []).length} baselines.`
                    : `I know T2P programming, exercises, form cues, scaling, and recovery.`}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 440, margin: "0 auto" }}>
              {quickPrompts.map((q, i) => (
                <button key={i} onClick={() => send(q)} style={{ padding: "10px 14px", border: "1px solid #E4E4E7", borderRadius: 10, background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left", color: "#52525B", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#F97316", fontWeight: 700, fontSize: 14 }}>→</span>{q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: m.role === "user" ? "#18181B" : "#F4F4F5", color: m.role === "user" ? "#fff" : "#18181B", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "10px 14px", borderRadius: "14px 14px 14px 4px", background: "#F4F4F5", fontSize: 14, color: "#A1A1AA" }}>Analyzing…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, display: "flex", gap: 8, paddingTop: 8, borderTop: "1px solid #E4E4E7" }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={isCoach ? "Ask about an athlete, progression, or programming…" : "Ask about your progress, lifts, programming, or technique…"}
          style={{ flex: 1, padding: "10px 14px", border: "1px solid #E4E4E7", borderRadius: 10, fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff" }}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{ padding: "10px 16px", background: loading || !input.trim() ? "#D4D4D8" : "#F97316", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: loading || !input.trim() ? "default" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          Send
        </button>
      </div>
    </div>
  );
}
