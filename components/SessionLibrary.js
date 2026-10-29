"use client";
import { useState, useEffect, useMemo } from "react";
import { Btn, Modal, Input } from "./ui";
import {
  WEEKDAYS, fetchTemplates, saveTemplate, deleteTemplate, templateExists, slugify,
  nameFromDayLabel, dateInWeek, buildLabel, insertIntoPrograms, weekIndexForDate, alreadyHas,
} from "../lib/sessionTemplates";

/*
  Session Library UI.

  InsertSessionModal: drop a saved session into this program on a chosen weekday, and
  optionally into other athletes' programs on the same calendar date (a whole folder in
  one go is the "group" case).
  SaveTemplateModal: save any existing day as a reusable session.
*/

const label12 = { fontSize: 12, fontWeight: 600, color: "#52525B", marginBottom: 6 };
const fmtDate = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// "Tucker Carr — Ski Preseason" and "Ski Preseason" are the same folder.
const baseName = (p, athletes) => {
  const ath = (athletes || []).find(a => a.id === p.athlete_id);
  if (ath?.name && (p.name || "").startsWith(ath.name + " — ")) return p.name.slice(ath.name.length + 3).trim().toLowerCase();
  return (p.name || "").trim().toLowerCase();
};

const OPTIONAL_PREFIX = "OPTIONAL. ";
const withOptional = (notes, optional) => {
  const n = (notes || "").replace(/^OPTIONAL[.:·\s-]*\s*/i, "");
  return optional ? OPTIONAL_PREFIX + n : n;
};

