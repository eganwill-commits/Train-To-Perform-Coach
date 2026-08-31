"use client";
import { useState } from "react";
import { Badge, Btn, Card, Input, Select, Modal, EmptyState, SearchableSelect } from "./ui";
import { roomLabel } from "../lib/constants";

/* Local calendar date, not UTC — see the note in AthleteView.js. */
const localDateISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};


function formatDate(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function formatLoggedAt(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function LogPage({ logs, addLog, deleteLog, unlogDay, athletes, exercises, cats, colors, isMobile }) {
  const [selectedAthlete, setSelectedAthlete] = useState("all");
  const [tab, setTab] = useState("workouts");
  const [modal, setModal] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [expandedExercise, setExpandedExercise] = useState(null);
  const [form, setForm] = useState({ athlete_id: "", exercise_id: "", category: "", sets: "", reps: "", load: "", rpe: "", notes: "", date: localDateISO() });

  const openNew = () => {
    const c = cats[0];
    const fx = exercises.find(e => e.category === c);
    setForm({ athlete_id: selectedAthlete !== "all" ? selectedAthlete : (athletes[0]?.id || ""), exercise_id: fx?.id || "", category: c, sets: "", reps: "", load: "", rpe: "", notes: "", date: localDateISO() });
    setModal(true);
  };

  const save = async () => {
    const ex = exercises.find(e => e.id === form.exercise_id);
    const ath = athletes.find(a => a.id === form.athlete_id);
    await addLog({ ...form, exercise_name: ex?.name || "Unknown", athlete_name: ath?.name || "Unknown" });
    setModal(false);
  };

  const catEx = exercises.filter(e => e.category === form.category);

  // Filter logs by selected athlete
  const filteredLogs = selectedAthlete === "all" ? logs : logs.filter(l => l.athlete_id === selectedAthlete);

  // Get athletes that have logs
  const athletesWithLogs = athletes.filter(a => logs.some(l => l.athlete_id === a.id));

  // Group logs by athlete + date + day + week for Workouts view
  const grouped = {};
  filteredLogs.forEach(l => {
    const key = `${l.athlete_id || l.athlete_name}-${l.date}-${l.day_label || ""}-${l.week_label || ""}`;
    if (!grouped[key]) {
      grouped[key] = { key, athlete_name: l.athlete_name, athlete_id: l.athlete_id, date: l.date, logged_at: l.logged_at, week_label: l.week_label || "", day_label: l.day_label || "", entries: [], categories: new Set(), rooms: new Set() };
    }
    grouped[key].entries.push(l);
    if (l.category) grouped[key].categories.add(l.category);
    if (l.equipment_tier) grouped[key].rooms.add(l.equipment_tier);
    if (l.logged_at && (!grouped[key].logged_at || new Date(l.logged_at) > new Date(grouped[key].logged_at))) {
      grouped[key].logged_at = l.logged_at;
    }
    if (l.week_label && !grouped[key].week_label) grouped[key].week_label = l.week_label;
    if (l.day_label && !grouped[key].day_label) grouped[key].day_label = l.day_label;
  });
  // Deduplicate: keep most recent log per exercise within each day
  Object.values(grouped).forEach(day => {
    const seen = {};
    const deduped = [];
    day.entries.sort((a, b) => new Date(b.logged_at || b.date) - new Date(a.logged_at || a.date));
    day.entries.forEach(l => {
      const norm = (l.exercise_name || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
      if (!seen[norm]) { seen[norm] = true; deduped.push(l); }
    });
    day.entries = deduped;
  });
  const sortedDays = Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Exercises sorted by most recent, deduped by exercise name per athlete
  const exerciseDeduped = (() => {
    const sorted = [...filteredLogs].sort((a, b) => new Date(b.logged_at || b.date) - new Date(a.logged_at || a.date));
    const seen = {};
    return sorted.filter(l => {
      const key = `${l.athlete_id}-${(l.exercise_name || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim()}`;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  })();

  const datesAreDifferent = (workoutDate, loggedAt) => {
    if (!loggedAt) return false;
    return new Date(workoutDate + "T12:00:00").toDateString() !== new Date(loggedAt).toDateString();
  };

  const tabStyle = (active) => ({
    padding: "8px 16px", borderRadius: 8, border: "none",
    background: active ? "#18181B" : "transparent",
    color: active ? "#fff" : "#71717A",
    fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  });

  const athletePillStyle = (active) => ({
    padding: "6px 14px", borderRadius: 20, border: active ? "2px solid #18181B" : "1px solid #E4E4E7",
    background: active ? "#18181B" : "#fff", color: active ? "#fff" : "#52525B",
    fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Log</h2>
        <Btn onClick={openNew} small={isMobile}>+ Log</Btn>
      </div>

      {/* Athlete pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => { setSelectedAthlete("all"); setExpandedDay(null); setExpandedExercise(null); }} style={athletePillStyle(selectedAthlete === "all")}>All Athletes</button>
        {athletesWithLogs.map(a => (
          <button key={a.id} onClick={() => { setSelectedAthlete(a.id); setExpandedDay(null); setExpandedExercise(null); }} style={athletePillStyle(selectedAthlete === a.id)}>
            {a.name}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>{logs.filter(l => l.athlete_id === a.id).length}</span>
          </button>
        ))}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#F4F4F5", borderRadius: 10, padding: 4, width: "fit-content" }}>
        <button onClick={() => { setTab("workouts"); setExpandedExercise(null); }} style={tabStyle(tab === "workouts")}>Workouts Logged</button>
        <button onClick={() => { setTab("exercises"); setExpandedDay(null); }} style={tabStyle(tab === "exercises")}>Exercises Logged</button>
      </div>

      {/* ===================== WORKOUTS TAB ===================== */}
      {tab === "workouts" && (
        <>
          {sortedDays.length === 0 ? <EmptyState icon="◇" title="No workouts logged" sub={selectedAthlete !== "all" ? "No workouts for this athlete yet." : "Start tracking."} action="+ Log Workout" onAction={openNew} /> : (() => {
            // Group sorted days by athlete
            const byAthlete = {};
            sortedDays.forEach(day => {
              const aid = day.athlete_id || "unknown";
              if (!byAthlete[aid]) byAthlete[aid] = { name: day.athlete_name, id: aid, days: [] };
              byAthlete[aid].days.push(day);
            });
            const athleteGroups = Object.values(byAthlete).sort((a, b) => a.name.localeCompare(b.name));
            // If filtered to one athlete, don't show the header
            const showHeaders = selectedAthlete === "all" && athleteGroups.length > 1;

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: showHeaders ? 20 : 10 }}>
                {athleteGroups.map(ag => (
                  <div key={ag.id}>
                    {showHeaders && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 6, borderBottom: "2px solid #18181B" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: "#18181B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>
                          {ag.name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{ag.name}</div>
                          <div style={{ fontSize: 12, color: "#71717A" }}>{ag.days.length} workout{ag.days.length !== 1 ? "s" : ""} · {ag.days.reduce((s, d) => s + d.entries.length, 0)} exercises</div>
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {ag.days.map(day => {
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
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {!showHeaders && selectedAthlete === "all" && <span style={{ fontWeight: 700, fontSize: 15 }}>{day.athlete_name}</span>}
                          <span style={{ fontWeight: selectedAthlete !== "all" ? 700 : 500, fontSize: selectedAthlete !== "all" ? 15 : 13, color: selectedAthlete !== "all" ? "#18181B" : "#52525B" }}>
                            {formatDate(day.date)}
                          </span>
                          {(day.week_label || day.day_label) && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#F97316", background: "#FFF7ED", padding: "1px 8px", borderRadius: 4 }}>
                              {day.week_label ? day.week_label.replace(/WEEK\s*/i, "W").split("—")[0].trim() : ""}{day.day_label ? ` ${day.day_label}` : ""}
                            </span>
                          )}
                          {(() => {
                            const rooms = Array.from(day.rooms || []).map(roomLabel).filter(Boolean);
                            if (!rooms.length) return null;
                            return <span style={{ fontSize: 11, fontWeight: 700, color: "#0F766E", background: "#F0FDFA", border: "1px solid #99F6E4", padding: "1px 8px", borderRadius: 4 }}>{rooms.join(" \u00b7 ")}</span>;
                          })()}
                        </div>
                        <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
                          {day.entries.length} exercise{day.entries.length !== 1 ? "s" : ""}
                        </div>
                        {showLoggedDate && (
                          <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 1 }}>Logged {formatLoggedAt(day.logged_at)}</div>
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
                                <div key={l.id} style={{ marginBottom: 2 }}>
                                  <div
                                    onClick={(e) => { e.stopPropagation(); setExpandedExercise(expandedExercise === l.id ? null : l.id); }}
                                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0 6px 12px", borderBottom: "1px solid #F4F4F5", gap: 8, cursor: "pointer" }}
                                  >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.exercise_name}</div>
                                      <div style={{ fontSize: 12, color: "#71717A" }}>
                                        {[l.sets && l.reps ? `${l.sets}×${l.reps}` : l.reps || l.sets || null, l.load ? `@ ${l.load}` : null, l.rpe ? `RPE ${l.rpe}` : null].filter(Boolean).join(" · ") || "—"}
                                      </div>
                                    </div>
                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                      <span style={{ fontSize: 12, color: "#A1A1AA" }}>{expandedExercise === l.id ? "▲" : "▸"}</span>
                                      <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this exercise?")) deleteLog(l.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D8", fontSize: 14, flexShrink: 0 }} title="Delete">✕</button>
                                    </div>
                                  </div>
                                  {expandedExercise === l.id && (
                                    <div style={{ padding: "8px 12px 10px", background: "#FAFAFA", borderRadius: "0 0 8px 8px", marginBottom: 4 }}>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                                        <div><div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>Sets</div><div style={{ fontSize: 14, fontWeight: 600 }}>{l.sets || "—"}</div></div>
                                        <div><div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>Reps</div><div style={{ fontSize: 14, fontWeight: 600 }}>{l.reps || "—"}</div></div>
                                        <div><div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>Load</div><div style={{ fontSize: 14, fontWeight: 600 }}>{l.load || "—"}</div></div>
                                        <div><div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>RPE</div><div style={{ fontSize: 14, fontWeight: 600 }}>{l.rpe || "—"}</div></div>
                                        <div><div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>Category</div><div style={{ fontSize: 14, fontWeight: 600 }}>{l.category || "—"}</div></div>
                                        <div><div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>Date</div><div style={{ fontSize: 14, fontWeight: 600 }}>{formatDate(l.date)}</div></div>
                                      </div>
                                      {l.notes && (
                                        <div style={{ padding: "6px 8px", background: "#F4F4F5", borderRadius: 6 }}>
                                          <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", marginBottom: 2 }}>Notes</div>
                                          <div style={{ fontSize: 13, color: "#18181B", whiteSpace: "pre-wrap" }}>{l.notes}</div>
                                        </div>
                                      )}
                                      {l.logged_at && (
                                        <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 6 }}>Logged {formatLoggedAt(l.logged_at)}</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
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
                              Delete Entire Workout ({day.entries.length} exercises)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}

      {/* ===================== EXERCISES TAB ===================== */}
      {tab === "exercises" && (
        <>
          {exerciseDeduped.length === 0 ? <EmptyState icon="◇" title="No exercises logged" sub={selectedAthlete !== "all" ? "No exercises for this athlete yet." : "Start tracking."} /> : (() => {
            const byAthlete = {};
            exerciseDeduped.forEach(l => {
              const aid = l.athlete_id || "unknown";
              if (!byAthlete[aid]) byAthlete[aid] = { name: l.athlete_name, id: aid, exercises: [] };
              byAthlete[aid].exercises.push(l);
            });
            const groups = Object.values(byAthlete).sort((a, b) => a.name.localeCompare(b.name));
            const showHeaders = selectedAthlete === "all" && groups.length > 1;

            return (
            <div>
              <div style={{ fontSize: 13, color: "#71717A", marginBottom: 12 }}>{exerciseDeduped.length} exercise{exerciseDeduped.length !== 1 ? "s" : ""} logged</div>
              <div style={{ display: "flex", flexDirection: "column", gap: showHeaders ? 20 : 6 }}>
                {groups.map(ag => (
                  <div key={ag.id}>
                    {showHeaders && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 6, borderBottom: "2px solid #18181B" }}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, background: "#18181B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }}>
                          {ag.name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{ag.name}</div>
                          <div style={{ fontSize: 12, color: "#71717A" }}>{ag.exercises.length} exercise{ag.exercises.length !== 1 ? "s" : ""}</div>
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {ag.exercises.map(l => {
                  const cc = colors[l.category];
                  const isExpanded = expandedExercise === l.id;
                  return (
                    <Card key={l.id} style={{ padding: 0, overflow: "hidden" }}>
                      <div
                        onClick={() => setExpandedExercise(isExpanded ? null : l.id)}
                        style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: isExpanded ? "#F9FAFB" : "#fff", borderBottom: isExpanded ? "1px solid #E4E4E7" : "none" }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, fontSize: 14 }}>{l.exercise_name}</span>
                            {l.category && <Badge color={cc?.bg || "#71717A"}>{l.category}</Badge>}
                          </div>
                          <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
                            {!showHeaders && selectedAthlete === "all" && <><span style={{ fontWeight: 600, color: "#52525B" }}>{l.athlete_name}</span> · </>}
                            {formatDate(l.date)}
                            {(l.week_label || l.day_label) && <> · <span style={{ color: "#F97316" }}>{l.week_label ? l.week_label.replace(/WEEK\s*/i, "W").split("—")[0].trim() : ""} {l.day_label || ""}</span></>}
                            {" · "}{[l.sets && l.reps ? `${l.sets}×${l.reps}` : null, l.load ? `@${l.load}` : null].filter(Boolean).join(" ") || "—"}
                          </div>
                          {l.notes && !isExpanded && <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📝 {l.notes}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 14, color: "#A1A1AA", transition: "transform .2s", transform: isExpanded ? "rotate(180deg)" : "none" }}>▼</span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: "12px 14px 14px", background: "#FAFAFA" }}>
                          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                            <div style={{ background: "#fff", padding: "8px 10px", borderRadius: 8, border: "1px solid #E4E4E7" }}>
                              <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.5 }}>Sets</div>
                              <div style={{ fontSize: 18, fontWeight: 700 }}>{l.sets || "—"}</div>
                            </div>
                            <div style={{ background: "#fff", padding: "8px 10px", borderRadius: 8, border: "1px solid #E4E4E7" }}>
                              <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.5 }}>Reps</div>
                              <div style={{ fontSize: 18, fontWeight: 700 }}>{l.reps || "—"}</div>
                            </div>
                            <div style={{ background: "#fff", padding: "8px 10px", borderRadius: 8, border: "1px solid #E4E4E7" }}>
                              <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.5 }}>Load</div>
                              <div style={{ fontSize: 18, fontWeight: 700 }}>{l.load || "—"}</div>
                            </div>
                            <div style={{ background: "#fff", padding: "8px 10px", borderRadius: 8, border: "1px solid #E4E4E7" }}>
                              <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.5 }}>RPE</div>
                              <div style={{ fontSize: 18, fontWeight: 700 }}>{l.rpe || "—"}</div>
                            </div>
                          </div>

                          {selectedAthlete === "all" && (
                            <div style={{ fontSize: 13, color: "#52525B", marginBottom: 8 }}>
                              <span style={{ fontWeight: 600 }}>Athlete:</span> {l.athlete_name}
                            </div>
                          )}

                          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#71717A", marginBottom: 8 }}>
                            <span><span style={{ fontWeight: 600 }}>Date:</span> {formatDate(l.date)}</span>
                            {l.category && <span><span style={{ fontWeight: 600 }}>Category:</span> {l.category}</span>}
                            {(l.week_label || l.day_label) && <span><span style={{ fontWeight: 600 }}>Program:</span> {l.week_label} {l.day_label}</span>}
                          </div>

                          {l.notes && (
                            <div style={{ padding: "8px 10px", background: "#fff", borderRadius: 8, border: "1px solid #E4E4E7", marginBottom: 8 }}>
                              <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Notes</div>
                              <div style={{ fontSize: 13, color: "#18181B", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{l.notes}</div>
                            </div>
                          )}

                          {l.logged_at && (
                            <div style={{ fontSize: 11, color: "#A1A1AA" }}>Logged {formatLoggedAt(l.logged_at)}</div>
                          )}

                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #E4E4E7" }}>
                            <button
                              onClick={() => { if (confirm(`Delete ${l.exercise_name}?`)) deleteLog(l.id); }}
                              style={{ padding: "6px 14px", background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                            >
                              Delete Exercise
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            );
          })()}
        </>
      )}

      {/* ===================== LOG MODAL ===================== */}
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
