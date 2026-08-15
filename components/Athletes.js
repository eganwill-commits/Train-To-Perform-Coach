"use client";
import { useState, useEffect } from "react";
import { Badge, Btn, Card, Input, Modal, Select, EmptyState } from "./ui";

function formatDate(d) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Equipment access tiers — match the keys in exercises.variants (see t2p_seed.sql)
const TIER_OPTIONS = [
  { value: "full_gym", label: "Full Gym (barbell + machines)" },
  { value: "no_barbell", label: "No Barbell (machines + DBs)" },
  { value: "no_machine", label: "No Machines (CrossFit)" },
  { value: "hotel_gym", label: "Hotel Gym (DBs + cardio)" },
  { value: "db_bodyweight", label: "Dumbbells & Bodyweight" },
];
const TIER_LABEL = Object.fromEntries(TIER_OPTIONS.map(o => [o.value, o.label]));

// 8 characters: 3 from the name + 5 random. Alphabet excludes I/O/0/1 so a code
// can be read aloud or typed from a text message without ambiguity.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeAccessCode(name) {
  const prefix = (name || "ATH").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  let rest = "";
  const buf = new Uint32Array(5);
  (globalThis.crypto || window.crypto).getRandomValues(buf);
  for (let i = 0; i < 5; i++) rest += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return prefix + rest;
}

