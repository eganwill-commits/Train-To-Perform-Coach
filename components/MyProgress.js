"use client";
import { useMemo, useState } from "react";
import { Card, EmptyState } from "./ui";
import { progressSeries, attendanceStats, shortDate } from "../lib/history";

/*
  My Progress.

  Athletes have hundreds of logged rows each and, until now, no way to see them move.
  Seeing a number go up is what keeps a teenager logging. Everything here is read from
  the athlete's own logs and day statuses - nothing is computed that they did not type.

  One chart per lift (small multiples), each a single series, so there is no legend
  and no colour-by-category to decode. The load unit is whatever they typed (lbs in
  practice); a lift logged in two units would show both as numbers, which is why the
  raw last value is printed beside each chart.
*/

const INK = "#18181B";
const MUTED = "#71717A";
const GRID = "#E4E4E7";
const LINE = "#2563EB";
const PR = "#16A34A";

function Sparkline({ points, height = 64 }) {
  const [hover, setHover] = useState(null);
  const W = 320, H = height, padX = 8, padY = 10;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i) => padX + (points.length === 1 ? (W - 2 * padX) / 2 : (i * (W - 2 * padX)) / (points.length - 1));
  const y = (v) => H - padY - ((v - min) / span) * (H - 2 * padY);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const bestI = vals.lastIndexOf(max);
  const lastI = points.length - 1;

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * (W / r.width);
    let best = 0, dist = Infinity;
    points.forEach((_, i) => { const dd = Math.abs(x(i) - px); if (dd < dist) { dist = dd; best = i; } });
    setHover(best);
  };

  const tip = hover != null ? points[hover] : null;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
        aria-label={`From ${points[0].value} to ${points[lastI].value}, best ${max}`}
        onMouseMove={onMove} onTouchStart={onMove} onTouchMove={onMove} onMouseLeave={() => setHover(null)}
        style={{ display: "block", touchAction: "pan-y" }}>
        <line x1={padX} x2={W - padX} y1={y(max)} y2={y(max)} stroke={GRID} strokeWidth="1" strokeDasharray="3 3" />
        <path d={d} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(bestI)} cy={y(max)} r="5" fill={PR} stroke="#fff" strokeWidth="2" />
        {lastI !== bestI && <circle cx={x(lastI)} cy={y(points[lastI].value)} r="4.5" fill={LINE} stroke="#fff" strokeWidth="2" />}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padY / 2} y2={H - padY / 2} stroke={MUTED} strokeWidth="1" />
            <circle cx={x(hover)} cy={y(points[hover].value)} r="5" fill="#fff" stroke={INK} strokeWidth="2" />
          </>
        )}
      </svg>
      {tip && (
        <div style={{ position: "absolute", top: -4, right: 0, fontSize: 11, color: INK, background: "#fff", border: `1px solid ${GRID}`, borderRadius: 6, padding: "2px 7px", pointerEvents: "none" }}>
          {shortDate(tip.date)} · <b>{tip.value}</b>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, sub }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "10px 6px", background: "#fff", borderRadius: 10, border: `1px solid ${GRID}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: INK, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "#A1A1AA", marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

export default function MyProgress({ logs, programs, isMobile }) {
  const [cat, setCat] = useState("STR");
  const series = useMemo(() => progressSeries(logs), [logs]);
  const att = useMemo(() => attendanceStats(programs), [programs]);
  const prs30 = useMemo(() => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    return series.filter(s => s.bestDate >= since && s.points.length > 1 && s.points[0].value < s.best).length;
  }, [series]);
  const shown = series.filter(s => s.category === cat);
  const cats = ["STR", "FIN", "PWR"].filter(c => series.some(s => s.category === c));

  return (
    <div>
      <h2 style={{ margin: "0 0 6px", fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>My Progress</h2>
      <p style={{ fontSize: 13, color: MUTED, margin: "0 0 16px" }}>Built from the numbers you log. The more you log, the more this shows.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Stat value={att.streak} label="Session streak" sub="completed in a row" />
        <Stat value={att.pct == null ? "—" : `${att.pct}%`} label="Attendance" sub={`${att.completed} of ${att.tracked}`} />
        <Stat value={prs30} label="Bests · 30 days" sub="lifts at a new high" />
      </div>

      {series.length === 0 ? (
        <EmptyState icon="◎" title="Nothing to chart yet" sub="Log a weight on your lifts in two sessions and your progress shows up here." />
      ) : (
        <>
          {cats.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {cats.map(c => (
                <button key={c} onClick={() => setCat(c)} style={{
                  padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
                  border: cat === c ? `2px solid ${INK}` : `1px solid ${GRID}`, background: cat === c ? INK : "#fff", color: cat === c ? "#fff" : "#52525B",
                }}>{c === "STR" ? "Strength" : c === "FIN" ? "Finishers" : "Power"}</button>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            {shown.map(s => (
              <Card key={s.name} style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: INK, minWidth: 0, wordBreak: "break-word" }}>{s.name}</div>
                  {s.isRecentPR && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: "#fff", background: PR, borderRadius: 999, padding: "2px 8px" }}>NEW BEST</span>}
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 12, color: MUTED, margin: "3px 0 2px", flexWrap: "wrap" }}>
                  <span>Best <b style={{ color: INK }}>{s.best}</b> <span style={{ color: "#A1A1AA" }}>{shortDate(s.bestDate)}</span></span>
                  <span>Last <b style={{ color: INK }}>{s.last}</b> <span style={{ color: "#A1A1AA" }}>{shortDate(s.lastDate)}</span></span>
                  {s.change > 0 && <span style={{ color: PR, fontWeight: 700 }}>+{Math.round(s.change * 10) / 10} since first log</span>}
                </div>
                <Sparkline points={s.points} />
                <div style={{ fontSize: 10, color: "#A1A1AA" }}>{s.points.length} sessions · tap the line for any day</div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
