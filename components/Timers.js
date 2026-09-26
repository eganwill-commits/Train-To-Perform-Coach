"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { Btn, Card } from "./ui";
import TimerRunner from "./TimerRunner";
import { FORMATS, FORMAT_LABEL, DEFAULT_CONFIG, PRESETS, normalizeConfig, summarize, fmt, makeSlug, DEFAULT_VOICE_LINE } from "../lib/timerEngine";

/* Timers: build, save and run station / EMOM / Tabata / AMRAP / For Time / clock
   workouts. Coaches build and share; athletes build their own or customize a
   copy of a shared one. Every saved timer has a no-login TV link: /tv/<code>. */

const FORMAT_COLOR = { stations: "#CC1F1F", emom: "#C8922A", intervals: "#7C3AED", amrap: "#DB2777", fortime: "#2563EB", clock: "#52525B" };
const label = { fontSize: 12, fontWeight: 700, color: "#52525B", display: "flex", flexDirection: "column", gap: 4 };
const field = { border: "1px solid #E4E4E7", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", width: "100%", boxSizing: "border-box", background: "#fff" };

function NumField({ lab, value, onChange, min = 0, suffix, width = 110 }) {
  return (
    <label style={{ ...label, width }}>
      {lab}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" inputMode="numeric" min={min} value={value} onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))} style={field} />
        {suffix && <span style={{ fontSize: 12, color: "#71717A", fontWeight: 600 }}>{suffix}</span>}
      </div>
    </label>
  );
}

function DurField({ lab, seconds, onChange, allowNone }) {
  const m = Math.floor((seconds || 0) / 60), s = (seconds || 0) % 60;
  const set = (mm, ss) => onChange(Math.max(0, (Number(mm) || 0) * 60 + (Number(ss) || 0)));
  return (
    <label style={{ ...label, width: 170 }}>
      {lab}{allowNone && <span style={{ fontWeight: 500, color: "#A1A1AA" }}>0:00 = no cap</span>}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input type="number" inputMode="numeric" min={0} value={m} onChange={e => set(e.target.value, s)} style={{ ...field, width: 70 }} aria-label="minutes" />
        <span style={{ fontWeight: 700 }}>:</span>
        <input type="number" inputMode="numeric" min={0} max={59} value={String(s).padStart(2, "0")} onChange={e => set(m, e.target.value)} style={{ ...field, width: 70 }} aria-label="seconds" />
      </div>
    </label>
  );
}

function MoveList({ title, hint, rows, onChange, listId, placeholder = "Movement" }) {
  const upd = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= rows.length) return; const c = [...rows]; [c[i], c[j]] = [c[j], c[i]]; onChange(c); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#18181B" }}>{title}</div>
        {hint && <div style={{ fontSize: 12, color: "#71717A" }}>{hint}</div>}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,2fr) minmax(0,1.2fr) auto", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#A1A1AA", textAlign: "right" }}>{i + 1}</span>
          <input list={listId} value={r.name} placeholder={placeholder} onChange={e => upd(i, "name", e.target.value)} style={field} />
          <input value={r.detail || ""} placeholder="Load / reps / note" onChange={e => upd(i, "detail", e.target.value)} style={field} />
          <div style={{ display: "flex", gap: 2 }}>
            <button type="button" onClick={() => move(i, -1)} style={iconBtn} aria-label="Move up">↑</button>
            <button type="button" onClick={() => move(i, 1)} style={iconBtn} aria-label="Move down">↓</button>
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} style={{ ...iconBtn, color: "#DC2626" }} aria-label="Remove">✕</button>
          </div>
        </div>
      ))}
      <div><Btn small variant="secondary" onClick={() => onChange([...rows, { name: "", detail: "" }])}>+ Add</Btn></div>
    </div>
  );
}
const shareLink = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #E4E4E7", background: "#fff", borderRadius: 8, padding: "7px 14px", fontWeight: 700, fontSize: 14, color: "#18181B", textDecoration: "none" };
const iconBtn = { border: "1px solid #E4E4E7", background: "#fff", borderRadius: 6, width: 30, height: 34, cursor: "pointer", fontWeight: 700, color: "#52525B", padding: 0 };