export default function Athletes({ athletes, addAthlete, updateAthlete, deleteAthlete, logs, colors, cats, isMobile, groups, groupAthletes, addAthleteToGroup, removeAthleteFromGroup, baselines, updateBaseline, addBaseline, deleteBaseline, videoSubs, updateVideoSub, deleteVideoSub, viewAsAthlete, focusAthleteId, onFocusClear, provisionLogin }) {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const needLogin = (athletes || []).filter(a => !a.auth_user_id);
  const [form, setForm] = useState({ name: "", age: "", sport: "", notes: "", equipment_tier: "full_gym" });
  const [showCode, setShowCode] = useState(null);
  const [detail, setDetail] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [editingBaseline, setEditingBaseline] = useState(null);
  const [baselineForm, setBaselineForm] = useState({});
  const [addingBaseline, setAddingBaseline] = useState(false);
  const [newBaselineForm, setNewBaselineForm] = useState({ movement: "", target: "", units: "lbs" });

  // Open athlete from external navigation (alerts)
  useEffect(() => {
    if (focusAthleteId) {
      setDetail(focusAthleteId);
      if (onFocusClear) onFocusClear();
    }
  }, [focusAthleteId]);

  const openNew = () => { setForm({ name: "", age: "", sport: "", notes: "", equipment_tier: "full_gym" }); setEdit(null); setModal(true); };
  const openEdit = (a) => { setForm({ name: a.name, age: a.age || "", sport: a.sport || "", notes: a.notes || "", equipment_tier: a.equipment_tier || "full_gym" }); setEdit(a.id); setModal(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    if (edit) { await updateAthlete(edit, form); }
    else { await addAthlete({ ...form, access_code: makeAccessCode(form.name) }); }
    setModal(false);
  };

  const activeAthlete = athletes.find(a => a.id === detail);

  // Athlete profile detail view
  if (detail && activeAthlete) {
    const athleteLogs = (logs || []).filter(l => l.athlete_id === activeAthlete.id);

    // Group by date + day_label + week_label
    const grouped = {};
    athleteLogs.forEach(l => {
      const key = `${l.date}-${l.day_label || ""}-${l.week_label || ""}`;
      if (!grouped[key]) { grouped[key] = { date: l.date, logged_at: l.logged_at, week_label: l.week_label || "", day_label: l.day_label || "", entries: [], categories: new Set() }; }
      grouped[key].entries.push(l);
      if (l.category) grouped[key].categories.add(l.category);
      if (l.logged_at && (!grouped[key].logged_at || new Date(l.logged_at) > new Date(grouped[key].logged_at))) grouped[key].logged_at = l.logged_at;
      if (l.week_label && !grouped[key].week_label) grouped[key].week_label = l.week_label;
      if (l.day_label && !grouped[key].day_label) grouped[key].day_label = l.day_label;
    });
    // Deduplicate: keep most recent log per exercise name within each day
    Object.values(grouped).forEach(day => {
      const seen = {};
      const deduped = [];
      // Sort entries by logged_at desc so newest comes first
      day.entries.sort((a, b) => new Date(b.logged_at || b.date) - new Date(a.logged_at || a.date));
      day.entries.forEach(l => {
        const norm = (l.exercise_name || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
        if (!seen[norm]) { seen[norm] = true; deduped.push(l); }
      });
      day.entries = deduped;
    });
    const sortedDays = Object.values(grouped).sort((a, b) => new Date(b.date) - new Date(a.date));

    // Stats
    const totalLogs = athleteLogs.length;
    const thisWeek = athleteLogs.filter(l => (new Date() - new Date(l.date)) / 86400000 < 7).length;
    const catCounts = {};
    cats.forEach(c => { catCounts[c] = 0; });
    athleteLogs.forEach(l => { if (catCounts[l.category] !== undefined) catCounts[l.category]++; });

    return (
      <div>
        <button onClick={() => setDetail(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#71717A", marginBottom: 12, fontFamily: "inherit" }}>← Back to Athletes</button>

        {/* Profile header */}
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>{activeAthlete.name}</h2>
              <div style={{ fontSize: 14, color: "#71717A", marginTop: 4 }}>{activeAthlete.sport}{activeAthlete.age ? ` · Age ${activeAthlete.age}` : ""}{activeAthlete.equipment_tier ? ` · ${TIER_LABEL[activeAthlete.equipment_tier] || activeAthlete.equipment_tier}` : ""}</div>
              {activeAthlete.notes && <p style={{ fontSize: 13, color: "#52525B", marginTop: 8, lineHeight: 1.5 }}>{activeAthlete.notes}</p>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {viewAsAthlete && <Btn small onClick={() => viewAsAthlete(activeAthlete)}>👁 View as athlete</Btn>}
              <Btn small variant="secondary" onClick={() => openEdit(activeAthlete)}>Edit</Btn>
            </div>
          </div>
          {/* Access code */}
          <div style={{ marginTop: 12, padding: "8px 12px", background: "#F4F4F5", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 11, color: "#71717A", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Athlete Code</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700, letterSpacing: 3, marginTop: 2, color: showCode === activeAthlete.id ? "#18181B" : "transparent", textShadow: showCode === activeAthlete.id ? "none" : "0 0 8px #18181B" }}>
                {activeAthlete.access_code || "—"}
              </div>
            </div>
            <button onClick={() => setShowCode(showCode === activeAthlete.id ? null : activeAthlete.id)} style={{ background: "none", border: "1px solid #D4D4D8", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "#52525B" }}>
              {showCode === activeAthlete.id ? "Hide" : "Show"}
            </button>
          </div>
        </Card>

        {/* Seasons */}
        {groups && groups.length > 0 && (
          <Card style={{ marginBottom: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Seasons</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {groups.map(g => {
                const isIn = (groupAthletes || []).some(ga => ga.group_id === g.id && ga.athlete_id === activeAthlete.id);
                return (
                  <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: isIn ? "#F0FDF4" : "#F9FAFB", border: `1px solid ${isIn ? "#4ADE80" : "#E4E4E7"}`, borderRadius: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: isIn ? "#18181B" : "#71717A" }}>{g.name}</div>
                      {g.description && <div style={{ fontSize: 12, color: "#A1A1AA", marginTop: 2 }}>{g.description}</div>}
                    </div>
                    <button
                      onClick={async () => {
                        if (isIn) { await removeAthleteFromGroup(g.id, activeAthlete.id); }
                        else { await addAthleteToGroup(g.id, activeAthlete.id); }
                      }}
                      style={{
                        padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 13,
                        background: isIn ? "#FEE2E2" : "#18181B",
                        color: isIn ? "#DC2626" : "#fff",
                      }}
                    >
                      {isIn ? "Remove" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{totalLogs}</div>
            <div style={{ fontSize: 12, color: "#71717A" }}>Total Logged</div>
          </Card>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{thisWeek}</div>
            <div style={{ fontSize: 12, color: "#71717A" }}>This Week</div>
          </Card>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{sortedDays.length}</div>
            <div style={{ fontSize: 12, color: "#71717A" }}>Sessions</div>
          </Card>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
              {cats.map(c => catCounts[c] > 0 && <Badge key={c} color={colors[c]?.bg}>{catCounts[c]}</Badge>)}
            </div>
            <div style={{ fontSize: 12, color: "#71717A", marginTop: 4 }}>By Pillar</div>
          </Card>
        </div>

        {/* Baseline Testing */}
        {(() => {
          const athleteBaselines = (baselines || []).filter(b => b.athlete_id === activeAthlete.id);
          return (
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Baseline Testing: Pre & Post</h3>
                <button onClick={() => { setAddingBaseline(true); setNewBaselineForm({ movement: "", target: "", units: "lbs" }); }} style={{ background: "#18181B", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>+ Add</button>
              </div>

              {/* Add new baseline form */}
              {addingBaseline && (
                <div style={{ padding: 12, background: "#F9FAFB", borderRadius: 8, border: "1px solid #E4E4E7", marginBottom: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: "#71717A" }}>Movement
                      <input value={newBaselineForm.movement} onChange={e => setNewBaselineForm({ ...newBaselineForm, movement: e.target.value })} placeholder="e.g. Back Squat 1RM" style={{ width: "100%", padding: "6px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} />
                    </label>
                    <label style={{ fontSize: 11, color: "#71717A" }}>Target
                      <input value={newBaselineForm.target} onChange={e => setNewBaselineForm({ ...newBaselineForm, target: e.target.value })} placeholder="e.g. 185" style={{ width: "100%", padding: "6px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} />
                    </label>
                    <label style={{ fontSize: 11, color: "#71717A" }}>Units
                      <select value={newBaselineForm.units} onChange={e => setNewBaselineForm({ ...newBaselineForm, units: e.target.value })} style={{ width: "100%", padding: "6px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box", background: "#fff" }}>
                        <option>lbs</option><option>kg</option><option>inches</option><option>cm</option><option>seconds</option><option>minutes</option><option>reps</option><option>meters</option><option>feet</option>
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button disabled={!newBaselineForm.movement.trim()} onClick={async () => {
                      await addBaseline({ athlete_id: activeAthlete.id, ...newBaselineForm, sort_order: athleteBaselines.length });
                      setAddingBaseline(false);
                    }} style={{ background: "#18181B", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, opacity: newBaselineForm.movement.trim() ? 1 : 0.5 }}>Add Baseline</button>
                    <button onClick={() => setAddingBaseline(false)} style={{ background: "none", border: "1px solid #D4D4D8", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "#71717A" }}>Cancel</button>
                  </div>
                </div>
              )}

              {athleteBaselines.length === 0 && !addingBaseline ? (
                <p style={{ color: "#A1A1AA", fontSize: 13, textAlign: "center", padding: 16 }}>No baselines yet. Click "+ Add" to create one.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #E4E4E7" }}>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, fontSize: 12, color: "#71717A", textTransform: "uppercase", letterSpacing: 0.5 }}>Movement</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, fontSize: 12, color: "#71717A", textTransform: "uppercase", letterSpacing: 0.5 }}>Target</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, fontSize: 12, color: "#F97316", textTransform: "uppercase", letterSpacing: 0.5 }}>Week 1</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, fontSize: 12, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5 }}>Week 12</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 700, fontSize: 12, color: "#71717A", textTransform: "uppercase", letterSpacing: 0.5 }}>Notes</th>
                        <th style={{ width: 60 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {athleteBaselines.map(b => {
                        const isEditing = editingBaseline === b.id;
                        if (isEditing) {
                          return (
                            <tr key={b.id} style={{ borderBottom: "1px solid #F4F4F5", background: "#FAFAFA" }}>
                              <td style={{ padding: "6px 8px" }}>
                                <input value={baselineForm.movement || ""} onChange={e => setBaselineForm({ ...baselineForm, movement: e.target.value })} style={{ width: "100%", padding: "4px 6px", border: "1px solid #E4E4E7", borderRadius: 4, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", fontWeight: 600 }} />
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <input value={baselineForm.target || ""} onChange={e => setBaselineForm({ ...baselineForm, target: e.target.value })} style={{ width: "60%", padding: "4px 6px", border: "1px solid #E4E4E7", borderRadius: 4, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                                  <select value={baselineForm.units || "lbs"} onChange={e => setBaselineForm({ ...baselineForm, units: e.target.value })} style={{ width: "40%", padding: "4px 4px", border: "1px solid #E4E4E7", borderRadius: 4, fontSize: 11, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" }}>
                                    <option>lbs</option><option>kg</option><option>inches</option><option>cm</option><option>seconds</option><option>minutes</option><option>reps</option><option>meters</option><option>feet</option>
                                  </select>
                                </div>
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <input value={baselineForm.week1_result || ""} onChange={e => setBaselineForm({ ...baselineForm, week1_result: e.target.value })} style={{ width: "100%", padding: "4px 6px", border: "1px solid #E4E4E7", borderRadius: 4, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <input value={baselineForm.week12_result || ""} onChange={e => setBaselineForm({ ...baselineForm, week12_result: e.target.value })} style={{ width: "100%", padding: "4px 6px", border: "1px solid #E4E4E7", borderRadius: 4, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <input value={baselineForm.week1_notes || ""} onChange={e => setBaselineForm({ ...baselineForm, week1_notes: e.target.value })} style={{ width: "100%", padding: "4px 6px", border: "1px solid #E4E4E7", borderRadius: 4, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
                              </td>
                              <td style={{ padding: "6px 8px", display: "flex", gap: 4 }}>
                                <button onClick={async () => { await updateBaseline(b.id, baselineForm); setEditingBaseline(null); }} style={{ background: "#18181B", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Save</button>
                                <button onClick={() => setEditingBaseline(null)} style={{ background: "none", border: "1px solid #D4D4D8", borderRadius: 4, padding: "4px 8px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "#71717A" }}>✕</button>
                              </td>
                            </tr>
                          );
                        }
                        return (
                          <tr key={b.id} style={{ borderBottom: "1px solid #F4F4F5" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 600 }}>{b.movement}</td>
                            <td style={{ padding: "8px 10px", color: "#71717A", fontSize: 12 }}>{b.target} <span style={{ color: "#A1A1AA" }}>({b.units})</span></td>
                            <td style={{ padding: "8px 10px", color: b.week1_result ? "#F97316" : "#D4D4D8", fontWeight: b.week1_result ? 600 : 400 }}>{b.week1_result || "—"}</td>
                            <td style={{ padding: "8px 10px", color: b.week12_result ? "#16A34A" : "#D4D4D8", fontWeight: b.week12_result ? 600 : 400 }}>{b.week12_result || "—"}</td>
                            <td style={{ padding: "8px 10px", color: "#A1A1AA", fontSize: 12, fontStyle: "italic" }}>{b.week1_notes || ""}</td>
                            <td style={{ padding: "8px 10px", display: "flex", gap: 4 }}>
                              <button onClick={() => { setEditingBaseline(b.id); setBaselineForm({ movement: b.movement || "", target: b.target || "", units: b.units || "lbs", week1_result: b.week1_result || "", week12_result: b.week12_result || "", week1_notes: b.week1_notes || "" }); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#A1A1AA", fontSize: 13 }}>✎</button>
                              <button onClick={() => { if (confirm(`Delete baseline "${b.movement}"?`)) deleteBaseline(b.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D8", fontSize: 13 }}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })()}

        {/* Video Submissions */}
        {(() => {
          const athleteVideos = (videoSubs || []).filter(v => v.athlete_id === activeAthlete.id);
          if (athleteVideos.length === 0) return null;
          const statusColor = { pending: "#F97316", reviewed: "#16A34A", "needs-work": "#DC2626" };
          const statusLabel = { pending: "Pending", reviewed: "Reviewed ✓", "needs-work": "Needs Work" };
          return (
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Video Submissions ({athleteVideos.length})</h3>
                <Badge color={statusColor.pending}>{athleteVideos.filter(v => v.status === "pending").length} pending</Badge>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {athleteVideos.map(v => (
                  <div key={v.id} style={{ padding: "12px 14px", border: "1px solid #E4E4E7", borderRadius: 8, background: v.status === "pending" ? "#FFFBEB" : "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{v.exercise_name || "Movement Video"}</div>
                        <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>
                          {new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          <span style={{ marginLeft: 8, fontWeight: 700, color: statusColor[v.status] || "#71717A" }}>{statusLabel[v.status] || v.status}</span>
                        </div>
                        {v.notes && <div style={{ fontSize: 12, color: "#52525B", marginTop: 4, fontStyle: "italic" }}>{v.notes}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <a href={v.video_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "4px 12px", borderRadius: 999 }}>▶ Watch</a>
                        <button onClick={() => { if (confirm("Delete this video submission?")) deleteVideoSub(v.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D8", fontSize: 14 }} title="Delete video">✕</button>
                      </div>
                    </div>
                    {/* Coach feedback area */}
                    <div style={{ marginTop: 8 }}>
                      {v.coach_feedback ? (
                        <div style={{ padding: "8px 12px", background: "#F0FDF4", borderRadius: 6, border: "1px solid #4ADE80" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Your Feedback</div>
                          <div style={{ fontSize: 13 }}>{v.coach_feedback}</div>
                          <button onClick={() => { const fb = prompt("Update feedback:", v.coach_feedback); if (fb !== null) updateVideoSub(v.id, { coach_feedback: fb, status: "reviewed" }); }} style={{ fontSize: 11, color: "#16A34A", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", marginTop: 4, fontWeight: 600 }}>Edit</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { const fb = prompt("Add feedback for this video:"); if (fb) updateVideoSub(v.id, { coach_feedback: fb, status: "reviewed" }); }} style={{ padding: "6px 12px", background: "#18181B", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Add Feedback</button>
                          <button onClick={() => updateVideoSub(v.id, { status: "reviewed" })} style={{ padding: "6px 12px", background: "#F0FDF4", color: "#16A34A", border: "1px solid #4ADE80", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Mark Reviewed</button>
                          <button onClick={() => updateVideoSub(v.id, { status: "needs-work" })} style={{ padding: "6px 12px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FCA5A5", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Needs Work</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })()}

        {/* Workout history */}
        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Workout History</h3>
        {sortedDays.length === 0 ? <Card><p style={{ color: "#A1A1AA", fontSize: 14, textAlign: "center", padding: 20 }}>No workouts logged yet.</p></Card> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedDays.map(day => {
              const dayKey = `${day.date}-${day.day_label}`;
              const isExpanded = expandedDay === dayKey;
              const catArray = Array.from(day.categories);
              const showLoggedDate = day.logged_at && new Date(day.date + "T12:00:00").toDateString() !== new Date(day.logged_at).toDateString();

              return (
                <Card key={dayKey} style={{ padding: 0, overflow: "hidden" }}>
                  <div onClick={() => setExpandedDay(isExpanded ? null : dayKey)} style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: isExpanded ? "#F9FAFB" : "#fff", borderBottom: isExpanded ? "1px solid #E4E4E7" : "none" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{formatDate(day.date)}</span>
                        {(day.week_label || day.day_label) && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#F97316", background: "#FFF7ED", padding: "1px 8px", borderRadius: 4 }}>
                            {day.week_label ? day.week_label.replace(/WEEK\s*/i, "W").split("—")[0].trim() : ""}{day.day_label ? ` ${day.day_label}` : ""}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#71717A" }}>{day.entries.length} exercise{day.entries.length !== 1 ? "s" : ""}</div>
                      {showLoggedDate && <div style={{ fontSize: 11, color: "#A1A1AA" }}>Logged {new Date(day.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {catArray.map(c => <Badge key={c} color={colors[c]?.bg || "#71717A"}>{c}</Badge>)}
                      <span style={{ fontSize: 16, color: "#A1A1AA", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: "8px 16px 14px" }}>
                      {cats.filter(c => day.entries.some(e => e.category === c)).map(cat => {
                        const cc = colors[cat];
                        return (
                          <div key={cat} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <div style={{ width: 4, height: 14, borderRadius: 2, background: cc?.bg || "#999" }} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: cc?.text || "#52525B", textTransform: "uppercase", letterSpacing: 0.5 }}>{cat}</span>
                            </div>
                            {day.entries.filter(e => e.category === cat).map(l => (
                              <div key={l.id} style={{ padding: "6px 0 6px 12px", borderBottom: "1px solid #F4F4F5" }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{l.exercise_name}</div>
                                <div style={{ fontSize: 12, color: "#71717A" }}>
                                  {[l.sets && l.reps ? `${l.sets}×${l.reps}` : l.reps || l.sets || null, l.load ? `@ ${l.load}` : null, l.rpe ? `RPE ${l.rpe}` : null].filter(Boolean).join(" · ") || "—"}
                                </div>
                                {l.notes && <div style={{ fontSize: 12, color: "#52525B", fontStyle: "italic", marginTop: 2 }}>📝 {l.notes}</div>}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <Modal open={modal} onClose={() => setModal(false)} title="Edit Athlete">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <div style={{ display: "flex", gap: 12 }}><div style={{ flex: 1 }}><Input label="Age" type="number" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} /></div><div style={{ flex: 1 }}><Input label="Sport" value={form.sport} onChange={e => setForm({ ...form, sport: e.target.value })} /></div></div>
            <Input label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            <Select label="Equipment access" value={form.equipment_tier} onChange={e => setForm({ ...form, equipment_tier: e.target.value })} options={TIER_OPTIONS} />
            <Btn onClick={save} style={{ marginTop: 8 }}>Save</Btn>
          </div>
        </Modal>
      </div>
    );
  }

  // Athletes list view
  return (
    <div>
      {provisionLogin && needLogin.length > 0 && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "#FFF7ED", border: "1px solid #FDBA74", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#9A3412" }}>
            <b>{needLogin.length}</b> athlete{needLogin.length !== 1 ? "s" : ""} still sign in the old way. Set up their logins so their data is protected.
          </div>
          <button
            disabled={backfilling}
            onClick={async () => {
              setBackfilling(true);
              const r = await provisionLogin({ all: true });
              setBackfilling(false);
              const failed = (r?.results || []).filter(x => !x.ok);
              alert(failed.length ? "Some logins could not be set up:\n" + failed.map(f => `${f.name}: ${f.error}`).join("\n") : "All athlete logins are set up. Ask them to sign in with the same code as before.");
            }}
            style={{ padding: "7px 14px", background: "#9A3412", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: backfilling ? "default" : "pointer", fontFamily: "inherit", opacity: backfilling ? 0.6 : 1 }}
          >{backfilling ? "Setting up…" : "Set up logins"}</button>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Athletes</h2>
        <Btn onClick={openNew} small={isMobile}>+ Add</Btn>
      </div>
      {athletes.length === 0 ? <EmptyState icon="◎" title="No athletes yet" sub="Add your first athlete." action="+ Add Athlete" onAction={openNew} /> : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {athletes.map(a => {
            const athleteLogCount = (logs || []).filter(l => l.athlete_id === a.id).length;
            const athleteSeasons = (groups || []).filter(g => (groupAthletes || []).some(ga => ga.group_id === g.id && ga.athlete_id === a.id));
            return (
              <Card key={a.id} onClick={() => setDetail(a.id)} style={{ cursor: "pointer", padding: isMobile ? 14 : 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</div>
                    <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>{a.sport}{a.age ? ` · Age ${a.age}` : ""}</div>
                  </div>
                  <Btn variant="danger" small onClick={(e) => { e.stopPropagation(); deleteAthlete(a.id); }}>✕</Btn>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 10, fontSize: 12, color: "#71717A" }}>
                  <span>{athleteLogCount} workout{athleteLogCount !== 1 ? "s" : ""} logged</span>
                  {a.access_code && <span style={{ color: "#A1A1AA" }}>Code: ••••••</span>}
                  {a.equipment_tier && a.equipment_tier !== "full_gym" && <span style={{ color: "#A1A1AA" }}>{TIER_LABEL[a.equipment_tier] || a.equipment_tier}</span>}
                </div>
                {athleteSeasons.length > 0 && (
                  <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                    {athleteSeasons.map(s => <Badge key={s.id} color="#16A34A">{s.name}</Badge>)}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Athlete" : "New Athlete"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Athlete name" />
          <div style={{ display: "flex", gap: 12 }}><div style={{ flex: 1 }}><Input label="Age" type="number" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} /></div><div style={{ flex: 1 }}><Input label="Sport" value={form.sport} onChange={e => setForm({ ...form, sport: e.target.value })} /></div></div>
          <Input label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Injury history, goals…" />
          <Select label="Equipment access" value={form.equipment_tier} onChange={e => setForm({ ...form, equipment_tier: e.target.value })} options={TIER_OPTIONS} />
          <Btn onClick={save} style={{ marginTop: 8 }}>{edit ? "Save" : "Add Athlete"}</Btn>
        </div>
      </Modal>
    </div>
  );
}
