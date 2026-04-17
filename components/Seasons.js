"use client";
import { useState } from "react";
import { Badge, Btn, Card, Input, Modal, EmptyState } from "./ui";

export default function Seasons({ groups, athletes, programs, logs, colors, cats, isMobile, addGroup, updateGroup, deleteGroup, addAthleteToGroup, removeAthleteFromGroup, groupAthletes, setPage }) {
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [detail, setDetail] = useState(null);
  const [addAthleteModal, setAddAthleteModal] = useState(false);

  const openNew = () => { setForm({ name: "", description: "" }); setEditId(null); setModal(true); };
  const openEdit = (g) => { setForm({ name: g.name, description: g.description || "" }); setEditId(g.id); setModal(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editId) { await updateGroup(editId, form); }
    else { await addGroup(form); }
    setModal(false);
  };

  const activeGroup = groups.find(g => g.id === detail);

  // Detail view
  if (detail && activeGroup) {
    const athleteIds = groupAthletes.filter(ga => ga.group_id === detail).map(ga => ga.athlete_id);
    const groupAthletesList = athletes.filter(a => athleteIds.includes(a.id));
    const groupPrograms = programs.filter(p => p.group_id === detail);
    const groupLogs = logs.filter(l => athleteIds.includes(l.athlete_id));
    const availableAthletes = athletes.filter(a => !athleteIds.includes(a.id));

    // Count exercises from completed/missed weeks AND days in programs
    const allAthletePrograms = programs.filter(p => athleteIds.includes(p.athlete_id));
    const programCats = { completed: {}, missed: {} };
    cats.forEach(c => { programCats.completed[c] = 0; programCats.missed[c] = 0; });
    let completedWeeks = 0, missedWeeks = 0, totalWeeks = 0;
    let completedSessions = 0, missedSessions = 0, totalSessions = 0;
    allAthletePrograms.forEach(p => {
      (p.weeks || []).forEach(w => {
        totalWeeks++;
        if (w.status === "completed") completedWeeks++;
        else if (w.status === "missed") missedWeeks++;
        (w.days || []).forEach(d => {
          if (d.blocks && d.blocks.length > 0) totalSessions++;
          // Day-level status takes priority, then fall back to week status
          const dayStatus = d.status || w.status || "";
          if (dayStatus === "completed" || dayStatus === "missed") {
            if (dayStatus === "completed") completedSessions++;
            else missedSessions++;
            (d.blocks || []).forEach(b => {
              if (b.category && programCats[dayStatus][b.category] !== undefined) {
                programCats[dayStatus][b.category]++;
              }
            });
          }
        });
      });
    });
    const totalProgrammed = Object.values(programCats.completed).reduce((a, b) => a + b, 0) + Object.values(programCats.missed).reduce((a, b) => a + b, 0);

    // Stats
    const thisWeekLogs = groupLogs.filter(l => (new Date() - new Date(l.date)) / 86400000 < 7).length;

    return (
      <div>
        <button onClick={() => setDetail(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#71717A", marginBottom: 12, fontFamily: "inherit" }}>← Back to Seasons</button>

        {/* Group header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>{activeGroup.name}</h2>
            {activeGroup.description && <p style={{ color: "#71717A", fontSize: 14, marginTop: 4 }}>{activeGroup.description}</p>}
            <Badge color={activeGroup.status === "active" ? "#16A34A" : "#71717A"}>{activeGroup.status || "active"}</Badge>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small variant="secondary" onClick={() => openEdit(activeGroup)}>Edit</Btn>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{groupAthletesList.length}</div>
            <div style={{ fontSize: 12, color: "#71717A" }}>Athletes</div>
          </Card>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#16A34A" }}>{completedSessions}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#D4D4D8" }}>/</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#DC2626" }}>{missedSessions}</span>
            </div>
            <div style={{ fontSize: 12, color: "#71717A" }}>Sessions: Done / Missed</div>
          </Card>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: (completedSessions + missedSessions) > 0 && Math.round((completedSessions / (completedSessions + missedSessions)) * 100) >= 80 ? "#16A34A" : "#F97316" }}>{(completedSessions + missedSessions) > 0 ? Math.round((completedSessions / (completedSessions + missedSessions)) * 100) : 0}%</div>
            <div style={{ fontSize: 12, color: "#71717A" }}>Attendance to Date</div>
          </Card>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0}%</div>
            <div style={{ fontSize: 12, color: "#71717A" }}>Program Completion</div>
          </Card>
          <Card style={{ padding: 14, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#16A34A" }}>{completedWeeks}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#D4D4D8" }}>/</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#DC2626" }}>{missedWeeks}</span>
            </div>
            <div style={{ fontSize: 12, color: "#71717A" }}>Weeks: Done / Missed</div>
          </Card>
        </div>

        {/* Athletes in group */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Athletes</h3>
          {availableAthletes.length > 0 && <Btn small variant="secondary" onClick={() => setAddAthleteModal(true)}>+ Add Athlete</Btn>}
        </div>
        {groupAthletesList.length === 0 ? (
          <Card style={{ marginBottom: 24 }}><p style={{ color: "#A1A1AA", fontSize: 14, textAlign: "center", padding: 16 }}>No athletes in this season yet.</p></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {groupAthletesList.map(a => {
              const athletePrograms = allAthletePrograms.filter(p => p.athlete_id === a.id);
              const athleteLogs = groupLogs.filter(l => l.athlete_id === a.id);

              // Per-athlete week and session stats
              let aCompWeeks = 0, aMissWeeks = 0, aTotalWeeks = 0;
              let aCompSessions = 0, aMissSessions = 0, aTotalSessions = 0;
              const aCats = { completed: {}, missed: {} };
              cats.forEach(c => { aCats.completed[c] = 0; aCats.missed[c] = 0; });
              athletePrograms.forEach(p => {
                (p.weeks || []).forEach(w => {
                  aTotalWeeks++;
                  if (w.status === "completed") aCompWeeks++;
                  else if (w.status === "missed") aMissWeeks++;
                  (w.days || []).forEach(d => {
                    if (d.blocks && d.blocks.length > 0) aTotalSessions++;
                    const dayStatus = d.status || w.status || "";
                    if (dayStatus === "completed" || dayStatus === "missed") {
                      if (dayStatus === "completed") aCompSessions++;
                      else aMissSessions++;
                      (d.blocks || []).forEach(b => {
                        if (b.category && aCats[dayStatus][b.category] !== undefined) aCats[dayStatus][b.category]++;
                      });
                    }
                  });
                });
              });
              const aTrackedSessions = aCompSessions + aMissSessions;
              const aTotalEx = Object.values(aCats.completed).reduce((s, v) => s + v, 0) + Object.values(aCats.missed).reduce((s, v) => s + v, 0);
              const attendancePct = aTrackedSessions > 0 ? Math.round((aCompSessions / aTrackedSessions) * 100) : 0;
              const completionPct = aTotalSessions > 0 ? Math.round((aCompSessions / aTotalSessions) * 100) : 0;

              return (
                <Card key={a.id} style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{a.name}</div>
                      <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>{a.sport}{a.age ? ` · Age ${a.age}` : ""}</div>
                    </div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {aTrackedSessions > 0 && (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: attendancePct >= 80 ? "#16A34A" : attendancePct >= 50 ? "#F97316" : "#DC2626" }}>{attendancePct}%</div>
                          <div style={{ fontSize: 9, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.3 }}>Attendance</div>
                        </div>
                      )}
                      {aTotalSessions > 0 && (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#52525B" }}>{completionPct}%</div>
                          <div style={{ fontSize: 9, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.3 }}>Completed</div>
                        </div>
                      )}
                      <button onClick={() => removeAthleteFromGroup(detail, a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#A1A1AA", fontSize: 14 }} title="Remove from season">✕</button>
                    </div>
                  </div>

                  {/* Session progress bar */}
                  {aTotalSessions > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", gap: 1, marginBottom: 4 }}>
                        {athletePrograms.flatMap(p => (p.weeks || []).flatMap((w, wi) => (w.days || []).map((d, di) => {
                          if (!d.blocks || d.blocks.length === 0) return null;
                          const ds = d.status || w.status || "";
                          return <div key={`${p.id}-${wi}-${di}`} style={{ flex: 1, height: 6, borderRadius: 2, background: ds === "completed" ? "#16A34A" : ds === "missed" ? "#DC2626" : "#E4E4E7" }} />;
                        }))).filter(Boolean)}
                      </div>
                      <div style={{ fontSize: 11, color: "#71717A" }}>
                        <span style={{ color: "#16A34A", fontWeight: 600 }}>{aCompSessions}</span> sessions done
                        {aMissSessions > 0 && <> · <span style={{ color: "#DC2626", fontWeight: 600 }}>{aMissSessions}</span> missed</>}
                        {" · "}{aTotalSessions - aCompSessions - aMissSessions} remaining
                      </div>
                    </div>
                  )}

                  {/* Per-athlete category distribution */}
                  {aTotalEx > 0 && (
                    <div style={{ marginTop: 12, padding: "10px 12px", background: "#FAFAFA", borderRadius: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#71717A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Category Breakdown</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {cats.map(c => {
                          const comp = aCats.completed[c] || 0;
                          const miss = aCats.missed[c] || 0;
                          const total = comp + miss;
                          if (total === 0) return null;
                          return (
                            <div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 36, fontSize: 11, fontWeight: 700, color: colors[c]?.text || "#52525B" }}>{c}</div>
                              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "#E4E4E7", overflow: "hidden", display: "flex" }}>
                                <div style={{ height: "100%", width: `${(comp / aTotalEx) * 100}%`, background: colors[c]?.bg, transition: "width .3s" }} />
                                <div style={{ height: "100%", width: `${(miss / aTotalEx) * 100}%`, background: colors[c]?.bg, opacity: 0.25, transition: "width .3s" }} />
                              </div>
                              <div style={{ fontSize: 11, color: "#52525B", fontWeight: 600, minWidth: 30, textAlign: "right" }}>
                                {comp > 0 && <span style={{ color: "#16A34A" }}>{comp}</span>}
                                {comp > 0 && miss > 0 && <span style={{ color: "#D4D4D8" }}>/</span>}
                                {miss > 0 && <span style={{ color: "#DC2626" }}>{miss}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Program names */}
                  {athletePrograms.map(p => (
                    <div key={p.id} style={{ marginTop: 8, padding: "6px 10px", background: "#F4F4F5", borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
                      {p.name}
                      <span style={{ fontSize: 11, color: "#71717A", fontWeight: 400, marginLeft: 8 }}>{(p.weeks || []).length}wk</span>
                    </div>
                  ))}
                </Card>
              );
            })}
          </div>
        )}

        {/* Category distribution for this group */}
        <Card>
          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Category Distribution</h3>
          <p style={{ fontSize: 12, color: "#A1A1AA", margin: "0 0 16px" }}>Exercises from {completedWeeks + missedWeeks} tracked weeks ({completedWeeks} completed, {missedWeeks} missed)</p>
          {totalProgrammed === 0 ? (
            <p style={{ fontSize: 13, color: "#A1A1AA", textAlign: "center", padding: 16 }}>Mark weeks as completed or missed to see distribution here.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cats.map(c => {
                const comp = programCats.completed[c] || 0;
                const miss = programCats.missed[c] || 0;
                const total = comp + miss;
                if (total === 0) return null;
                const maxBar = totalProgrammed;
                return (
                  <div key={c}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <Badge color={colors[c]?.bg}>{c}</Badge>
                      <span style={{ fontSize: 12, color: "#52525B", fontWeight: 600 }}>{total} exercises</span>
                    </div>
                    <div style={{ display: "flex", height: 10, borderRadius: 5, background: "#F4F4F5", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(comp / maxBar) * 100}%`, background: colors[c]?.bg, borderRadius: "5px 0 0 5px", transition: "width .4s" }} />
                      <div style={{ height: "100%", width: `${(miss / maxBar) * 100}%`, background: colors[c]?.bg, opacity: 0.3, transition: "width .4s" }} />
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 3, fontSize: 11 }}>
                      {comp > 0 && <span style={{ color: "#16A34A", fontWeight: 600 }}>✓ {comp} completed</span>}
                      {miss > 0 && <span style={{ color: "#DC2626", fontWeight: 600 }}>✗ {miss} missed</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Add athlete modal */}
        <Modal open={addAthleteModal} onClose={() => setAddAthleteModal(false)} title="Add Athlete to Season">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {availableAthletes.length === 0 ? (
              <p style={{ color: "#A1A1AA", fontSize: 14, textAlign: "center", padding: 16 }}>All athletes are already in this season.</p>
            ) : availableAthletes.map(a => (
              <button key={a.id} onClick={async () => { await addAthleteToGroup(detail, a.id); setAddAthleteModal(false); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", border: "1px solid #E4E4E7", borderRadius: 8, background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: "#71717A" }}>{a.sport}{a.age ? ` · Age ${a.age}` : ""}</div>
                </div>
                <span style={{ color: "#16A34A", fontWeight: 700 }}>+</span>
              </button>
            ))}
          </div>
        </Modal>

        {/* Edit modal */}
        <Modal open={modal} onClose={() => setModal(false)} title="Edit Season">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Season Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <Btn onClick={save} style={{ marginTop: 8 }}>Save</Btn>
          </div>
        </Modal>
      </div>
    );
  }

  // List view
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Seasons</h2>
        <Btn onClick={openNew} small={isMobile}>+ New Season</Btn>
      </div>
      {groups.length === 0 ? <EmptyState icon="▣" title="No seasons yet" sub="Create a season to organize your athletes and programs." action="+ New Season" onAction={openNew} /> : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {groups.map(g => {
            const athleteIds = groupAthletes.filter(ga => ga.group_id === g.id).map(ga => ga.athlete_id);
            const groupProgramCount = programs.filter(p => p.group_id === g.id).length;
            return (
              <Card key={g.id} onClick={() => setDetail(g.id)} style={{ cursor: "pointer", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{g.name}</div>
                    {g.description && <p style={{ fontSize: 13, color: "#71717A", marginTop: 4 }}>{g.description}</p>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Badge color={g.status === "active" ? "#16A34A" : "#71717A"}>{g.status || "active"}</Badge>
                    <Btn variant="danger" small onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${g.name}"?`)) deleteGroup(g.id); }}>✕</Btn>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 13, color: "#52525B" }}>
                  <span style={{ fontWeight: 600 }}>{athleteIds.length} athlete{athleteIds.length !== 1 ? "s" : ""}</span>
                  <span>{groupProgramCount} program{groupProgramCount !== 1 ? "s" : ""}</span>
                </div>
                {/* Athlete avatars */}
                {athleteIds.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {athletes.filter(a => athleteIds.includes(a.id)).map(a => (
                      <span key={a.id} style={{ background: "#F4F4F5", padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: "#52525B" }}>{a.name}</span>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Edit Season" : "New Season"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Season Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Spring/Summer 2026 Training" />
          <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="12-week program for freeride skiers" />
          <Btn onClick={save} style={{ marginTop: 8 }}>{editId ? "Save" : "Create Season"}</Btn>
        </div>
      </Modal>
    </div>
  );
}
