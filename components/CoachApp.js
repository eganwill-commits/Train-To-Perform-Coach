"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { PILLAR_COLORS, GENERIC_COLORS, NAV_ITEMS } from "../lib/constants";
import { WorkspaceProvider, useWorkspace } from "../lib/WorkspaceContext";
import { DEFAULT_WORKSPACE } from "../lib/workspaces";
import Dashboard from "./Dashboard";
import Athletes from "./Athletes";
import Programs from "./Programs";
import Library from "./Library";
import LogPage from "./LogPage";
import Settings from "./Settings";
import Seasons from "./Seasons";
import Messages from "./Messages";
import AIChat from "./AIChat";
import ToastNotifications from "./ToastNotifications";
import AlertsBell from "./AlertsBell";
import T2PLogo from "./T2PLogo";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

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

// Outer wrapper provides WorkspaceContext to the entire coach tree
export default function CoachApp(props) {
  return (
    <WorkspaceProvider>
      <CoachAppInner {...props} />
    </WorkspaceProvider>
  );
}

function CoachAppInner({ onLogout }) {
  const { activeProgramType, workspace } = useWorkspace();

  const [page, setPage] = useState("dashboard");
  const [focusAthleteId, setFocusAthleteId] = useState(null);
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
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const isMobile = useIsMobile();

  const cats = usePillars ? Object.keys(PILLAR_COLORS) : Object.keys(GENERIC_COLORS);
  const colors = usePillars ? PILLAR_COLORS : GENERIC_COLORS;

  // Refs for latest state (used in callbacks to avoid stale closures)
  const programsRef = useRef(programs);
  programsRef.current = programs;
  const athletesRef = useRef(athletes);
  athletesRef.current = athletes;
  const activeProgramTypeRef = useRef(activeProgramType);
  activeProgramTypeRef.current = activeProgramType;

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

  // Poll for programs and videos every 30 seconds
  useEffect(() => {
    if (!loaded) return;
    const poll = setInterval(async () => {
      const [vRes, pRes] = await Promise.all([
        supabase.from("video_submissions").select("*").order("created_at", { ascending: false }),
        supabase.from("programs").select("*"),
      ]);
      if (vRes.data) setVideoSubs(vRes.data);
      if (pRes.data) setPrograms(pRes.data);
    }, 30000);
    return () => clearInterval(poll);
  }, [loaded]);

  // Realtime subscription for logs — instant updates
  useEffect(() => {
    if (!loaded) return;
    const channel = supabase.channel("coach-logs-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "logs" }, (payload) => {
        setLogs(prev => {
          if (prev.some(l => l.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "logs" }, (payload) => {
        setLogs(prev => prev.map(l => l.id === payload.new.id ? payload.new : l));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "logs" }, (payload) => {
        setLogs(prev => prev.filter(l => l.id !== payload.old.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loaded]);

  // Poll for unread messages
  useEffect(() => {
    const fetchUnread = async () => {
      const { data } = await supabase.from("messages").select("id").eq("sender_role", "athlete").is("read_at", null);
      setUnreadMsgCount(data?.length || 0);
    };
    fetchUnread();
    const iv = setInterval(fetchUnread, 15000);
    return () => clearInterval(iv);
  }, []);

  // Save helpers — update local state + Supabase
  const saveAthletes = useCallback(async (newAthletes) => {
    setAthletes(newAthletes);
  }, []);

  // ★ Workspace-aware: auto-stamp program_type on new athletes
  const addAthlete = useCallback(async (athlete) => {
    const stamped = { ...athlete, program_type: athlete.program_type || activeProgramTypeRef.current };
    const { data, error } = await supabase.from("athletes").insert(stamped).select().single();
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

  // ★ Workspace-aware: auto-stamp program_type on new programs
  //   - If program has athlete_id, inherit that athlete's workspace
  //   - Otherwise, use the currently active workspace
  const addProgram = useCallback(async (program) => {
    let pt = program.program_type;
    if (!pt && program.athlete_id) {
      const a = athletesRef.current.find(x => x.id === program.athlete_id);
      pt = a?.program_type;
    }
    pt = pt || activeProgramTypeRef.current;
    const stamped = { ...program, program_type: pt };
    const { data, error } = await supabase.from("programs").insert(stamped).select().single();
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

  // ★ Workspace-aware: default suitability includes current workspace
  const addExercise = useCallback(async (exercise) => {
    const suitability = exercise.suitability && exercise.suitability.length > 0
      ? exercise.suitability
      : [activeProgramTypeRef.current];
    const stamped = { ...exercise, suitability };
    const { data, error } = await supabase.from("exercises").insert(stamped).select().single();
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

    // Delete existing logs for this athlete+week+day to prevent duplicates
    const existing = logs.filter(l =>
      l.athlete_id === program.athlete_id && l.day_label === (day.label || "") && l.week_label === (weekLabel || "")
    );
    if (existing.length > 0) {
      for (const old of existing) {
        await supabase.from("logs").delete().eq("id", old.id);
      }
      setLogs(prev => prev.filter(l => !existing.some(e => e.id === l.id)));
    }

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
        exercise_status: "completed",
      };
    });
    const { data, error } = await supabase.from("logs").insert(logEntries).select();
    if (!error && data) setLogs(prev => [...data.reverse(), ...prev]);
    return !error;
  }, [athletes, exercises, logs]);

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

    // Auto-copy programs from this season to the new athlete
    const uid = () => Math.random().toString(36).slice(2, 10);
    const seasonPrograms = programsRef.current.filter(p => p.group_id === groupId);
    const existingAthleteIds = seasonPrograms.map(p => p.athlete_id).filter(id => id && id !== athleteId);
    if (existingAthleteIds.length === 0) return; // No existing programs to copy

    const templateAthleteId = existingAthleteIds[0];
    const templatePrograms = seasonPrograms.filter(p => p.athlete_id === templateAthleteId);
    const alreadyHas = seasonPrograms.some(p => p.athlete_id === athleteId);
    if (alreadyHas) return;

    const athlete = athletesRef.current.find(a => a.id === athleteId);
    const athName = athlete?.name || "Athlete";
    // ★ Inherit workspace from the destination athlete
    const newProgramType = athlete?.program_type || activeProgramTypeRef.current;

    for (const tp of templatePrograms) {
      const newWeeks = JSON.parse(JSON.stringify(tp.weeks || [])).map(w => ({
        ...w, id: uid(),
        days: (w.days || []).map(d => ({
          ...d, id: uid(), status: "", coachNotes: "", coachNotesShared: false,
          blocks: (d.blocks || []).map(b => ({ ...b, id: uid() })),
        })),
        status: "", coachRecap: "",
      }));
      const baseName = tp.name.includes("—") ? tp.name.split("—").slice(1).join("—").trim() : tp.name;
      const newProg = await supabase.from("programs").insert({
        name: `${athName} — ${baseName}`,
        athlete_id: athleteId,
        description: tp.description || "",
        weeks: newWeeks,
        group_id: groupId,
        program_type: newProgramType,   // ★ stamp workspace
      }).select().single();
      if (!newProg.error && newProg.data) {
        setPrograms(prev => [...prev, newProg.data]);
      }
    }
  }, []);

  const removeAthleteFromGroup = useCallback(async (groupId, athleteId) => {
    await supabase.from("group_athletes").delete().eq("group_id", groupId).eq("athlete_id", athleteId);
    setGroupAthletes(prev => prev.filter(ga => !(ga.group_id === groupId && ga.athlete_id === athleteId)));
  }, []);

  const updateBaseline = useCallback(async (id, updates) => {
    const { error } = await supabase.from("baselines").update(updates).eq("id", id);
    if (!error) setBaselines(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const addBaseline = useCallback(async (baseline) => {
    const { data, error } = await supabase.from("baselines").insert(baseline).select().single();
    if (!error && data) setBaselines(prev => [...prev, data]);
    return data;
  }, []);

  const deleteBaseline = useCallback(async (id) => {
    await supabase.from("baselines").delete().eq("id", id);
    setBaselines(prev => prev.filter(b => b.id !== id));
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

  const nav = (id) => { setPage(id); setFocusAthleteId(null); if (isMobile) setNavOpen(false); };
  const navToAthlete = (athleteId, targetPage) => { setFocusAthleteId(athleteId); setPage(targetPage || "athletes"); if (isMobile) setNavOpen(false); };

  // ═══════════════════════════════════════════════════════════════
  // ★ WORKSPACE FILTERING
  // Everything below this point is filtered by the active workspace.
  // ═══════════════════════════════════════════════════════════════
  const filteredAthletes = useMemo(() => {
    return athletes.filter(a => (a.program_type || "teen") === activeProgramType);
  }, [athletes, activeProgramType]);

  const filteredAthleteIds = useMemo(
    () => new Set(filteredAthletes.map(a => a.id)),
    [filteredAthletes]
  );

  const filteredPrograms = useMemo(() => {
    return programs.filter(p => (p.program_type || "teen") === activeProgramType);
  }, [programs, activeProgramType]);

  const filteredExercises = useMemo(() => {
    return exercises.filter(e => {
      // Defensive: if suitability missing or empty, show in all workspaces
      if (!e.suitability || e.suitability.length === 0) return true;
      return e.suitability.includes(activeProgramType);
    });
  }, [exercises, activeProgramType]);

  // Logs only from athletes in this workspace
  const filteredLogs = useMemo(() => {
    return logs.filter(l => filteredAthleteIds.has(l.athlete_id));
  }, [logs, filteredAthleteIds]);

  // Seasons that include at least one athlete from this workspace
  const filteredGroups = useMemo(() => {
    return groups.filter(g =>
      groupAthletes.some(ga => ga.group_id === g.id && filteredAthleteIds.has(ga.athlete_id))
    );
  }, [groups, groupAthletes, filteredAthleteIds]);

  if (!loaded) return (
    <div className="t2p-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#71717A" }}>Loading…</p>
    </div>
  );

  // Props pack uses FILTERED data — children stay workspace-unaware
  const pp = {
    athletes: filteredAthletes,
    programs: filteredPrograms,
    exercises: filteredExercises,
    logs: filteredLogs,
    groups: filteredGroups,
    setLogs, cats, colors, usePillars, isMobile, setPage: nav,
    groupAthletes, baselines, videoSubs,
    // Pass workspace context for components that need it (e.g. Athletes edit modal)
    activeProgramType, workspace,
    addAthlete, updateAthlete, deleteAthlete,
    addProgram, updateProgram, deleteProgram,
    addExercise, deleteExercise, updateExercise,
    addLog, deleteLog, submitDay, unlogDay,
    addGroup, updateGroup, deleteGroup,
    addAthleteToGroup, removeAthleteFromGroup,
    updateBaseline, addBaseline, deleteBaseline,
    addVideoSub, updateVideoSub, deleteVideoSub,
    saveSettings, resetAll,
  };

  return (
    <div className="t2p-root" style={{ fontFamily: "'DM Sans', sans-serif", display: "flex", background: "#FAFAFA", overflow: "hidden", position: "relative" }}>
      <ToastNotifications isCoach currentUserId="coach" onNavigate={navToAthlete} />
      {isMobile && navOpen && <div onClick={() => setNavOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 999 }} />}
      <nav className="t2p-nav" style={{
        width: 220, minWidth: 220, background: "#18181B", color: "#fff",
        display: "flex", flexDirection: "column", paddingBottom: 0,
        position: isMobile ? "fixed" : "relative",
        left: isMobile ? (navOpen ? 0 : -240) : 0,
        top: 0, bottom: 0, zIndex: 1000,
        transition: "left .25s cubic-bezier(.4,0,.2,1)",
        boxShadow: isMobile && navOpen ? "4px 0 24px rgba(0,0,0,.25)" : "none",
        overflowY: "auto",
      }}>
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #27272A", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <T2PLogo />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <AlertsBell logs={filteredLogs} videoSubs={videoSubs} athletes={filteredAthletes} isMobile={isMobile} onNavigate={navToAthlete} />
            {isMobile && <button onClick={() => setNavOpen(false)} style={{ background: "none", border: "none", color: "#A1A1AA", fontSize: 22, cursor: "pointer", padding: 4 }}>✕</button>}
          </div>
        </div>

        {/* ★ Workspace switcher mounts above the nav */}
        <WorkspaceSwitcher />

        <div style={{ flex: 1, padding: "4px 10px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV_ITEMS.map(n => (
            <button key={n.id} onClick={() => nav(n.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
              border: "none", background: page === n.id ? "#27272A" : "transparent",
              color: page === n.id ? "#fff" : "#A1A1AA", fontSize: 14, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left", position: "relative",
            }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}
              {n.id === "messages" && unreadMsgCount > 0 && <span style={{ background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 5px", minWidth: 16, textAlign: "center", marginLeft: "auto" }}>{unreadMsgCount}</span>}
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
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {/* Mobile workspace badge — shows active workspace at a glance */}
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 0.8, padding: "3px 8px",
                borderRadius: 999, background: workspace.accent, color: "#fff",
                fontFamily: "'Space Mono', monospace",
              }}>
                {workspace.label.toUpperCase()}
              </span>
              <AlertsBell logs={filteredLogs} videoSubs={videoSubs} athletes={filteredAthletes} isMobile={isMobile} onNavigate={navToAthlete} />
              <span style={{ fontSize: 13, color: "#A1A1AA", textTransform: "capitalize" }}>{page}</span>
            </div>
          </header>
        )}
        <main className="t2p-main" style={{ flex: 1, padding: isMobile ? "12px 10px" : 32, maxWidth: "100%", overflowX: "hidden" }}>
          {page === "dashboard" && <Dashboard {...pp} />}
          {page === "seasons" && <Seasons {...pp} />}
          {page === "athletes" && <Athletes {...pp} focusAthleteId={focusAthleteId} onFocusClear={() => setFocusAthleteId(null)} />}
          {page === "programs" && <Programs {...pp} />}
          {page === "library" && <Library {...pp} />}
          {page === "log" && <LogPage {...pp} />}
          {page === "messages" && <Messages isCoach currentUserId="coach" currentUserName="Coach" athletes={pp.athletes} isMobile={isMobile} />}
          {page === "settings" && <Settings {...pp} />}
          {page === "ai-chat" && <AIChat isMobile={isMobile} isCoach athletes={pp.athletes} programs={pp.programs} logs={pp.logs} exercises={pp.exercises} baselines={pp.baselines} videoSubs={pp.videoSubs} />}
        </main>
      </div>
    </div>
  );
}
