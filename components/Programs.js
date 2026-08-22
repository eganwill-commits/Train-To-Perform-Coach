"use client";
import { useState, useEffect, useRef } from "react";
import { Badge, Btn, Card, Input, Select, Modal, EmptyState, SearchableSelect, BlurInput } from "./ui";
import { supabase } from "../lib/supabase";
import { printDay } from "./printHelper";
import NotesBoard from "./NotesBoard";
import ProgramBrief, { briefSummary } from "./ProgramBrief";

const uid = () => Math.random().toString(36).slice(2, 10);

// Derive real calendar dates from week/day labels (e.g. "Week 1 · Jul 6–10").
// Falls back to the legacy fixed base for programs whose labels have no dates,
// so existing programs are unaffected.
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const WDAYS = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
function weekStartFromLabel(label, idx, startDate) {
  if (startDate) {
    const p = String(startDate).split("-").map(Number);
    if (p[0] && p[1] && p[2]) { const d = new Date(p[0], p[1] - 1, p[2]); d.setDate(d.getDate() + idx * 7); return d; }
  }
  const m = (label || "").match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/i);
  if (m) return new Date(2026, MONTHS[m[1].slice(0, 3).toLowerCase()], parseInt(m[2], 10));
  return new Date(2026, 3, 6 + idx * 7);
}
// The chip shows the week's own number, not its position in the array. Mac's program
// opens with Week 0 (the benchmark), so position+1 labelled every week one higher than
// the program, the workbook and the PDF call it - W1 was really Week 0, W13 was Week 12.
function weekNumberLabel(label, idx) {
  const m = (label || "").match(/week\s+(\d+)/i);
  return "W" + (m ? m[1] : idx + 1);
}
function weekdayOffset(label) {
  const m = (label || "").toLowerCase().match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/);
  return m ? WDAYS[m[1]] : 0;
}

const DAY_WARMUPS = {
  lowerA: "2–3 min easy bike/row → lower-body mobility (leg swings, deep bodyweight squats, walking lunges, ankle rocks) → glute bridges + dead bugs → 2–3 ramp-up sets building to your first working Back Squat.",
  lowerB: "2–3 min easy bike/row → hinge mobility (leg swings, 90/90 hips, hamstring sweeps, cat-cow) → glute bridges + dead bugs to set your brace → 2–3 ramp-up sets building to your first working Deadlift.",
  upperA: "2–3 min easy cardio → upper-body mobility (arm circles, band pull-aparts, scap push-ups, band shoulder dislocates) → a few light face pulls → 2–3 ramp-up sets building to your first working Bench Press.",
  upperB: "2–3 min easy cardio → overhead mobility (band dislocates, wall slides, thoracic extensions, lat stretch) → scap pull-ups + band pull-aparts → 2–3 ramp-up sets building to your first working Pull-Up / Overhead Press.",
  generic: "2–3 min easy cardio → dynamic mobility for the joints you train today → glute/core (lower) or scap/cuff (upper) activation → 2–3 ramp-up sets on the day\u2019s first big lift.",
};
const WARMUP_NOTE = "Train solo with rack pins/safeties; never go to true failure on barbell squat, bench, or overhead press alone.";
function warmupForDay(label) {
  const t = (label || "").toLowerCase();
  if (t.includes("squat")) return DAY_WARMUPS.lowerA;
  if (t.includes("hinge") || t.includes("deadlift")) return DAY_WARMUPS.lowerB;
  if (t.includes("horizontal")) return DAY_WARMUPS.upperA;
  if (t.includes("vertical")) return DAY_WARMUPS.upperB;
  if (t.includes("lower")) return (t.includes(" b") || t.includes("(b")) ? DAY_WARMUPS.lowerB : DAY_WARMUPS.lowerA;
  if (t.includes("upper")) return (t.includes(" b") || t.includes("(b")) ? DAY_WARMUPS.upperB : DAY_WARMUPS.upperA;
  return DAY_WARMUPS.generic;
}