function Editor({ draft, setDraft, role, exercises, onSave, onRun, onCancel, saving, libraryCount, onEditVoice }) {
  const c = draft.config;
  const setC = (patch) => setDraft(d => ({ ...d, config: { ...d.config, ...patch } }));
  const changeFormat = (f) => setDraft(d => ({ ...d, format: f, config: { ...DEFAULT_CONFIG[f], movements: d.config.movements?.length ? d.config.movements : DEFAULT_CONFIG[f].movements, warmup: d.config.warmup || [], countdown: d.config.countdown ?? 10 } }));
  const [showWarm, setShowWarm] = useState((c.warmup || []).length > 0);
  const names = useMemo(() => Array.from(new Set((exercises || []).map(e => e.name).filter(Boolean))).sort(), [exercises]);
  const f = draft.format;

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <datalist id="t2p-ex-names">{names.map(n => <option key={n} value={n} />)}</datalist>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ ...label, flex: "1 1 260px" }}>Name
          <input value={draft.name} placeholder="e.g. Fifty And Fit · Stations" onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={field} />
        </label>
        <label style={{ ...label, width: 200 }}>Countdown before start
          <select value={c.countdown ?? 10} onChange={e => setC({ countdown: Number(e.target.value) })} style={field}>
            {[0, 5, 10, 15, 20, 30].map(v => <option key={v} value={v}>{v ? `:${String(v).padStart(2, "0")}` : "None"}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start", background: "#FAFAFA", border: "1px solid #F4F4F5", borderRadius: 10, padding: 12 }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={c.beeps !== false} onChange={e => setC({ beeps: e.target.checked })} style={{ width: 18, height: 18 }} />
          3-2-1 countdown beeps
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={!!c.voice} onChange={e => setC({ voice: e.target.checked })} style={{ width: 18, height: 18 }} />
          Voice call on "Go"
        </label>
        {c.voice && (
          <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
              <input type="radio" name="voiceSource" checked={c.voiceSource !== "custom"} onChange={() => setC({ voiceSource: "library" })} />
              <span><b>Voice line library</b> · a random line from {libraryCount != null ? `${libraryCount} lines` : "your list"} each time</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
              <input type="radio" name="voiceSource" checked={c.voiceSource === "custom"} onChange={() => setC({ voiceSource: "custom", voiceLines: c.voiceLines && c.voiceLines.length ? c.voiceLines : [DEFAULT_VOICE_LINE] })} />
              <span><b>Custom lines</b> for this timer only</span>
            </label>
            {c.voiceSource === "custom" && (
              <textarea rows={3} aria-label="Custom voice lines, one per line" value={(c.voiceLines || []).join("\n")}
                onChange={e => setC({ voiceLines: e.target.value.split("\n") })} style={{ ...field, resize: "vertical", fontFamily: "inherit" }} />
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "#71717A" }}>
              <Btn small variant="secondary" onClick={() => testVoice(c.voiceSource === "custom" ? c.voiceLines : null)}>▶ Test voice</Btn>
              {role === "coach" && c.voiceSource !== "custom" && onEditVoice && <Btn small variant="ghost" onClick={onEditVoice}>Edit voice lines</Btn>}
              Uses the device's built-in voice.
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FORMATS.map(o => (
          <button key={o.value} type="button" onClick={() => changeFormat(o.value)} style={{
            border: `2px solid ${f === o.value ? FORMAT_COLOR[o.value] : "#E4E4E7"}`, background: f === o.value ? FORMAT_COLOR[o.value] : "#fff",
            color: f === o.value ? "#fff" : "#18181B", borderRadius: 999, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>{o.label}</button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: "#71717A", marginTop: -8 }}>{FORMATS.find(o => o.value === f)?.blurb}</div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {f === "stations" && <>
          <NumField lab="Work" value={c.work} onChange={v => setC({ work: v })} suffix="sec" min={1} />
          <NumField lab="Transition" value={c.rest} onChange={v => setC({ rest: v })} suffix="sec" />
          <NumField lab="Rounds" value={c.rounds} onChange={v => setC({ rounds: v })} min={1} width={90} />
          <NumField lab="Rest between rounds" value={c.roundRest} onChange={v => setC({ roundRest: v })} suffix="sec" width={160} />
        </>}
        {f === "emom" && <>
          <label style={{ ...label, width: 170 }}>Every
            <select value={[60, 120, 180, 30, 45, 90].includes(c.interval) ? c.interval : "custom"} onChange={e => e.target.value !== "custom" && setC({ interval: Number(e.target.value) })} style={field}>
              <option value={60}>1:00 (EMOM)</option><option value={120}>2:00 (E2MOM)</option><option value={180}>3:00 (E3MOM)</option>
              <option value={30}>0:30</option><option value={45}>0:45</option><option value={90}>1:30</option>
              {![60, 120, 180, 30, 45, 90].includes(c.interval) && <option value="custom">{fmt(c.interval)}</option>}
            </select>
          </label>
          <NumField lab="Intervals" value={c.rounds} onChange={v => setC({ rounds: v })} min={1} width={100} />
        </>}
        {f === "intervals" && <>
          <NumField lab="Work" value={c.work} onChange={v => setC({ work: v })} suffix="sec" min={1} />
          <NumField lab="Rest" value={c.rest} onChange={v => setC({ rest: v })} suffix="sec" />
          <NumField lab="Rounds" value={c.rounds} onChange={v => setC({ rounds: v })} min={1} width={90} />
          <NumField lab="Sets" value={c.sets} onChange={v => setC({ sets: v })} min={1} width={80} />
          {c.sets > 1 && <NumField lab="Rest between sets" value={c.setRest} onChange={v => setC({ setRest: v })} suffix="sec" width={150} />}
          <div style={{ alignSelf: "flex-end" }}><Btn small variant="secondary" onClick={() => setC({ work: 20, rest: 10, rounds: 8 })}>Tabata 20/10 × 8</Btn></div>
        </>}
        {f === "amrap" && <DurField lab="Time" seconds={c.cap} onChange={v => setC({ cap: v })} />}
        {f === "fortime" && <DurField lab="Time cap" seconds={c.cap} onChange={v => setC({ cap: v })} allowNone />}
      </div>

      {f !== "clock" && (
        <MoveList
          title={f === "stations" ? "Stations" : f === "emom" ? "Movements" : f === "intervals" ? "Movements (optional)" : "Workout"}
          hint={f === "stations" ? "One per station, in rotation order" : f === "emom" ? "Rotates each interval: 1, 2, 3, 1…" : f === "intervals" ? "Rotates each round" : "Shown next to the clock"}
          rows={c.movements || []} onChange={rows => setC({ movements: rows })} listId="t2p-ex-names"
        />
      )}

      {showWarm ? (
        <MoveList title="Warm-up (shown on screen)" rows={c.warmup || []} onChange={rows => setC({ warmup: rows })} listId="t2p-ex-names" placeholder="Warm-up movement" />
      ) : (
        <div><Btn small variant="ghost" onClick={() => { setShowWarm(true); if (!(c.warmup || []).length) setC({ warmup: [{ name: "", detail: "" }] }); }}>+ Add a warm-up list</Btn></div>
      )}

      {role === "coach" && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={!!draft.shared} onChange={e => setDraft(d => ({ ...d, shared: e.target.checked }))} style={{ width: 18, height: 18 }} />
          Share with athletes (they can run it or customize a copy)
        </label>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", borderTop: "1px solid #F4F4F5", paddingTop: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{summarize(f, c)}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="secondary" onClick={onRun}>Run without saving</Btn>
          {onSave && <Btn variant="accent" onClick={onSave} disabled={saving}>{saving ? "Saving…" : draft.id ? "Save changes" : "Save"}</Btn>}
        </div>
      </div>
    </Card>
  );
}

// Speak one random line with the device voice. lines = null -> pull from the library.
async function testVoice(lines) {
  try {
    let list = (lines || []).map(x => (x || "").trim()).filter(Boolean);
    if (!lines) {
      const [{ data }, { data: vs }] = await Promise.all([supabase.from("voice_lines").select("text, audio_url, audio_key").eq("enabled", true), supabase.from("app_settings").select("value").eq("key", "voice").maybeSingle()]);
      const vid = vs?.value?.voice_id;
      const pick = (data || [])[Math.floor(Math.random() * (data || []).length)];
      if (pick && vid && pick.audio_url && pick.audio_key === `${vid}|${pick.text.trim()}`) { new Audio(pick.audio_url).play().catch(() => {}); return; }
      list = pick ? [pick.text] : [];
    }
    const text = list[Math.floor(Math.random() * list.length)] || DEFAULT_VOICE_LINE;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(text));
  } catch {}
}

function shareText(t, url) {
  const c = normalizeConfig(t.format, t.config);
  const lines = [`${t.name}`, summarize(t.format, c), ""];
  const warm = (c.warmup || []).filter(m => (m.name || "").trim());
  const mv = (c.movements || []).filter(m => (m.name || "").trim());
  if (warm.length) { lines.push("Warm-up:"); warm.forEach((m, i) => lines.push(`${i + 1}. ${m.name}${m.detail ? " (" + m.detail + ")" : ""}`)); lines.push(""); }
  if (mv.length) { lines.push(t.format === "stations" ? "Stations:" : "Workout:"); mv.forEach((m, i) => lines.push(`${i + 1}. ${m.name}${m.detail ? " (" + m.detail + ")" : ""}`)); lines.push(""); }
  lines.push("Open the timer (any phone, laptop or TV browser, no login):", url);
  return lines.join("\n");
}

function TimerCard({ t, mine, role, ownerName, onRun, onEdit, onCopy, onDelete, onShareToggle }) {
  const [tvOpen, setTvOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/tv/${t.slug}` : `/tv/${t.slug}`;
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  return (
    <Card style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.25, wordBreak: "break-word" }}>{t.name}</div>
          <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>{summarize(t.format, t.config)}</div>
        </div>
        <span style={{ background: FORMAT_COLOR[t.format], color: "#fff", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{FORMAT_LABEL[t.format]}</span>
      </div>
      {(ownerName || (role === "coach" && t.created_by_role === "coach")) && (
        <div style={{ fontSize: 12, color: "#71717A" }}>
          {ownerName ? `Built by ${ownerName}` : t.shared ? "Shared with athletes" : "Coach only"}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Btn small onClick={onRun}>▶ Run</Btn>
        {mine && <Btn small variant="secondary" onClick={onEdit}>Edit</Btn>}
        <Btn small variant="secondary" onClick={onCopy}>{mine ? "Duplicate" : "Customize"}</Btn>
        <Btn small variant="secondary" onClick={async () => {
          const text = shareText(t, url);
          if (navigator.share) { try { await navigator.share({ title: t.name, text }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
          setShareOpen(o => !o); setTvOpen(false);
        }}>↗ Share</Btn>
        <Btn small variant="secondary" onClick={() => { setTvOpen(o => !o); setShareOpen(false); }}>📺 TV link</Btn>
        {role === "coach" && t.created_by_role === "coach" && <Btn small variant="ghost" onClick={onShareToggle}>{t.shared ? "Hide from athletes" : "Show to athletes"}</Btn>}
        {mine && <Btn small variant="danger" onClick={onDelete}>Delete</Btn>}
      </div>
      {shareOpen && (
        <div style={{ background: "#FAFAFA", border: "1px solid #E4E4E7", borderRadius: 8, padding: 12, fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "#52525B" }}>Send this workout to anyone. The link opens the timer on any phone, laptop or TV, no login needed.</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <a href={`sms:?&body=${encodeURIComponent(`${t.name}: ${url}`)}`} style={shareLink}>💬 Text</a>
            <a href={`mailto:?subject=${encodeURIComponent(t.name + " · T2P workout")}&body=${encodeURIComponent(shareText(t, url))}`} style={shareLink}>✉ Email</a>
            <button type="button" onClick={copy} style={{ ...shareLink, cursor: "pointer", fontFamily: "inherit" }}>{copied ? "✓ Copied" : "🔗 Copy link"}</button>
          </div>
        </div>
      )}
      {tvOpen && (
        <div style={{ background: "#FAFAFA", border: "1px solid #E4E4E7", borderRadius: 8, padding: 12, fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ fontSize: 14, fontWeight: 700, wordBreak: "break-all", userSelect: "all" }}>{url.replace(/^https?:\/\//, "")}</code>
            <Btn small variant="secondary" onClick={copy}>{copied ? "Copied" : "Copy"}</Btn>
          </div>
          <div style={{ color: "#52525B", lineHeight: 1.5 }}>
            No login needed. Open it in the TV's browser (Fire TV Silk, Google TV, smart TV), or open it on your phone or laptop and AirPlay / cast to the TV. On the TV you can also go to <b>{typeof window !== "undefined" ? window.location.host : ""}/tv</b> and enter code <b style={{ fontFamily: "monospace", fontSize: 15 }}>{t.slug}</b>.
          </div>
        </div>
      )}
    </Card>
  );
}

const VOICE_CATS = ["Hype", "Grit", "Team", "Other"];

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const t = data?.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
let _player = null;
function playUrl(url) { try { if (_player) _player.pause(); _player = new Audio(url); _player.play().catch(() => {}); } catch {} }
function sayDevice(text) { try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new window.SpeechSynthesisUtterance(text)); } catch {} }

function VoicePicker({ current, onPick, onClose }) {
  const [voices, setVoices] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/voice", { headers: await authHeader() });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setErr(j.message || (r.status === 401 ? "Sign in as the coach to choose a voice." : "Couldn't load voices.")); setVoices([]); return; }
        setVoices(j.voices || []);
      } catch { setErr("Couldn't reach the voice service."); setVoices([]); }
    })();
  }, []);
  const shown = (voices || []).filter(v => !q || `${v.name} ${v.description} ${v.accent} ${v.gender} ${v.use}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ border: "1px solid #E4E4E7", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "#FAFAFA" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search voices (deep, british, announcer…)" style={{ ...field, flex: "1 1 220px" }} />
        <Btn small variant="ghost" onClick={onClose}>Cancel</Btn>
      </div>
      {err && <div style={{ color: "#B91C1C", fontSize: 13, fontWeight: 600 }}>{err}</div>}
      {!voices ? <div style={{ color: "#A1A1AA", fontSize: 13 }}>Loading voices…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8, maxHeight: 360, overflow: "auto" }}>
          {shown.map(v => (
            <div key={v.id} style={{ background: "#fff", border: `2px solid ${current === v.id ? "#F97316" : "#E4E4E7"}`, borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 800 }}>{v.name}</div>
              <div style={{ fontSize: 12, color: "#71717A", lineHeight: 1.4 }}>{[v.gender, v.age, v.accent, v.use].filter(Boolean).join(" · ")}{v.description ? ` — ${v.description}` : ""}</div>
              <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                {v.preview && <Btn small variant="secondary" onClick={() => playUrl(v.preview)}>▶ Sample</Btn>}
                <Btn small variant={current === v.id ? "accent" : "primary"} onClick={() => onPick(v)}>{current === v.id ? "Selected" : "Use this voice"}</Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VoiceLibrary({ onClose, onSaved }) {
  const [rows, setRows] = useState(null);
  const [removed, setRemoved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [voice, setVoice] = useState(null);        // { voice_id, voice_name }
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState(null);  // { done, total }
  const loadRows = async () => { const { data } = await supabase.from("voice_lines").select("*").order("sort"); setRows(data || []); return data || []; };
  useEffect(() => {
    loadRows();
    supabase.from("app_settings").select("value").eq("key", "voice").maybeSingle().then(({ data }) => setVoice(data?.value || {}));
  }, []);
  const upd = (i, patch) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i, d) => setRows(r => { const j = i + d; if (j < 0 || j >= r.length) return r; const c = [...r]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const keyFor = (text, vid) => `${vid}|${(text || "").trim()}`;
  const isCurrent = (r) => voice?.voice_id && r.audio_url && r.audio_key === keyFor(r.text, voice.voice_id);
  const play = (r) => (isCurrent(r) ? playUrl(r.audio_url) : sayDevice(r.text));

  // Record every enabled line that has no clip in the current voice (or whose wording changed).
  const record = async (list, vid, vname) => {
    if (!vid) return;
    const todo = list.filter(r => r.id && r.enabled && (r.text || "").trim() && r.audio_key !== keyFor(r.text, vid));
    if (!todo.length) return;
    const headers = { "Content-Type": "application/json", ...(await authHeader()) };
    setProgress({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      const res = await fetch("/api/voice", { method: "POST", headers, body: JSON.stringify({ text: r.text, voice_id: vid }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setProgress(null); setMsg("Couldn't record voice clips: " + (j.message || res.status)); return; }
      const blob = await res.blob();
      const path = `${r.id}-${Date.now()}.mp3`;
      const up = await supabase.storage.from("voice-lines").upload(path, blob, { contentType: "audio/mpeg", upsert: false });
      if (up.error) { setProgress(null); setMsg("Couldn't store a voice clip: " + up.error.message); return; }
      const url = supabase.storage.from("voice-lines").getPublicUrl(path).data.publicUrl;
      await supabase.from("voice_lines").update({ audio_url: url, audio_key: keyFor(r.text, vid) }).eq("id", r.id);
      setProgress({ done: i + 1, total: todo.length });
    }
    setProgress(null);
    await loadRows();
    setMsg(`Done. All lines are recorded in ${vname || voice?.voice_name || "the new voice"}.`);
  };

  const pickVoice = async (v) => {
    const value = { voice_id: v.id, voice_name: v.name };
    setVoice(value); setPicking(false); setMsg("");
    await supabase.from("app_settings").upsert({ key: "voice", value, updated_at: new Date().toISOString() });
    await record(rows || [], v.id, v.name);
  };

  const save = async () => {
    setSaving(true); setMsg("");
    const keep = rows.map((r, i) => ({ ...r, text: (r.text || "").trim(), sort: i + 1 })).filter(r => r.text);
    if (removed.length) await supabase.from("voice_lines").delete().in("id", removed);
    const existing = keep.filter(r => r.id).map(({ id, text, category, enabled, sort }) => ({ id, text, category, enabled, sort }));
    const fresh = keep.filter(r => !r.id).map(({ text, category, enabled, sort }) => ({ text, category, enabled, sort }));
    const e1 = existing.length ? (await supabase.from("voice_lines").upsert(existing)).error : null;
    const e2 = fresh.length ? (await supabase.from("voice_lines").insert(fresh)).error : null;
    setSaving(false);
    if (e1 || e2) { setMsg("Couldn't save: " + (e1 || e2).message); return; }
    const data = await loadRows();
    setRemoved([]); setMsg("Saved.");
    onSaved && onSaved();
    if (voice?.voice_id) await record(data, voice.voice_id);
  };

  if (!rows) return <Card><div style={{ color: "#A1A1AA" }}>Loading…</div></Card>;
  const on = rows.filter(r => r.enabled && (r.text || "").trim()).length;
  const missing = voice?.voice_id ? rows.filter(r => r.id && r.enabled && (r.text || "").trim() && !isCurrent(r)).length : 0;
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Voice lines</div>
          <div style={{ fontSize: 13, color: "#71717A", marginTop: 2 }}>When a work interval starts, the timer says one of these at random. {on} line{on === 1 ? "" : "s"} on. Untick a line to rest it without deleting it.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
          <Btn variant="accent" onClick={save} disabled={saving || !!progress}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#18181B", color: "#fff", borderRadius: 10, padding: "10px 14px" }}>
        <span style={{ fontSize: 13, color: "#A1A1AA", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Voice</span>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{voice?.voice_name || "Device voice (built in)"}</span>
        <span style={{ fontSize: 12, color: "#A1A1AA" }}>{voice?.voice_id ? "Recorded once, sounds the same on every device" : "Pick a character voice to record your lines"}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {voice?.voice_id && missing > 0 && !progress && <Btn small variant="secondary" onClick={() => record(rows, voice.voice_id)}>Record {missing} missing</Btn>}
          <Btn small variant="accent" onClick={() => setPicking(p => !p)}>{voice?.voice_id ? "Change voice" : "Choose voice"}</Btn>
        </div>
      </div>
      {picking && <VoicePicker current={voice?.voice_id} onPick={pickVoice} onClose={() => setPicking(false)} />}
      {progress && <div style={{ fontSize: 13, fontWeight: 700, color: "#C2410C" }}>Recording line {progress.done + 1 > progress.total ? progress.total : progress.done + 1} of {progress.total}… keep this page open.</div>}
      {msg && <div style={{ fontSize: 13, color: msg.startsWith("Couldn't") ? "#B91C1C" : "#15803D", fontWeight: 600 }}>{msg}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r, i) => (
          <div key={r.id || "n" + i} style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr) 110px auto", gap: 6, alignItems: "center", opacity: r.enabled ? 1 : 0.5 }}>
            <input type="checkbox" checked={!!r.enabled} onChange={e => upd(i, { enabled: e.target.checked })} style={{ width: 18, height: 18 }} aria-label="Use this line" />
            <input value={r.text} onChange={e => upd(i, { text: e.target.value })} placeholder="Type a line…" style={field} />
            <select value={r.category || "Hype"} onChange={e => upd(i, { category: e.target.value })} style={field}>{VOICE_CATS.map(c => <option key={c}>{c}</option>)}</select>
            <div style={{ display: "flex", gap: 2 }}>
              <button type="button" onClick={() => play(r)} style={{ ...iconBtn, color: isCurrent(r) ? "#F97316" : "#52525B" }} aria-label="Play" title={isCurrent(r) ? "Play recorded clip" : "Play with device voice (not recorded yet)"}>▶</button>
              <button type="button" onClick={() => move(i, -1)} style={iconBtn} aria-label="Move up">↑</button>
              <button type="button" onClick={() => move(i, 1)} style={iconBtn} aria-label="Move down">↓</button>
              <button type="button" onClick={() => { if (r.id) setRemoved(x => [...x, r.id]); setRows(rs => rs.filter((_, j) => j !== i)); }} style={{ ...iconBtn, color: "#DC2626" }} aria-label="Delete">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div><Btn small variant="secondary" onClick={() => setRows(r => [...r, { text: "", category: "Hype", enabled: true }])}>+ Add line</Btn></div>
    </Card>
  );
}

export default function Timers({ role = "coach", athlete, athletes = [], exercises = [], isMobile, readOnly }) {
  const [timers, setTimers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const [running, setRunning] = useState(null);
  const [saving, setSaving] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [libraryCount, setLibraryCount] = useState(null);
  const canWrite = !readOnly;
  const loadVoiceCount = useCallback(async () => {
    const { count } = await supabase.from("voice_lines").select("id", { count: "exact", head: true }).eq("enabled", true);
    setLibraryCount(count ?? null);
  }, []);
  useEffect(() => { loadVoiceCount(); }, [loadVoiceCount]);
  const athleteName = useMemo(() => Object.fromEntries((athletes || []).map(a => [a.id, a.name])), [athletes]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("timers").select("*").order("updated_at", { ascending: false });
    if (role === "athlete") q = q.or(`athlete_id.eq.${athlete.id},and(created_by_role.eq.coach,shared.eq.true)`);
    const { data, error: e } = await q;
    if (e) setError("Couldn't load timers. Check your connection and reload.");
    setTimers(data || []);
    setLoading(false);
  }, [role, athlete]);
  useEffect(() => { load(); }, [load]);

  const isMine = (t) => (role === "coach" ? t.created_by_role === "coach" : t.athlete_id === athlete?.id);

  const newDraft = (preset) => setDraft({
    name: preset ? preset.name : "",
    format: preset ? preset.format : "stations",
    config: preset ? JSON.parse(JSON.stringify(preset.config)) : JSON.parse(JSON.stringify(DEFAULT_CONFIG.stations)),
    shared: role === "coach",
  });

  const save = async () => {
    if (!canWrite) return;
    setSaving(true); setError("");
    const config = normalizeConfig(draft.format, draft.config);
    config.movements = config.movements.filter(m => (m.name || "").trim());
    config.warmup = config.warmup.filter(m => (m.name || "").trim());
    const row = {
      name: (draft.name || "").trim() || FORMAT_LABEL[draft.format],
      format: draft.format, config,
      shared: role === "coach" ? !!draft.shared : false,
      updated_at: new Date().toISOString(),
    };
    let res;
    if (draft.id) res = await supabase.from("timers").update(row).eq("id", draft.id).select().single();
    else {
      for (let tries = 0; tries < 4; tries++) {
        res = await supabase.from("timers").insert({ ...row, slug: makeSlug(), created_by_role: role, athlete_id: role === "athlete" ? athlete.id : null }).select().single();
        if (!res.error || !String(res.error.message || "").includes("slug")) break;
      }
    }
    setSaving(false);
    if (res.error) { setError("Couldn't save the timer: " + res.error.message); return; }
    setDraft(null);
    load();
  };

  const copyToDraft = (t) => setDraft({ name: t.name + (isMine(t) ? " (copy)" : ""), format: t.format, config: normalizeConfig(t.format, JSON.parse(JSON.stringify(t.config || {}))), shared: role === "coach" });
  const del = async (t) => { if (!canWrite || !confirm(`Delete "${t.name}"? Its TV link will stop working.`)) return; await supabase.from("timers").delete().eq("id", t.id); load(); };
  const toggleShare = async (t) => { if (!canWrite) return; await supabase.from("timers").update({ shared: !t.shared }).eq("id", t.id); load(); };

  if (running) return <TimerRunner timer={running} onExit={() => setRunning(null)} />;

  const mine = timers.filter(isMine);
  const others = timers.filter(t => !isMine(t));
  const grid = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 };
  const h2 = { fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#71717A", margin: "8px 0 0" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1200 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, letterSpacing: 1, lineHeight: 1, margin: 0 }}>Timers</h1>
          <p style={{ color: "#71717A", fontSize: 14, marginTop: 4 }}>Stations, EMOM, Tabata, AMRAP, For Time and a running clock. Run on your phone or put it on the gym TV.</p>
        </div>
        {!draft && !voiceOpen && canWrite && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {role === "coach" && <Btn variant="secondary" onClick={() => setVoiceOpen(true)}>🎙 Voice lines</Btn>}
            <Btn variant="accent" onClick={() => newDraft()}>+ New timer</Btn>
          </div>
        )}
      </div>

      {error && <div style={{ background: "#FEF2F2", color: "#B91C1C", padding: "10px 14px", borderRadius: 8, fontSize: 14 }}>{error}</div>}

      {voiceOpen && role === "coach" ? (
        <VoiceLibrary onClose={() => setVoiceOpen(false)} onSaved={loadVoiceCount} />
      ) : draft ? (
        <Editor draft={draft} setDraft={setDraft} role={role} exercises={exercises} saving={saving}
          libraryCount={libraryCount} onEditVoice={canWrite ? () => setVoiceOpen(true) : null}
          onSave={canWrite ? save : null}
          onRun={() => setRunning({ name: draft.name || FORMAT_LABEL[draft.format], format: draft.format, config: draft.config })}
          onCancel={() => setDraft(null)} />
      ) : (
        <>
          <div>
            <div style={h2}>Quick start</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {PRESETS.map(p => (
                <button key={p.name} type="button" onClick={() => newDraft(p)} style={{ border: `1px solid #E4E4E7`, borderLeft: `4px solid ${FORMAT_COLOR[p.format]}`, background: "#fff", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>{p.name}</button>
              ))}
            </div>
          </div>

          <div style={h2}>{role === "coach" ? "Your timers" : "My timers"}</div>
          {loading ? <div style={{ color: "#A1A1AA", fontSize: 14 }}>Loading…</div> : mine.length === 0 ? (
            <div style={{ color: "#71717A", fontSize: 14 }}>None yet. Pick a quick start above or build a new one.</div>
          ) : (
            <div style={grid}>
              {mine.map(t => <TimerCard key={t.id} t={t} mine={canWrite} role={role} onRun={() => setRunning(t)} onEdit={() => setDraft({ id: t.id, name: t.name, format: t.format, config: normalizeConfig(t.format, JSON.parse(JSON.stringify(t.config || {}))), shared: t.shared })} onCopy={() => copyToDraft(t)} onDelete={() => del(t)} onShareToggle={() => toggleShare(t)} />)}
            </div>
          )}

          {others.length > 0 && <>
            <div style={h2}>{role === "coach" ? "Built by athletes" : "From your coach"}</div>
            <div style={grid}>
              {others.map(t => <TimerCard key={t.id} t={t} mine={false} role={role} ownerName={role === "coach" ? (athleteName[t.athlete_id] || "Athlete") : null} onRun={() => setRunning(t)} onCopy={() => canWrite && copyToDraft(t)} />)}
            </div>
          </>}
        </>
      )}
    </div>
  );
}
