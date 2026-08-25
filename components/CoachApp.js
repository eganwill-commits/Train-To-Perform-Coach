"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, supabaseUrl, supabaseAnonKey } from "../lib/supabase";
import { PILLAR_COLORS, GENERIC_COLORS, NAV_ITEMS } from "../lib/constants";
import Dashboard from "./Dashboard";
import Athletes from "./Athletes";
import AthleteView from "./AthleteView";
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

// PostgREST returns at most 1000 rows per select. There are already more log rows
// than that, so a single select silently dropped the oldest ones and the coach saw a
// truncated history with no error. Page through until a short page comes back.
// The id tiebreaker keeps the ordering stable across pages.
async function fetchAllLogs() {
  const PAGE = 1000;
  let from = 0;
  let all = [];
  for (let guard = 0; guard < 50; guard++) {
    const { data, error } = await supabase
      .from("logs")
      .select("*")
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error("fetchAllLogs page failed", error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default function CoachApp({ onLogout }) {
  const [page, setPage] = useState("dashboard");
  const [focusAthleteId, setFocusAthleteId] = useState(null);
  // What inside the athlete's program the alert pointed at (week/day/log), so "View"
  // lands on the thing itself instead of the athlete's dashboard.
  const [focusTarget, setFocusTarget] = useState(null);
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
  const [previewAthlete, setPreviewAthlete] = useState(null);
  const isMobile = useIsMobile();

  const cats = usePillars ? Object.keys(PILLAR_COLORS) : Object.keys(GENERIC_COLORS);
  const colors = usePillars ? PILLAR_COLORS : GENERIC_COLORS;

  // Refs for latest state (used in callbacks to avoid stale closures)
  const programsRef = useRef(programs);
  programsRef.current = programs;
  const athletesRef = useRef(athletes);
  athletesRef.current = athletes;

  // Load all data from Supabase
  useEffect(() => {
    async function loadData() {
      const [aRes, pRes, eRes, lRes, sRes, gRes, gaRes, bRes, vRes] = await Promise.all([
        supabase.from("athletes").select("*").order("created_at", { ascending: true }),
        supabase.from("programs").select("*").order("created_at", { ascending: true }),
        supabase.from("exercises").select("*"),
        fetchAllLogs(),
        supabase.from("settings").select("*").eq("id", 1).single(),
        supabase.from("program_groups").select("*").order("created_at", { ascending: false }),
        supabase.from("group_athletes").select("*"),
        supabase.from("baselines").select("*").order("sort_order", { ascending: true }),
        supabase.from("video_submissions").select("*").order("created_at", { ascending: false }),
      ]);
      setAthletes(aRes.data || []);
      setPrograms(pRes.data || []);
      setExercises(eRes.data || []);
      setLogs(lRes || []);
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

  // Give an athlete (or every athlete) a real login behind their access code.
  // Runs server-side via the provision-athlete edge function, which is coach-only.
  const provisionLogin = useCallback(async (payload) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: "Not signed in" };
    const res = await fetch(`${supabaseUrl}/functions/v1/provision-athlete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: supabaseAnonKey },
      body: JSON.stringify(payload),
    });
    try { return await res.json(); } catch { return { ok: false, error: `HTTP ${res.status}` }; }
  }, []);

  const addAthlete = useCallback(async (athlete) => {
    const { data, error } = await supabase.from("athletes").insert(athlete).select().single();
    if (!error && data) {
      setAthletes(prev => [...prev, data]);
      const r = await provisionLogin({ athlete_id: data.id });   // login ready immediately
      if (!r?.ok) alert("Athlete saved, but their login could not be set up: " + (r?.error || r?.results?.[0]?.error || "unknown error"));
    }
  }, [provisionLogin]);

  const updateAthlete = useCallback(async (id, updates) => {
    const { error } = await supabase.from("athletes").update(updates).eq("id", id);
    if (!error) {
      setAthletes(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
      // Changing the code changes the credential, so refresh the login behind it.
      if (updates.access_code) await provisionLogin({ athlete_id: id });
    }
  }, [provisionLogin]);

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
    // A rejected insert used to be swallowed here, so the athlete saw "Saved!" while
    // nothing was written. Throw, and let the caller's catch tell them the truth.
    const { data, error } = await supabase.from("logs").insert(log).select().single();
    if (error) throw error;
    if (data) setLogs(prev => [data, ...prev]);
    return data;
  }, []);

  const submitDay = useCallback(async (program, day, date, weekLabel) => {
    const athlete = athletes.find(a => a.id === program.athlete_id);
    const athleteName = athlete?.name || "Unknown";

    // Rows already logged for this athlete+week+day. Deleted only AFTER the
    // replacements are written, so a failure can never leave the day empty.
    const existing = logs.filter(l =>
      l.athlete_id === program.athlete_id && l.day_label === (day.label || "") && l.week_label === (weekLabel || "")
    );

    // What the athlete actually logged wins over what was prescribed. Marking a day
    // complete from the coach side must never overwrite their numbers with the
    // programmed ones - those numbers are what progression is calculated from.
    const normalize = (s) => (s || "").toLowerCase().replace(/[-\u2013\u2014]/g, " ").replace(/\s+/g, " ").trim();
    const logEntries = day.blocks.map(block => {
      const exName = block.exerciseName || exercises.find(e => e.id === block.exerciseId)?.name || "Unknown";
      const logged = existing.find(l =>
        (l.exercise_id && block.exerciseId && l.exercise_id === block.exerciseId) ||
        l.exercise_name === exName ||
        normalize(l.exercise_name) === normalize(exName)
      );
      return {
        athlete_id: program.athlete_id || "",
        athlete_name: athleteName,
        exercise_id: block.exerciseId || "",
        exercise_name: exName,
        category: block.category || "",
        // Marking a day complete from the coach side records that it happened. It does NOT
        // invent numbers: if the athlete logged nothing, these stay empty rather than
        // back-filling the prescription as if they had hit it.
        sets: logged?.sets ?? "",
        reps: logged?.reps ?? "",
        load: logged?.load ?? "",
        rpe: logged?.rpe ?? "",
        // logs.notes belongs to the athlete. The coach's programming note lives on the
        // block and must not be copied in here - it reads back as if they wrote it.
        notes: logged?.notes ?? "",
        date: date || new Date().toISOString().slice(0, 10),
        week_label: weekLabel || "",
        day_label: day.label || "",
        exercise_status: logged?.exercise_status ?? "completed",
      };
    });
    const { data, error } = await supabase.from("logs").insert(logEntries).select();
    if (error) return false;
    if (data) setLogs(prev => [...data.reverse(), ...prev]);
    if (existing.length > 0) {
      for (const old of existing) {
        await supabase.from("logs").delete().eq("id", old.id);
      }
      setLogs(prev => prev.filter(l => !existing.some(e => e.id === l.id)));
    }
    return true;
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
    // Find a "template" — use the first program from another athlete in this season
    const existingAthleteIds = seasonPrograms.map(p => p.athlete_id).filter(id => id && id !== athleteId);
    if (existingAthleteIds.length === 0) return; // No existing programs to copy
    const templateAthleteId = existingAthleteIds[0];
    const templatePrograms = seasonPrograms.filter(p => p.athlete_id === templateAthleteId);
    // Check if this athlete already has programs in this season
    const alreadyHas = seasonPrograms.some(p => p.athlete_id === athleteId);
    if (alreadyHas) return;

    const athlete = athletesRef.current.find(a => a.id === athleteId);
    const athName = athlete?.name || "Athlete";

    for (const tp of templatePrograms) {
      // Deep clone and re-ID all weeks/days/blocks
      const newWeeks = JSON.parse(JSON.stringify(tp.weeks || [])).map(w => ({
        ...w, id: uid(),
        days: (w.days || []).map(d => ({
          ...d, id: uid(), status: "", coachNotes: "", coachNotesShared: false,
          blocks: (d.blocks || []).map(b => ({ ...b, id: uid() })),
        })),
        status: "", coachRecap: "",
      }));
      // Create program name with athlete's name
      const baseName = tp.name.includes("—") ? tp.name.split("—").slice(1).join("—").trim() : tp.name;
      const newProg = await supabase.from("programs").insert({
        name: `${athName} — ${baseName}`,
        athlete_id: athleteId,
        description: tp.description || "",
        weeks: newWeeks,
        group_id: groupId,
      }).select().single();
      if (!newProg.error && newProg.data) {
        setPrograms(prev => [...prev, newProg.data]);
      }
    }
  }, []);

  // Membership-only: enroll an athlete in a season WITHOUT auto-copying programs
  // (keeps Program folders and Seasons in sync without duplicating programs).
  const addSeasonMembership = useCallback(async (groupId, athleteId) => {
    if (!groupId || !athleteId) return;
    const { data: existing } = await supabase.from("group_athletes")
      .select("athlete_id").eq("group_id", groupId).eq("athlete_id", athleteId);
    if (existing && existing.length) return; // already a member
    const { data, error } = await supabase.from("group_athletes")
      .insert({ group_id: groupId, athlete_id: athleteId }).select().single();
    if (!error && data) setGroupAthletes(prev =>
      prev.some(ga => ga.group_id === groupId && ga.athlete_id === athleteId) ? prev : [...prev, data]);
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
  const navToAthlete = (athleteId, targetPage, target) => { setFocusAthleteId(athleteId); setFocusTarget(target || null); setPage(targetPage || "athletes"); if (isMobile) setNavOpen(false); };

  if (!loaded) return (
    <div className="t2p-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <p style={{ color: "#71717A" }}>Loading…</p>
    </div>
  );

  const pp = {
    athletes, programs, exercises, logs, setLogs, cats, colors, usePillars, isMobile, setPage: nav,
    groups, groupAthletes, baselines, videoSubs,
    addAthlete, updateAthlete, deleteAthlete, provisionLogin,
    addProgram, updateProgram, deleteProgram,
    addExercise, deleteExercise, updateExercise,
    addLog, deleteLog, submitDay, unlogDay,
    addGroup, updateGroup, deleteGroup,
    addAthleteToGroup, removeAthleteFromGroup, addSeasonMembership,
    updateBaseline, addBaseline, deleteBaseline,
    addVideoSub, updateVideoSub, deleteVideoSub,
    saveSettings, resetAll,
    viewAsAthlete: setPreviewAthlete,
  };

  // Coach previewing an athlete's app (read the same data the athlete sees)
  if (previewAthlete) {
    const TIER_LABELS = { full_gym: "Full Gym", no_barbell: "No Barbell", no_machine: "No Machines", db_bodyweight: "Dumbbells & Bodyweight" };
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ background: "#1E3A8A", color: "#fff", padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          <span>👁 Previewing as {previewAthlete.name}{previewAthlete.equipment_tier ? ` · ${TIER_LABELS[previewAthlete.equipment_tier] || previewAthlete.equipment_tier}` : ""} · read-only</span>
          <button onClick={() => setPreviewAthlete(null)} style={{ background: "#fff", color: "#1E3A8A", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Exit preview</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <AthleteView athlete={previewAthlete} onLogout={() => setPreviewAthlete(null)} readOnly />
        </div>
      </div>
    );
  }

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
      }}>
        <div style={{ padding: "0 20px 28px", borderBottom: "1px solid #27272A", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <T2PLogo />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <AlertsBell logs={logs} videoSubs={videoSubs} athletes={athletes} isMobile={isMobile} onNavigate={navToAthlete} />
            {isMobile && <button onClick={() => setNavOpen(false)} style={{ background: "none", border: "none", color: "#A1A1AA", fontSize: 22, cursor: "pointer", padding: 4 }}>✕</button>}
          </div>
        </div>
        <div style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
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
              <AlertsBell logs={logs} videoSubs={videoSubs} athletes={athletes} isMobile={isMobile} onNavigate={navToAthlete} />
              <span style={{ fontSize: 13, color: "#A1A1AA", textTransform: "capitalize" }}>{page}</span>
            </div>
          </header>
        )}
        <main className="t2p-main" style={{ flex: 1, padding: isMobile ? "12px 10px" : 32, maxWidth: "100%", overflowX: "hidden" }}>
          {page === "dashboard" && <Dashboard {...pp} />}
          {page === "seasons" && <Seasons {...pp} />}
          {page === "athletes" && <Athletes {...pp} focusAthleteId={focusAthleteId} onFocusClear={() => setFocusAthleteId(null)} />}
          {page === "programs" && <Programs {...pp} focusAthleteId={focusAthleteId} focusTarget={focusTarget} onFocusClear={() => { setFocusAthleteId(null); setFocusTarget(null); }} />}
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
