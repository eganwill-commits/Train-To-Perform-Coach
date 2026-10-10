"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { Modal, Btn } from "./ui";
import { programExercises, findBlock, suggestCue, fetchCueForVideo, saveCueForVideo, removeCue } from "../lib/cues";

/*
  Video feedback, then the cue that carries it forward.

  Step 1 is the feedback itself, saved and sent exactly as before - the cue can never
  hold it up. Step 2 drafts a one-to-two line cue from that feedback, pre-picks the
  exercises it should follow (the filmed one, plus any substitute the program swapped
  in), and waits for the coach to approve or edit it. Nothing reaches the athlete's
  exercise cards until "Approve cue" is pressed.
*/
const keyOf = (e) => e.id || `name:${e.name}`;
const norm = (s) => String(s || "").trim().toLowerCase();

export default function VideoFeedbackModal({ open, video, programs, athleteName, onSaveFeedback, onClose, onCueChanged }) {
  const [step, setStep] = useState("feedback");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [cue, setCue] = useState("");
  const [picked, setPicked] = useState([]); // keys
  const [existing, setExisting] = useState(null);
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [cueBusy, setCueBusy] = useState(false);
  const areaRef = useRef(null);
  const sentFeedback = useRef("");

  const candidates = useMemo(() => programExercises(programs), [programs]);
  const byKey = useMemo(() => new Map(candidates.map(c => [keyOf(c), c])), [candidates]);

  // The exercise that was filmed, as a candidate key.
  const filmedKey = useMemo(() => {
    if (!video) return null;
    const b = findBlock(programs, video.block_id);
    if (b?.exerciseId && byKey.has(b.exerciseId)) return b.exerciseId;
    const n = norm(b?.exerciseName || video.exercise_name);
    const hit = candidates.find(c => norm(c.name) === n);
    return hit ? keyOf(hit) : null;
  }, [video, programs, candidates, byKey]);

  useEffect(() => {
    if (!open) return;
    setStep("feedback");
    setText(video?.coach_feedback || "");
    setSaving(false);
    setCue(""); setPicked([]); setExisting(null); setDraftNote("");
    const t = setTimeout(() => {
      const el = areaRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 60);
    return () => clearTimeout(t);
  }, [open, video]);

  const draft = async (fb, prior) => {
    setDrafting(true);
    setDraftNote("");
    const s = await suggestCue({ feedback: fb, exerciseName: video?.exercise_name, candidates });
    setCue(s.cue);
    const keys = new Set(s.appliesTo.filter(k => byKey.has(k)));
    if (filmedKey) keys.add(filmedKey);
    (prior?.exercise_ids || []).forEach(id => { if (byKey.has(id)) keys.add(id); });
    setPicked([...keys]);
    if (!s.ai) setDraftNote("Couldn't reach the suggestion service, so this is taken straight from your feedback. Edit it down before approving.");
    setDrafting(false);
  };

  const goToCue = async (fb) => {
    setStep("cue");
    const prior = video?.id ? await fetchCueForVideo(video.id) : null;
    const live = prior && prior.active ? prior : null;
    setExisting(live);
    if (live && fb === (video?.coach_feedback || "")) {
      // Feedback unchanged: show the cue he already approved rather than redrafting it.
      setCue(live.cue);
      const keys = new Set();
      (live.exercise_ids || []).forEach(id => { if (byKey.has(id)) keys.add(id); });
      (live.exercise_names || []).forEach(n => { const c = candidates.find(x => norm(x.name) === norm(n)); if (c) keys.add(keyOf(c)); });
      if (!keys.size && filmedKey) keys.add(filmedKey);
      setPicked([...keys]);
      return;
    }
    await draft(fb, live);
  };

  const dirty = (text || "") !== (video?.coach_feedback || "");

  const attemptClose = () => {
    if (saving || cueBusy) return;
    if (step === "feedback" && dirty && !window.confirm("Discard what you've written?")) return;
    onClose();
  };

  const sendFeedback = async () => {
    if (saving || !text.trim()) return;
    setSaving(true);
    try {
      if (dirty || !video?.coach_feedback) await onSaveFeedback(text);
      sentFeedback.current = text;
      setSaving(false);
      await goToCue(text);
    } catch (e) {
      console.error("Video feedback save failed", e);
      setSaving(false);
    }
  };

  const approve = async () => {
    if (cueBusy) return;
    const list = picked.map(k => byKey.get(k)).filter(Boolean);
    if (!cue.trim()) { window.alert("The cue is empty."); return; }
    if (!list.length) { window.alert("Pick at least one exercise for the cue to show on."); return; }
    setCueBusy(true);
    try {
      await saveCueForVideo({ athleteId: video.athlete_id, video, cue, exercises: list });
      if (onCueChanged) onCueChanged();
      onClose();
    } catch (e) {
      window.alert("The cue could not be saved. Your text is still here - try again.");
    } finally {
      setCueBusy(false);
    }
  };

  const remove = async () => {
    if (!existing || cueBusy) return;
    if (!window.confirm("Remove this cue from the athlete's exercise cards?")) return;
    setCueBusy(true);
    try {
      await removeCue(existing.id);
      if (onCueChanged) onCueChanged();
      onClose();
    } catch (e) {
      window.alert("The cue could not be removed - try again.");
    } finally {
      setCueBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); step === "feedback" ? sendFeedback() : approve(); }
  };

  const first = (athleteName || "the athlete").split(" ")[0];
  const unpicked = candidates.filter(c => !picked.includes(keyOf(c))).sort((a, b) => a.name.localeCompare(b.name));

  if (!video) return null;

  return (
    <Modal
      open={open}
      onClose={attemptClose}
      title={step === "feedback" ? (video.coach_feedback ? "Update feedback" : "Add feedback") : "Coach cue"}
    >
      {step === "feedback" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: "#71717A", lineHeight: 1.5 }}>
            {video.exercise_name || "Movement video"}. This is sent to the athlete and rings their bell. Next you&rsquo;ll approve a short cue that shows on this exercise in later sessions.
          </div>
          <textarea
            ref={areaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="What did you see? What should they change next time?"
            rows={9}
            style={taStyle(180)}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={sendFeedback} disabled={saving || !text.trim()}>
              {saving ? "Saving…" : dirty || !video.coach_feedback ? (video.coach_feedback ? "Update feedback" : "Send feedback") : "Next: cue"}
            </Btn>
            <Btn variant="secondary" onClick={attemptClose} disabled={saving}>Cancel</Btn>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#A1A1AA" }}>{"⌘↵"} to save</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 600 }}>✓ Feedback sent.</div>
          <div style={{ fontSize: 12, color: "#71717A", lineHeight: 1.5 }}>
            {existing ? "This is the cue currently on " : "Recommended cue. It will show at the top of "}
            these exercises on every later session, so {first} sees it before the first rep. Edit anything, then approve.
          </div>

          <div>
            <div style={labelStyle}>Cue</div>
            {drafting ? (
              <div style={{ ...taStyle(72), color: "#A1A1AA", display: "flex", alignItems: "center" }}>Drafting a cue from your feedback…</div>
            ) : (
              <textarea value={cue} onChange={e => setCue(e.target.value)} onKeyDown={onKeyDown} rows={3} style={{ ...taStyle(72), background: "#FFFBEB", borderColor: "#FCD34D", fontWeight: 600 }} />
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: cue.length > 180 ? "#B45309" : "#A1A1AA" }}>{cue.length} characters{cue.length > 180 ? " · long for mid-set" : ""}</span>
              {!drafting && (
                <button onClick={() => draft(sentFeedback.current || video.coach_feedback || text, existing)} style={linkBtn}>↻ Suggest again</button>
              )}
            </div>
            {draftNote && <div style={{ fontSize: 11, color: "#B45309", marginTop: 4 }}>{draftNote}</div>}
          </div>

          <div>
            <div style={labelStyle}>Shows on</div>
            {!candidates.length && <div style={{ fontSize: 12, color: "#B45309" }}>No program found for this athlete, so there&rsquo;s nothing to attach the cue to.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {picked.map(k => {
                const c = byKey.get(k);
                if (!c) return null;
                return (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "1px solid #E4E4E7", borderRadius: 8, background: "#fff" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}{k === filmedKey ? <span style={{ fontSize: 10, color: "#71717A", fontWeight: 700, marginLeft: 6 }}>FILMED</span> : null}</div>
                      <div style={{ fontSize: 11, color: "#71717A" }}>{c.firstWeek === c.lastWeek ? c.firstWeek : `${c.firstWeek} to ${c.lastWeek}`} · {c.count} session{c.count === 1 ? "" : "s"}</div>
                    </div>
                    <button onClick={() => setPicked(p => p.filter(x => x !== k))} title="Remove" style={{ background: "none", border: "none", color: "#A1A1AA", fontSize: 15, cursor: "pointer" }}>✕</button>
                  </div>
                );
              })}
            </div>
            {unpicked.length > 0 && (
              <select
                value=""
                onChange={e => { const k = e.target.value; if (k) setPicked(p => [...p, k]); }}
                style={{ marginTop: 6, width: "100%", border: "1px solid #E4E4E7", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#52525B" }}
              >
                <option value="">+ Add another exercise (e.g. a substitute)…</option>
                {unpicked.map(c => <option key={keyOf(c)} value={keyOf(c)}>{c.name} ({c.firstWeek === c.lastWeek ? c.firstWeek : `${c.firstWeek} to ${c.lastWeek}`})</option>)}
              </select>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Btn onClick={approve} disabled={cueBusy || drafting || !cue.trim() || !picked.length}>{cueBusy ? "Saving…" : existing ? "Update cue" : "Approve cue"}</Btn>
            <Btn variant="secondary" onClick={onClose} disabled={cueBusy}>{existing ? "Keep as is" : "Skip cue"}</Btn>
            {existing && <button onClick={remove} disabled={cueBusy} style={{ ...linkBtn, color: "#DC2626", marginLeft: "auto" }}>Remove cue</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}

const labelStyle = { fontSize: 11, fontWeight: 700, color: "#52525B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
const linkBtn = { background: "none", border: "none", padding: 0, color: "#2563EB", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
function taStyle(minHeight) {
  return {
    width: "100%", minHeight, padding: "10px 12px", border: "1px solid #E4E4E7", borderRadius: 8,
    fontSize: 14, fontFamily: "inherit", lineHeight: 1.55, boxSizing: "border-box", resize: "vertical", color: "#18181B",
  };
}
