"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card } from "./ui";
import { findMissingNumberSessions } from "../lib/logging";
import { fetchDismissals, dismissedSetFor, dismissGap, undismissGap } from "../lib/dismissals";
import { fetchNudges, nudgeKey, draftNudge, sendNudge } from "../lib/nudges";
import { weekNumberLabel } from "../lib/weeks";

export default function Dashboard({ athletes, programs, logs, cats, colors, isMobile, onNavigate }) {
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const recent = [...logs].slice(0, 5);

  // Count exercises from all programs by category
  const programCounts = {};
  let totalProgramExercises = 0;
  cats.forEach(c => { programCounts[c] = 0; });
  programs.forEach(p => {
    (p.weeks || []).forEach(w => {
      (w.days || []).forEach(d => {
        (d.blocks || []).forEach(b => {
          if (b.category && programCounts[b.category] !== undefined) {
            programCounts[b.category]++;
            totalProgramExercises++;
          }
        });
      });
    });
  });

  // Count logged workouts by category
  const logCounts = {};
  cats.forEach(c => { logCounts[c] = 0; });
  logs.forEach(l => {
    if (l.category && logCounts[l.category] !== undefined) logCounts[l.category]++;
  });

  /*
    Sessions the coach has waved off. Loaded once and kept in state; every dismissal
    re-reads rather than patching the set optimistically, so a write that silently failed
    shows the gap again instead of hiding it here while the athlete keeps being nagged.
  */
  const [dismissedBy, setDismissedBy] = useState(new Map());
  const [lastDismissed, setLastDismissed] = useState(null); // one-step undo
  const [busyKey, setBusyKey] = useState(null);
  const reloadDismissals = async () => {
    const { byAthlete } = await fetchDismissals();
    setDismissedBy(byAthlete);
  };
  useEffect(() => { reloadDismissals(); }, []);

  /*
    Who has trained recently without recording the numbers that matter.

    The athlete's own app nags them; this is the coach's side of it - one place to see the
    whole roster instead of opening each athlete to find out. Same rule, same module, so
    the two can never disagree about whose session is incomplete.
  */
  const missing = useMemo(() => {
    const rows = [];
    (programs || []).forEach(p => {
      const ath = (athletes || []).find(a => a.id === p.athlete_id);
      if (!ath) return;
      findMissingNumberSessions({
        program: p,
        logs,
        athleteId: p.athlete_id,
        displayName: (b) => b.exerciseName || "",
        dismissed: dismissedSetFor(dismissedBy, p.athlete_id),
      }).forEach(g => rows.push({ ...g, athlete: ath, programName: p.name }));
    });
    return rows.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [programs, athletes, logs, dismissedBy]);

  /*
    One dismissal or a whole row of them, through the same path.

    The roster-wide case is not a nicety: the movements a session asks for come from one
    shared program, so when a day is wrong for one athlete it is usually wrong for all six
    - the Week 1 screen day flagged four athletes for the same five technique lifts on the
    day this was built. Six clicks to say one thing is how a coach learns to ignore the
    panel.
  */
  const dismissRows = async (rows, label, key) => {
    setBusyKey(key);
    const done = [];
    for (const m of rows) {
      const ok = await dismissGap({
        athleteId: m.athlete.id,
        weekLabel: m.weekLabel,
        dayLabel: m.day.label,
        movements: m.missing,
      });
      if (ok) done.push({ athleteId: m.athlete.id, weekLabel: m.weekLabel, dayLabel: m.day.label });
    }
    if (done.length) setLastDismissed({ label, rows: done });
    await reloadDismissals();
    setBusyKey(null);
  };

  const handleUndo = async () => {
    if (!lastDismissed) return;
    for (const r of lastDismissed.rows) await undismissGap(r);
    setLastDismissed(null);
    await reloadDismissals();
  };

  /*
    Nudges: which movements the coach has already chased, and the one he is composing.

    Composed before sending, never fired straight off the chip. The message goes out
    under his own name into the athlete's thread, and a canned line there is worse than
    no line - the athlete can tell, and the whole value of a nudge is that a person
    noticed. So the chip drafts; he edits; he sends.
  */
  const [nudges, setNudges] = useState(new Map());
  const [composing, setComposing] = useState(null); // {athlete, movement, weekLabel, dayLabel, wi, text, nkey}
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(null);
  const reloadNudges = async () => setNudges(await fetchNudges());
  useEffect(() => { reloadNudges(); }, []);

  const openComposer = (ath, m, mv) => {
    setJustSent(null);
    setComposing({
      athlete: ath,
      movement: mv.name,
      weekLabel: m.weekLabel,
      dayLabel: m.day.label,
      nkey: nudgeKey(ath.id, m.weekLabel, m.day.label, mv.name),
      text: draftNudge({
        athleteName: ath.name,
        movement: mv.name,
        dayLabel: m.day.label,
        weekLabel: weekNumberLabel(m.weekLabel, m.wi),
      }),
    });
  };

  const handleSendNudge = async () => {
    if (!composing) return;
    setSending(true);
    const res = await sendNudge({
      athlete: composing.athlete,
      movement: composing.movement,
      weekLabel: composing.weekLabel,
      dayLabel: composing.dayLabel,
      text: composing.text,
    });
    setSending(false);
    if (!res.ok) { setJustSent({ ok: false }); return; }
    setJustSent({ ok: true, name: composing.athlete.name, movement: composing.movement });
    setComposing(null);
    await reloadNudges();
  };

  /*
    Sessions flagged for more than one athlete, so they can be cleared in one go.
  */
  const sharedSessions = useMemo(() => {
    const map = new Map();
    missing.forEach(m => {
      const e = map.get(m.key);
      if (e) e.rows.push(m);
      else map.set(m.key, { key: m.key, weekLabel: m.weekLabel, wi: m.wi, dayLabel: m.day.label, rows: [m] });
    });
    return [...map.values()]
      .filter(s => s.rows.length > 1)
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [missing]);

  /*
    Grouped by athlete rather than a flat list. A stack of sessions ordered only by date
    reads as noise once more than one or two athletes are behind - the coach thinks in
    people ("has Gus logged anything?"), not in a chronological feed of days.
  */
  const byAthlete = useMemo(() => {
    const map = new Map();
    missing.forEach(m => {
      const e = map.get(m.athlete.id);
      if (e) e.sessions.push(m);
      else map.set(m.athlete.id, { athlete: m.athlete, sessions: [m] });
    });
    return [...map.values()].sort((a, b) =>
      b.sessions.length - a.sessions.length ||
      String(b.sessions[0].date || "").localeCompare(String(a.sessions[0].date || "")) ||
      a.athlete.name.localeCompare(b.athlete.name)
    );
  }, [missing]);

  // Always start collapsed, even for a single athlete. One consistent shape reads cleaner
  // than a panel that changes layout depending on how many people are behind.
  const [openAthlete, setOpenAthlete] = useState(null);
  const isOpen = (id) => openAthlete === id;

  return (
    <div>
      <div style={{ marginBottom: isMobile ? 20 : 32 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Dashboard</h2>
        <p style={{ margin: "4px 0 0", color: "#71717A", fontSize: 14 }}>{today}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))", gap: isMobile ? 10 : 16, marginBottom: isMobile ? 20 : 32 }}>
        {[{ l: "Athletes", v: athletes.length, i: "◎" }, { l: "Programs", v: programs.length, i: "▦" }, { l: "Logged", v: logs.length, i: "◇" }, { l: "This Week", v: logs.filter(x => (new Date() - new Date(x.date)) / 86400000 < 7).length, i: "↗" }].map(s => (
          <Card key={s.l} style={{ padding: isMobile ? 14 : 20, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: isMobile ? 36 : 44, height: isMobile ? 36 : 44, borderRadius: 10, background: "#F4F4F5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 16 : 20, flexShrink: 0 }}>{s.i}</div>
            <div><div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700 }}>{s.v}</div><div style={{ fontSize: 12, color: "#71717A" }}>{s.l}</div></div>
          </Card>
        ))}
      </div>

      {/*
        Undo, outside the alert card on purpose: dismissing the last gap makes that card
        disappear, and an undo that vanishes with the thing it undoes is not an undo.
      */}
      {lastDismissed && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: isMobile ? 16 : 24, padding: "10px 14px", borderRadius: 10, background: "#F4F4F5", border: "1px solid #E4E4E7" }}>
          <span style={{ fontSize: 12, color: "#52525B", minWidth: 0, wordBreak: "break-word" }}>
            Dismissed {lastDismissed.label}. It is off their app too.
          </span>
          <button
            onClick={handleUndo}
            style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#18181B", background: "#fff", border: "1px solid #D4D4D8", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit" }}
          >
            Undo
          </button>
        </div>
      )}

      {/*
        Sent confirmation. Outside the panel like the undo bar, because sending the last
        nudge on the last flagged session takes the panel with it.
      */}
      {justSent && (
        <div style={{
          marginBottom: isMobile ? 16 : 24, padding: "10px 14px", borderRadius: 10, fontSize: 12,
          background: justSent.ok ? "#F0FDF4" : "#FEF2F2",
          border: `1px solid ${justSent.ok ? "#BBF7D0" : "#FCA5A5"}`,
          color: justSent.ok ? "#166534" : "#991B1B",
        }}>
          {justSent.ok
            ? <>Nudge sent to <b>{justSent.name}</b> about <b>{justSent.movement}</b> — it{"’"}s in their Messages.</>
            : <>That nudge didn{"’"}t send. Nothing reached the athlete — try again.</>}
        </div>
      )}

      {/* Who is missing numbers */}
      {missing.length > 0 && (
        <Card style={{ marginBottom: isMobile ? 16 : 24, border: "2px solid #FCA5A5", background: "#FEF2F2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{"\u26A0\uFE0F"}</span>
            <h3 style={{ margin: 0, fontSize: 16, color: "#991B1B" }}>Missing numbers</h3>
          </div>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#7F1D1D" }}>
            {missing.length} session{missing.length !== 1 ? "s" : ""} across {byAthlete.length} athlete{byAthlete.length !== 1 ? "s" : ""} with
            a lift or finisher that has no numbers against it. The exact movements are listed below —
            their own app is prompting them for the same ones. Dismiss anything you don{"’"}t need.
          </p>
          {/*
            The same day flagged across the roster. Everyone runs one shared program, so a
            session that is wrong for one athlete is usually wrong for all of them - clearing
            it six times teaches the coach to stop reading the panel.
          */}
          {sharedSessions.length > 0 && (
            <div style={{ marginBottom: 10, padding: "9px 11px", background: "#fff", border: "1px dashed #FCA5A5", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#991B1B", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                Flagged for more than one athlete
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sharedSessions.map(s => (
                  <div key={s.key} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#18181B", wordBreak: "break-word" }}>{s.dayLabel}</div>
                      <div style={{ fontSize: 11, color: "#71717A" }}>
                        {weekNumberLabel(s.weekLabel, s.wi)} · {s.rows.map(r => r.athlete.name).join(", ")}
                      </div>
                    </div>
                    <button
                      onClick={() => dismissRows(s.rows, `${s.dayLabel} for ${s.rows.length} athletes`, `all::${s.key}`)}
                      disabled={busyKey === `all::${s.key}`}
                      style={{
                        flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#52525B",
                        background: "#FAFAFA", border: "1px solid #E4E4E7", borderRadius: 6,
                        padding: "4px 10px", cursor: busyKey === `all::${s.key}` ? "default" : "pointer",
                        fontFamily: "inherit", opacity: busyKey === `all::${s.key}` ? 0.5 : 1,
                      }}
                    >
                      {busyKey === `all::${s.key}` ? "Dismissing…" : `Dismiss for all ${s.rows.length}`}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byAthlete.map(({ athlete: ath, sessions }) => {
              const open = isOpen(ath.id);
              return (
                <div key={ath.id} style={{ background: "#fff", border: "1px solid #FCA5A5", borderRadius: 8, overflow: "hidden" }}>
                  {/*
                    Dismiss sits on the collapsed row, not only inside it.

                    The panel opens with every athlete collapsed and most of them carrying a
                    single session, so a dismiss that only existed one level down meant expand,
                    dismiss, collapse for each person. It is a sibling of the expander rather
                    than a child of it - a button inside a button is invalid and the click would
                    toggle the accordion on its way past.
                  */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 12px" }}>
                    <button
                      onClick={() => setOpenAthlete(open ? null : ath.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textAlign: "left",
                        padding: 0, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#18181B", flex: 1, minWidth: 0, wordBreak: "break-word" }}>
                        {ath.name}
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 999, padding: "2px 9px" }}>
                        {sessions.length} session{sessions.length !== 1 ? "s" : ""}
                      </span>
                      <span style={{ flexShrink: 0, fontSize: 10, color: "#A1A1AA", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>{"\u25BC"}</span>
                    </button>
                    <button
                      onClick={() => dismissRows(
                        sessions.map(m => ({ ...m, athlete: ath })),
                        sessions.length === 1
                          ? `${sessions[0].day.label} for ${ath.name}`
                          : `${sessions.length} sessions for ${ath.name}`,
                        `ath::${ath.id}`
                      )}
                      disabled={busyKey === `ath::${ath.id}`}
                      style={{
                        flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#52525B",
                        background: "#FAFAFA", border: "1px solid #E4E4E7", borderRadius: 6,
                        padding: "4px 10px", cursor: busyKey === `ath::${ath.id}` ? "default" : "pointer",
                        fontFamily: "inherit", opacity: busyKey === `ath::${ath.id}` ? 0.5 : 1,
                      }}
                    >
                      {busyKey === `ath::${ath.id}`
                        ? "Dismissing\u2026"
                        : sessions.length === 1 ? "Dismiss" : `Dismiss all ${sessions.length}`}
                    </button>
                  </div>
                  {open && (
                    <div style={{ borderTop: "1px solid #FEE2E2" }}>
                      {/*
                        The movements themselves, not a count.

                        "2 not recorded" made the coach open the session to find out which
                        two, which is the whole job. Naming them means most of the time he
                        can settle it from here - a missing Back Squat on a test day is not
                        the same thing as a missing finisher on a screen day.
                      */}
                      {sessions.map((m, i) => {
                        const bkey = `${ath.id}::${m.key}`;
                        return (
                          <div
                            key={`${m.wi}-${m.day.id}-${i}`}
                            style={{ padding: "9px 12px 10px 16px", borderTop: i ? "1px solid #F4F4F5" : "none" }}
                          >
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#18181B", wordBreak: "break-word" }}>
                                  {m.day.label}
                                </div>
                                <div style={{ fontSize: 11, color: "#71717A", marginTop: 1 }}>
                                  {weekNumberLabel(m.weekLabel, m.wi)} · {m.count} of {m.total} missing{m.date ? ` · ${m.date}` : ""}
                                </div>
                              </div>
                              {onNavigate && (
                                <button
                                  onClick={() => onNavigate(ath.id, "programs", { weekLabel: m.weekLabel, dayLabel: m.day.label })}
                                  style={{
                                    flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#DC2626", whiteSpace: "nowrap",
                                    background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0,
                                  }}
                                >
                                  Open {"→"}
                                </button>
                              )}
                            </div>
                            {/*
                              The specific movements with nothing against them — and each one
                              is the nudge button for itself.

                              Per movement rather than per session on purpose: chasing the
                              Overhead Press and letting the neck isometrics go is a real
                              coaching distinction, and one message per thing asked for is
                              clearer to the athlete than a list they have to parse.
                            */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                              {m.missing.map(mv => {
                                const nkey = nudgeKey(ath.id, m.weekLabel, m.day.label, mv.name);
                                const sent = nudges.get(nkey);
                                const isOpenComposer = composing && composing.nkey === nkey;
                                return (
                                  <button
                                    key={mv.id || mv.name}
                                    onClick={() => (isOpenComposer ? setComposing(null) : openComposer(ath, m, mv))}
                                    title={sent
                                      ? `Nudged ${new Date(sent.sent_at).toLocaleDateString()} — send another?`
                                      : `Nudge ${ath.name} about this`}
                                    style={{
                                      display: "inline-flex", alignItems: "center", gap: 5,
                                      fontSize: 11, fontWeight: 600, textAlign: "left",
                                      color: sent ? "#3F3F46" : "#7F1D1D",
                                      background: isOpenComposer ? "#FEE2E2" : sent ? "#FAFAFA" : "#FEF2F2",
                                      border: `1px solid ${isOpenComposer ? "#DC2626" : sent ? "#E4E4E7" : "#FECACA"}`,
                                      borderRadius: 6, padding: "3px 8px", wordBreak: "break-word",
                                      cursor: "pointer", fontFamily: "inherit",
                                    }}
                                  >
                                    <span style={{ fontWeight: 800, opacity: 0.6 }}>{mv.category}</span>
                                    <span>{mv.name}</span>
                                    <span style={{ opacity: 0.65, whiteSpace: "nowrap" }}>
                                      {sent
                                        ? `· nudged ${new Date(sent.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                                        : "· nudge"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Draft, edit, send. Never fires straight off the chip. */}
                            {composing && composing.nkey.startsWith(`${ath.id}::${m.key}::`) && (
                              <div style={{ marginTop: 8, padding: 10, background: "#fff", border: "2px solid #DC2626", borderRadius: 8 }}>
                                <div style={{ fontSize: 11, color: "#71717A", marginBottom: 6 }}>
                                  To <b style={{ color: "#18181B" }}>{composing.athlete.name}</b> in Messages, from you · about <b style={{ color: "#18181B" }}>{composing.movement}</b>
                                </div>
                                <textarea
                                  value={composing.text}
                                  onChange={e => setComposing({ ...composing, text: e.target.value })}
                                  rows={3}
                                  style={{
                                    width: "100%", boxSizing: "border-box", fontSize: 13, lineHeight: 1.45,
                                    fontFamily: "inherit", color: "#18181B", padding: 8,
                                    border: "1px solid #D4D4D8", borderRadius: 6, resize: "vertical",
                                  }}
                                />
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                                  <button
                                    onClick={handleSendNudge}
                                    disabled={sending || !composing.text.trim()}
                                    style={{
                                      fontSize: 12, fontWeight: 700, color: "#fff",
                                      background: sending || !composing.text.trim() ? "#FCA5A5" : "#DC2626",
                                      border: "none", borderRadius: 6, padding: "6px 14px",
                                      cursor: sending || !composing.text.trim() ? "default" : "pointer", fontFamily: "inherit",
                                    }}
                                  >
                                    {sending ? "Sending…" : "Send nudge"}
                                  </button>
                                  <button
                                    onClick={() => setComposing(null)}
                                    style={{
                                      fontSize: 12, fontWeight: 700, color: "#52525B", background: "none",
                                      border: "1px solid #E4E4E7", borderRadius: 6, padding: "6px 12px",
                                      cursor: "pointer", fontFamily: "inherit",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  {nudges.get(composing.nkey) && (
                                    <span style={{ fontSize: 11, color: "#A16207" }}>
                                      Already nudged {new Date(nudges.get(composing.nkey).sent_at).toLocaleDateString()} — this sends another.
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            {/*
                              Not every gap is a gap. A tap into a future week that saved a
                              warm-up, a session the numbers were taken on paper for - the only
                              way to clear those used to be typing fake numbers into the
                              athlete's log, which is worse than the alert. This also clears the
                              banner on the athlete's phone; that is the point.
                            */}
                            <button
                              onClick={() => dismissRows([{ ...m, athlete: ath }], `${m.day.label} for ${ath.name}`, bkey)}
                              disabled={busyKey === bkey}
                              style={{
                                marginTop: 7, fontSize: 11, fontWeight: 700, color: "#52525B",
                                background: "#FAFAFA", border: "1px solid #E4E4E7", borderRadius: 6,
                                padding: "4px 10px", cursor: busyKey === bkey ? "default" : "pointer",
                                fontFamily: "inherit", opacity: busyKey === bkey ? 0.5 : 1,
                              }}
                            >
                              {busyKey === bkey ? "Dismissing…" : "Dismiss"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Programming Distribution */}
      <Card style={{ marginBottom: isMobile ? 16 : 24 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Programming Distribution</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#A1A1AA" }}>{totalProgramExercises} total exercise blocks across {programs.length} program{programs.length !== 1 ? "s" : ""}</p>
        <div style={{ display: "flex", gap: isMobile ? 8 : 12, flexWrap: "wrap" }}>
          {cats.map(c => {
            const ct = programCounts[c] || 0;
            const pct = totalProgramExercises ? (ct / totalProgramExercises) * 100 : 0;
            return (
              <div key={c} style={{ flex: isMobile ? "1 1 40%" : 1, textAlign: "center", minWidth: 0 }}>
                <div style={{ height: 10, borderRadius: 5, background: colors[c]?.light, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: colors[c]?.bg, borderRadius: 5, transition: "width .4s" }} />
                </div>
                <Badge color={colors[c]?.bg}>{c}</Badge>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#18181B", marginTop: 4 }}>{ct}</div>
                <div style={{ fontSize: 11, color: "#A1A1AA" }}>{pct.toFixed(0)}%</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Logged Distribution */}
      {logs.length > 0 && (
        <Card style={{ marginBottom: isMobile ? 16 : 24 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Logged Workouts by Category</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#A1A1AA" }}>{logs.length} workouts logged</p>
          <div style={{ display: "flex", gap: isMobile ? 8 : 12, flexWrap: "wrap" }}>
            {cats.map(c => {
              const ct = logCounts[c] || 0;
              const pct = logs.length ? (ct / logs.length) * 100 : 0;
              return (
                <div key={c} style={{ flex: isMobile ? "1 1 40%" : 1, textAlign: "center", minWidth: 0 }}>
                  <div style={{ height: 10, borderRadius: 5, background: colors[c]?.light, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: colors[c]?.bg, borderRadius: 5, transition: "width .4s" }} />
                  </div>
                  <Badge color={colors[c]?.bg}>{c}</Badge>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#18181B", marginTop: 4 }}>{ct}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Recent Activity</h3>
        {recent.length === 0 ? <p style={{ color: "#A1A1AA", fontSize: 14 }}>No workouts logged yet.</p> : recent.map(l => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F4F4F5", fontSize: 14, gap: 8, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Badge color={colors[l.category]?.bg || "#71717A"}>{l.category}</Badge><span>{l.exercise_name}</span></span>
            <span style={{ color: "#71717A", fontSize: 12 }}>{l.athlete_name} · {new Date(l.date).toLocaleDateString()}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
