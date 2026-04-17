"use client";
import { useState, useEffect, useRef } from "react";
import { Badge, Btn, Card, Input, Select, Modal, EmptyState, SearchableSelect, BlurInput } from "./ui";
import { printDay } from "./printHelper";

const uid = () => Math.random().toString(36).slice(2, 10);

export default function Programs({ programs, addProgram, updateProgram, deleteProgram, athletes, exercises, cats, colors, isMobile, submitDay, unlogDay, logs, groups }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", selectedAthletes: [], weeks: 4, description: "", group_id: "" });
  const [detail, setDetail] = useState(null);

  const openNew = () => { setForm({ name: "", selectedAthletes: [], weeks: 4, description: "", group_id: groups?.[0]?.id || "" }); setModal(true); };

  const toggleAthlete = (id) => {
    setForm(prev => ({
      ...prev,
      selectedAthletes: prev.selectedAthletes.includes(id)
        ? prev.selectedAthletes.filter(a => a !== id)
        : [...prev.selectedAthletes, id]
    }));
  };

  const createProgram = async () => {
    if (!form.name.trim()) return;
    const makeWeeks = () => {
      const weeks = [];
      for (let w = 0; w < Number(form.weeks); w++) {
        const days = [];
        for (let d = 0; d < 4; d++) days.push({ id: uid(), label: ["Mon", "Tue", "Thu", "Fri"][d], blocks: [] });
        weeks.push({ id: uid(), label: `Week ${w + 1}`, days });
      }
      return weeks;
    };
    const targets = form.selectedAthletes.length > 0 ? form.selectedAthletes : [""];
    let lastProg = null;
    for (const athId of targets) {
      const prog = await addProgram({ name: form.name, athlete_id: athId, description: form.description, weeks: makeWeeks(), group_id: form.group_id || "" });
      if (prog) lastProg = prog;
    }
    setModal(false);
    if (targets.length === 1 && lastProg) setDetail(lastProg.id);
  };

  // Re-ID helper for deep copying weeks/days/blocks
  const reId = (obj) => ({ ...obj, id: uid() });
  const reIdBlocks = (blocks) => blocks.map(b => reId(b));
  const reIdDays = (days) => days.map(d => ({ ...reId(d), blocks: reIdBlocks(d.blocks) }));
  const reIdWeeks = (weeks) => weeks.map(w => ({ ...reId(w), days: reIdDays(w.days) }));

  const findTargetProgram = (athId, sourceProgram) => {
    // Find target athlete's program: prefer same base name, else largest
    const athProgs = programs.filter(p => p.athlete_id === athId);
    if (athProgs.length === 0) return null;
    // Try matching by base name (strip athlete name prefix)
    const baseName = sourceProgram.name.replace(/^[^—]*—\s*/, "").trim();
    const nameMatch = athProgs.find(p => p.name.includes(baseName));
    if (nameMatch) return nameMatch;
    // Fall back to the program with most weeks
    return athProgs.sort((a, b) => (b.weeks?.length || 0) - (a.weeks?.length || 0))[0];
  };

  const copyToAthletes = async (sourceProgram, targetAthleteIds, mode, weekIndex, dayIndex) => {
    for (const athId of targetAthleteIds) {
      if (mode === "program") {
        // Full program → create new
        const weeks = reIdWeeks(JSON.parse(JSON.stringify(sourceProgram.weeks || [])));
        const athName = athletes.find(a => a.id === athId)?.name || "";
        const baseName = sourceProgram.name.replace(/^[^—]*—\s*/, "").trim();
        await addProgram({
          name: `${athName} — ${baseName}`,
          athlete_id: athId,
          description: sourceProgram.description || "",
          weeks,
          group_id: sourceProgram.group_id || "",
        });
      } else if (mode === "week") {
        const target = findTargetProgram(athId, sourceProgram);
        const srcWeek = (sourceProgram.weeks || [])[weekIndex];
        if (!srcWeek) continue;
        const copiedWeek = JSON.parse(JSON.stringify(srcWeek));
        const newWeek = { ...copiedWeek, id: uid(), days: reIdDays(copiedWeek.days) };

        if (target) {
          const targetWeeks = JSON.parse(JSON.stringify(target.weeks || []));
          if (weekIndex < targetWeeks.length) {
            // Replace existing week's days
            targetWeeks[weekIndex] = { ...targetWeeks[weekIndex], days: newWeek.days };
          } else {
            // Append as new week
            targetWeeks.push(newWeek);
          }
          await updateProgram(target.id, { weeks: targetWeeks });
        } else {
          // No existing program, create one
          const athName = athletes.find(a => a.id === athId)?.name || "";
          const baseName = sourceProgram.name.replace(/^[^—]*—\s*/, "").trim();
          await addProgram({ name: `${athName} — ${baseName}`, athlete_id: athId, description: sourceProgram.description || "", weeks: [newWeek], group_id: sourceProgram.group_id || "" });
        }
      } else if (mode === "day") {
        const target = findTargetProgram(athId, sourceProgram);
        const srcWeek = (sourceProgram.weeks || [])[weekIndex];
        const srcDay = srcWeek?.days?.[dayIndex];
        if (!srcDay) continue;
        const copiedDay = JSON.parse(JSON.stringify(srcDay));
        const newDay = { ...copiedDay, id: uid(), blocks: reIdBlocks(copiedDay.blocks) };

        if (target) {
          const targetWeeks = JSON.parse(JSON.stringify(target.weeks || []));
          // Ensure week exists
          while (targetWeeks.length <= weekIndex) {
            const days = [];
            for (let d = 0; d < 4; d++) days.push({ id: uid(), label: ["Mon", "Tue", "Thu", "Fri"][d], blocks: [] });
            targetWeeks.push({ id: uid(), label: `Week ${targetWeeks.length + 1}`, days });
          }
          // Replace day's blocks
          if (dayIndex < targetWeeks[weekIndex].days.length) {
            targetWeeks[weekIndex].days[dayIndex] = { ...targetWeeks[weekIndex].days[dayIndex], blocks: newDay.blocks };
          }
          await updateProgram(target.id, { weeks: targetWeeks });
        } else {
          const athName = athletes.find(a => a.id === athId)?.name || "";
          const baseName = sourceProgram.name.replace(/^[^—]*—\s*/, "").trim();
          const days = [];
          for (let d = 0; d < 4; d++) days.push({ id: uid(), label: ["Mon", "Tue", "Thu", "Fri"][d], blocks: d === dayIndex ? newDay.blocks : [] });
          await addProgram({ name: `${athName} — ${baseName}`, athlete_id: athId, description: sourceProgram.description || "", weeks: [{ id: uid(), label: srcWeek.label, days }], group_id: sourceProgram.group_id || "" });
        }
      }
    }
  };

  const ap = programs.find(p => p.id === detail);

  const addBlock = async (wi, di, cat) => {
    const weeks = JSON.parse(JSON.stringify(ap.weeks));
    const firstEx = exercises.find(e => e.category === cat);
    weeks[wi].days[di].blocks.push({ id: uid(), exerciseId: firstEx?.id || "", exerciseName: firstEx?.name || "", category: cat, sets: 3, reps: "8", load: "", tempo: "", rest: "60", notes: "" });
    await updateProgram(ap.id, { weeks });
  };

  const updateBlock = async (wi, di, bi, f, v) => {
    const weeks = JSON.parse(JSON.stringify(ap.weeks));
    const block = weeks[wi].days[di].blocks[bi];
    block[f] = v;
    if (f === "exerciseId") { const ex = exercises.find(e => e.id === v); if (ex) block.exerciseName = ex.name; }
    if (f === "category") { const firstEx = exercises.find(e => e.category === v); if (firstEx) { block.exerciseId = firstEx.id; block.exerciseName = firstEx.name; } }
    await updateProgram(ap.id, { weeks });
  };

  const removeBlock = async (wi, di, bi) => {
    const weeks = JSON.parse(JSON.stringify(ap.weeks));
    weeks[wi].days[di].blocks.splice(bi, 1);
    await updateProgram(ap.id, { weeks });
  };

  const moveBlock = async (wi, di, bi, direction) => {
    const weeks = JSON.parse(JSON.stringify(ap.weeks));
    const blocks = weeks[wi].days[di].blocks;
    const newIndex = bi + direction;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    const [moved] = blocks.splice(bi, 1);
    blocks.splice(newIndex, 0, moved);
    await updateProgram(ap.id, { weeks });
  };

  if (detail && ap) return <ProgramDetail program={ap} exercises={exercises} cats={cats} colors={colors} addBlock={addBlock} updateBlock={updateBlock} removeBlock={removeBlock} moveBlock={moveBlock} onBack={() => setDetail(null)} athletes={athletes} isMobile={isMobile} submitDay={submitDay} unlogDay={unlogDay} logs={logs || []} copyToAthletes={copyToAthletes} updateProgram={updateProgram} groups={groups} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Programs</h2>
        <Btn onClick={openNew} small={isMobile}>+ New</Btn>
      </div>
      {programs.length === 0 ? <EmptyState icon="▦" title="No programs yet" sub="Create a training program." action="+ New Program" onAction={openNew} /> : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {programs.map(p => {
            const ath = athletes.find(a => a.id === p.athlete_id);
            const grp = (groups || []).find(g => g.id === p.group_id);
            const wks = p.weeks || [];
            const completed = wks.filter(w => w.status === "completed").length;
            const missed = wks.filter(w => w.status === "missed").length;
            return (
              <Card key={p.id} onClick={() => setDetail(p.id)} style={{ cursor: "pointer", padding: isMobile ? 14 : 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>{ath?.name || "Unassigned"} · {wks.length}wk</div>
                    {grp && <div style={{ marginTop: 4 }}><Badge color="#2563EB">{grp.name}</Badge></div>}
                  </div>
                  <Btn variant="danger" small onClick={(e) => { e.stopPropagation(); deleteProgram(p.id); if (detail === p.id) setDetail(null); }}>✕</Btn>
                </div>
                {p.description && <p style={{ fontSize: 13, color: "#52525B", marginTop: 8 }}>{p.description}</p>}
                {wks.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                      {wks.map((w, i) => (
                        <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: w.status === "completed" ? "#16A34A" : w.status === "missed" ? "#DC2626" : "#E4E4E7" }} />
                      ))}
                    </div>
                    {(completed > 0 || missed > 0) && (
                      <div style={{ fontSize: 11, color: "#71717A" }}>
                        {completed > 0 && <span style={{ color: "#16A34A", fontWeight: 600 }}>{completed} completed</span>}
                        {completed > 0 && missed > 0 && " · "}
                        {missed > 0 && <span style={{ color: "#DC2626", fontWeight: 600 }}>{missed} missed</span>}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title="New Program">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Program Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Off-Season Block 1" />
          {athletes.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#18181B" }}>Assign to Athletes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                {athletes.map(a => {
                  const selected = form.selectedAthletes.includes(a.id);
                  return (
                    <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: `1px solid ${selected ? "#18181B" : "#E4E4E7"}`, borderRadius: 8, cursor: "pointer", background: selected ? "#F9FAFB" : "#fff" }}>
                      <input type="checkbox" checked={selected} onChange={() => toggleAthlete(a.id)} style={{ accentColor: "#18181B" }} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                      <span style={{ fontSize: 12, color: "#71717A" }}>{a.sport}</span>
                    </label>
                  );
                })}
              </div>
              {form.selectedAthletes.length === 0 && <p style={{ fontSize: 12, color: "#A1A1AA", marginTop: 4 }}>No athletes selected — program will be unassigned</p>}
              {form.selectedAthletes.length > 1 && <p style={{ fontSize: 12, color: "#F97316", marginTop: 4 }}>A separate copy will be created for each athlete</p>}
            </div>
          )}
          <Input label="Weeks" type="number" value={form.weeks} onChange={e => setForm({ ...form, weeks: e.target.value })} min={1} max={52} />
          {(groups || []).length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#18181B" }}>Link to Season</div>
              <select
                value={form.group_id}
                onChange={e => setForm({ ...form, group_id: e.target.value })}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #E4E4E7", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "#fff", cursor: "pointer" }}
              >
                <option value="">No season</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <Btn onClick={createProgram} style={{ marginTop: 8 }}>
            {form.selectedAthletes.length > 1 ? `Create for ${form.selectedAthletes.length} Athletes` : "Create Program"}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

function ProgramDetail({ program, exercises, cats, colors, addBlock, updateBlock, removeBlock, moveBlock, onBack, athletes, isMobile, submitDay, unlogDay, logs, copyToAthletes, updateProgram, groups }) {
  // Keep a ref to latest program to prevent stale closures in async handlers
  const programRef = useRef(program);
  programRef.current = program;

  const [aw, setAw] = useState(() => {
    const weeks = program.weeks || [];
    const firstOpen = weeks.findIndex(w => w.status !== "completed" && w.status !== "missed");
    return firstOpen >= 0 ? firstOpen : 0;
  });
  const [submitting, setSubmitting] = useState(null);
  const [unlogging, setUnlogging] = useState(null);
  const [submitDates, setSubmitDates] = useState({});
  const [catPicker, setCatPicker] = useState(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyMode, setCopyMode] = useState("program");
  const [copyDayIndex, setCopyDayIndex] = useState(0);
  const [copyTargets, setCopyTargets] = useState([]);
  const [expandedBlock, setExpandedBlock] = useState(null);

  // Auto-advance to next open week when status changes
  useEffect(() => {
    const weeks = program.weeks || [];
    const currentStatus = weeks[aw]?.status;
    if (currentStatus === "completed" || currentStatus === "missed") {
      const nextOpen = weeks.findIndex((w, i) => i > aw && w.status !== "completed" && w.status !== "missed");
      if (nextOpen >= 0) setAw(nextOpen);
    }
  }, [program.weeks]);

  const setWeekStatus = async (weekIndex, status) => {
    const weeks = JSON.parse(JSON.stringify(programRef.current.weeks));
    weeks[weekIndex].status = weeks[weekIndex].status === status ? "" : status;
    await updateProgram(programRef.current.id, { weeks });
  };

  const setDayStatus = async (weekIndex, dayIndex, status) => {
    const weeks = JSON.parse(JSON.stringify(programRef.current.weeks));
    const day = weeks[weekIndex].days[dayIndex];
    day.status = day.status === status ? "" : status;
    await updateProgram(programRef.current.id, { weeks });
  };

  const updateWeekField = async (weekIndex, field, value) => {
    const weeks = JSON.parse(JSON.stringify(programRef.current.weeks));
    weeks[weekIndex][field] = value;
    await updateProgram(programRef.current.id, { weeks });
  };

  const updateDayField = async (wi, di, field, value) => {
    const weeks = JSON.parse(JSON.stringify(programRef.current.weeks));
    weeks[wi].days[di][field] = value;
    await updateProgram(programRef.current.id, { weeks });
  };

  const ath = athletes.find(a => a.id === program.athlete_id);
  const weeks = program.weeks || [];
  const week = weeks[aw];
  if (!week) return <div><button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#71717A", fontFamily: "inherit" }}>← Back</button><p>No weeks in this program.</p></div>;

  // Check which dates have logs for this athlete
  const getDateForDay = (dayId) => submitDates[dayId] || new Date().toISOString().slice(0, 10);

  const getDayLogs = (date, dayLabel) => {
    if (!program.athlete_id) return [];
    return logs.filter(l => l.athlete_id === program.athlete_id && l.date === date && l.day_label === dayLabel);
  };

  const resolveExerciseId = (block) => {
    if (block.exerciseId) { const f = exercises.find(e => e.id === block.exerciseId); if (f) return f.id; }
    if (block.exerciseName) { const f = exercises.find(e => e.name === block.exerciseName); if (f) return f.id; }
    return "__custom__";
  };
  const getDisplayName = (block) => {
    if (block.exerciseId) { const f = exercises.find(e => e.id === block.exerciseId); if (f) return f.name; }
    return block.exerciseName || "Unknown";
  };

  const arrowStyle = (disabled) => ({
    background: disabled ? "transparent" : "#fff",
    border: disabled ? "1px solid transparent" : "1px solid #D4D4D8",
    borderRadius: 5, cursor: disabled ? "default" : "pointer",
    padding: "1px 5px", fontSize: 10, color: disabled ? "#D4D4D8" : "#52525B", lineHeight: 1.2,
  });

  const handleSubmit = async (day) => {
    const date = getDateForDay(day.id);
    setSubmitting(day.id);
    await submitDay(program, day, date, week.label);
    setSubmitting(null);
  };

  const handleUnlog = async (day) => {
    const date = getDateForDay(day.id);
    if (!confirm(`Remove logged workout for ${ath?.name || "this athlete"} — ${day.label} on ${date}?`)) return;
    setUnlogging(day.id);
    await unlogDay(program.athlete_id, date, day.label, week.label);
    setUnlogging(null);
  };

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#71717A", marginBottom: 12, fontFamily: "inherit" }}>← Back</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontFamily: "'Space Mono', monospace" }}>{program.name}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {ath && <Badge color="#71717A">{ath.name}</Badge>}
          <button onClick={() => { setCopyOpen(true); setCopyMode("program"); setCopyTargets([]); }} style={{ background: "none", border: "1px solid #E4E4E7", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "#52525B", fontWeight: 600 }}>⧉ Copy</button>
        </div>
      </div>
      {program.description && <p style={{ color: "#71717A", fontSize: 14, margin: "0 0 12px" }}>{program.description}</p>}

      {/* Season link */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#71717A" }}>Season:</span>
        <select
          value={program.group_id || ""}
          onChange={e => updateProgram(program.id, { group_id: e.target.value })}
          style={{ padding: "4px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: "#fff", cursor: "pointer", color: program.group_id ? "#2563EB" : "#A1A1AA", fontWeight: program.group_id ? 600 : 400 }}
        >
          <option value="">No season</option>
          {(groups || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {weeks.map((w, i) => {
          const st = w.status || "";
          const bgColor = aw === i ? "#18181B" : st === "completed" ? "#16A34A" : st === "missed" ? "#DC2626" : "#fff";
          const textColor = aw === i ? "#fff" : st === "completed" || st === "missed" ? "#fff" : "#52525B";
          const borderColor = aw === i ? "#18181B" : st === "completed" ? "#16A34A" : st === "missed" ? "#DC2626" : "#E4E4E7";
          return (
            <button key={w.id} onClick={() => setAw(i)} style={{ padding: "5px 14px", borderRadius: 8, border: `2px solid ${borderColor}`, background: bgColor, color: textColor, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", position: "relative" }}>
              {st === "completed" && "✓ "}
              {st === "missed" && "✗ "}
              W{i + 1}
            </button>
          );
        })}
      </div>
      {/* Week status controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#71717A", fontWeight: 600 }}>{week.label}:</span>
        <button onClick={() => setWeekStatus(aw, "completed")} style={{ padding: "4px 12px", borderRadius: 6, border: week.status === "completed" ? "2px solid #16A34A" : "1px solid #E4E4E7", background: week.status === "completed" ? "#F0FDF4" : "#fff", color: week.status === "completed" ? "#16A34A" : "#71717A", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ✓ Completed
        </button>
        <button onClick={() => setWeekStatus(aw, "missed")} style={{ padding: "4px 12px", borderRadius: 6, border: week.status === "missed" ? "2px solid #DC2626" : "1px solid #E4E4E7", background: week.status === "missed" ? "#FEF2F2" : "#fff", color: week.status === "missed" ? "#DC2626" : "#71717A", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ✗ Missed
        </button>
        {week.status && <span style={{ fontSize: 11, color: "#A1A1AA" }}>Click again to clear</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {week.days.map((day, di) => {
          const date = getDateForDay(day.id);
          const dayLogs = getDayLogs(date, day.label);
          const isLogged = dayLogs.length > 0;

          return (
            <Card key={day.id} style={{ padding: 14, border: day.status === "completed" ? "2px solid #16A34A" : day.status === "missed" ? "2px solid #DC2626" : "1px solid #E4E4E7", background: day.status === "completed" ? "#F0FDF418" : day.status === "missed" ? "#FEF2F218" : "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {day.status === "completed" && <span style={{ color: "#16A34A", fontWeight: 700, fontSize: 14 }}>✓</span>}
                  {day.status === "missed" && <span style={{ color: "#DC2626", fontWeight: 700, fontSize: 14 }}>✗</span>}
                  <h4 style={{ margin: 0, fontSize: 15 }}>{day.label}</h4>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button onClick={() => printDay(program, week.label, day, exercises, colors)} style={{ background: "none", border: "1px solid #E4E4E7", borderRadius: 6, cursor: "pointer", padding: "4px 10px", fontSize: 12, color: "#52525B", fontFamily: "inherit", fontWeight: 600 }}>🖨</button>
                  <div style={{ position: "relative" }}>
                    <Btn small variant="secondary" onClick={() => setCatPicker(catPicker === day.id ? null : day.id)}>+ Ex</Btn>
                    {catPicker === day.id && (
                      <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.12)", zIndex: 50, overflow: "hidden", minWidth: 120 }}>
                        {cats.map(c => (
                          <button key={c} onClick={() => { addBlock(aw, di, c); setCatPicker(null); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, textAlign: "left", borderBottom: "1px solid #F4F4F5" }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[c]?.bg || "#999", flexShrink: 0 }} />
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {day.blocks.length === 0 && <p style={{ color: "#A1A1AA", fontSize: 13, textAlign: "center", padding: 12 }}>Empty</p>}
              {day.blocks.map((block, bi) => {
                const cc = colors[block.category];
                const resolvedId = resolveExerciseId(block);
                const displayName = getDisplayName(block);
                const catExercises = exercises.filter(ex => ex.category === block.category);
                const otherExercises = exercises.filter(ex => ex.category !== block.category);
                const allOptions = [
                  ...catExercises.map(ex => ({ value: ex.id, label: ex.name, group: block.category })),
                  ...otherExercises.map(ex => ({ value: ex.id, label: ex.name, group: ex.category })),
                ];
                const isCustom = resolvedId === "__custom__";
                const isFirst = bi === 0;
                const isLast = bi === day.blocks.length - 1;
                const resolvedEx = resolvedId !== "__custom__" ? exercises.find(e => e.id === resolvedId) : null;
                const videoUrl = resolvedEx?.video_url || (block.exerciseName ? exercises.find(e => e.name === block.exerciseName)?.video_url : "") || "";

                return (
                  <div key={block.id} style={{ background: cc?.light || "#F9FAFB", border: `1px solid ${cc?.border || "#E5E7EB"}`, borderRadius: 10, marginBottom: 8, borderLeft: `4px solid ${cc?.bg || "#999"}`, overflow: "hidden" }}>
                    {isMobile ? (() => {
                      const isOpen = expandedBlock === block.id;
                      return (
                        <>
                          <div onClick={() => setExpandedBlock(isOpen ? null : block.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 10px", cursor: "pointer" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                              <Badge color={cc?.bg || "#999"}>{block.category}</Badge>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.3 }}>{displayName}</div>
                                <div style={{ fontSize: 11, color: "#71717A" }}>{[block.sets && block.reps ? `${block.sets}×${block.reps}` : null, block.load ? `@ ${block.load}` : null].filter(Boolean).join(" ") || "—"}</div>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                              {videoUrl && <a href={videoUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>▶</a>}
                              <span style={{ fontSize: 12, color: "#A1A1AA", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>
                            </div>
                          </div>
                          {isOpen && (
                            <div style={{ padding: "0 10px 10px", borderTop: "1px solid #E4E4E7" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 6 }}>
                                <div style={{ display: "flex", gap: 4 }}>
                                  <button onClick={() => !isFirst && moveBlock(aw, di, bi, -1)} style={arrowStyle(isFirst)} disabled={isFirst}>▲</button>
                                  <button onClick={() => !isLast && moveBlock(aw, di, bi, 1)} style={arrowStyle(isLast)} disabled={isLast}>▼</button>
                                </div>
                                <button onClick={() => removeBlock(aw, di, bi)} style={{ background: "#FEE2E2", border: "none", borderRadius: 6, cursor: "pointer", color: "#DC2626", fontSize: 12, padding: "4px 10px", fontWeight: 600, fontFamily: "inherit" }}>Remove</button>
                              </div>
                              {!isCustom && (
                                <div style={{ marginBottom: 6 }}>
                                  <SearchableSelect value={resolvedId} onChange={e => updateBlock(aw, di, bi, "exerciseId", e.target.value)} options={allOptions} groupBy placeholder="Select exercise…" />
                                </div>
                              )}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                                {[["Sets", "sets", "number"], ["Reps", "reps", "text"], ["Load", "load", "text"]].map(([lb, f, t]) => (
                                  <label key={f} style={{ fontSize: 10, color: "#71717A" }}>{lb}<BlurInput type={t} value={block[f]} onSave={v => updateBlock(aw, di, bi, f, v)} placeholder={f === "load" ? "lbs" : ""} style={{ width: "100%", padding: "6px 5px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 14, fontFamily: "inherit", marginTop: 1, boxSizing: "border-box" }} /></label>
                                ))}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                                {[["Tempo", "tempo", "3-1-2-0"], ["Rest(s)", "rest", ""]].map(([lb, f, ph]) => (
                                  <label key={f} style={{ fontSize: 10, color: "#71717A" }}>{lb}<BlurInput value={block[f]} onSave={v => updateBlock(aw, di, bi, f, v)} placeholder={ph} style={{ width: "100%", padding: "6px 5px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 14, fontFamily: "inherit", marginTop: 1, boxSizing: "border-box" }} /></label>
                                ))}
                              </div>
                              <label style={{ fontSize: 10, color: "#71717A", display: "block", marginTop: 4 }}>Notes
                                <BlurInput value={block.notes || ""} onSave={v => updateBlock(aw, di, bi, "notes", v)} placeholder="Coaching cues, modifications…" style={{ width: "100%", padding: "6px 5px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 14, fontFamily: "inherit", marginTop: 1, boxSizing: "border-box" }} />
                              </label>
                              {block.notes && !expandedBlock && <div style={{ fontSize: 11, color: "#71717A", marginTop: 4, fontStyle: "italic" }}>{block.notes}</div>}
                            </div>
                          )}
                        </>
                      );
                    })() : (
                      /* Desktop: full expanded view */
                      <div style={{ padding: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Badge color={cc?.bg || "#999"}>{block.category}</Badge>
                            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                              <button onClick={() => !isFirst && moveBlock(aw, di, bi, -1)} style={arrowStyle(isFirst)} disabled={isFirst}>▲</button>
                              <button onClick={() => !isLast && moveBlock(aw, di, bi, 1)} style={arrowStyle(isLast)} disabled={isLast}>▼</button>
                            </div>
                            {videoUrl && (
                              <a href={videoUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "3px 10px", borderRadius: 999, letterSpacing: 0.3 }}>▶ Video</a>
                            )}
                          </div>
                          <button onClick={() => removeBlock(aw, di, bi)} style={{ background: "none", border: "none", cursor: "pointer", color: "#A1A1AA", fontSize: 14 }}>✕</button>
                        </div>
                        {isCustom ? (
                          <div style={{ width: "100%", marginBottom: 4, padding: "5px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: "#18181B", fontWeight: 600 }}>{displayName}</div>
                        ) : (
                          <div style={{ marginBottom: 4 }}>
                            <SearchableSelect value={resolvedId} onChange={e => updateBlock(aw, di, bi, "exerciseId", e.target.value)} options={allOptions} groupBy placeholder="Select exercise…" />
                          </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginTop: 4 }}>
                          {[["Sets", "sets", "number"], ["Reps", "reps", "text"], ["Load", "load", "text"]].map(([lb, f, t]) => (
                            <label key={f} style={{ fontSize: 10, color: "#71717A" }}>{lb}<BlurInput type={t} value={block[f]} onSave={v => updateBlock(aw, di, bi, f, v)} placeholder={f === "load" ? "lbs" : ""} style={{ width: "100%", padding: "4px 5px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", marginTop: 1, boxSizing: "border-box" }} /></label>
                          ))}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 4 }}>
                          {[["Tempo", "tempo", "3-1-2-0"], ["Rest(s)", "rest", ""]].map(([lb, f, ph]) => (
                            <label key={f} style={{ fontSize: 10, color: "#71717A" }}>{lb}<BlurInput value={block[f]} onSave={v => updateBlock(aw, di, bi, f, v)} placeholder={ph} style={{ width: "100%", padding: "4px 5px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", marginTop: 1, boxSizing: "border-box" }} /></label>
                          ))}
                        </div>
                        <label style={{ fontSize: 10, color: "#71717A", display: "block", marginTop: 4 }}>Notes
                          <BlurInput value={block.notes || ""} onSave={v => updateBlock(aw, di, bi, "notes", v)} placeholder="Coaching cues, modifications…" style={{ width: "100%", padding: "4px 5px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", marginTop: 1, boxSizing: "border-box" }} />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Submit / Unlog section */}
              {day.blocks.length > 0 && submitDay && (
                <div style={{ marginTop: 8, padding: 10, background: isLogged ? "#F0FDF4" : "#F9FAFB", borderRadius: 8, border: `1px solid ${isLogged ? "#4ADE80" : "#E4E4E7"}` }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontSize: 11, color: "#71717A", fontWeight: 600 }}>Date:</label>
                    <input type="date" value={date} onChange={e => setSubmitDates(prev => ({ ...prev, [day.id]: e.target.value }))} style={{ flex: 1, padding: "3px 6px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  {isLogged ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "#16A34A", fontWeight: 600, fontSize: 13 }}>✓ Logged — {dayLogs.length} exercises</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => handleUnlog(day)}
                          disabled={unlogging === day.id}
                          style={{ flex: 1, padding: "7px", background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: unlogging === day.id ? "default" : "pointer", fontFamily: "inherit" }}
                        >
                          {unlogging === day.id ? "Removing…" : "Unlog Day"}
                        </button>
                        <button
                          onClick={() => { handleUnlog(day).then(() => setTimeout(() => handleSubmit(day), 300)); }}
                          style={{ flex: 1, padding: "7px", background: "#18181B", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          Re-submit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSubmit(day)}
                      disabled={submitting === day.id}
                      style={{ width: "100%", padding: "8px", background: "#18181B", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: submitting === day.id ? "default" : "pointer", fontFamily: "inherit", opacity: submitting === day.id ? 0.5 : 1 }}
                    >
                      {submitting === day.id ? "Submitting…" : `Log ${day.label}'s Workout`}
                    </button>
                  )}
                </div>
              )}

              {/* Coach Notes for the day */}
              <div style={{ marginTop: 10, padding: "8px 10px", background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: 0.5 }}>Coach Notes</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, color: day.coachNotesShared ? "#1E40AF" : "#A1A1AA", fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={!!day.coachNotesShared}
                      onChange={e => updateDayField(aw, di, "coachNotesShared", e.target.checked)}
                      style={{ accentColor: "#2563EB", cursor: "pointer" }}
                    />
                    Share with athlete
                  </label>
                </div>
                <BlurInput
                  value={day.coachNotes || ""}
                  onSave={v => updateDayField(aw, di, "coachNotes", v)}
                  placeholder="Notes for the day — warm-up reminders, focus areas, recovery tips…"
                  multiline
                  debounceMs={1500}
                  style={{ width: "100%", padding: "6px 8px", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", minHeight: 48, resize: "vertical" }}
                />
              </div>

              {/* Day status buttons */}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => setDayStatus(aw, di, "completed")} style={{ flex: 1, padding: "5px", borderRadius: 6, border: day.status === "completed" ? "2px solid #16A34A" : "1px solid #E4E4E7", background: day.status === "completed" ? "#F0FDF4" : "#fff", color: day.status === "completed" ? "#16A34A" : "#A1A1AA", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  ✓ Completed
                </button>
                <button onClick={() => setDayStatus(aw, di, "missed")} style={{ flex: 1, padding: "5px", borderRadius: 6, border: day.status === "missed" ? "2px solid #DC2626" : "1px solid #E4E4E7", background: day.status === "missed" ? "#FEF2F2" : "#fff", color: day.status === "missed" ? "#DC2626" : "#A1A1AA", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  ✗ Missed
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Weekly Recap */}
      <div style={{ marginTop: 16, padding: "14px 16px", background: "#EFF6FF", borderRadius: 10, border: "1px solid #BFDBFE" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "#1E40AF", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>📋 Weekly Recap — {week.label}</label>
        <BlurInput
          value={week.coachRecap || ""}
          onSave={v => updateWeekField(aw, "coachRecap", v)}
          placeholder="Summarize the week — what went well, areas to improve, notes for the athlete…"
          multiline
          debounceMs={1500}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", minHeight: 64, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      {/* Copy modal */}
      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title="Copy Programming">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* What to copy */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#18181B" }}>What to copy</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { mode: "program", label: "Entire Program", sub: `All ${weeks.length} weeks — creates new program` },
                { mode: "week", label: `${week.label}`, sub: `${week.days.length} days — replaces week in existing program` },
                ...week.days.map((d, di) => ({ mode: "day", dayIdx: di, label: `${week.label} — ${d.label}`, sub: `${d.blocks.length} exercise${d.blocks.length !== 1 ? "s" : ""} — replaces day in existing program` })),
              ].map(opt => (
                <label key={`${opt.mode}-${opt.dayIdx ?? ""}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1px solid ${copyMode === opt.mode && (opt.mode !== "day" || copyDayIndex === opt.dayIdx) ? "#18181B" : "#E4E4E7"}`, borderRadius: 8, cursor: "pointer", background: copyMode === opt.mode && (opt.mode !== "day" || copyDayIndex === opt.dayIdx) ? "#F9FAFB" : "#fff" }}>
                  <input type="radio" name="copyMode" checked={copyMode === opt.mode && (opt.mode !== "day" || copyDayIndex === opt.dayIdx)} onChange={() => { setCopyMode(opt.mode); if (opt.dayIdx !== undefined) setCopyDayIndex(opt.dayIdx); }} style={{ accentColor: "#18181B" }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: "#71717A" }}>{opt.sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Who to copy to */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#18181B" }}>Copy to athletes</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
              {athletes.filter(a => a.id !== program.athlete_id).map(a => {
                const checked = copyTargets.includes(a.id);
                return (
                  <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1px solid ${checked ? "#18181B" : "#E4E4E7"}`, borderRadius: 8, cursor: "pointer", background: checked ? "#F0FDF4" : "#fff" }}>
                    <input type="checkbox" checked={checked} onChange={() => setCopyTargets(prev => checked ? prev.filter(id => id !== a.id) : [...prev, a.id])} style={{ accentColor: "#18181B" }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#71717A" }}>{a.sport}{a.age ? ` · Age ${a.age}` : ""}</div>
                    </div>
                  </label>
                );
              })}
              {athletes.filter(a => a.id !== program.athlete_id).length === 0 && (
                <p style={{ color: "#A1A1AA", fontSize: 13, textAlign: "center", padding: 16 }}>No other athletes available.</p>
              )}
            </div>
          </div>

          {copyTargets.length > 0 && (
            <Btn onClick={async () => {
              await copyToAthletes(program, copyTargets, copyMode, aw, copyDayIndex);
              setCopyOpen(false);
              setCopyTargets([]);
              alert(copyMode === "program" ? "Program copied!" : `${copyMode === "week" ? week.label : week.days[copyDayIndex]?.label} copied into existing programs!`);
            }} style={{ marginTop: 4 }}>
              {copyMode === "program"
                ? `Copy Full Program to ${copyTargets.length} Athlete${copyTargets.length !== 1 ? "s" : ""}`
                : `Paste ${copyMode === "week" ? week.label : `${week.label} ${week.days[copyDayIndex]?.label}`} into ${copyTargets.length} Program${copyTargets.length !== 1 ? "s" : ""}`
              }
            </Btn>
          )}
        </div>
      </Modal>
    </div>
  );
}
