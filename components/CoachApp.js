"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { PILLAR_COLORS, GENERIC_COLORS, NAV_ITEMS } from "../lib/constants";
import Dashboard from "./Dashboard";
import Athletes from "./Athletes";
import Programs from "./Programs";
import Library from "./Library";
import LogPage from "./LogPage";
import Settings from "./Settings";
import Seasons from "./Seasons";
import T2PLogo from "./T2PLogo";

function useIsMobile(bp = 768) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const h = () => setM(window.innerWidth < bp);
    h();
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return m;
}

export default function CoachApp({ onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [athletes, setAthletes] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [logs, setLogs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupAthletes, setGroupAthletes] = useState([]);
  const [baselines, setBaselines] = useState([]);
  const [videoSubs, setVideoSubs] = useState([]);
  const [usePillars, setUsePillars] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const isMobile = useIsMobile();

  const cats = usePillars ? Object.keys(PILLAR_COLORS) : Object.keys(GENERIC_COLORS);
  const colors = usePillars ? PILLAR_COLORS : GENERIC_COLORS;

  // Load all data from Supabase
  useEffect(() => {
    async function loadData() {
      const [aRes, pRes, eRes, lRes, sRes, gRes, gaRes, bRes, vRes] = await Promise.all([
        supabase.from("athletes").select("*").order("created_at", { ascending: true }),
        supabase.from("programs").select("*").order("created_at", { ascending: true }),
        supabase.from("exercises").select("*"),
        supabase.from("logs").select("*").order("date", { ascending: false }),
        supabase.from("settings").select("*").eq("id", 1).single(),
        supabase.from("program_groups").select("*").order("created_at", { ascending: false }),
        supabase.from("group_athletes").select("*"),
        supabase.from("baselines").select("*").order("sort_order", { ascending: true }),
        supabase.from("video_submissions").select("*").order("created_at", { ascending: false }),
      ]);
      setAthletes(aRes.data || []);
      setPrograms(pRes.data || []);
      setExercises(eRes.data || []);
      setLogs(lRes.data || []);
      setGroups(gRes.data || []);
      setGroupAthletes(gaRes.data || []);
      setBaselines(bRes.data || []);
      setVideoSubs(vRes.data || []);
      if (sRes.data) setUsePillars(sRes.data.use_pillars);
      setLoaded(true);
    }
    loadData();
  }, []);

  // Save helpers — update local state + Supabase
  const saveAthletes = useCallback(async (newAthletes) => {
    setAthletes(newAthletes);
  }, []);

  const addAthlete = useCallback(async (athlete) => {
    const { data, error } = await supabase.from("athletes").insert(athlete).select().single();
    if (!error && data) setAthletes(prev => [...prev, data]);
  }, []);

  const updateAthlete = useCallback(async (id, updates) => {
    const { error } = await supabase.from("athletes").update(updates).eq("id", id);
    if (!error) setAthletes(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }, []);

  const deleteAthlete = useCallback(async (id) => {
    await supabase.from("athletes").delete().eq("id", id);
    setAthletes(prev => prev.filter(a => a.id !== id));
  }, []);

  const addProgram = useCallback(async (program) => {
    const { data, error } = await supabase.from("programs").insert(program).select().single();
    if (!error && data) { setPrograms(prev => [...prev, data]); return data; }
    return null;
  }, []);

  const updateProgram = useCallback(async (id, updates) => {
    const { error } = await supabase.from("programs").update(updates).eq("id", id);
    if (!error) setPrograms(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const deleteProgram = useCallback(async (id) => {
    await supabase.from("programs").delete().eq("id", id);
    setPrograms(prev => prev.filter(p => p.id !== id));
  }, []);

  const addExercise = useCallback(async (exercise) => {
    const { data, error } = await supabase.from("exercises").insert(exercise).select().single();
    if (!error && data) setExercises(prev => [...prev, data]);
  }, []);

  const deleteExercise = useCallback(async (id) => {
    await supabase.from("exercises").delete().eq("id", id);
    setExercises(prev => prev.filter(e => e.id !== id));
  }, []);

  const updateExercise = useCallback(async (id, updates) => {
    const { error } = await supabase.from("exercises").update(updates).eq("id", id);
    if (!error) setExercises(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }, []);

  const addLog = useCallback(async (log) => {
    const { data, error } = await supabase.from("logs").insert(log).select().single();
    if (!error && data) setLogs(prev => [data, ...prev]);
  }, []);

  const submitDay = useCallback(async (program, day, date, weekLabel) => {
    const athlete = athletes.find(a => a.id === program.athlete_id);
    const athleteName = athlete?.name || "Unknown";
    const logEntries = day.blocks.map(block => {
      const exName = block.exerciseName || exercises.find(e => e.id === block.exerciseId)?.name || "Unknown";
      return {
        athlete_id: program.athlete_id || "",
        athlete_name: athleteName,
        exercise_id: block.exerciseId || "",
        exercise_name: exName,
        category: block.category || "",
        sets: block.sets || "",
        reps: block.reps || "",
        load: block.load || "",
        rpe: "",
        notes: block.notes || "",
        date: date || new Date().toISOString().slice(0, 10),
        week_label: weekLabel || "",
        day_label: day.label || "",
      };
    });
    const { data, error } = await supabase.from("logs").insert(logEntries).select();
    if (!error && data) setLogs(prev => [...data.reverse(), ...prev]);
    return !error;
  }, [athletes, exercises]);

  const deleteLog = useCallback(async (id) => {
    await supabase.from("logs").delete().eq("id", id);
    setLogs(prev => prev.filter(l => l.id !== id));
  }, []);

  const unlogDay = useCallback(async (athleteId, date, dayLabel, weekLabel) => {
    let query = supabase.from("logs").delete().eq("athlete_id", athleteId).eq("date", date);
    if (dayLabel) query = query.eq("day_label", dayLabel);
    if (weekLabel) query = query.eq("week_label", weekLabel);
    const { error } = await query;
    if (!error) setLogs(prev => prev.filter(l => !(l.athlete_id === athleteId && l.date === date && (!dayLabel || l.day_label === dayLabel) && (!weekLabel || l.week_label === weekLabel))));
    return !error;
  }, []);

  const saveSettings = useCallback(async (pillars) => {
    setUsePillars(pillars);
    await supabase.from("settings").update({ use_pillars: pillars }).eq("id", 1);
  }, []);

  const resetAll = useCallback(async () => {
    await Promise.all([
      supabase.from("athletes").delete().neq("id", ""),
      supabase.from("programs").delete().neq("id", ""),
      supabase.from("logs").delete().neq("id", ""),
    ]);
    setAthletes([]);
    setPrograms([]);
    setLogs([]);
  }, []);

  // Group functions
  const addGroup = useCallback(async (group) => {
    const { data, error } = await supabase.from("program_groups").insert(group).select().single();
    if (!error && data) setGroups(prev => [data, ...prev]);
    return data;
  }, []);

  const updateGroup = useCallback(async (id, updates) => {
    const { error } = await supabase.from("program_groups").update(updates).eq("id", id);
    if (!error) setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  }, []);

  const deleteGroup = useCallback(async (id) => {
    await supabase.from("program_groups").delete().eq("id", id);
    await supabase.from("group_athletes").delete().eq("group_id", id);
    setGroups(prev => prev.filter(g => g.id !== id));
    setGroupAthletes(prev => prev.filter(ga => ga.group_id !== id));
  }, []);

  const addAthleteToGroup = useCallback(async (groupId, athleteId) => {
    const { data, error } = await supabase.from("group_athletes").insert({ group_id: groupId, athlete_id: athleteId }).select().single();
    if (!error && data) setGroupAthletes(prev => [...prev, data]);
  }, []);

  const removeAthleteFromGroup = useCallback(async (groupId, athleteId) => {
    await supabase.from("group_athletes").delete().eq("group_id", groupId).eq("athlete_id", athleteId);
    setGroupAthletes(prev => prev.filter(ga => !(ga.group_id === groupId && ga.athlete_id === athleteId)));
  }, []);

  const updateBaseline = useCallback(async (id, updates) => {
    const { error } = await supabase.from("baselines").update(updates).eq("id", id);
    if (!error) setBaselines(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const addVideoSub = useCallback(async (sub) => {
    const { data, error } = await supabase.from("video_submissions").insert(sub).select().single();
    if (!error && data) setVideoSubs(prev => [data, ...prev]);
    return data;
  }, []);

  const updateVideoSub = useCallback(async (id, updates) => {
    const { error } = await supabase.from("video_submissions").update(updates).eq("id", id);
    if (!error) setVideoSubs(prev => prev.map(v => v.id === id ? { ...v, ...updates } : v));
  }, []);

  const deleteVideoSub = useCallback(async (id) => {
    await supabase.from("video_submissions").delete().eq("id", id);
    setVideoSubs(prev => prev.filter(v => v.id !== id));
  }, []);

  const nav = (id) => { setPage(id); if (isMobile) setNavOpen(false); };

  if (!loaded) return (
    <div className="t2p-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#71717A" }}>Loading…</p>
    </div>
  );

  const pp = {
    athletes, programs, exercises, logs, cats, colors, usePillars, isMobile, setPage: nav,
    groups, groupAthletes, baselines, videoSubs,
    addAthlete, updateAthlete, deleteAthlete,
    addProgram, updateProgram, deleteProgram,
    addExercise, deleteExercise, updateExercise,
    addLog, deleteLog, submitDay, unlogDay,
    addGroup, updateGroup, deleteGroup,
    addAthleteToGroup, removeAthleteFromGroup,
    updateBaseline,
    addVideoSub, updateVideoSub, deleteVideoSub,
    saveSettings, resetAll,
  };

  return (
    <div className="t2p-root" style={{ fontFamily: "'DM Sans', sans-serif", display: "flex", background: "#FAFAFA", overflow: "hidden", position: "relative" }}>
      {isMobile && navOpen && <div onClick={() => setNavOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 999 }} />}
      <nav className="t2p-nav" style={{
        width: 220, minWidth: 220, background: "#18181B", color: "#fff",
        display: "flex", flexDirection: "column", paddingBottom: 0,
        position: isMobile ? "fixed" : "relative",
        left: isMobile ? (navOpen ? 0 : -240) : 0,
        top: 0, bottom: 0, zIndex: 1000,
        transition: "left .25s cubic-bezier(.4,0,.2,1)",
        boxShadow: isMobile && navOpen ? "4px 0 24px rgba(0,0,0,.25)" : "none",
      }}>
        <div style={{ padding: "0 20px 28px", borderBottom: "1px solid #27272A", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <T2PLogo />
          {isMobile && <button onClick={() => setNavOpen(false)} style={{ background: "none", border: "none", color: "#A1A1AA", fontSize: 22, cursor: "pointer", padding: 4 }}>✕</button>}
        </div>
        <div style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(n => (
            <button key={n.id} onClick={() => nav(n.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
              border: "none", background: page === n.id ? "#27272A" : "transparent",
              color: page === n.id ? "#fff" : "#A1A1AA", fontSize: 14, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #27272A", fontSize: 11, color: "#52525B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{usePillars ? "T2P Pillar Mode" : "Generic Mode"}</span>
          {onLogout && <button onClick={onLogout} style={{ background: "none", border: "none", color: "#71717A", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Sign Out</button>}
        </div>
      </nav>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, maxWidth: "100%" }}>
        {isMobile && (
          <header className="t2p-mobile-header" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#fff", borderBottom: "1px solid #E4E4E7", flexShrink: 0 }}>
            <button onClick={() => setNavOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ display: "block", width: 22, height: 2, background: "#18181B", borderRadius: 2 }} />
              <span style={{ display: "block", width: 22, height: 2, background: "#18181B", borderRadius: 2 }} />
              <span style={{ display: "block", width: 22, height: 2, background: "#18181B", borderRadius: 2 }} />
            </button>
            <T2PLogo size="small" variant="dark" />
            <span style={{ fontSize: 13, color: "#A1A1AA", marginLeft: "auto", textTransform: "capitalize" }}>{page}</span>
          </header>
        )}
        <main className="t2p-main" style={{ flex: 1, padding: isMobile ? 16 : 32 }}>
          {page === "dashboard" && <Dashboard {...pp} />}
          {page === "seasons" && <Seasons {...pp} />}
          {page === "athletes" && <Athletes {...pp} />}
          {page === "programs" && <Programs {...pp} />}
          {page === "library" && <Library {...pp} />}
          {page === "log" && <LogPage {...pp} />}
          {page === "settings" && <Settings {...pp} />}
        </main>
      </div>
    </div>
  );
}
