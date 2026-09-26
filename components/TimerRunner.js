"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { buildSegments, normalizeConfig, summarize, fmt } from "../lib/timerEngine";
import { LOGO_SRC } from "./T2PLogo";

/* Full-screen, T2P-branded timer. Used inside the app (as an overlay) and on the
   public /tv/<code> page. Everything is laid out on a fixed 1920x1080 stage that
   scales to the screen, so it fits any TV browser or a mirrored phone/laptop. */

const CSS = `
.t2pt-root{position:fixed;inset:0;z-index:5000;background:#1a1a1a;color:#f2f2f2;font-family:'DM Sans',system-ui,sans-serif;overflow:hidden}
.t2pt-stage{position:absolute;left:50%;top:0;width:1920px;height:1080px;box-sizing:border-box;padding:36px 52px 44px;transform-origin:top center;display:grid;grid-template-rows:auto 1fr;gap:26px}
.t2pt-head{display:flex;align-items:center;gap:24px;border-bottom:3px solid #2b2b2b;padding-bottom:16px;min-width:0}
.t2pt-brand{display:flex;align-items:center;gap:14px;flex-shrink:0}
.t2pt-brand img{height:58px;width:auto}
.t2pt-brand span{font-family:'Bebas Neue',Impact,sans-serif;font-size:40px;letter-spacing:.08em;line-height:1}
.t2pt-brand b{color:#cc1f1f;font-weight:400}
.t2pt-name{font-family:'Bebas Neue',Impact,sans-serif;font-size:64px;line-height:1;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1;border-left:3px solid #2b2b2b;padding-left:24px}
.t2pt-sum{font-family:'Bebas Neue',Impact,sans-serif;font-size:36px;letter-spacing:.06em;color:#888;white-space:nowrap}
.t2pt-body{display:grid;gap:36px;min-height:0}
.t2pt-col{display:flex;flex-direction:column;gap:12px;min-height:0;min-width:0}
.t2pt-h2{font-family:'Bebas Neue',Impact,sans-serif;font-size:36px;letter-spacing:.12em;color:#888;margin:0;display:flex;justify-content:space-between;align-items:baseline}
.t2pt-h2 small{font-size:24px;color:#c8922a;letter-spacing:.08em}
.t2pt-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;flex:1;min-height:0}
.t2pt-li{flex:1;min-height:0;max-height:150px;display:grid;grid-template-columns:1.3em 1fr auto;align-items:center;gap:.5em;background:#2b2b2b;border-radius:8px;padding:0 22px;border-left:8px solid transparent;transition:background .2s,border-color .2s}
.t2pt-li .n{font-family:'Bebas Neue',Impact,sans-serif;color:#888}
.t2pt-li .nm{font-weight:700;line-height:1.08;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.t2pt-li .dt{font-weight:500;color:#888;white-space:nowrap;font-size:.72em}
.t2pt-li.on{background:#cc1f1f;border-left-color:#f2f2f2}
.t2pt-li.on .n,.t2pt-li.on .dt{color:#ffd9d9}
.t2pt-li.next{border-left-color:#c8922a}
.t2pt-warm .t2pt-li{font-size:26px}
.t2pt-moves .t2pt-li{font-size:42px}
.t2pt-clock{background:#232323;border-radius:14px;border-top:12px solid #444;padding:28px 34px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;min-height:0}
.t2pt-phase{font-family:'Bebas Neue',Impact,sans-serif;font-size:72px;line-height:1;letter-spacing:.06em;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t2pt-time{font-family:'Bebas Neue',Impact,sans-serif;font-size:300px;line-height:.8;letter-spacing:.01em;font-variant-numeric:tabular-nums}
.t2pt-sub{font-size:38px;font-weight:700;line-height:1.15;min-height:1.15em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t2pt-sub span{color:#888;font-weight:500}
.t2pt-bar{height:16px;background:#444;border-radius:8px;overflow:hidden}
.t2pt-bar i{display:block;height:100%;width:0;background:#f2f2f2;transition:width .2s linear}
.t2pt-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.t2pt-meta div{display:flex;flex-direction:column;gap:4px}
.t2pt-meta span{font-size:20px;text-transform:uppercase;letter-spacing:.12em;color:#888}
.t2pt-meta strong{font-family:'Bebas Neue',Impact,sans-serif;font-weight:400;font-size:70px;line-height:1;font-variant-numeric:tabular-nums}
.t2pt-ctl{display:flex;gap:10px;flex-wrap:wrap}
.t2pt-btn{font-family:'Bebas Neue',Impact,sans-serif;font-size:34px!important;letter-spacing:.08em;border:3px solid #444;background:transparent;color:#f2f2f2;border-radius:8px;padding:.18em .7em;cursor:pointer;line-height:1.1}
.t2pt-btn.pri{background:#f2f2f2;color:#1a1a1a;border-color:#f2f2f2}
.t2pt-btn.red{background:#cc1f1f;border-color:#cc1f1f}
.t2pt-btn:focus-visible,.t2pt-btn:focus{outline:5px solid #c8922a;outline-offset:3px}
.t2pt-root.k-ready .t2pt-clock{border-top-color:#c8922a}.t2pt-root.k-ready .t2pt-phase{color:#c8922a}
.t2pt-root.k-work .t2pt-clock,.t2pt-root.k-cap .t2pt-clock,.t2pt-root.k-up .t2pt-clock{border-top-color:#cc1f1f}
.t2pt-root.k-work .t2pt-phase,.t2pt-root.k-cap .t2pt-phase,.t2pt-root.k-up .t2pt-phase{color:#ff4d4d}
.t2pt-root.k-rest .t2pt-clock,.t2pt-root.k-roundrest .t2pt-clock{border-top-color:#e0e0e0}
.t2pt-root.k-rest .t2pt-phase,.t2pt-root.k-roundrest .t2pt-phase{color:#e0e0e0}
.t2pt-root.k-rest .t2pt-time,.t2pt-root.k-roundrest .t2pt-time{color:#c8922a}
.t2pt-root.k-ready .t2pt-time{color:#c8922a}
.t2pt-root.k-done .t2pt-clock{border-top-color:#c8922a}.t2pt-root.k-done .t2pt-phase{color:#c8922a}
.t2pt-root.solo .t2pt-time{font-size:480px}
.t2pt-root.solo .t2pt-clock{align-items:center;text-align:center}.t2pt-root.solo .t2pt-bar{width:100%}.t2pt-root.solo .t2pt-meta{width:70%}.t2pt-root.solo .t2pt-meta div{align-items:center}.t2pt-root.solo .t2pt-ctl{justify-content:center}
.t2pt-root.flow{overflow:auto}
.t2pt-root.flow .t2pt-stage{position:static;transform:none!important;width:auto;height:auto;padding:16px;grid-template-rows:auto;gap:16px}
.t2pt-root.flow .t2pt-head{flex-wrap:wrap;gap:8px 14px}
.t2pt-root.flow .t2pt-brand img{height:30px}.t2pt-root.flow .t2pt-brand span{font-size:22px}
.t2pt-root.flow .t2pt-name{font-size:30px;border:0;padding:0;flex-basis:100%;white-space:normal}
.t2pt-root.flow .t2pt-sum{font-size:18px;white-space:normal}
.t2pt-root.flow .t2pt-body{grid-template-columns:1fr!important;gap:16px}
.t2pt-root.flow .t2pt-clockcol{order:-1}
.t2pt-root.flow .t2pt-clock{padding:16px}
.t2pt-root.flow .t2pt-phase{font-size:34px}
.t2pt-root.flow .t2pt-time,.t2pt-root.flow.solo .t2pt-time{font-size:128px}
.t2pt-root.flow .t2pt-sub{font-size:18px}
.t2pt-root.flow .t2pt-meta strong{font-size:32px}.t2pt-root.flow .t2pt-meta span{font-size:12px}
.t2pt-root.flow .t2pt-btn{font-size:22px!important}
.t2pt-root.flow .t2pt-h2{font-size:20px}.t2pt-root.flow .t2pt-h2 small{font-size:14px}
.t2pt-root.flow .t2pt-li{padding:10px 14px;max-height:none}
.t2pt-root.flow .t2pt-warm .t2pt-li{font-size:16px}.t2pt-root.flow .t2pt-moves .t2pt-li{font-size:19px}
@media (prefers-reduced-motion:reduce){.t2pt-root *{transition:none!important}}
`;