export function InsertSessionModal({ open, onClose, program, weekIndex, programs, athletes, updateProgram }) {
  const [templates, setTemplates] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [slug, setSlug] = useState("");
  const [weekday, setWeekday] = useState("Wed");
  const [optional, setOptional] = useState(true);
  const [shared, setShared] = useState(true);
  const [notes, setNotes] = useState("");
  const [targets, setTargets] = useState([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);

  const load = async () => {
    setLoadError("");
    try {
      const t = await fetchTemplates();
      setTemplates(t);
      if (!t.find(x => x.slug === slug)) setSlug(t[0]?.slug || "");
    } catch (e) {
      console.error("fetchTemplates failed", e);
      setLoadError("The session library could not be loaded.");
      setTemplates([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    setResults(null);
    setTargets([program.id]);
    load();
  }, [open, program.id]);

  const tpl = (templates || []).find(t => t.slug === slug);
  // Re-seed the note when the template changes; the coach edits from there.
  useEffect(() => { if (tpl) setNotes(withOptional(tpl.coachNotes, optional)); }, [slug, templates]);

  const date = useMemo(() => dateInWeek(program, weekIndex, weekday), [program, weekIndex, weekday]);
  const label = tpl ? buildLabel({ name: tpl.name, weekday, date, optional }) : "";

  const myBase = baseName(program, athletes);
  const others = useMemo(() => (programs || []).filter(p => p.id !== program.id), [programs, program.id]);
  const folderMates = others.filter(p => baseName(p, athletes) === myBase);
  const rest = others.filter(p => baseName(p, athletes) !== myBase);
  const athName = (p) => (athletes || []).find(a => a.id === p.athlete_id)?.name || "Unassigned";

  // What would happen for a program on this date, shown before the coach commits.
  const statusFor = (p) => {
    if (!tpl) return "";
    const wi = weekIndexForDate(p, date);
    if (wi < 0) return "no week on this date";
    if (alreadyHas(p.weeks?.[wi]?.days, tpl.name, weekday)) return "already has it";
    return "";
  };

  const toggle = (id) => setTargets(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const allFolderOn = folderMates.length > 0 && folderMates.every(p => targets.includes(p.id));

  const run = async () => {
    if (!tpl || targets.length === 0) return;
    setBusy(true);
    const chosen = (programs || []).filter(p => targets.includes(p.id));
    const res = await insertIntoPrograms({ tpl, targets: chosen, date, weekday, optional, coachNotes: notes, shared, updateProgram });
    setBusy(false);
    setResults(res);
  };

  const remove = async (t) => {
    if (!confirm(`Delete "${t.name}" from the session library?\n\nSessions already added to programs stay exactly as they are.`)) return;
    try { await deleteTemplate(t.slug); await load(); }
    catch (e) { console.error(e); alert("That template could not be deleted."); }
  };

  const ProgRow = ({ p, sub }) => {
    const st = statusFor(p);
    const checked = targets.includes(p.id);
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: `1px solid ${checked ? "#18181B" : "#E4E4E7"}`, borderRadius: 8, cursor: "pointer", background: checked ? "#F9FAFB" : "#fff", opacity: st ? 0.6 : 1 }}>
        <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} style={{ accentColor: "#18181B" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{athName(p)}</div>
          <div style={{ fontSize: 11, color: "#71717A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub || p.name}</div>
        </div>
        {st && <span style={{ fontSize: 11, color: "#B45309", fontWeight: 600, whiteSpace: "nowrap" }}>{st}</span>}
      </label>
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Insert Session">
      {results ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{results.filter(r => r.ok).length} of {results.length} added</div>
          {results.map(r => (
            <div key={r.program.id} style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, background: r.ok ? "#F0FDF4" : "#FFF7ED", border: `1px solid ${r.ok ? "#BBF7D0" : "#FED7AA"}` }}>
              <b>{athName(r.program)}</b>{" · "}
              {r.ok ? <span>{r.label}</span> : <span style={{ color: "#9A3412" }}>skipped: {r.reason}</span>}
            </div>
          ))}
          <Btn onClick={onClose}>Done</Btn>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {loadError && <div style={{ color: "#DC2626", fontSize: 13 }}>{loadError}</div>}
          {templates === null ? <div style={{ fontSize: 13, color: "#71717A" }}>Loading library…</div> : templates.length === 0 ? (
            <div style={{ fontSize: 13, color: "#71717A", lineHeight: 1.5 }}>
              The library is empty. Open any session, tap <b>⋯</b> on the day, and choose <b>Save as template</b>.
            </div>
          ) : (
            <>
              <div>
                <div style={label12}>Session</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {templates.map(t => (
                    <label key={t.slug} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${slug === t.slug ? "#18181B" : "#E4E4E7"}`, borderRadius: 8, cursor: "pointer", background: slug === t.slug ? "#F9FAFB" : "#fff" }}>
                      <input type="radio" name="tpl" checked={slug === t.slug} onChange={() => setSlug(t.slug)} style={{ accentColor: "#18181B" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: "#71717A" }}>{t.blocks.length} exercise{t.blocks.length !== 1 ? "s" : ""}{t.minutes ? ` · ~${t.minutes} min` : ""}</div>
                      </div>
                      <button onClick={(e) => { e.preventDefault(); remove(t); }} title="Delete from library" style={{ background: "none", border: "none", color: "#A1A1AA", cursor: "pointer", fontSize: 14 }}>🗑</button>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div style={label12}>Day</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {WEEKDAYS.map(d => (
                    <button key={d} onClick={() => setWeekday(d)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${weekday === d ? "#18181B" : "#E4E4E7"}`, background: weekday === d ? "#18181B" : "#fff", color: weekday === d ? "#fff" : "#52525B", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{d}</button>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "#71717A", marginTop: 6 }}>{fmtDate(date)}</div>
              </div>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={optional} onChange={e => { setOptional(e.target.checked); setNotes(n => withOptional(n, e.target.checked)); }} style={{ accentColor: "#18181B" }} />
                  Optional session
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} style={{ accentColor: "#2563EB" }} />
                  Share coach note with athlete
                </label>
              </div>

              <div>
                <div style={label12}>Coach note</div>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} style={{ width: "100%", padding: "8px 10px", border: "1px solid #E4E4E7", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
              </div>

              <div style={{ fontSize: 12, padding: "8px 10px", background: "#F4F4F5", borderRadius: 8 }}>
                Shows as <b>{label}</b>
              </div>

              <div>
                <div style={label12}>Add to</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <ProgRow p={program} sub={`This program · ${program.name}`} />
                  {folderMates.length > 0 && (
                    <>
                      <button onClick={() => setTargets(prev => allFolderOn ? prev.filter(id => !folderMates.some(p => p.id === id)) : Array.from(new Set([...prev, ...folderMates.map(p => p.id)])))} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: "4px 0", color: "#2563EB", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                        {allFolderOn ? "Clear the rest of this folder" : `Add everyone in this folder (${folderMates.length})`}
                      </button>
                      {folderMates.map(p => <ProgRow key={p.id} p={p} />)}
                    </>
                  )}
                  {rest.length > 0 && (
                    <details>
                      <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#52525B", padding: "4px 0" }}>Other programs ({rest.length})</summary>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, maxHeight: 240, overflowY: "auto" }}>
                        {rest.map(p => <ProgRow key={p.id} p={p} />)}
                      </div>
                    </details>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 6 }}>Placed by calendar date, so it lands on {fmtDate(date)} in every program, whatever week number that is.</div>
              </div>

              <div style={{ position: "sticky", bottom: 0, background: "#fff", paddingTop: 10, borderTop: "1px solid #F4F4F5" }}>
                <Btn disabled={!tpl || targets.length === 0 || busy} onClick={run} style={{ width: "100%" }}>
                  {busy ? "Adding…" : `Add to ${targets.length} program${targets.length !== 1 ? "s" : ""}`}
                </Btn>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

export function SaveTemplateModal({ open, onClose, day }) {
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open || !day) return;
    setName(nameFromDayLabel(day.label));
    setNotes(withOptional(day.coachNotes || "", false));
    setMinutes("");
    setMsg("");
  }, [open, day]);

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const s = slugify(n);
      if (await templateExists(s) && !confirm(`"${n}" is already in the library. Replace it with this session?\n\nSessions already added to programs are not changed.`)) { setBusy(false); return; }
      await saveTemplate({ slug: s, name: n, coachNotes: notes, minutes, blocks: day.blocks || [] });
      setMsg("Saved to the session library.");
      setTimeout(onClose, 900);
    } catch (e) {
      console.error("saveTemplate failed", e);
      setMsg("That could not be saved. Please try again.");
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Save as Template">
      {day && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: "#71717A" }}>{(day.blocks || []).length} exercises from <b>{day.label}</b>. Saving copies them; this session is not changed.</div>
          <Input label="Template name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mobility · Full Menu Stretch" />
          <Input label="Approx. minutes (optional)" type="number" value={minutes} onChange={e => setMinutes(e.target.value)} />
          <div>
            <div style={label12}>Default coach note</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} placeholder="Write it for any athlete: no names or dates." style={{ width: "100%", padding: "8px 10px", border: "1px solid #E4E4E7", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
            <div style={{ fontSize: 11, color: "#A1A1AA", marginTop: 4 }}>Write it generically. You can tailor it each time you insert the session.</div>
          </div>
          {msg && <div style={{ fontSize: 13, fontWeight: 600, color: msg.startsWith("Saved") ? "#16A34A" : "#DC2626" }}>{msg}</div>}
          <Btn disabled={!name.trim() || busy} onClick={save}>{busy ? "Saving…" : "Save to library"}</Btn>
        </div>
      )}
    </Modal>
  );
}