export default function Programs({ programs, addProgram, updateProgram, deleteProgram, athletes, exercises, cats, colors, isMobile, submitDay, unlogDay, logs, groups, setLogs, addGroup, addAthleteToGroup, addSeasonMembership }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", selectedAthletes: [], weeks: 4, description: "", group_id: "", trackAsSeason: false, start_date: "" });
  const [detail, setDetail] = useState(null);
  const [folderKey, setFolderKey] = useState(null);
  const [addAthModal, setAddAthModal] = useState(false);
  const [addAthTargets, setAddAthTargets] = useState([]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameVal, setRenameVal] = useState("");

  const openNew = () => { const t = new Date(); const add = ((8 - t.getDay()) % 7) || 7; const nm = new Date(t); nm.setDate(t.getDate() + add); const iso = `${nm.getFullYear()}-${String(nm.getMonth() + 1).padStart(2, "0")}-${String(nm.getDate()).padStart(2, "0")}`; setForm({ name: "", selectedAthletes: [], weeks: 4, description: "", group_id: groups?.[0]?.id || "", trackAsSeason: false, start_date: iso }); setModal(true); };

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

    // Optionally spin up a matching Season (program_group).
    let groupId = form.group_id || "";
    if (form.trackAsSeason && addGroup) {
      const g = await addGroup({ name: form.name, description: form.description || "" });
      if (g) groupId = g.id;
    }

    let lastProg = null;
    for (const athId of targets) {
      const prog = await addProgram({ name: form.name, athlete_id: athId, description: form.description, weeks: makeWeeks(), group_id: groupId, start_date: form.start_date || null });
      if (prog) lastProg = prog;
    }

    // Keep Program ↔ Season in sync: enroll the athletes in the linked season (membership only).
    if (groupId && addSeasonMembership) {
      for (const athId of targets) { if (athId) await addSeasonMembership(groupId, athId); }
    }
    setModal(false);
    if (targets.length === 1 && lastProg) setDetail(lastProg.id);
    else if (targets.length > 1) setFolderKey(form.name.toLowerCase().replace(/\s+/g, " ").trim());
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

  // ---- Folder grouping (derived from program name, no schema change) ----
  // Folder = all per-athlete program copies that share the same base name.
  const baseNameOf = (p) => {
    const ath = athletes.find(a => a.id === p.athlete_id);
    if (ath?.name && p.name.startsWith(ath.name + " — ")) return p.name.slice((ath.name + " — ").length).trim();
    const m = p.name.match(/^(.*?)\s—\s(.*)$/);
    if (m && athletes.some(a => a.name === m[1])) return m[2].trim();
    return (p.name || "").trim();
  };
  const keyOf = (name) => (name || "").toLowerCase().replace(/\s+/g, " ").trim();
  const folders = (() => {
    const map = new Map();
    programs.forEach(p => {
      const name = baseNameOf(p);
      const key = keyOf(name);
      if (!map.has(key)) map.set(key, { key, name, programs: [] });
      map.get(key).programs.push(p);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  const addAthletesToFolder = async (folder, targetIds) => {
    const source = folder.programs[0];
    for (const athId of targetIds) {
      const weeks = reIdWeeks(JSON.parse(JSON.stringify(source?.weeks || [])));
      await addProgram({ name: folder.name, athlete_id: athId, description: source?.description || "", weeks, group_id: source?.group_id || "" });
      // Keep Program ↔ Season in sync: if this folder is linked to a season, enroll them too.
      if (source?.group_id && addSeasonMembership) await addSeasonMembership(source.group_id, athId);
    }
  };
  const renameFolder = async (folder, newName) => {
    for (const p of folder.programs) await updateProgram(p.id, { name: newName });
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

  if (detail && ap) return <ProgramDetail program={ap} programs={programs} exercises={exercises} cats={cats} colors={colors} addBlock={addBlock} updateBlock={updateBlock} removeBlock={removeBlock} moveBlock={moveBlock} onBack={() => setDetail(null)} athletes={athletes} isMobile={isMobile} submitDay={submitDay} unlogDay={unlogDay} logs={logs || []} copyToAthletes={copyToAthletes} updateProgram={updateProgram} groups={groups} setLogs={setLogs} />;

  // ---- Folder detail: the athletes inside one program folder ----
  const activeFolder = folderKey ? folders.find(f => f.key === folderKey) : null;
  if (folderKey && activeFolder) {
    const folderAthIds = activeFolder.programs.map(p => p.athlete_id);
    const availableAthletes = athletes.filter(a => !folderAthIds.includes(a.id));
    return (
      <div>
        <button onClick={() => setFolderKey(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#71717A", marginBottom: 12, fontFamily: "inherit" }}>← Back to Programs</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 26, fontFamily: "'Space Mono', monospace", display: "flex", alignItems: "center", gap: 8 }}><span>📁</span>{activeFolder.name}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small variant="secondary" onClick={() => { setRenameVal(activeFolder.name); setRenameOpen(true); }}>Rename</Btn>
            {availableAthletes.length > 0 && <Btn small onClick={() => { setAddAthTargets([]); setAddAthModal(true); }}>+ Add Athletes</Btn>}
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#71717A", marginBottom: 16 }}>{activeFolder.programs.length} athlete{activeFolder.programs.length !== 1 ? "s" : ""} · {(activeFolder.programs[0]?.weeks || []).length} weeks · each athlete logs their own copy</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {activeFolder.programs.map(p => {
            const ath = athletes.find(a => a.id === p.athlete_id);
            const wks = p.weeks || [];
            const completed = wks.filter(w => w.status === "completed").length;
            const missed = wks.filter(w => w.status === "missed").length;
            return (
              <Card key={p.id} onClick={() => setDetail(p.id)} style={{ cursor: "pointer", padding: isMobile ? 14 : 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{ath?.name || "Unassigned"}</div>
                    <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>{ath?.sport || ""}{ath?.age ? ` · Age ${ath.age}` : ""} · {wks.length}wk</div>
                  </div>
                  <Btn variant="danger" small onClick={(e) => { e.stopPropagation(); if (confirm(`Remove ${ath?.name || "this athlete"} from "${activeFolder.name}"? This deletes their copy of the program.`)) { deleteProgram(p.id); if (detail === p.id) setDetail(null); } }}>✕</Btn>
                </div>
                {wks.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                      {wks.map((w, i) => (<div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: w.status === "completed" ? "#16A34A" : w.status === "missed" ? "#DC2626" : "#E4E4E7" }} />))}
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
                <div style={{ marginTop: 10, fontSize: 12, color: "#18181B", fontWeight: 600 }}>Open program →</div>
              </Card>
            );
          })}
        </div>

        {/* Add athletes modal */}
        <Modal open={addAthModal} onClose={() => setAddAthModal(false)} title={`Add Athletes to ${activeFolder.name}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {availableAthletes.length === 0 ? (
              <p style={{ color: "#A1A1AA", fontSize: 14, textAlign: "center", padding: 16 }}>All athletes are already in this folder.</p>
            ) : (
              <>
                <p style={{ fontSize: 12, color: "#71717A", margin: 0 }}>Each athlete gets their own copy of this program to follow and log. If this program is linked to a Season, they&apos;re added to it automatically.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                  {availableAthletes.map(a => {
                    const checked = addAthTargets.includes(a.id);
                    return (
                      <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1px solid ${checked ? "#18181B" : "#E4E4E7"}`, borderRadius: 8, cursor: "pointer", background: checked ? "#F0FDF4" : "#fff" }}>
                        <input type="checkbox" checked={checked} onChange={() => setAddAthTargets(prev => checked ? prev.filter(id => id !== a.id) : [...prev, a.id])} style={{ accentColor: "#18181B" }} />
                        <div><div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div><div style={{ fontSize: 12, color: "#71717A" }}>{a.sport}{a.age ? ` · Age ${a.age}` : ""}</div></div>
                      </label>
                    );
                  })}
                </div>
                {addAthTargets.length > 0 && (
                  <Btn onClick={async () => { await addAthletesToFolder(activeFolder, addAthTargets); setAddAthModal(false); setAddAthTargets([]); }} style={{ marginTop: 4 }}>
                    Add {addAthTargets.length} Athlete{addAthTargets.length !== 1 ? "s" : ""}
                  </Btn>
                )}
              </>
            )}
          </div>
        </Modal>

        {/* Rename folder modal */}
        <Modal open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename Folder">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 12, color: "#71717A", margin: 0 }}>Renames this program for all {activeFolder.programs.length} athlete{activeFolder.programs.length !== 1 ? "s" : ""} in the folder.</p>
            <Input label="Folder / Program Name" value={renameVal} onChange={e => setRenameVal(e.target.value)} />
            <Btn onClick={async () => { const nn = renameVal.trim(); if (!nn) return; await renameFolder(activeFolder, nn); setFolderKey(keyOf(nn)); setRenameOpen(false); }} style={{ marginTop: 4 }}>Save</Btn>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Programs</h2>
        <Btn onClick={openNew} small={isMobile}>+ New</Btn>
      </div>
      {programs.length === 0 ? <EmptyState icon="▦" title="No programs yet" sub="Create a training program." action="+ New Program" onAction={openNew} /> : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {folders.map(folder => {
            // Single-athlete program → behaves like a normal program card (opens directly)
            if (folder.programs.length === 1) {
              const p = folder.programs[0];
              const ath = athletes.find(a => a.id === p.athlete_id);
              const grp = (groups || []).find(g => g.id === p.group_id);
              const wks = p.weeks || [];
              const completed = wks.filter(w => w.status === "completed").length;
              const missed = wks.filter(w => w.status === "missed").length;
              return (
                <Card key={p.id} onClick={() => setDetail(p.id)} style={{ cursor: "pointer", padding: isMobile ? 14 : 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{folder.name}</div>
                      <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>{ath?.name || "Unassigned"} · {wks.length}wk</div>
                      {grp && <div style={{ marginTop: 4 }}><Badge color="#16A34A">{grp.name}</Badge></div>}
                    </div>
                    <Btn variant="danger" small onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${folder.name}" for ${ath?.name || "this athlete"}?`)) { deleteProgram(p.id); if (detail === p.id) setDetail(null); } }}>✕</Btn>
                  </div>
                  {p.description && <p style={{ fontSize: 13, color: "#52525B", marginTop: 8 }}>{briefSummary(p.description)}</p>}
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
            }
            // Multi-athlete → folder card (opens the folder)
            const wks0 = folder.programs[0]?.weeks || [];
            const grp = (groups || []).find(g => g.id === folder.programs[0]?.group_id);
            const folderAthletes = folder.programs.map(p => athletes.find(a => a.id === p.athlete_id)).filter(Boolean);
            return (
              <Card key={folder.key} onClick={() => setFolderKey(folder.key)} style={{ cursor: "pointer", padding: isMobile ? 14 : 20, borderLeft: "4px solid #18181B" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}><span>📁</span>{folder.name}</div>
                    <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>{folder.programs.length} athletes · {wks0.length}wk</div>
                    {grp && <div style={{ marginTop: 4 }}><Badge color="#16A34A">{grp.name}</Badge></div>}
                  </div>
                  <Badge color="#18181B">{folder.programs.length}</Badge>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {folderAthletes.slice(0, 8).map(a => (
                    <span key={a.id} style={{ background: "#F4F4F5", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: "#52525B" }}>{a.name}</span>
                  ))}
                  {folderAthletes.length > 8 && <span style={{ fontSize: 12, color: "#A1A1AA", alignSelf: "center" }}>+{folderAthletes.length - 8}</span>}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "#18181B", fontWeight: 600 }}>Open folder →</div>
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
          <Input label="Start date (Week 1 Monday)" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
          <label style={{ display: "flex", alignItems: "start", gap: 10, padding: "10px 12px", border: `1px solid ${form.trackAsSeason ? "#16A34A" : "#E4E4E7"}`, borderRadius: 8, cursor: "pointer", background: form.trackAsSeason ? "#F0FDF4" : "#fff" }}>
            <input type="checkbox" checked={form.trackAsSeason} onChange={e => setForm({ ...form, trackAsSeason: e.target.checked })} style={{ accentColor: "#16A34A", marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Also track this as a Season</div>
              <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>Creates a matching Season named “{form.name || "…"}” and enrolls the selected athletes — gives you attendance, completion, and category stats without re-entering the roster.</div>
            </div>
          </label>
          {!form.trackAsSeason && (groups || []).length > 0 && (
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

// Read-only caption showing the four equipment-tier swaps for an exercise
function VariantHint({ ex }) {
  if (!ex || !ex.variants) return null;
  const rows = [
    ["Full gym", ex.variants.full_gym],
    ["No barbell", ex.variants.no_barbell],
    ["No machines", ex.variants.no_machine],
    ["Hotel gym", ex.variants.hotel_gym],
    ["DB / bodyweight", ex.variants.db_bodyweight],
  ].filter(r => r[1]);
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 6, padding: "6px 8px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 6 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#1E3A8A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>Equipment options</div>
      {rows.map(r => (
        <div key={r[0]} style={{ fontSize: 11, color: "#1E3A8A", lineHeight: 1.35 }}>
          <span style={{ fontWeight: 700 }}>{r[0]}:</span> {r[1]}
        </div>
      ))}
    </div>
  );
}

function ProgramDetail({ program, programs, exercises, cats, colors, addBlock, updateBlock, removeBlock, moveBlock, onBack, athletes, isMobile, submitDay, unlogDay, logs, copyToAthletes, updateProgram, groups, setLogs }) {
  // Keep a ref to latest program to prevent stale closures in async handlers
  const programRef = useRef(program);
  programRef.current = program;

  const [aw, setAw] = useState(() => {
    const weeks = program.weeks || [];
    // Find current week: first week that has any day not yet completed/missed
    const currentWi = weeks.findIndex(w => {
      if (w.status === "completed" || w.status === "missed") return false;
      const days = w.days || [];
      if (days.length === 0) return true;
      // If all days have a status, this week is done — move to next
      const allDaysDone = days.every(d => d.status === "completed" || d.status === "missed");
      return !allDaysDone;
    });
    return currentWi >= 0 ? currentWi : weeks.length - 1;
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
  const [recapSaved, setRecapSaved] = useState(false);

  // Compute current week (for the "back to current" button) but don't auto-navigate
  const currentWeekIndex = (() => {
    const weeks = program.weeks || [];
    const wi = weeks.findIndex(w => {
      if (w.status === "completed" || w.status === "missed") return false;
      const days = w.days || [];
      if (days.length === 0) return true;
      return !days.every(d => d.status === "completed" || d.status === "missed");
    });
    return wi >= 0 ? wi : weeks.length - 1;
  })();

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

    // Propagate coachRecap to all programs in the same season
    if (field === "coachRecap" && programRef.current.group_id) {
      const weekLabel = weeks[weekIndex].label;
      const groupId = programRef.current.group_id;
      
      // Fetch sibling programs fresh from Supabase to avoid stale data
      const { data: siblings } = await supabase.from("programs")
        .select("id, weeks")
        .eq("group_id", groupId)
        .neq("id", programRef.current.id);
      
      if (siblings && siblings.length > 0) {
        for (const sib of siblings) {
          const sibWeeks = JSON.parse(JSON.stringify(sib.weeks || []));
          const matchWi = sibWeeks.findIndex(w => w.label === weekLabel);
          if (matchWi >= 0) {
            sibWeeks[matchWi].coachRecap = value;
            // Update Supabase + local state for each sibling
            await updateProgram(sib.id, { weeks: sibWeeks });
          }
        }
      }
      setRecapSaved(true);
      setTimeout(() => setRecapSaved(false), 2000);
    }
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
    const weekLabel = week?.label || "";
    return logs.filter(l =>
      l.athlete_id === program.athlete_id &&
      l.day_label === dayLabel &&
      l.week_label === weekLabel
    );
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

  // Flexible matching: log entry matches a block by exercise_id, exact name, or normalized name
  const normalize = (s) => (s || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
  const logMatchesBlock = (log, block, displayName) => {
    if (block.exerciseId && log.exercise_id && log.exercise_id === block.exerciseId) return true;
    if (log.exercise_name === displayName) return true;
    if (block.exerciseName && log.exercise_name === block.exerciseName) return true;
    if (normalize(log.exercise_name) === normalize(displayName)) return true;
    if (block.exerciseName && normalize(log.exercise_name) === normalize(block.exerciseName)) return true;
    return false;
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

  const handleReopenDay = async (day) => {
    // Just reset the day status to "" — keeps all athlete log data intact
    const weeks = JSON.parse(JSON.stringify(programRef.current.weeks));
    const wDay = weeks[aw]?.days?.find(d => d.id === day.id);
    if (wDay) {
      wDay.status = "";
      await updateProgram(programRef.current.id, { weeks });
    }
  };

  const handleUnlog = async (day, skipConfirm) => {
    const date = getDateForDay(day.id);
    if (!skipConfirm && !confirm(`⚠️ This will permanently delete ${ath?.name || "this athlete"}'s logged workout for ${day.label} on ${date}, including their notes, RPE, and load data.\n\nThis cannot be undone. Are you sure?`)) return;
    setUnlogging(day.id);
    await unlogDay(program.athlete_id, date, day.label, week.label);
    setUnlogging(null);
  };

  const toggleExerciseStatus = async (logEntry, newStatus, block, dayLabel) => {
    if (logEntry && logEntry.id) {
      // Update existing log
      const status = logEntry.exercise_status === newStatus ? "completed" : newStatus;
      const { error } = await supabase.from("logs").update({ exercise_status: status }).eq("id", logEntry.id);
      if (!error && setLogs) {
        setLogs(prev => prev.map(l => l.id === logEntry.id ? { ...l, exercise_status: status } : l));
      }
    } else if (block) {
      // Create a new log entry for this exercise
      const exName = getDisplayName(block);
      const athleteName = ath?.name || "Unknown";
      const newLog = {
        athlete_id: program.athlete_id || "",
        athlete_name: athleteName,
        exercise_id: block.exerciseId || "",
        exercise_name: exName,
        category: block.category || "",
        sets: block.sets || "",
        reps: block.reps || "",
        load: block.load || "",
        rpe: "",
        notes: "",
        exercise_status: newStatus,
        date: getDateForDay(dayLabel || ""),
        week_label: week?.label || "",
        day_label: dayLabel || "",
      };
      const { data, error } = await supabase.from("logs").insert([newLog]).select();
      if (!error && data && setLogs) {
        setLogs(prev => [...data, ...prev]);
      }
    }
  };

  // Coach delete: remove the block from the program AND wipe any associated log entry
  // so the exercise fully disappears (no red ghost from a missed/completed log).
  const deleteBlockAndLog = async (wi, di, bi, block, logEntry) => {
    if (logEntry && logEntry.id) {
      const { error } = await supabase.from("logs").delete().eq("id", logEntry.id);
      if (!error && setLogs) {
        setLogs(prev => prev.filter(l => l.id !== logEntry.id));
      }
    }
    await removeBlock(wi, di, bi);
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
      {program.description && <ProgramBrief text={program.description} />}

      {/* Season link */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#71717A" }}>Season:</span>
        <select
          value={program.group_id || ""}
          onChange={e => updateProgram(program.id, { group_id: e.target.value })}
          style={{ padding: "4px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: "#fff", cursor: "pointer", color: program.group_id ? "#16A34A" : "#A1A1AA", fontWeight: program.group_id ? 600 : 400 }}
        >
          <option value="">No season</option>
          {(groups || []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#71717A" }}>Start date:</span>
        <input type="date" value={program.start_date || ""} onChange={e => updateProgram(program.id, { start_date: e.target.value || null })} style={{ padding: "4px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", background: "#fff", cursor: "pointer" }} />
        <span style={{ fontSize: 11, color: "#A1A1AA" }}>Week 1 Monday — sets every week/day date</span>
      </div>

      {/* Notes Board */}
      <NotesBoard athleteId={program.athlete_id} authorName="Coach" authorRole="coach" isMobile={isMobile} />

      <div style={{ display: "flex", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
        {weeks.map((w, i) => {
          const st = w.status || "";
          const isCurrent = i === currentWeekIndex;
          const bgColor = aw === i ? "#18181B" : st === "completed" ? "#16A34A" : st === "missed" ? "#DC2626" : "#fff";
          const textColor = aw === i ? "#fff" : st === "completed" || st === "missed" ? "#fff" : "#52525B";
          const borderColor = aw === i ? "#18181B" : isCurrent && aw !== i ? "#F59E0B" : st === "completed" ? "#16A34A" : st === "missed" ? "#DC2626" : "#E4E4E7";
          const weekStart = weekStartFromLabel(w.label, i, program.start_date);
          const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 4);
          const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          return (
            <button key={w.id} onClick={() => setAw(i)} style={{ padding: "4px 10px", borderRadius: 8, border: `2px solid ${borderColor}`, background: bgColor, color: textColor, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", position: "relative", textAlign: "center", lineHeight: 1.2 }}>
              {st === "completed" && "✓ "}
              {st === "missed" && "✗ "}
              {weekNumberLabel(w.label, i)}
              <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.75, marginTop: 1 }}>{fmt(weekStart)}–{fmt(weekEnd)}</div>
            </button>
          );
        })}
      </div>
      {aw !== currentWeekIndex && (
        <button onClick={() => setAw(currentWeekIndex)} style={{ marginBottom: 6, padding: "4px 12px", background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          ← Back to Current Week ({weekNumberLabel(weeks[currentWeekIndex]?.label, currentWeekIndex)})
        </button>
      )}
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
          // ONE map from block -> the athlete's log for it, built once at day level so the
          // results summary below and the per-block cards can never disagree about whether
          // a number exists.
          const blockLogMap = {};
          {
            const usedIds = new Set();
            day.blocks.forEach(block => {
              const dn = getDisplayName(block);
              const m = dayLogs.find(l => !usedIds.has(l.id) && logMatchesBlock(l, block, dn));
              if (m) { blockLogMap[block.id] = m; usedIds.add(m.id); }
            });
          }

          return (
            <Card key={day.id} style={{ padding: 14, minWidth: 0, border: day.status === "completed" ? "2px solid #16A34A" : day.status === "missed" ? "2px solid #DC2626" : "1px solid #E4E4E7", background: day.status === "completed" ? "#F0FDF418" : day.status === "missed" ? "#FEF2F218" : "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {day.status === "completed" && <span style={{ color: "#16A34A", fontWeight: 700, fontSize: 14 }}>✓</span>}
                  {day.status === "missed" && <span style={{ color: "#DC2626", fontWeight: 700, fontSize: 14 }}>✗</span>}
                  <h4 style={{ margin: 0, fontSize: 15 }}>{day.label}
                    <span style={{ fontWeight: 400, fontSize: 12, color: "#71717A", marginLeft: 6 }}>
                      {(() => { const ws = weekStartFromLabel(week.label, aw, program.start_date); const d = new Date(ws); d.setDate(ws.getDate() + weekdayOffset(day.label)); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); })()}
                    </span>
                  </h4>
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
              {(() => { const wu = warmupForDay(day.label); if (!wu || !/hypertroph/i.test((program && program.name) || "")) return null; return (
                <details style={{ marginBottom: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#1E3A8A" }}>🔥 Warm-up (8–10 min)</summary>
                  <div style={{ marginTop: 6, padding: "8px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, fontSize: 12, color: "#1E3A8A", lineHeight: 1.5 }}>
                    {wu}
                    <div style={{ marginTop: 6, color: "#52525B", fontStyle: "italic" }}>{WARMUP_NOTE}</div>
                  </div>
                </details>
              ); })()}
              {day.blocks.length === 0 && <p style={{ color: "#A1A1AA", fontSize: 13, textAlign: "center", padding: 12 }}>Empty</p>}
              {(() => {
                // blockLogMap is built once at day level, above.
                return day.blocks.map((block, bi) => {
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
                const blockLogged = !!blockLogMap[block.id];
                const logEntry = blockLogMap[block.id];
                const exStatus = logEntry?.exercise_status || null;
                const borderLeftColor = exStatus === "missed" ? "#DC2626" : exStatus === "completed" ? "#16A34A" : (cc?.bg || "#999");
                const cardBg = exStatus === "missed" ? "#FEF2F2" : exStatus === "completed" ? "#F0FDF4" : (cc?.light || "#F9FAFB");

                return (
                  <div key={block.id} style={{ background: cardBg, border: `1px solid ${cc?.border || "#E5E7EB"}`, borderRadius: 10, marginBottom: 8, borderLeft: `4px solid ${borderLeftColor}`, overflow: "hidden", opacity: exStatus === "missed" ? 0.6 : 1 }}>
                    {isMobile ? (() => {
                      const isOpen = expandedBlock === block.id;
                      return (
                        <>
                          <div style={{ display: "flex", alignItems: "center", padding: "10px 10px", gap: 6 }}>
                            <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => toggleExerciseStatus(logEntry, "completed", block, day.label)} style={{ width: 22, height: 22, borderRadius: 4, border: exStatus === "completed" ? "2px solid #16A34A" : "1px solid #D4D4D8", background: exStatus === "completed" ? "#16A34A" : "transparent", color: exStatus === "completed" ? "#fff" : "#A1A1AA", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✓</button>
                              <button onClick={() => toggleExerciseStatus(logEntry, "missed", block, day.label)} style={{ width: 22, height: 22, borderRadius: 4, border: exStatus === "missed" ? "2px solid #DC2626" : "1px solid #D4D4D8", background: exStatus === "missed" ? "#DC2626" : "transparent", color: exStatus === "missed" ? "#fff" : "#A1A1AA", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }} title="Mark missed">✗</button>
                              <button onClick={() => { if (confirm(`Delete "${getDisplayName(block)}" from ${day.label}? This removes it from the day's program.`)) deleteBlockAndLog(aw, di, bi, block, logEntry); }} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid #FCA5A5", background: "transparent", color: "#DC2626", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }} title="Delete from day">🗑</button>
                            </div>
                            <div onClick={() => setExpandedBlock(isOpen ? null : block.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1, cursor: "pointer" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                <Badge color={cc?.bg || "#999"}>{block.category}</Badge>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, textDecoration: exStatus === "missed" ? "line-through" : "none", wordBreak: "break-word" }}>{displayName}</div>
                                  <div style={{ fontSize: 11, color: "#71717A" }}>{[block.sets && block.reps ? `${block.sets}×${block.reps}` : null, block.load ? `@ ${block.load}` : null].filter(Boolean).join(" ") || "—"}</div>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                                {blockLogged && <span style={{ width: 8, height: 8, borderRadius: 4, background: "#16A34A", flexShrink: 0 }} title="Athlete logged" />}
                                {videoUrl && <a href={videoUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>▶</a>}
                                <span style={{ fontSize: 12, color: "#A1A1AA", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>
                              </div>
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
                                <BlurInput value={block.notes || ""} onSave={v => updateBlock(aw, di, bi, "notes", v)} placeholder="Coaching cues, modifications…" multiline style={{ width: "100%", padding: "6px 5px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 14, fontFamily: "inherit", marginTop: 1, boxSizing: "border-box", minHeight: block.notes && block.notes.length > 60 ? 60 : undefined }} />
                              </label>
                              <VariantHint ex={resolvedEx} />
                              {block.notes && !expandedBlock && <div style={{ fontSize: 11, color: "#71717A", marginTop: 4, fontStyle: "italic", whiteSpace: "pre-wrap", lineHeight: 1.4, wordBreak: "break-word" }}>{block.notes}</div>}

                              {/* Athlete's logged results */}
                              {(() => {
                                const ml = blockLogMap[block.id];
                                if (!ml) return null;
                                return (
                                  <div style={{ marginTop: 8, padding: "8px 10px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0" }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Athlete's Results</div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                                      <div><div style={{ fontSize: 9, color: "#71717A" }}>Sets</div><div style={{ fontSize: 14, fontWeight: 700 }}>{ml.sets || "—"}</div></div>
                                      <div><div style={{ fontSize: 9, color: "#71717A" }}>Reps</div><div style={{ fontSize: 14, fontWeight: 700 }}>{ml.reps || "—"}</div></div>
                                      <div><div style={{ fontSize: 9, color: "#71717A" }}>Load</div><div style={{ fontSize: 14, fontWeight: 700 }}>{ml.load || "—"}</div></div>
                                      <div><div style={{ fontSize: 9, color: "#71717A" }}>RPE</div><div style={{ fontSize: 14, fontWeight: 700 }}>{ml.rpe || "—"}</div></div>
                                    </div>
                                    {ml.notes && (
                                      <div style={{ marginTop: 6, padding: "4px 6px", background: "#fff", borderRadius: 4, border: "1px solid #BBF7D0" }}>
                                        <div style={{ fontSize: 9, color: "#71717A" }}>Athlete Notes</div>
                                        <div style={{ fontSize: 12, color: "#18181B", whiteSpace: "pre-wrap" }}>{ml.notes}</div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </>
                      );
                    })() : (
                      /* Desktop: full expanded view */
                      <div style={{ padding: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                              <button onClick={() => toggleExerciseStatus(logEntry, "completed", block, day.label)} style={{ width: 22, height: 22, borderRadius: 4, border: exStatus === "completed" ? "2px solid #16A34A" : "1px solid #D4D4D8", background: exStatus === "completed" ? "#16A34A" : "transparent", color: exStatus === "completed" ? "#fff" : "#A1A1AA", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✓</button>
                              <button onClick={() => toggleExerciseStatus(logEntry, "missed", block, day.label)} style={{ width: 22, height: 22, borderRadius: 4, border: exStatus === "missed" ? "2px solid #DC2626" : "1px solid #D4D4D8", background: exStatus === "missed" ? "#DC2626" : "transparent", color: exStatus === "missed" ? "#fff" : "#A1A1AA", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }} title="Mark missed">✗</button>
                              <button onClick={() => { if (confirm(`Delete "${getDisplayName(block)}" from ${day.label}? This removes it from the day's program.`)) deleteBlockAndLog(aw, di, bi, block, logEntry); }} style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid #FCA5A5", background: "transparent", color: "#DC2626", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }} title="Delete from day">🗑</button>
                            </div>
                            <Badge color={cc?.bg || "#999"}>{block.category}</Badge>
                            {blockLogged && <span style={{ width: 8, height: 8, borderRadius: 4, background: "#16A34A", flexShrink: 0 }} title="Athlete logged" />}
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
                          <BlurInput value={block.notes || ""} onSave={v => updateBlock(aw, di, bi, "notes", v)} placeholder="Coaching cues, modifications…" multiline style={{ width: "100%", padding: "4px 5px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", marginTop: 1, boxSizing: "border-box", minHeight: block.notes && block.notes.length > 60 ? 60 : undefined }} />
                        </label>
                        <VariantHint ex={resolvedEx} />

                        {/* Athlete's logged results */}
                        {(() => {
                          const ml = blockLogMap[block.id];
                          if (!ml) return null;
                          return (
                            <div style={{ marginTop: 8, padding: "8px 10px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Athlete's Results</div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                                <div><div style={{ fontSize: 9, color: "#71717A" }}>Sets</div><div style={{ fontSize: 14, fontWeight: 700 }}>{ml.sets || "—"}</div></div>
                                <div><div style={{ fontSize: 9, color: "#71717A" }}>Reps</div><div style={{ fontSize: 14, fontWeight: 700 }}>{ml.reps || "—"}</div></div>
                                <div><div style={{ fontSize: 9, color: "#71717A" }}>Load</div><div style={{ fontSize: 14, fontWeight: 700 }}>{ml.load || "—"}</div></div>
                                <div><div style={{ fontSize: 9, color: "#71717A" }}>RPE</div><div style={{ fontSize: 14, fontWeight: 700 }}>{ml.rpe || "—"}</div></div>
                              </div>
                              {ml.notes && (
                                <div style={{ marginTop: 6, padding: "4px 6px", background: "#fff", borderRadius: 4, border: "1px solid #BBF7D0" }}>
                                  <div style={{ fontSize: 9, color: "#71717A" }}>Athlete Notes</div>
                                  <div style={{ fontSize: 12, color: "#18181B", whiteSpace: "pre-wrap" }}>{ml.notes}</div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              });
              })()}

              {/* Submit / Reopen / Manage section */}
              {day.blocks.length > 0 && submitDay && (
                <div style={{ marginTop: 8, padding: 10, background: isLogged ? "#F0FDF4" : "#F9FAFB", borderRadius: 8, border: `1px solid ${isLogged ? "#4ADE80" : "#E4E4E7"}` }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontSize: 11, color: "#71717A", fontWeight: 600 }}>Date:</label>
                    <input type="date" value={date} onChange={e => setSubmitDates(prev => ({ ...prev, [day.id]: e.target.value }))} style={{ flex: 1, padding: "3px 6px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  {isLogged && (
                    <div style={{ marginBottom: 8, minWidth: 0, background: "#fff", border: "1px solid #BBF7D0", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5, padding: "6px 8px", background: "#F0FDF4" }}>
                        What {(ath?.name || "the athlete").split(" ")[0]} actually did
                      </div>
                      {day.blocks.filter(b => blockLogMap[b.id]).map(b => {
                        const ml = blockLogMap[b.id];
                        const val = [
                          ml.sets && ml.reps ? `${ml.sets}\u00d7${ml.reps}` : (ml.reps || ml.sets || ""),
                          ml.load ? `@ ${ml.load}` : "",
                          ml.rpe ? `RPE ${ml.rpe}` : "",
                        ].filter(Boolean).join(" \u00b7 ");
                        return (
                          <div key={b.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 10, padding: "4px 8px", borderTop: "1px solid #F0FDF4", fontSize: 12 }}>
                            <span style={{ color: "#52525B", flex: "1 1 auto", minWidth: 110, wordBreak: "break-word" }}>{ml.exercise_name || getDisplayName(b)}</span>
                            <span style={{ fontWeight: 700, flex: "0 0 auto", marginLeft: "auto", whiteSpace: "nowrap" }}>{val || "\u2014"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isLogged && day.status === "completed" ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "#16A34A", fontWeight: 600, fontSize: 13 }}>✓ Logged — {dayLogs.length} exercises</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => handleReopenDay(day)}
                          style={{ flex: 1, padding: "7px", background: "#FEF3C7", color: "#92400E", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          ✏️ Reopen Day
                        </button>
                      </div>
                      <button
                        onClick={() => handleUnlog(day)}
                        disabled={unlogging === day.id}
                        style={{ width: "100%", marginTop: 4, padding: "5px", background: "none", color: "#DC2626", border: "none", fontSize: 11, fontWeight: 600, cursor: unlogging === day.id ? "default" : "pointer", fontFamily: "inherit", opacity: 0.7 }}
                      >
                        {unlogging === day.id ? "Deleting…" : "🗑 Delete All Logs"}
                      </button>
                    </div>
                  ) : isLogged && day.status !== "completed" ? (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "#D97706", fontWeight: 600, fontSize: 13 }}>✏️ Reopened — {dayLogs.length} exercises (athlete data preserved)</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => {
                            setDayStatus(aw, di, "completed");
                          }}
                          style={{ flex: 1, padding: "7px", background: "#18181B", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          ✓ Mark Complete
                        </button>
                      </div>
                      <button
                        onClick={() => handleUnlog(day)}
                        disabled={unlogging === day.id}
                        style={{ width: "100%", marginTop: 4, padding: "5px", background: "none", color: "#DC2626", border: "none", fontSize: 11, fontWeight: 600, cursor: unlogging === day.id ? "default" : "pointer", fontFamily: "inherit", opacity: 0.7 }}
                      >
                        {unlogging === day.id ? "Deleting…" : "🗑 Delete All Logs"}
                      </button>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#1E40AF", textTransform: "uppercase", letterSpacing: 0.5 }}>📋 Weekly Recap — {week.label}</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {recapSaved && <span style={{ fontSize: 11, fontWeight: 600, color: "#16A34A" }}>✓ Saved to all athletes</span>}
            {program.group_id && <span style={{ fontSize: 10, color: "#93C5FD" }}>Shared across season</span>}
          </div>
        </div>
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

          <div style={{ position: "sticky", bottom: 0, background: "#fff", paddingTop: 10, marginTop: 2, borderTop: "1px solid #F4F4F5" }}>
            <Btn disabled={copyTargets.length === 0} onClick={async () => {
              if (copyTargets.length === 0) return;
              await copyToAthletes(program, copyTargets, copyMode, aw, copyDayIndex);
              setCopyOpen(false);
              setCopyTargets([]);
              alert(copyMode === "program" ? "Program copied!" : `${copyMode === "week" ? week.label : week.days[copyDayIndex]?.label} copied into existing programs!`);
            }} style={{ width: "100%", marginTop: 0 }}>
              {copyTargets.length === 0
                ? "Select at least one athlete to copy to"
                : (copyMode === "program"
                  ? `Copy Full Program to ${copyTargets.length} Athlete${copyTargets.length !== 1 ? "s" : ""}`
                  : `Paste ${copyMode === "week" ? week.label : `${week.label} ${week.days[copyDayIndex]?.label}`} into ${copyTargets.length} Program${copyTargets.length !== 1 ? "s" : ""}`)
              }
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
