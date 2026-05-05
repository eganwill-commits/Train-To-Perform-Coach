"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { PILLAR_COLORS, ATHLETE_NAV } from "../lib/constants";
import { Badge, Btn, Card, Input, Select, Modal, EmptyState, SearchableSelect } from "./ui";
import { printDay } from "./printHelper";
import T2PLogo from "./T2PLogo";
import AIChat from "./AIChat";

function useIsMobile(bp = 768) {
  const [m, setM] = useState(false);
  useEffect(() => { const h = () => setM(window.innerWidth < bp); h(); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, [bp]);
  return m;
}

export default function AthleteView({ athlete, onLogout }) {
  const [page, setPage] = useState("my-program");
  const [programs, setPrograms] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [logs, setLogs] = useState([]);
  const [videoSubs, setVideoSubs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [baselines, setBaselines] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const isMobile = useIsMobile();
  const colors = PILLAR_COLORS;
  const cats = Object.keys(colors);

  useEffect(() => {
    async function load() {
      const [pRes, eRes, lRes, vRes, gRes, bRes] = await Promise.all([
        supabase.from("programs").select("*").eq("athlete_id", athlete.id),
        supabase.from("exercises").select("*"),
        supabase.from("logs").select("*").eq("athlete_id", athlete.id).order("date", { ascending: false }),
        supabase.from("video_submissions").select("*").eq("athlete_id", athlete.id).order("created_at", { ascending: false }),
        supabase.from("program_groups").select("*"),
        supabase.from("baselines").select("*").eq("athlete_id", athlete.id).order("sort_order", { ascending: true }),
      ]);
      setPrograms(pRes.data || []);
      setExercises(eRes.data || []);
      setLogs(lRes.data || []);
      setVideoSubs(vRes.data || []);
      setGroups(gRes.data || []);
      setBaselines(bRes.data || []);
      setLoaded(true);
    }
    load();
  }, [athlete.id]);

  // Poll for programs, videos, baselines every 30 seconds
  useEffect(() => {
    if (!loaded) return;
    const poll = setInterval(async () => {
      const [pRes, vRes, bRes] = await Promise.all([
        supabase.from("programs").select("*").eq("athlete_id", athlete.id),
        supabase.from("video_submissions").select("*").eq("athlete_id", athlete.id).order("created_at", { ascending: false }),
        supabase.from("baselines").select("*").eq("athlete_id", athlete.id).order("sort_order", { ascending: true }),
      ]);
      if (pRes.data) setPrograms(pRes.data);
      if (vRes.data) setVideoSubs(vRes.data);
      if (bRes.data) setBaselines(bRes.data);
    }, 30000);
    return () => clearInterval(poll);
  }, [loaded, athlete.id]);

  // Realtime subscription for logs — instant updates
  useEffect(() => {
    if (!loaded) return;
    const channel = supabase.channel(`athlete-logs-${athlete.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "logs", filter: `athlete_id=eq.${athlete.id}` }, (payload) => {
        setLogs(prev => {
          if (prev.some(l => l.id === payload.new.id)) return prev;
          return [payload.new, ...prev];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "logs", filter: `athlete_id=eq.${athlete.id}` }, (payload) => {
        setLogs(prev => prev.map(l => l.id === payload.new.id ? payload.new : l));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "logs", filter: `athlete_id=eq.${athlete.id}` }, (payload) => {
        setLogs(prev => prev.filter(l => l.id !== payload.old.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loaded, athlete.id]);

  const addLog = useCallback(async (log) => {
    const { data, error } = await supabase.from("logs").insert(log).select().single();
    if (!error && data) setLogs(prev => [data, ...prev]);
  }, []);

  const addVideoSub = useCallback(async (sub) => {
    const { data, error } = await supabase.from("video_submissions").insert(sub).select().single();
    if (!error && data) setVideoSubs(prev => [data, ...prev]);
    return data;
  }, []);

  const deleteLog = useCallback(async (id) => {
    await supabase.from("logs").delete().eq("id", id);
    setLogs(prev => prev.filter(l => l.id !== id));
  }, []);

  const deleteDayLogs = useCallback(async (date, dayLabel) => {
    const toDelete = logs.filter(l => l.athlete_id === athlete.id && l.date === date && l.day_label === dayLabel);
    for (const l of toDelete) {
      await supabase.from("logs").delete().eq("id", l.id);
    }
    setLogs(prev => prev.filter(l => !(l.athlete_id === athlete.id && l.date === date && l.day_label === dayLabel)));
  }, [logs, athlete.id]);

  const deleteVideoSub = useCallback(async (id) => {
    if (!confirm("Delete this video submission?")) return;
    await supabase.from("video_submissions").delete().eq("id", id);
    setVideoSubs(prev => prev.filter(v => v.id !== id));
  }, []);

  const updateBaseline = useCallback(async (id, updates) => {
    const { error } = await supabase.from("baselines").update(updates).eq("id", id);
    if (!error) setBaselines(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const nav = (id) => { setPage(id); if (isMobile) setNavOpen(false); };

  if (!loaded) return <div className="t2p-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}><p style={{ color: "#71717A" }}>Loading…</p></div>;

  return (
    <div className="t2p-root" style={{ fontFamily: "'DM Sans', sans-serif", display: "flex", background: "#FAFAFA", overflow: "hidden" }}>
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
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #27272A" }}>
          <T2PLogo />
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "#F97316", fontWeight: 600 }}>{athlete.name}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#71717A" }}>{athlete.sport} · Age {athlete.age}</p>
        </div>
        <div style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
          {ATHLETE_NAV.map(n => (
            <button key={n.id} onClick={() => nav(n.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
              border: "none", background: page === n.id ? "#27272A" : "transparent",
              color: page === n.id ? "#fff" : "#A1A1AA", fontSize: 14, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}><span style={{ fontSize: 16 }}>{n.icon}</span>{n.label}</button>
          ))}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #27272A" }}>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "#71717A", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Sign Out</button>
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
            <span style={{ fontSize: 13, color: "#F97316", marginLeft: "auto", fontWeight: 600 }}>{athlete.name}</span>
          </header>
        )}
        <main className="t2p-main" style={{ flex: 1, padding: isMobile ? "12px 10px" : 32, maxWidth: "100%", overflowX: "hidden" }}>
          {page === "my-program" && <MyProgram programs={programs} setPrograms={setPrograms} exercises={exercises} colors={colors} cats={cats} isMobile={isMobile} athlete={athlete} addLog={addLog} logs={logs} groups={groups} addVideoSub={addVideoSub} videoSubs={videoSubs} deleteVideoSub={deleteVideoSub} />}
          {page === "my-baselines" && <MyBaselines baselines={baselines} updateBaseline={updateBaseline} isMobile={isMobile} />}
          {page === "my-logs" && <MyLogs logs={logs} colors={colors} cats={cats} isMobile={isMobile} deleteLog={deleteLog} deleteDayLogs={deleteDayLogs} />}
          {page === "my-videos" && <MyVideos videoSubs={videoSubs} addVideoSub={addVideoSub} deleteVideoSub={deleteVideoSub} athlete={athlete} exercises={exercises} cats={cats} colors={colors} isMobile={isMobile} />}
          {page === "ai-chat" && <AIChat isMobile={isMobile} athleteName={athlete.name} athlete={athlete} programs={programs} logs={logs} baselines={baselines} videoSubs={videoSubs} />}
        </main>
      </div>
    </div>
  );
}


function MyProgram({ programs, setPrograms, exercises, colors, cats, isMobile, athlete, addLog, logs, groups, addVideoSub, videoSubs, deleteVideoSub }) {
  const [selectedProg, setSelectedProg] = useState(null);
  const [expandedBlock, setExpandedBlock] = useState(null);
  const [aw, setAw] = useState(0);
  const [blockResults, setBlockResults] = useState({});
  const [submitting, setSubmitting] = useState(null);
  const [saved, setSaved] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(null); // block.id being uploaded
  const [videoSuccess, setVideoSuccess] = useState(null); // block.id that succeeded

  const handleVideoUpload = async (file, block) => {
    if (!file || !addVideoSub) return;
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) { alert("Video must be under 100MB"); return; }
    setUploadingVideo(block.id);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const fileName = `${athlete.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("videos").upload(fileName, file);
      if (upErr) { alert("Upload failed: " + upErr.message); setUploadingVideo(null); return; }
      const { data: urlData } = supabase.storage.from("videos").getPublicUrl(fileName);
      const exName = getDisplayName(block);
      await addVideoSub({
        athlete_id: athlete.id,
        athlete_name: athlete.name,
        exercise_name: exName,
        video_url: urlData.publicUrl,
        notes: "",
        date: new Date().toISOString().slice(0, 10),
        status: "pending",
      });
      setUploadingVideo(null);
      setVideoSuccess(block.id);
      setTimeout(() => setVideoSuccess(null), 3000);
    } catch (err) {
      alert("Upload error: " + err.message);
      setUploadingVideo(null);
    }
  };

  const prog = programs.find(p => p.id === selectedProg);

  useEffect(() => {
    if (prog) {
      const weeks = prog.weeks || [];
      // Find current week: first week with any day not yet completed/missed
      const currentWi = weeks.findIndex(w => {
        if (w.status === "completed" || w.status === "missed") return false;
        const days = w.days || [];
        if (days.length === 0) return true;
        const allDaysDone = days.every(d => d.status === "completed" || d.status === "missed");
        return !allDaysDone;
      });
      setAw(currentWi >= 0 ? currentWi : weeks.length - 1);
      setExpandedBlock(null);
      setBlockResults({});
    }
  }, [selectedProg]);

  const getDisplayName = (block) => {
    if (block.exerciseId) { const f = exercises.find(e => e.id === block.exerciseId); if (f) return f.name; }
    if (block.exerciseName) return block.exerciseName;
    return "—";
  };
  const getVideoUrl = (block) => {
    if (block.exerciseId) { const f = exercises.find(e => e.id === block.exerciseId); if (f && f.video_url) return f.video_url; }
    if (block.exerciseName) { const f = exercises.find(e => e.name === block.exerciseName); if (f && f.video_url) return f.video_url; }
    return "";
  };
  const updateResult = (blockId, field, value) => {
    setBlockResults(prev => ({ ...prev, [blockId]: { ...(prev[blockId] || {}), [field]: value } }));
  };

  const submitDay = async (day, weekLabel) => {
    if (!addLog || !athlete) return;
    const date = new Date().toISOString().slice(0, 10);
    setSubmitting(day.id);

    // Delete existing logs for this week+day to prevent duplicates
    const existing = (logs || []).filter(l =>
      l.athlete_id === athlete.id && l.day_label === day.label && l.week_label === weekLabel
    );
    for (const old of existing) {
      await supabase.from("logs").delete().eq("id", old.id);
    }
    if (existing.length > 0) {
      setLogs(prev => prev.filter(l => !existing.some(e => e.id === l.id)));
    }

    // Insert fresh logs with effective values (user edits > existing logged > programmed)
    const weekLabel2 = weekLabel;
    const normalize = (s) => (s || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
    const remainingLogs = (logs || []).filter(l => l.athlete_id === athlete.id && l.day_label === day.label && l.week_label === weekLabel2);
    for (const block of day.blocks) {
      const result = blockResults[block.id] || {};
      const dn = getDisplayName(block);
      const existingLog = remainingLogs.find(l =>
        (l.exercise_id && block.exerciseId && l.exercise_id === block.exerciseId) ||
        l.exercise_name === dn || (block.exerciseName && l.exercise_name === block.exerciseName) ||
        normalize(l.exercise_name) === normalize(dn)
      );
      await addLog({
        athlete_id: athlete.id, athlete_name: athlete.name,
        exercise_id: block.exerciseId || "", exercise_name: dn,
        category: block.category || "",
        sets: result.sets ?? existingLog?.sets ?? block.sets ?? "",
        reps: result.reps ?? existingLog?.reps ?? block.reps ?? "",
        load: result.load ?? existingLog?.load ?? block.load ?? "",
        rpe: result.rpe ?? existingLog?.rpe ?? "",
        notes: result.notes ?? existingLog?.notes ?? "",
        exercise_status: result.status ?? existingLog?.exercise_status ?? "completed",
        date, week_label: weekLabel, day_label: day.label,
      });
    }
    // Auto-mark day as completed in the program
    try {
      const freshProg = programs.find(p => p.id === prog.id);
      if (freshProg) {
        const updatedWeeks = JSON.parse(JSON.stringify(freshProg.weeks || []));
        const wi = updatedWeeks.findIndex(w => w.label === weekLabel);
        if (wi >= 0) {
          const di = updatedWeeks[wi].days.findIndex(d => d.id === day.id);
          if (di >= 0) {
            updatedWeeks[wi].days[di].status = "completed";
            await supabase.from("programs").update({ weeks: updatedWeeks }).eq("id", freshProg.id);
            setPrograms(prev => prev.map(p => p.id === freshProg.id ? { ...p, weeks: updatedWeeks } : p));
          }
        }
      }
    } catch (e) { /* silent — logging succeeded even if status update fails */ }
    setSubmitting(null);
    setSaved(true);
    setBlockResults({});
    setTimeout(() => setSaved(false), 3000);
  };

  if (!prog) {
    return (
      <div style={{ maxWidth: "100%", overflowX: "hidden" }}>
        <h2 style={{ margin: "0 0 20px", fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>My Program</h2>
        {programs.length === 0 ? <EmptyState icon="▦" title="No program assigned yet" sub="Your coach will assign your program soon." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {programs.map(p => {
              const wks = p.weeks || [];
              const completed = wks.filter(w => w.status === "completed").length;
              const missed = wks.filter(w => w.status === "missed").length;
              const grp = (groups || []).find(g => g.id === p.group_id);
              // Session-level stats
              let compSessions = 0, missSessions = 0, totalSessions = 0;
              wks.forEach(w => {
                (w.days || []).forEach(d => {
                  if (d.blocks && d.blocks.length > 0) {
                    totalSessions++;
                    const ds = d.status || w.status || "";
                    if (ds === "completed") compSessions++;
                    else if (ds === "missed") missSessions++;
                  }
                });
              });
              const tracked = compSessions + missSessions;
              const attendancePct = tracked > 0 ? Math.round((compSessions / tracked) * 100) : null;
              const completionPct = totalSessions > 0 ? Math.round((compSessions / totalSessions) * 100) : 0;
              return (
                <Card key={p.id} onClick={() => setSelectedProg(p.id)} style={{ cursor: "pointer" }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{p.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: "#71717A" }}>{wks.length} weeks</span>
                    {grp && <Badge color="#16A34A">{grp.name}</Badge>}
                  </div>
                  {p.description && <p style={{ fontSize: 13, color: "#52525B", marginTop: 8 }}>{p.description}</p>}
                  {/* Stats row */}
                  {totalSessions > 0 && (
                    <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                      {attendancePct !== null && (
                        <div style={{ textAlign: "center", flex: 1, padding: "8px", background: "#F9FAFB", borderRadius: 8 }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: attendancePct >= 80 ? "#16A34A" : attendancePct >= 50 ? "#F97316" : "#DC2626" }}>{attendancePct}%</div>
                          <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.3 }}>Attendance</div>
                        </div>
                      )}
                      <div style={{ textAlign: "center", flex: 1, padding: "8px", background: "#F9FAFB", borderRadius: 8 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: "#52525B" }}>{completionPct}%</div>
                        <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.3 }}>Completed</div>
                      </div>
                    </div>
                  )}
                  {wks.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 2 }}>
                        {wks.map((w, i) => <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: w.status === "completed" ? "#16A34A" : w.status === "missed" ? "#DC2626" : "#E4E4E7" }} />)}
                      </div>
                      {(completed > 0 || missed > 0) && <div style={{ fontSize: 11, color: "#71717A", marginTop: 4 }}>{completed > 0 && <span style={{ color: "#16A34A", fontWeight: 600 }}>{completed} done</span>}{completed > 0 && missed > 0 && " · "}{missed > 0 && <span style={{ color: "#DC2626", fontWeight: 600 }}>{missed} missed</span>}</div>}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const weeks = prog.weeks || [];
  const week = weeks[aw];
  const inputStyle = { width: "100%", padding: "7px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 16, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" };

  return (
    <div style={{ maxWidth: "100%", overflowX: "hidden" }}>
      <button onClick={() => setSelectedProg(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#71717A", marginBottom: 8, fontFamily: "inherit" }}>← Back</button>
      <h2 style={{ margin: "0 0 6px", fontSize: isMobile ? 16 : 24, fontFamily: "'Space Mono', monospace", wordBreak: "break-word", lineHeight: 1.3 }}>{prog.name}</h2>
      {(() => { const grp = (groups || []).find(g => g.id === prog.group_id); return grp ? <div style={{ marginBottom: 6 }}><Badge color="#16A34A">{grp.name}</Badge></div> : null; })()}
      {prog.description && <p style={{ color: "#71717A", fontSize: 12, margin: "0 0 10px" }}>{prog.description}</p>}

      {/* Attendance & Completion stats */}
      {(() => {
        let cs = 0, ms = 0, ts = 0;
        (prog.weeks || []).forEach(w => {
          (w.days || []).forEach(d => {
            if (d.blocks && d.blocks.length > 0) {
              ts++;
              const ds = d.status || w.status || "";
              if (ds === "completed") cs++;
              else if (ds === "missed") ms++;
            }
          });
        });
        const tr = cs + ms;
        if (ts === 0) return null;
        return (
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {tr > 0 && (
              <div style={{ flex: 1, textAlign: "center", padding: "8px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E4E4E7" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: Math.round((cs / tr) * 100) >= 80 ? "#16A34A" : "#F97316" }}>{Math.round((cs / tr) * 100)}%</div>
                <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.3 }}>Attendance</div>
              </div>
            )}
            <div style={{ flex: 1, textAlign: "center", padding: "8px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E4E4E7" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#52525B" }}>{Math.round((cs / ts) * 100)}%</div>
              <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.3 }}>Program Completed</div>
            </div>
            <div style={{ flex: 1, textAlign: "center", padding: "8px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E4E4E7" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#52525B" }}>{cs}<span style={{ fontSize: 13, fontWeight: 400, color: "#A1A1AA" }}>/{ts}</span></div>
              <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.3 }}>Sessions Done</div>
            </div>
          </div>
        );
      })()}

      {saved && <div style={{ background: "#F0FDF4", color: "#16A34A", padding: "10px 14px", borderRadius: 8, marginBottom: 10, fontWeight: 600, fontSize: 14 }}>Workout logged!</div>}

      {/* Week tabs — current and past only */}
      {(() => {
        const currentWi = weeks.findIndex(w => {
          if (w.status === "completed" || w.status === "missed") return false;
          const days = w.days || [];
          if (days.length === 0) return true;
          return !days.every(d => d.status === "completed" || d.status === "missed");
        });
        const maxVisible = currentWi >= 0 ? currentWi : weeks.length - 1;
        return (
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {weeks.map((w, i) => {
              if (i > maxVisible) return null;
              const st = w.status || "";
              const isActive = aw === i;
              const isCurrent = i === maxVisible;
              const bg = isActive ? "#18181B" : st === "completed" ? "#16A34A" : st === "missed" ? "#DC2626" : "#fff";
              const fg = isActive || st === "completed" || st === "missed" ? "#fff" : "#52525B";
              const bd = isActive ? "#18181B" : st === "completed" ? "#16A34A" : st === "missed" ? "#DC2626" : "#E4E4E7";
              return <button key={w.id} onClick={() => setAw(i)} style={{ padding: "4px 9px", borderRadius: 6, border: `2px solid ${bd}`, background: bg, color: fg, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", lineHeight: 1.2 }}>{st === "completed" ? "✓" : st === "missed" ? "✗" : ""}{isCurrent ? "→ " : ""}W{i + 1}</button>;
            })}
            {maxVisible < weeks.length - 1 && (
              <span style={{ fontSize: 11, color: "#A1A1AA", marginLeft: 4 }}>+{weeks.length - maxVisible - 1} upcoming</span>
            )}
          </div>
        );
      })()}

      {week && week.days.map(day => {
        const dayStatus = day.status || week.status || "";
        const weekLabel = week.label || "";
        const dayLabel = day.label || "";
        const normalize = (s) => (s || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

        // STRICT: Only match logs for this exact week+day
        const scopedLogs = (logs || []).filter(l =>
          l.athlete_id === athlete.id && l.day_label === dayLabel && l.week_label === weekLabel
        );
        const dayLogged = scopedLogs.length > 0;

        const blockLogMap = {};
        const usedIds = new Set();
        const matchByName = (log, block) => {
          const dn = getDisplayName(block);
          if (log.exercise_id && block.exerciseId && log.exercise_id === block.exerciseId) return true;
          if (log.exercise_name === dn) return true;
          if (block.exerciseName && log.exercise_name === block.exerciseName) return true;
          if (normalize(log.exercise_name) === normalize(dn)) return true;
          if (block.exerciseName && normalize(log.exercise_name) === normalize(block.exerciseName)) return true;
          return false;
        };

        day.blocks.forEach(block => {
          const m = scopedLogs.find(l => !usedIds.has(l.id) && matchByName(l, block));
          if (m) { blockLogMap[block.id] = m; usedIds.add(m.id); }
        });

        return (
          <Card key={day.id} style={{ padding: isMobile ? 10 : 14, marginBottom: 10, overflow: "hidden", border: dayStatus === "completed" ? "2px solid #16A34A" : dayStatus === "missed" ? "2px solid #DC2626" : "1px solid #E4E4E7", background: dayStatus === "missed" ? "#FEF2F218" : "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {dayStatus === "completed" && <span style={{ color: "#16A34A", fontWeight: 700, fontSize: 14 }}>✓</span>}
                {dayStatus === "missed" && <span style={{ color: "#DC2626", fontWeight: 700, fontSize: 14 }}>✗</span>}
                <h4 style={{ margin: 0, fontSize: 15 }}>{day.label}</h4>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {dayStatus === "missed" && <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626" }}>Missed</span>}
                {dayStatus === "completed" && <span style={{ fontSize: 11, fontWeight: 600, color: "#16A34A" }}>Done</span>}
                <span style={{ fontSize: 11, color: "#A1A1AA" }}>{day.blocks.length} exercises</span>
              </div>
            </div>

            {day.blocks.map(block => {
              const cc = colors[block.category];
              const videoUrl = getVideoUrl(block);
              const isOpen = expandedBlock === block.id;
              const result = blockResults[block.id] || {};
              const hasInput = result.sets || result.reps || result.load || result.rpe;
              const loggedResult = blockLogMap[block.id] || null;
              // Effective values: user input > logged result > programmed value
              const effSets = result.sets ?? loggedResult?.sets ?? "";
              const effReps = result.reps ?? loggedResult?.reps ?? "";
              const effLoad = result.load ?? loggedResult?.load ?? "";
              const effRpe = result.rpe ?? loggedResult?.rpe ?? "";
              const effNotes = result.notes ?? loggedResult?.notes ?? "";

              const exStatus = result.status ?? loggedResult?.exercise_status ?? null;
              const borderLeftColor = exStatus === "completed" ? "#16A34A" : exStatus === "missed" ? "#DC2626" : (cc?.bg || "#999");
              const bgColor = exStatus === "completed" ? "#F0FDF4" : exStatus === "missed" ? "#FEF2F2" : (cc?.light || "#F9FAFB");

              return (
                <div key={block.id} style={{ background: bgColor, border: `1px solid ${cc?.border || "#E5E7EB"}`, borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${borderLeftColor}`, overflow: "hidden", opacity: exStatus === "missed" ? 0.6 : 1 }}>
                  {/* Collapsed row */}
                  <div style={{ display: "flex", alignItems: "center", padding: "8px 8px", gap: 6 }}>
                    {/* Complete/Missed toggles */}
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => updateResult(block.id, "status", exStatus === "completed" ? null : "completed")} style={{ width: 24, height: 24, borderRadius: 4, border: exStatus === "completed" ? "2px solid #16A34A" : "1px solid #D4D4D8", background: exStatus === "completed" ? "#16A34A" : "transparent", color: exStatus === "completed" ? "#fff" : "#A1A1AA", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✓</button>
                      <button onClick={() => updateResult(block.id, "status", exStatus === "missed" ? null : "missed")} style={{ width: 24, height: 24, borderRadius: 4, border: exStatus === "missed" ? "2px solid #DC2626" : "1px solid #D4D4D8", background: exStatus === "missed" ? "#DC2626" : "transparent", color: exStatus === "missed" ? "#fff" : "#A1A1AA", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>✗</button>
                    </div>
                    <div onClick={() => setExpandedBlock(isOpen ? null : block.id)} style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, cursor: "pointer", gap: 6 }}>
                      <Badge color={cc?.bg || "#999"}>{block.category}</Badge>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, textDecoration: exStatus === "missed" ? "line-through" : "none", wordBreak: "break-word" }}>{getDisplayName(block)}</div>
                        {!isOpen && <div style={{ fontSize: 11, color: "#71717A" }}>{[block.sets && block.reps ? `${block.sets}×${block.reps}` : null, block.load ? `@ ${block.load}` : null].filter(Boolean).join(" ") || ""}</div>}
                      </div>
                      {hasInput && <span style={{ width: 7, height: 7, borderRadius: 4, background: "#16A34A", flexShrink: 0 }} />}
                      {!hasInput && loggedResult && <span style={{ width: 7, height: 7, borderRadius: 4, background: "#16A34A", flexShrink: 0 }} />}
                      {videoUrl && <a href={videoUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "2px 6px", borderRadius: 999, flexShrink: 0 }}>▶</a>}
                      <span style={{ fontSize: 10, color: "#A1A1AA", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>▼</span>
                    </div>
                  </div>

                  {/* Expanded */}
                  {isOpen && (
                    <div style={{ padding: "0 8px 10px", borderTop: `1px solid ${cc?.border || "#E4E4E7"}` }}>
                      {/* Programmed values */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginTop: 8 }}>
                        {block.sets && <div><div style={{ fontSize: 9, color: "#71717A", fontWeight: 700 }}>SETS</div><div style={{ fontSize: 16, fontWeight: 700 }}>{block.sets}</div></div>}
                        {block.reps && <div><div style={{ fontSize: 9, color: "#71717A", fontWeight: 700 }}>REPS</div><div style={{ fontSize: 16, fontWeight: 700 }}>{block.reps}</div></div>}
                        {block.load && <div><div style={{ fontSize: 9, color: "#71717A", fontWeight: 700 }}>LOAD</div><div style={{ fontSize: 16, fontWeight: 700 }}>{block.load}</div></div>}
                      </div>
                      {(block.tempo || block.rest) && (
                        <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12 }}>
                          {block.tempo && <span style={{ color: "#71717A" }}>Tempo: <b>{block.tempo}</b></span>}
                          {block.rest && <span style={{ color: "#71717A" }}>Rest: <b>{block.rest}s</b></span>}
                        </div>
                      )}
                      {block.notes && (
                        <div style={{ marginTop: 6, padding: "6px 8px", background: "#fff", borderRadius: 6, border: "1px solid #E4E4E7", fontSize: 12, color: "#52525B", fontStyle: "italic", whiteSpace: "pre-wrap", lineHeight: 1.4, wordBreak: "break-word" }}>{block.notes}</div>
                      )}
                      {videoUrl && <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "5px 12px", borderRadius: 999, marginTop: 6 }}>▶ Watch Video</a>}

                      {/* Log / Edit inputs */}
                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed #D4D4D8" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: loggedResult ? "#16A34A" : "#71717A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                          {loggedResult ? "Your Results (edit & re-submit)" : "Log Your Results"}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          <label style={{ fontSize: 10, color: "#71717A" }}>Sets<input type="number" value={effSets} onChange={e => updateResult(block.id, "sets", e.target.value)} placeholder={block.sets || ""} style={inputStyle} /></label>
                          <label style={{ fontSize: 10, color: "#71717A" }}>Reps<input value={effReps} onChange={e => updateResult(block.id, "reps", e.target.value)} placeholder={block.reps || ""} style={inputStyle} /></label>
                          <label style={{ fontSize: 10, color: "#71717A" }}>Load<input value={effLoad} onChange={e => updateResult(block.id, "load", e.target.value)} placeholder={block.load || "lbs"} style={inputStyle} /></label>
                          <label style={{ fontSize: 10, color: "#71717A" }}>RPE<input value={effRpe} onChange={e => updateResult(block.id, "rpe", e.target.value)} placeholder="1-10" style={inputStyle} /></label>
                        </div>
                        <label style={{ fontSize: 10, color: "#71717A", display: "block", marginTop: 6 }}>Notes<input value={effNotes} onChange={e => updateResult(block.id, "notes", e.target.value)} placeholder="How did it feel?" style={inputStyle} /></label>
                        {loggedResult && <div style={{ fontSize: 10, color: "#A1A1AA", marginTop: 4 }}>Logged {new Date(loggedResult.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                      </div>

                      {/* Submit Video */}
                      {addVideoSub && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed #D4D4D8" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Submit Form Video</div>
                          {videoSuccess === block.id ? (
                            <div style={{ background: "#F0FDF4", padding: "8px 10px", borderRadius: 6, fontSize: 12, color: "#16A34A", fontWeight: 600, textAlign: "center" }}>✓ Video submitted for review!</div>
                          ) : uploadingVideo === block.id ? (
                            <div style={{ background: "#EFF6FF", padding: "8px 10px", borderRadius: 6, fontSize: 12, color: "#2563EB", fontWeight: 600, textAlign: "center" }}>Uploading…</div>
                          ) : (
                            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", border: "1px dashed #BFDBFE", borderRadius: 8, background: "#F8FAFF", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#2563EB" }}>
                              <span>🎥</span> Record or Choose Video
                              <input type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f, block); e.target.value = ""; }} style={{ display: "none" }} />
                            </label>
                          )}
                        </div>
                      )}

                      {/* Previous video submissions for this exercise */}
                      {(() => {
                        const exName = getDisplayName(block);
                        const exVideos = (videoSubs || []).filter(v => v.exercise_name === exName);
                        if (exVideos.length === 0) return null;
                        const statusColors = { pending: { bg: "#FFF7ED", color: "#F97316", label: "Pending Review" }, reviewed: { bg: "#F0FDF4", color: "#16A34A", label: "Reviewed ✓" }, "needs-work": { bg: "#FEF2F2", color: "#DC2626", label: "Needs Work" } };
                        return (
                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed #D4D4D8" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>My Submissions ({exVideos.length})</div>
                            {exVideos.map(v => {
                              const sc = statusColors[v.status] || statusColors.pending;
                              return (
                                <div key={v.id} style={{ padding: "8px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E4E4E7", marginBottom: 6 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                    <a href={v.video_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>▶ Watch Video</a>
                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                      <span style={{ fontSize: 10, fontWeight: 600, color: sc.color, background: sc.bg, padding: "2px 8px", borderRadius: 4 }}>{sc.label}</span>
                                      {deleteVideoSub && <button onClick={() => deleteVideoSub(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D8", fontSize: 14 }} title="Delete video">✕</button>}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 11, color: "#A1A1AA" }}>
                                    {new Date(v.date || v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  </div>
                                  {v.coach_feedback && (
                                    <div style={{ marginTop: 4, padding: "6px 8px", background: "#fff", borderRadius: 6, border: "1px solid #E4E4E7" }}>
                                      <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", marginBottom: 2 }}>Coach Feedback</div>
                                      <div style={{ fontSize: 12, color: "#18181B", whiteSpace: "pre-wrap" }}>{v.coach_feedback}</div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Shared Coach Notes */}
            {day.coachNotes && day.coachNotesShared && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>📝 Coach Notes</div>
                <div style={{ fontSize: 13, color: "#78350F", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{day.coachNotes}</div>
              </div>
            )}

            {/* Log day button */}
            {day.blocks.length > 0 && addLog && (
              <div style={{ marginTop: 6 }}>
                {dayStatus === "missed" ? (
                  <div style={{ background: "#FEF2F2", padding: "8px", borderRadius: 6, fontSize: 13, color: "#DC2626", fontWeight: 600, textAlign: "center" }}>✗ Session missed</div>
                ) : (
                  <button onClick={() => submitDay(day, week.label)} disabled={submitting === day.id} style={{ width: "100%", padding: "10px", background: dayLogged ? "#16A34A" : "#18181B", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: submitting === day.id ? "default" : "pointer", fontFamily: "inherit", opacity: submitting === day.id ? 0.5 : 1 }}>
                    {submitting === day.id ? "Saving…" : dayLogged ? `✓ Update ${day.label}` : `Log ${day.label}`}
                  </button>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {/* Weekly Recap from coach */}
      {week.coachRecap && (
        <div style={{ marginTop: 12, padding: "12px 14px", background: "#EFF6FF", borderRadius: 10, border: "1px solid #BFDBFE" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1E40AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>📋 Weekly Recap</div>
          <div style={{ fontSize: 13, color: "#1E3A5F", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{week.coachRecap}</div>
        </div>
      )}
    </div>
  );
}

function AthleteLog({ addLog, athlete, exercises, cats, colors, isMobile, programs, logs }) {
  const [selectedWorkout, setSelectedWorkout] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [blockResults, setBlockResults] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedEx, setExpandedEx] = useState(null);

  // Build workout options from programs
  const workoutOptions = [];
  (programs || []).forEach(p => {
    (p.weeks || []).forEach((w, wi) => {
      (w.days || []).forEach((d, di) => {
        if (d.blocks && d.blocks.length > 0) {
          const label = `${w.label ? w.label.replace(/WEEK\s*/i, "W").split("—")[0].trim() : `W${wi + 1}`} ${d.label}`;
          workoutOptions.push({ value: `${p.id}-${wi}-${di}`, label, programId: p.id, weekIndex: wi, dayIndex: di, day: d, weekLabel: w.label || `Week ${wi + 1}` });
        }
      });
    });
  });

  const selected = workoutOptions.find(o => o.value === selectedWorkout);

  const getDisplayName = (block) => {
    if (block.exerciseId) { const f = exercises.find(e => e.id === block.exerciseId); if (f) return f.name; }
    return block.exerciseName || "Unknown";
  };

  const updateResult = (blockId, field, value) => {
    setBlockResults(prev => ({ ...prev, [blockId]: { ...(prev[blockId] || {}), [field]: value } }));
  };

  const submitAll = async () => {
    if (!selected) return;
    setSubmitting(true);
    for (const block of selected.day.blocks) {
      const result = blockResults[block.id] || {};
      await addLog({
        athlete_id: athlete.id,
        athlete_name: athlete.name,
        exercise_id: block.exerciseId || "",
        exercise_name: getDisplayName(block),
        category: block.category || "",
        sets: result.sets || block.sets || "",
        reps: result.reps || block.reps || "",
        load: result.load || block.load || "",
        rpe: result.rpe || "",
        notes: result.notes || "",
        date,
        week_label: selected.weekLabel,
        day_label: selected.day.label,
      });
    }
    setSubmitting(false);
    setSaved(true);
    setBlockResults({});
    setTimeout(() => setSaved(false), 3000);
  };

  const alreadyLogged = selected && (logs || []).some(l => l.athlete_id === athlete.id && l.date === date && l.day_label === selected.day.label && l.week_label === selected.weekLabel);

  return (
    <div style={{ maxWidth: "100%" }}>
      <h2 style={{ margin: "0 0 20px", fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Log Workout</h2>
      {saved && <div style={{ background: "#F0FDF4", color: "#16A34A", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 14 }}>Workout logged!</div>}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Select Workout</div>
            <select value={selectedWorkout} onChange={e => { setSelectedWorkout(e.target.value); setBlockResults({}); setExpandedEx(null); }} style={{ width: "100%", padding: "9px 12px", border: "1px solid #E4E4E7", borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="">— Choose a workout —</option>
              {workoutOptions.map(o => <option key={o.value} value={o.value}>{o.label} ({o.day.blocks.length} exercises)</option>)}
            </select>
          </div>
        </div>
      </Card>

      {selected && (
        <div>
          {alreadyLogged && (
            <div style={{ background: "#FFF7ED", border: "1px solid #F97316", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13, color: "#F97316", fontWeight: 600 }}>
              Already logged for {date}.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selected.day.blocks.map((block, bi) => {
              const cc = colors[block.category];
              const result = blockResults[block.id] || {};
              const resolvedEx = block.exerciseId ? exercises.find(e => e.id === block.exerciseId) : null;
              const resolvedByName = !resolvedEx && block.exerciseName ? exercises.find(e => e.name === block.exerciseName) : null;
              const matchedEx = resolvedEx || resolvedByName;
              const videoUrl = matchedEx?.video_url || "";
              const isOpen = !isMobile || expandedEx === block.id;
              const hasInput = result.sets || result.reps || result.load || result.rpe || result.notes;

              return (
                <Card key={block.id} style={{ padding: 0, borderLeft: `4px solid ${cc?.bg || "#999"}`, overflow: "hidden" }}>
                  {/* Header - always visible */}
                  <div onClick={isMobile ? () => setExpandedEx(expandedEx === block.id ? null : block.id) : undefined} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", cursor: isMobile ? "pointer" : "default" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                      <Badge color={cc?.bg || "#999"}>{block.category}</Badge>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, wordBreak: "break-word" }}>{getDisplayName(block)}</div>
                        <div style={{ fontSize: 11, color: "#71717A" }}>
                          {[block.sets && block.reps ? `${block.sets}×${block.reps}` : null, block.load ? `@ ${block.load}` : null].filter(Boolean).join(" ") || ""}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      {hasInput && <span style={{ width: 8, height: 8, borderRadius: 4, background: "#16A34A" }} />}
                      {videoUrl && <a href={videoUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", fontSize: 11, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>▶</a>}
                      {isMobile && <span style={{ fontSize: 12, color: "#A1A1AA", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>}
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isOpen && (
                    <div style={{ padding: "0 12px 12px", borderTop: "1px solid #E4E4E7" }}>
                      {block.notes && <div style={{ fontSize: 12, color: "#52525B", padding: "8px 0 4px", fontStyle: "italic" }}>{block.notes}</div>}
                      {videoUrl && (
                        <a href={videoUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "4px 12px", borderRadius: 999, marginTop: 6, marginBottom: 8 }}>▶ Watch Movement Video</a>
                      )}
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8, marginBottom: 6 }}>Your Results</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <label style={{ fontSize: 10, color: "#71717A" }}>Sets<input type="number" value={result.sets ?? ""} onChange={e => updateResult(block.id, "sets", e.target.value)} placeholder={block.sets || ""} style={{ width: "100%", padding: "8px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 16, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} /></label>
                        <label style={{ fontSize: 10, color: "#71717A" }}>Reps<input value={result.reps ?? ""} onChange={e => updateResult(block.id, "reps", e.target.value)} placeholder={block.reps || ""} style={{ width: "100%", padding: "8px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 16, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} /></label>
                        <label style={{ fontSize: 10, color: "#71717A" }}>Load<input value={result.load ?? ""} onChange={e => updateResult(block.id, "load", e.target.value)} placeholder={block.load || "lbs"} style={{ width: "100%", padding: "8px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 16, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} /></label>
                        <label style={{ fontSize: 10, color: "#71717A" }}>RPE<input value={result.rpe ?? ""} onChange={e => updateResult(block.id, "rpe", e.target.value)} placeholder="1-10" style={{ width: "100%", padding: "8px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 16, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} /></label>
                      </div>
                      <label style={{ fontSize: 10, color: "#71717A", display: "block", marginTop: 6 }}>Notes<input value={result.notes ?? ""} onChange={e => updateResult(block.id, "notes", e.target.value)} placeholder="How did it feel?" style={{ width: "100%", padding: "8px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 16, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} /></label>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <Btn onClick={submitAll} disabled={submitting} style={{ marginTop: 16, width: "100%", opacity: submitting ? 0.5 : 1 }}>
            {submitting ? "Logging…" : `Log ${selected.label} (${selected.day.blocks.length} exercises)`}
          </Btn>
        </div>
      )}
    </div>
  );
}

function MyLogs({ logs, colors, cats, isMobile, deleteLog, deleteDayLogs }) {
  const [expandedDay, setExpandedDay] = useState(null);
  const [expandedExercise, setExpandedExercise] = useState(null);

  const formatDate = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // Group logs by date + day_label + week_label
  const grouped = {};
  logs.forEach(l => {
    const key = `${l.date}-${l.day_label || ""}-${l.week_label || ""}`;
    if (!grouped[key]) { grouped[key] = { date: l.date, week_label: l.week_label || "", day_label: l.day_label || "", entries: [], categories: new Set() }; }
    grouped[key].entries.push(l);
    if (l.category) grouped[key].categories.add(l.category);
  });
  // Deduplicate: keep most recent per exercise within each day
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

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Completed Workouts</h2>
      {sortedDays.length === 0 ? <EmptyState icon="◇" title="No completed workouts yet" sub="Log your first workout to see it here." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sortedDays.map(day => {
            const isExpanded = expandedDay === `${day.date}-${day.day_label}`;
            const catArray = Array.from(day.categories);
            return (
              <Card key={`${day.date}-${day.day_label}`} style={{ padding: 0, overflow: "hidden" }}>
                <div onClick={() => { setExpandedDay(isExpanded ? null : `${day.date}-${day.day_label}`); setExpandedExercise(null); }} style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: isExpanded ? "#F9FAFB" : "#fff", borderBottom: isExpanded ? "1px solid #E4E4E7" : "none" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{formatDate(day.date)}</span>
                      {(day.week_label || day.day_label) && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#F97316", background: "#FFF7ED", padding: "1px 8px", borderRadius: 4 }}>
                          {day.week_label ? day.week_label.replace(/WEEK\s*/i, "W").split("—")[0].trim() : ""}{day.day_label ? ` ${day.day_label}` : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>{day.entries.length} exercise{day.entries.length !== 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {catArray.map(c => <Badge key={c} color={colors[c]?.bg || "#71717A"}>{c}</Badge>)}
                    <span style={{ fontSize: 16, color: "#A1A1AA", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ padding: "8px 16px 14px" }}>
                    {(cats || Object.keys(colors)).filter(c => day.entries.some(e => e.category === c)).map(cat => {
                      const cc = colors[cat];
                      return (
                        <div key={cat} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 4, height: 14, borderRadius: 2, background: cc?.bg || "#999" }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: cc?.text || "#52525B", textTransform: "uppercase", letterSpacing: 0.5 }}>{cat}</span>
                          </div>
                          {day.entries.filter(e => e.category === cat).map(l => {
                            const isExOpen = expandedExercise === l.id;
                            return (
                              <div key={l.id} style={{ marginBottom: 2 }}>
                                <div
                                  onClick={(e) => { e.stopPropagation(); setExpandedExercise(isExOpen ? null : l.id); }}
                                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0 6px 12px", borderBottom: "1px solid #F4F4F5", gap: 8, cursor: "pointer" }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{l.exercise_name}</div>
                                    <div style={{ fontSize: 12, color: "#71717A" }}>
                                      {[l.sets && l.reps ? `${l.sets}×${l.reps}` : l.reps || l.sets || null, l.load ? `@ ${l.load}` : null, l.rpe ? `RPE ${l.rpe}` : null].filter(Boolean).join(" · ") || "—"}
                                    </div>
                                    {l.notes && !isExOpen && <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📝 {l.notes}</div>}
                                  </div>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                                    <span style={{ fontSize: 12, color: "#A1A1AA" }}>{isExOpen ? "▲" : "▸"}</span>
                                    <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this exercise?")) deleteLog(l.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D8", fontSize: 14 }} title="Delete">✕</button>
                                  </div>
                                </div>
                                {isExOpen && (
                                  <div style={{ padding: "10px 12px", background: "#FAFAFA", borderRadius: "0 0 8px 8px", marginBottom: 4 }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                                      <div style={{ background: "#fff", padding: "6px 8px", borderRadius: 6, border: "1px solid #E4E4E7" }}>
                                        <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>Sets</div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>{l.sets || "—"}</div>
                                      </div>
                                      <div style={{ background: "#fff", padding: "6px 8px", borderRadius: 6, border: "1px solid #E4E4E7" }}>
                                        <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>Reps</div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>{l.reps || "—"}</div>
                                      </div>
                                      <div style={{ background: "#fff", padding: "6px 8px", borderRadius: 6, border: "1px solid #E4E4E7" }}>
                                        <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>Load</div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>{l.load || "—"}</div>
                                      </div>
                                      <div style={{ background: "#fff", padding: "6px 8px", borderRadius: 6, border: "1px solid #E4E4E7" }}>
                                        <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase" }}>RPE</div>
                                        <div style={{ fontSize: 16, fontWeight: 700 }}>{l.rpe || "—"}</div>
                                      </div>
                                    </div>
                                    {l.notes && (
                                      <div style={{ padding: "8px 10px", background: "#fff", borderRadius: 6, border: "1px solid #E4E4E7", marginBottom: 6 }}>
                                        <div style={{ fontSize: 10, color: "#A1A1AA", textTransform: "uppercase", marginBottom: 2 }}>Notes</div>
                                        <div style={{ fontSize: 13, color: "#18181B", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{l.notes}</div>
                                      </div>
                                    )}
                                    <div style={{ fontSize: 11, color: "#A1A1AA" }}>{formatDate(l.date)} · {l.category}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid #E4E4E7" }}>
                      <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete all ${day.entries.length} exercises for this workout?`)) { deleteDayLogs(day.date, day.day_label); setExpandedDay(null); } }} style={{ width: "100%", padding: "8px", background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Delete Entire Workout ({day.entries.length} exercises)
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyVideos({ videoSubs, addVideoSub, deleteVideoSub, athlete, exercises, cats, colors, isMobile }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ exercise_name: "", video_url: "", notes: "" });
  const [uploadMode, setUploadMode] = useState("upload"); // "upload" or "link"
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      alert("Video must be under 100MB. Try trimming the clip or lowering the resolution.");
      return;
    }
    setSelectedFile(file);
  };

  const uploadAndSubmit = async () => {
    if (uploadMode === "link") {
      if (!form.video_url.trim()) return;
      await addVideoSub({
        athlete_id: athlete.id, athlete_name: athlete.name,
        exercise_name: form.exercise_name, video_url: form.video_url,
        notes: form.notes, date: new Date().toISOString().slice(0, 10),
      });
    } else {
      if (!selectedFile) return;
      setUploading(true);
      setUploadProgress("Uploading video…");
      try {
        const ext = selectedFile.name.split(".").pop()?.toLowerCase() || "mp4";
        const fileName = `${athlete.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { data, error } = await supabase.storage.from("videos").upload(fileName, selectedFile, { cacheControl: "3600", upsert: false });
        if (error) { alert("Upload failed: " + error.message); setUploading(false); setUploadProgress(""); return; }
        const { data: urlData } = supabase.storage.from("videos").getPublicUrl(data.path);
        const publicUrl = urlData.publicUrl;
        setUploadProgress("Saving…");
        await addVideoSub({
          athlete_id: athlete.id, athlete_name: athlete.name,
          exercise_name: form.exercise_name, video_url: publicUrl,
          notes: form.notes, date: new Date().toISOString().slice(0, 10),
        });
      } catch (err) {
        alert("Upload error: " + (err.message || "Unknown error"));
      }
      setUploading(false);
      setUploadProgress("");
    }
    setForm({ exercise_name: "", video_url: "", notes: "" });
    setSelectedFile(null);
    setModal(false);
  };

  const statusColor = { pending: "#F97316", reviewed: "#16A34A", "needs-work": "#DC2626" };
  const statusLabel = { pending: "Pending Review", reviewed: "Reviewed ✓", "needs-work": "Needs Work" };
  const fileSizeMB = selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(1) : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>My Videos</h2>
        <Btn onClick={() => { setForm({ exercise_name: exercises[0]?.name || "", video_url: "", notes: "" }); setSelectedFile(null); setUploadMode("upload"); setModal(true); }} small={isMobile}>+ Submit Video</Btn>
      </div>

      <Card style={{ marginBottom: 20, padding: 16, background: "#F9FAFB" }}>
        <p style={{ fontSize: 14, color: "#52525B", margin: 0, lineHeight: 1.6 }}>
          Upload a video directly from your phone or paste a link from YouTube or Google Drive. Your coach will review your form and provide feedback.
        </p>
      </Card>

      {videoSubs.length === 0 ? (
        <EmptyState icon="▶" title="No videos submitted" sub="Submit a movement video for coach review." action="+ Submit Video" onAction={() => { setForm({ exercise_name: exercises[0]?.name || "", video_url: "", notes: "" }); setSelectedFile(null); setUploadMode("upload"); setModal(true); }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {videoSubs.map(v => (
            <Card key={v.id} style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{v.exercise_name || "Movement Video"}</div>
                  <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>{new Date(v.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[v.status] || "#71717A", background: `${statusColor[v.status] || "#71717A"}15`, padding: "3px 10px", borderRadius: 999 }}>
                    {statusLabel[v.status] || v.status}
                  </span>
                  {deleteVideoSub && <button onClick={() => deleteVideoSub(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#D4D4D8", fontSize: 16 }} title="Delete video">✕</button>}
                </div>
              </div>
              <a href={v.video_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "5px 14px", borderRadius: 999, marginTop: 10 }}>▶ Watch Video</a>
              {v.notes && <div style={{ fontSize: 13, color: "#52525B", marginTop: 8, fontStyle: "italic" }}>{v.notes}</div>}
              {v.coach_feedback && (
                <div style={{ marginTop: 10, padding: "10px 14px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #4ADE80" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Coach Feedback</div>
                  <div style={{ fontSize: 13, color: "#18181B" }}>{v.coach_feedback}</div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Submit Movement Video">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <SearchableSelect
              label="Exercise"
              value={form.exercise_name}
              onChange={e => setForm({ ...form, exercise_name: e.target.value })}
              options={[
                ...exercises.map(ex => ({ value: ex.name, label: ex.name, group: ex.category })),
                { value: "Other", label: "Other", group: "Other" },
              ]}
              placeholder="Search exercises…"
              groupBy
            />
          </div>

          {/* Upload mode toggle */}
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #E4E4E7" }}>
            <button onClick={() => setUploadMode("upload")} style={{ flex: 1, padding: "10px", border: "none", background: uploadMode === "upload" ? "#18181B" : "#fff", color: uploadMode === "upload" ? "#fff" : "#52525B", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Upload from Phone
            </button>
            <button onClick={() => setUploadMode("link")} style={{ flex: 1, padding: "10px", border: "none", borderLeft: "1px solid #E4E4E7", background: uploadMode === "link" ? "#18181B" : "#fff", color: uploadMode === "link" ? "#fff" : "#52525B", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Paste Link
            </button>
          </div>

          {uploadMode === "upload" ? (
            <div>
              <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "24px 16px", border: "2px dashed #D4D4D8", borderRadius: 10, cursor: "pointer", background: selectedFile ? "#F0FDF4" : "#FAFAFA", transition: "background .2s" }}>
                <input type="file" accept="video/*" onChange={handleFileSelect} style={{ display: "none" }} />
                {selectedFile ? (
                  <>
                    <span style={{ fontSize: 28 }}>✓</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#16A34A" }}>{selectedFile.name}</span>
                    <span style={{ fontSize: 12, color: "#71717A" }}>{fileSizeMB} MB</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 28 }}>🎥</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#52525B" }}>Tap to choose from library or record</span>
                    <span style={{ fontSize: 12, color: "#A1A1AA" }}>MP4, MOV, WebM · Max 100MB</span>
                  </>
                )}
              </label>
            </div>
          ) : (
            <Input label="Video Link" value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="Paste YouTube, Google Drive, or any video link" />
          )}

          <Input label="Notes for Coach" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any questions or concerns about this movement?" />

          {uploading ? (
            <div style={{ textAlign: "center", padding: "12px", color: "#F97316", fontWeight: 600, fontSize: 14 }}>
              <div style={{ marginBottom: 6 }}>{uploadProgress}</div>
              <div style={{ height: 4, background: "#E4E4E7", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#F97316", borderRadius: 2, width: "60%", animation: "pulse 1.5s ease-in-out infinite" }} />
              </div>
            </div>
          ) : (
            <Btn onClick={uploadAndSubmit} disabled={uploadMode === "upload" ? !selectedFile : !form.video_url.trim()} style={{ marginTop: 8, opacity: (uploadMode === "upload" ? !selectedFile : !form.video_url.trim()) ? 0.5 : 1 }}>
              {uploadMode === "upload" ? "Upload & Submit" : "Submit for Review"}
            </Btn>
          )}
        </div>
      </Modal>
    </div>
  );
}

function MyBaselines({ baselines, updateBaseline, isMobile }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const startEdit = (b) => {
    setEditing(b.id);
    setForm({ week1_result: b.week1_result || "", week1_notes: b.week1_notes || "", week12_result: b.week12_result || "", week12_notes: b.week12_notes || "" });
  };

  const save = async (id) => {
    await updateBaseline(id, form);
    setEditing(null);
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>My Baselines</h2>
      <p style={{ fontSize: 13, color: "#71717A", margin: "0 0 20px" }}>Enter your results for Week 1 and Week 12 testing.</p>

      {baselines.length === 0 ? (
        <EmptyState icon="◎" title="No baselines set up yet" sub="Your coach will set up your baseline movements." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {baselines.map(b => {
            const isEditing = editing === b.id;
            const hasW1 = b.week1_result;
            const hasW12 = b.week12_result;
            return (
              <Card key={b.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{b.movement}</div>
                    <div style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>Target: <strong>{b.target}</strong> <span style={{ color: "#A1A1AA" }}>({b.units})</span></div>
                  </div>
                  {!isEditing && (
                    <button onClick={() => startEdit(b)} style={{ background: "none", border: "1px solid #E4E4E7", borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "#52525B", fontWeight: 600 }}>
                      {hasW1 || hasW12 ? "Edit" : "Add Results"}
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div style={{ padding: "10px", background: "#FFF7ED", borderRadius: 8, border: "1px solid #FED7AA" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#F97316", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Week 1</div>
                        <label style={{ fontSize: 11, color: "#71717A", display: "block", marginBottom: 6 }}>Result
                          <input value={form.week1_result} onChange={e => setForm({ ...form, week1_result: e.target.value })} placeholder={`e.g. ${b.target}`} style={{ width: "100%", padding: "8px", border: "1px solid #FED7AA", borderRadius: 6, fontSize: 16, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} />
                        </label>
                        <label style={{ fontSize: 11, color: "#71717A", display: "block" }}>Notes
                          <input value={form.week1_notes} onChange={e => setForm({ ...form, week1_notes: e.target.value })} placeholder="How did it feel?" style={{ width: "100%", padding: "8px", border: "1px solid #FED7AA", borderRadius: 6, fontSize: 14, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} />
                        </label>
                      </div>
                      <div style={{ padding: "10px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Week 12</div>
                        <label style={{ fontSize: 11, color: "#71717A", display: "block", marginBottom: 6 }}>Result
                          <input value={form.week12_result} onChange={e => setForm({ ...form, week12_result: e.target.value })} placeholder={`e.g. ${b.target}`} style={{ width: "100%", padding: "8px", border: "1px solid #BBF7D0", borderRadius: 6, fontSize: 16, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} />
                        </label>
                        <label style={{ fontSize: 11, color: "#71717A", display: "block" }}>Notes
                          <input value={form.week12_notes} onChange={e => setForm({ ...form, week12_notes: e.target.value })} placeholder="How did it feel?" style={{ width: "100%", padding: "8px", border: "1px solid #BBF7D0", borderRadius: 6, fontSize: 14, fontFamily: "inherit", marginTop: 2, boxSizing: "border-box" }} />
                        </label>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn onClick={() => save(b.id)} small>Save</Btn>
                      <button onClick={() => setEditing(null)} style={{ padding: "6px 14px", background: "none", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit", color: "#71717A", fontWeight: 600 }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ padding: "10px", background: "#FFF7ED", borderRadius: 8, border: "1px solid #FED7AA" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#F97316", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Week 1</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: hasW1 ? "#18181B" : "#D4D4D8" }}>{hasW1 || "—"}</div>
                      {b.week1_notes && <div style={{ fontSize: 12, color: "#71717A", fontStyle: "italic", marginTop: 4 }}>{b.week1_notes}</div>}
                    </div>
                    <div style={{ padding: "10px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #BBF7D0" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Week 12</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: hasW12 ? "#18181B" : "#D4D4D8" }}>{hasW12 || "—"}</div>
                      {b.week12_notes && <div style={{ fontSize: 12, color: "#71717A", fontStyle: "italic", marginTop: 4 }}>{b.week12_notes}</div>}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
