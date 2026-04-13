"use client";
import { useState } from "react";
import { Badge, Btn, Card, Input, Select, Modal, EmptyState, SearchableSelect } from "./ui";

function formatDate(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function formatLoggedAt(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function LogPage({ logs, addLog, deleteLog, unlogDay, athletes, exercises, cats, colors, isMobile }) {
  const [modal, setModal] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [form, setForm] = useState({ athlete_id: "", exercise_id: "", category: "", sets: "", reps: "", load: "", rpe: "", notes: "", date: new Date().toISOString().slice(0, 10) });

  const openNew = () => {
    const c = cats[0];
    const fx = exercises.find(e => e.category === c);
    setForm({ athlete_id: athletes[0]?.id || "", exercise_id: fx?.id || "", category: c, sets: "", reps: "", load: "", rpe: "", notes: "", date: new Date().toISOString().slice(0, 10) });
    setModal(true);
  };

  const save = async () => {
    const ex = exercises.find(e => e.id === form.exercise_id);
    const ath = athletes.find(a => a.id === form.athlete_id);
    await addLog({ ...form, exercise_name: ex?.name || "Unknown", athlete_name: ath?.name || "Unknown" });
    setModal(false);
  };

  const catEx = exercises.filter(e => e.category === form.category);

  // Group logs by athlete + date
  const grouped = {};
  logs.forEach(l => {
    const key = `${l.athlete_id || l.athlete_name}-${l.date}-${l.day_label || ""}`;
    if (!grouped[key]) {
      grouped[key] = { key, athlete_name: l.athlete_name, athlete_id: l.athlete_id, date: l.date, logged_at: l.logged_at, week_label: l.week_label || "", day_label: l.day_label || "", entries: [], categories: new Set() };
    }
    grouped[key].entries.push(l);
    if (l.category) grouped[key].categories.add(l.category);
    if (l.logged_at && (!grouped[key].logged_at || new Date(l.logged_at) > new Date(grouped[key].logged_at))) {
      grouped[key].logged_at = l.logged_at;
    }
    if (l.week_label && !grouped[key].week_label) grouped[key].week_label = l.week_label;
    if (l.day_label && !grouped[key].day_label) grouped[key].day_label = l.day_label;
  });

  const sortedDays = Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Check if logged_at date differs from workout date
  const datesAreDifferent = (workoutDate, loggedAt) => {
    if (!loggedAt) return false;
    const wd = new Date(workoutDate + "T12:00:00").toDateString();
    const ld = new Date(loggedAt).toDateString();
    return wd !== ld;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Workout Log</h2>
        <Btn onClick={openNew} small={isMobile}>+ Log</Btn>
      </div>

      {sortedDays.length === 0 ? <EmptyState icon="◇" title="No workouts logged" sub="Start tracking." action="+ Log Workout" onAction={openNew} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sortedDays.map(day => {
            const isExpanded = expandedDay === day.key;
            const catArray = Array.from(day.categories);
            const showLoggedDate = datesAreDifferent(day.date, day.logged_at);

            return (
              <Card key={day.key} style={{ padding: 0, overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedDay(isExpanded ? null : day.key)}
                  style={{ padding: isMobile ? "12px 14px" : "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: isExpanded ? "#F9FAFB" : "#fff", borderBottom: isExpanded ? "1px solid #E4E4E7" : "none" }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{day.athlete_name}</span>
                      {(day.week_label || day.day_label) && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#F97316", background: "#FFF7ED", padding: "1px 8px", borderRadius: 4 }}>
                          {day.week_label ? day.week_label.replace(/WEEK\s*/i, "W").split("—")[0].trim() : ""}{day.day_label ? ` ${day.day_label}` : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
                      {formatDate(day.date)} · {day.entries.length} exercise{day.entries.length !== 1 ? "s" : ""}
                    </div>
                    {showLoggedDate && (
                      <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 1 }}>
                        Logged {formatLoggedAt(day.logged_at)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {catArray.map(c => <Badge key={c} color={colors[c]?.bg || "#71717A"}>{c}</Badge>)}
                    </div>
                    <span style={{ fontSize: 18, color: "#A1A1AA", transition: "transform .2s", transform: isExpanded ? "rotate(180deg)" : "none" }}>▼</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ padding: isMobile ? "10px 14px 14px" : "12px 18px 18px" }}>
                    {cats.filter(c => day.entries.some(e => e.category === c)).map(cat => {
                      const catEntries = day.entries.filter(e => e.category === cat);
                      const cc = colors[cat];
                      return (
                        <div key={cat} style={{ marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 4, height: 16, borderRadius: 2, background: cc?.bg || "#999" }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: cc?.text || "#52525B", textTransform: "uppercase", letterSpacing: 0.5 }}>{cat}</span>
                          </div>
                          {catEntries.map(l => (
                            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0 6px 12px", borderBottom: "1px solid #F4F4F5", gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{l.exercise_name}</div>
                                <div style={{ fontSize: 12, color: "#71717A" }}>
                                  {[
                                    l.sets && l.reps ? `${l.sets}×${l.reps}` : l.reps || l.sets || null,
                                    l.load ? `@ ${l.load}` : null,
                                    l.rpe ? `RPE ${l.rpe}` : null,
                                  ].filter(Boolean).join(" · ") || "—"}
                                </div>
                                {l.notes && <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 2, fontStyle: "italic" }}>{l.notes}</div>}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); deleteLog(l.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D8", fontSize: 14, flexShrink: 0 }}>✕</button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {/* Delete entire day */}
                    {unlogDay && (
                      <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid #E4E4E7" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const label = [day.week_label, day.day_label].filter(Boolean).join(" ") || formatDate(day.date);
                            if (confirm(`Delete ${day.entries.length} logged exercises for ${day.athlete_name} — ${label}?`)) {
                              unlogDay(day.athlete_id, day.date, day.day_label, day.week_label);
                              setExpandedDay(null);
                            }
                          }}
                          style={{ width: "100%", padding: "8px", background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Delete This Workout ({day.entries.length} exercises)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Log Workout">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          {athletes.length > 0 && <Select label="Athlete" value={form.athlete_id} onChange={e => setForm({ ...form, athlete_id: e.target.value })} options={athletes.map(a => ({ value: a.id, label: a.name }))} />}
          <Select label="Category" value={form.category} onChange={e => { const c = e.target.value; const fx = exercises.find(x => x.category === c); setForm({ ...form, category: c, exercise_id: fx?.id || "" }); }} options={cats} />
          <SearchableSelect label="Exercise" value={form.exercise_id} onChange={e => setForm({ ...form, exercise_id: e.target.value })} options={catEx.map(e => ({ value: e.id, label: e.name }))} placeholder="Search exercises…" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Sets" type="number" value={form.sets} onChange={e => setForm({ ...form, sets: e.target.value })} />
            <Input label="Reps" value={form.reps} onChange={e => setForm({ ...form, reps: e.target.value })} />
            <Input label="Load" value={form.load} onChange={e => setForm({ ...form, load: e.target.value })} placeholder="lbs" />
            <Input label="RPE" value={form.rpe} onChange={e => setForm({ ...form, rpe: e.target.value })} placeholder="1-10" />
          </div>
          <Input label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <Btn onClick={save} style={{ marginTop: 8 }}>Save</Btn>
        </div>
      </Modal>
    </div>
  );
}