const PHASE = { ready: "Get ready", work: "Work", rest: "Rest", roundrest: "Rest", cap: "AMRAP", up: "Go", done: "Done" };

export default function TimerRunner({ timer, onExit, tv = false }) {
  const format = timer.format;
  const config = useMemo(() => normalizeConfig(format, timer.config), [format, timer.config]);
  const segs = useMemo(() => buildSegments(format, config), [format, config]);
  const moves = (config.movements || []).filter(m => (m.name || "").trim());
  const warm = (config.warmup || []).filter(m => (m.name || "").trim());
  const last = segs[segs.length - 1];
  const openEnded = last.dur == null;
  const endAt = openEnded ? Infinity : last.start + last.dur;

  // Clock state lives in refs; `tick` just forces a re-render a few times a second.
  const acc = useRef(0);          // ms banked while paused
  const since = useRef(null);     // performance.now() when last resumed, null = paused
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(null); // { reason, elapsed }
  const [rounds, setRounds] = useState(0);         // AMRAP round taps
  const [, setTick] = useState(0);
  const lastBeep = useRef("");
  const audio = useRef(null);
  const wake = useRef(null);
  const stageRef = useRef(null);
  const rootRef = useRef(null);
  const startBtn = useRef(null);
  const [zoom, setZoom] = useState(0.92);
  // Sound settings start from the saved timer and can be flipped on screen for this session.
  const [beepsOn, setBeepsOn] = useState(config.beeps !== false);
  const [voiceOn, setVoiceOn] = useState(!!config.voice);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
  const voiceLines = (config.voiceLines || []).map(l => (l || "").trim()).filter(Boolean);
  const lastLine = useRef(-1);
  const speak = useCallback((text) => {
    if (!canSpeak || !text) return false;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new window.SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 1; u.volume = 1;
      const voices = synth.getVoices ? synth.getVoices() : [];
      const en = voices.find(v => /en[-_]US/i.test(v.lang) && /male|daniel|alex|fred|google us/i.test(v.name)) || voices.find(v => /^en/i.test(v.lang));
      if (en) u.voice = en;
      synth.speak(u);
      return true;
    } catch { return false; }
  }, [canSpeak]);
  const goCall = useCallback(() => {
    if (!voiceOn || !voiceLines.length) return false;
    let i = 0;
    if (voiceLines.length > 1) { do { i = Math.floor(Math.random() * voiceLines.length); } while (i === lastLine.current); }
    lastLine.current = i;
    return speak(voiceLines[i]);
  }, [voiceOn, voiceLines, speak]);
  const [flow, setFlow] = useState(false);

  const elapsedMs = () => acc.current + (since.current != null ? performance.now() - since.current : 0);

  // Audio: one shared context, kept "warm" with an inaudible tone once started.
  // Soundbars (Sonos/HDMI ARC), Bluetooth speakers and TVs mute their output after
  // silence and swallow the first fraction of a second of the next sound, which ate
  // the short 3-2-1 beeps. A constant near-silent signal keeps the audio path open.
  const keepAlive = useRef(null);
  const ensureAudio = useCallback(() => {
    try {
      // iPhone: play through the silent switch like a media app would.
      if (navigator.audioSession) { try { navigator.audioSession.type = "playback"; } catch {} }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audio.current = audio.current || new Ctx();
      const a = audio.current;
      if (a.state === "suspended") a.resume();
      if (!keepAlive.current) {
        const o = a.createOscillator(), g = a.createGain();
        o.frequency.value = 40; g.gain.value = 0.0015;
        o.connect(g); g.connect(a.destination); o.start();
        keepAlive.current = o;
      }
      return a;
    } catch { return null; }
  }, []);
  const beep = useCallback((freq = 880, dur = 0.25, vol = 0.5) => {
    const a = ensureAudio();
    if (!a) return;
    try {
      const t0 = a.currentTime + 0.01;
      const o = a.createOscillator(), g = a.createGain();
      o.type = "square"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.setValueAtTime(vol, t0 + dur - 0.04);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch {}
  }, [ensureAudio]);
  useEffect(() => () => { try { keepAlive.current && keepAlive.current.stop(); } catch {} try { audio.current && audio.current.close(); } catch {} }, []);

  // Fit the 1920x1080 stage to the window; phones in portrait get a scrolling layout.
  useEffect(() => {
    try { const z = parseFloat(localStorage.getItem("t2p_timer_zoom")); if (z > 0.3 && z < 1.5) setZoom(z); } catch {}
  }, []);
  useEffect(() => {
    const fit = () => {
      const vv = window.visualViewport;
      const w = Math.min(window.innerWidth, vv ? vv.width : 1e9);
      const h = Math.min(window.innerHeight, vv ? vv.height : 1e9);
      const isFlow = w < 700 || h > w * 1.15;
      setFlow(isFlow);
      const st = stageRef.current;
      if (!st) return;
      if (isFlow) { st.style.transform = ""; st.style.top = ""; return; }
      const s = Math.min(w / 1920, h / 1080) * zoom;
      st.style.transform = `translateX(-50%) scale(${s})`;
      st.style.top = Math.max(0, Math.min((h - 1080 * s) / 2, 14)) + "px";
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); };
  }, [zoom, flow]);
  const changeZoom = (d) => setZoom(z => { const nz = Math.max(0.4, Math.min(1.2, Math.round((z + d) * 100) / 100)); try { localStorage.setItem("t2p_timer_zoom", String(nz)); } catch {} return nz; });

  const releaseWake = () => { try { wake.current && wake.current.release(); } catch {} wake.current = null; };
  const requestWake = async () => { try { wake.current = await navigator.wakeLock?.request("screen"); } catch {} };

  const finish = useCallback((reason) => {
    const e = elapsedMs();
    acc.current = e; since.current = null;
    setRunning(false); setFinished({ reason, elapsed: e });
    releaseWake(); beep(1046, 0.7);
  }, [beep]);

  // Ticker: re-render, fire beeps, detect the end.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const t = elapsedMs() / 1000;
      if (t >= endAt) { finish(format === "amrap" ? "time" : format === "fortime" ? "cap" : "complete"); return; }
      const seg = segs.findLast ? segs.findLast(s => s.start <= t) : [...segs].reverse().find(s => s.start <= t);
      const si = segs.indexOf(seg);
      if (seg.dur != null) {
        const left = Math.ceil(seg.start + seg.dur - t);
        const key = si + ":" + left;
        if (left <= 3 && left >= 1 && lastBeep.current !== key) { lastBeep.current = key; if (beepsOn) beep(880, 0.22, 0.55); }
      }
      const enterKey = "enter:" + si;
      if (si > 0 && lastBeep.current !== enterKey && !lastBeep.current.startsWith(si + ":")) {
        lastBeep.current = enterKey;
        const isGo = seg.kind === "work" || seg.kind === "cap" || seg.kind === "up";
        if (isGo) { beep(1318, 0.45, 0.6); goCall(); }
        else beep(523, 0.5, 0.5);
      }
      setTick(x => x + 1);
    }, 100);
    return () => clearInterval(id);
  }, [running, segs, endAt, finish, beep, format, beepsOn, goCall]);

  useEffect(() => () => releaseWake(), []);
  useEffect(() => { startBtn.current?.focus(); }, []);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible" && since.current != null && !wake.current) requestWake(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const start = () => {
    if (finished) reset();
    since.current = performance.now();
    setRunning(true); setStarted(true);
    beep(segs[0].kind === "ready" ? 880 : 1046, 0.25);
    if (voiceOn && canSpeak) { try { const u = new window.SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); } catch {} }
    if (segs[0].kind !== "ready" && !started) goCall();
    requestWake();
  };
  const pause = () => { acc.current = elapsedMs(); since.current = null; setRunning(false); releaseWake(); };
  const reset = () => { acc.current = 0; since.current = null; lastBeep.current = ""; setRunning(false); setStarted(false); setFinished(null); setRounds(0); releaseWake(); };
  const skip = () => {
    const t = elapsedMs() / 1000;
    const next = segs.find(s => s.start > t + 0.01);
    if (!next) { if (!openEnded) finish("complete"); return; }
    acc.current = next.start * 1000 + 1; if (since.current != null) since.current = performance.now();
    if (!started) setStarted(true);
    lastBeep.current = ""; setTick(x => x + 1);
  };
  const fullscreen = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else (rootRef.current || document.documentElement).requestFullscreen?.().catch(() => {}); } catch {} };

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space" && !(e.target && e.target.tagName === "BUTTON")) { e.preventDefault(); running ? pause() : start(); }
      if (e.key === "Escape" && onExit && !document.fullscreenElement) onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- derive the current view ----------
  const t = elapsedMs() / 1000;
  const seg = finished ? null : (segs.findLast ? segs.findLast(s => s.start <= t) : [...segs].reverse().find(s => s.start <= t)) || segs[0];
  const kind = finished ? "done" : !started ? "ready" : seg.kind;
  const workStart = segs[0].kind === "ready" ? segs[1]?.start ?? 0 : 0;
  const workElapsed = Math.max(0, (finished ? finished.elapsed / 1000 : t) - workStart);

  let bigTime, pct = 0, phase, sub = "", subDetail = "";
  if (finished) {
    phase = finished.reason === "cap" ? "Time cap" : "Done";
    bigTime = fmt(format === "amrap" ? config.cap : workElapsed);
    sub = format === "amrap" ? `${rounds} round${rounds === 1 ? "" : "s"}` : format === "fortime" || format === "clock" ? "Final time" : "Nice work";
    pct = 100;
  } else if (!started) {
    phase = "Ready";
    const first = segs.find(s => s.kind !== "ready");
    bigTime = first.dur != null ? fmt(first.dur) : "0:00";
    sub = first.kind === "work" && first.label !== "Work" && first.label !== "Go" ? "First: " + first.label : "Press Start";
    if (config.countdown > 0) subDetail = `:${String(config.countdown).padStart(2, "0")} countdown`;
  } else if (seg.dur == null) {
    phase = seg.label; bigTime = fmt(t - seg.start); sub = seg.sub;
  } else {
    const left = Math.max(0, seg.start + seg.dur - t);
    bigTime = seg.kind === "up" ? fmt(t - seg.start) : fmt(Math.ceil(left - 0.001));
    pct = Math.min(100, ((t - seg.start) / seg.dur) * 100);
    phase = seg.kind === "work" ? (format === "stations" || format === "emom" || moves.length ? "Work" : seg.label) : seg.kind === "ready" ? "Get ready" : seg.kind === "cap" ? "AMRAP" : seg.label;
    if (seg.kind === "work" && seg.label !== "Work" && seg.label !== "Go") { sub = seg.label; subDetail = seg.sub; }
    else sub = seg.sub;
  }

  const hasRounds = ["stations", "emom", "intervals"].includes(format);
  const curRound = seg && hasRounds ? (seg.kind === "ready" ? 1 : seg.round) : 1;
  const totalRounds = hasRounds ? (segs.find(s => s.kind !== "ready")?.rounds || 1) : 0;
  const totalWork = openEnded ? null : endAt - workStart;
  const remaining = totalWork != null ? Math.max(0, totalWork - workElapsed) : null;
  const setInfo = format === "intervals" && config.sets > 1 && seg && seg.set ? `${seg.set} / ${config.sets}` : null;

  const activeIdx = seg && !finished && started ? (seg.kind === "work" ? seg.index : -1) : -1;
  const nextIdx = seg && !finished && started && (seg.kind === "rest") ? seg.index : (!started && format === "stations" ? 0 : -1);

  const listTitle = format === "stations" ? "Stations" : format === "emom" ? "Rotation" : format === "intervals" ? "Intervals" : "Workout";
  const listNote = format === "stations" ? "rotate to next #" : format === "emom" ? (config.interval === 60 ? "every minute" : `every ${fmt(config.interval)}`) : "";

  const cols = [];
  if (warm.length) cols.push("440px");
  if (moves.length) cols.push("1fr");
  cols.push(moves.length && warm.length ? "620px" : moves.length || warm.length ? "700px" : "1fr");
  const solo = !moves.length && !warm.length;

  return (
    <div ref={rootRef} className={`t2pt-root k-${kind}${flow ? " flow" : ""}${solo ? " solo" : ""}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="t2pt-stage" ref={stageRef}>
        <div className="t2pt-head">
          <div className="t2pt-brand"><img src={LOGO_SRC} alt="" /><span>TRAIN TO <b>PERFORM</b></span></div>
          <div className="t2pt-name">{timer.name || "Workout"}</div>
          <div className="t2pt-sum">{summarize(format, config)}</div>
        </div>
        <div className="t2pt-body" style={{ gridTemplateColumns: cols.join(" ") }}>
          {warm.length > 0 && (
            <section className="t2pt-col t2pt-warm">
              <h2 className="t2pt-h2">Warm-up <small>1 round</small></h2>
              <ol className="t2pt-list">
                {warm.map((m, i) => <li key={i} className="t2pt-li"><span className="n">{i + 1}</span><span className="nm">{m.name}</span><span className="dt">{m.detail}</span></li>)}
              </ol>
            </section>
          )}
          {moves.length > 0 && (
            <section className="t2pt-col t2pt-moves">
              <h2 className="t2pt-h2">{listTitle} {listNote && <small>{listNote}</small>}</h2>
              <ol className="t2pt-list">
                {moves.map((m, i) => <li key={i} className={`t2pt-li${i === activeIdx ? " on" : i === nextIdx ? " next" : ""}`}><span className="n">{i + 1}</span><span className="nm">{m.name}</span><span className="dt">{m.detail}</span></li>)}
              </ol>
            </section>
          )}
          <section className="t2pt-col t2pt-clockcol">
            <div className="t2pt-clock" aria-live="polite">
              <div className="t2pt-phase">{phase}</div>
              <div className="t2pt-time">{bigTime}</div>
              <div className="t2pt-sub">{sub || "\u00a0"}{subDetail ? <span> · {subDetail}</span> : null}</div>
              <div className="t2pt-bar"><i style={{ width: pct + "%" }} /></div>
              <div className="t2pt-meta">
                {hasRounds && <div><span>Round</span><strong>{Math.min(curRound, totalRounds)} / {totalRounds}</strong></div>}
                {setInfo && <div><span>Set</span><strong>{setInfo}</strong></div>}
                {format === "amrap" && <div><span>Rounds</span><strong>{rounds}</strong></div>}
                <div><span>{remaining != null ? "Remaining" : "Elapsed"}</span><strong>{fmt(remaining != null ? remaining : workElapsed)}</strong></div>
                {format === "stations" && !setInfo && <div><span>Station</span><strong>{seg && started && !finished && seg.index >= 0 ? seg.index + 1 : 1} / {moves.length || 1}</strong></div>}
              </div>
              <div className="t2pt-ctl">
                <button ref={startBtn} className="t2pt-btn pri" onClick={() => (running ? pause() : start())}>{running ? "Pause" : finished ? "Restart" : started ? "Resume" : "Start"}</button>
                {format === "amrap" && started && !finished && <button className="t2pt-btn red" onClick={() => setRounds(r => r + 1)}>+1 Round</button>}
                {(format === "fortime" || format === "clock") && started && !finished && <button className="t2pt-btn red" onClick={() => finish("done")}>{format === "clock" ? "Stop" : "Done"}</button>}
                {!openEnded && <button className="t2pt-btn" onClick={skip}>Skip</button>}
                <button className="t2pt-btn" onClick={reset}>Reset</button>
                {!flow && <button className="t2pt-btn" onClick={() => changeZoom(-0.05)} aria-label="Smaller">A−</button>}
                {!flow && <button className="t2pt-btn" onClick={() => changeZoom(0.05)} aria-label="Bigger">A+</button>}
                <button className="t2pt-btn" onClick={() => setBeepsOn(v => !v)} aria-pressed={beepsOn}>{beepsOn ? "3-2-1 On" : "3-2-1 Off"}</button>
                {canSpeak && <button className="t2pt-btn" onClick={() => { if (!voiceOn) speak(voiceLines[0] || ""); setVoiceOn(!voiceOn); }} aria-pressed={voiceOn}>{voiceOn ? "Voice On" : "Voice Off"}</button>}
                <button className="t2pt-btn" onClick={fullscreen}>Full screen</button>
                {onExit && <button className="t2pt-btn" onClick={onExit}>Exit</button>}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
