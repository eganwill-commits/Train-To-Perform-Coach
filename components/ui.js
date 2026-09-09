"use client";
import { useState, useRef, useEffect } from "react";
export function Badge({ color, children }) { return <span style={{ background: color, color: "#fff", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>{children}</span>; }
export function Btn({ children, onClick, variant = "primary", small, style = {}, disabled }) {
  const base = { border: "none", borderRadius: 8, cursor: disabled ? "default" : "pointer", fontWeight: 600, fontSize: small ? 12 : 14, padding: small ? "5px 12px" : "10px 20px", transition: "all .15s", opacity: disabled ? 0.4 : 1, whiteSpace: "nowrap" };
  const v = { primary: { background: "#18181B", color: "#fff" }, secondary: { background: "#F4F4F5", color: "#18181B" }, danger: { background: "#FEE2E2", color: "#DC2626" }, ghost: { background: "transparent", color: "#18181B" }, accent: { background: "#F97316", color: "#fff" } };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...v[variant], ...style }}>{children}</button>;
}
export function Input({ label, ...props }) { return <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600, color: "#52525B" }}>{label}<input {...props} style={{ border: "1px solid #E4E4E7", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", ...(props.style || {}) }} /></label>; }
export function Select({ label, options, ...props }) { return <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600, color: "#52525B" }}>{label}<select {...props} style={{ border: "1px solid #E4E4E7", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none", fontFamily: "inherit", background: "#fff", width: "100%", boxSizing: "border-box" }}>{options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}</select></label>; }
export function SearchableSelect({ label, value, onChange, options, placeholder = "Search…", groupBy }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef(null);
  const inputRef = useRef(null);
  const btnRef = useRef(null);
  const selectedLabel = options.find(o => (o.value ?? o) === value)?.label ?? options.find(o => (o.value ?? o) === value) ?? "";

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openDropdown = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen(!open);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const searchWords = search.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = search ? options.filter(o => {
    const label = ((o.label ?? o) + "").toLowerCase();
    return searchWords.every(word => label.includes(word));
  }) : options;

  const grouped = groupBy ? {} : null;
  if (grouped) { filtered.forEach(o => { const g = o.group || "Other"; if (!grouped[g]) grouped[g] = []; grouped[g].push(o); }); }

  const handleSelect = (val) => { onChange({ target: { value: val } }); setOpen(false); setSearch(""); };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {label && <div style={{ fontSize: 13, fontWeight: 600, color: "#52525B", marginBottom: 4 }}>{label}</div>}
      <button ref={btnRef} type="button" onClick={openDropdown} style={{ width: "100%", padding: "7px 10px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ lineHeight: 1.3, textAlign: "left", wordBreak: "break-word" }}>{selectedLabel || placeholder}</span>
        <span style={{ color: "#A1A1AA", fontSize: 10, marginLeft: 6 }}>▼</span>
      </button>
      {open && (
        <div style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width, background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,.15)", zIndex: 9999, maxHeight: 260, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid #F4F4F5", flexShrink: 0 }}>
            <input ref={inputRef} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: "100%", padding: "6px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {grouped ? Object.entries(grouped).map(([g, items]) => (
              <div key={g}>
                <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#A1A1AA", textTransform: "uppercase", letterSpacing: 0.5, background: "#FAFAFA" }}>{g}</div>
                {items.map(o => (
                  <button key={o.value ?? o} onClick={() => handleSelect(o.value ?? o)} style={{ display: "block", width: "100%", padding: "8px 12px", border: "none", background: (o.value ?? o) === value ? "#F4F4F5" : "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left", fontWeight: (o.value ?? o) === value ? 700 : 400 }}>
                    {o.label ?? o}
                  </button>
                ))}
              </div>
            )) : filtered.map(o => (
              <button key={o.value ?? o} onClick={() => handleSelect(o.value ?? o)} style={{ display: "block", width: "100%", padding: "8px 12px", border: "none", background: (o.value ?? o) === value ? "#F4F4F5" : "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left", borderBottom: "1px solid #F4F4F5", fontWeight: (o.value ?? o) === value ? 700 : 400 }}>
                {o.label ?? o}
              </button>
            ))}
            {filtered.length === 0 && <div style={{ padding: "12px", fontSize: 13, color: "#A1A1AA", textAlign: "center" }}>No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
export function Card({ children, style = {}, onClick }) { return <div onClick={onClick} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E4E4E7", padding: 20, cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>; }
export function Modal({ open, onClose, title, children }) { if (!open) return null; return <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.45)", padding: 12 }} onClick={onClose}><div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: 480, maxWidth: "95vw", maxHeight: "85vh", overflow: "auto", padding: 24 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2><button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#71717A" }}>✕</button></div>{children}</div></div>; }
export function EmptyState({ icon, title, sub, action, onAction }) { return <div style={{ textAlign: "center", padding: "60px 20px", color: "#71717A" }}><div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div><h3 style={{ margin: 0, color: "#18181B", fontSize: 18 }}>{title}</h3><p style={{ fontSize: 14, marginTop: 6 }}>{sub}</p>{action && <Btn onClick={onAction} style={{ marginTop: 16 }}>{action}</Btn>}</div>; }
/* Set a textarea's height to exactly fit its content.

   Naively assigning scrollHeight leaves every one of these boxes ~2px short:
   with box-sizing: border-box the height property covers the borders, but
   scrollHeight does not - so the last line stays fractionally clipped forever.
   Add the borders back (or subtract padding, for content-box).

   Pass `max` to cap the growth and hand back a scrollbar past that point. */
export function fitHeight(el, max) {
  if (!el) return;
  el.style.height = "auto";
  const cs = window.getComputedStyle(el);
  const num = (v) => parseFloat(v) || 0;
  const want = cs.boxSizing === "border-box"
    ? el.scrollHeight + num(cs.borderTopWidth) + num(cs.borderBottomWidth)
    : el.scrollHeight - num(cs.paddingTop) - num(cs.paddingBottom);
  const h = max ? Math.min(want, max) : want;
  el.style.height = h + "px";
  el.style.overflowY = max && want > max ? "auto" : "hidden";
}

export function useAutoGrow(value) {
  const ref = useRef(null);
  const fit = () => fitHeight(ref.current);
  useEffect(fit, [value]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return [ref, fit];
}

/* On a phone the on-screen keyboard covers the bottom half of the screen, so a
   field tapped down there vanishes the moment it gets focus. Nudge it up - but
   only on narrow screens, and only when it is actually low enough to be covered.
   On a laptop this does nothing, so clicking through a day's blocks never jumps. */
export function keepInView(el) {
  if (!el || typeof el.scrollIntoView !== "function") return;
  if (typeof window === "undefined" || window.innerWidth > 820) return;
  setTimeout(() => {
    try {
      const r = el.getBoundingClientRect();
      if (r.bottom < window.innerHeight * 0.5) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch (_) {}
  }, 300);
}

/* A textarea that starts one line tall and grows to fit whatever is typed,
   so nothing ever scrolls out of sight. Drop-in replacement for <input>. */
export function AutoGrow({ value, style = {}, onFocus, onKeyDown, singleLine, ...props }) {
  const [ref] = useAutoGrow(value);
  return (
    <textarea
      {...props}
      ref={ref}
      rows={1}
      value={value ?? ""}
      onFocus={e => { keepInView(e.target); if (onFocus) onFocus(e); }}
      onKeyDown={e => {
        // singleLine fields wrap instead of scrolling, but Enter still commits
        // rather than inserting a newline - they hold a number, not a paragraph.
        if (singleLine && e.key === "Enter") { e.preventDefault(); e.target.blur(); }
        if (onKeyDown) onKeyDown(e);
      }}
      style={{ resize: "none", overflow: "hidden", lineHeight: 1.4, display: "block", ...style }}
    />
  );
}

export function BlurInput({ value, onSave, multiline, grow, debounceMs, ...props }) {
  const [local, setLocal] = useState(value ?? "");
  const prev = useRef(value);
  const timerRef = useRef(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const localRef = useRef(local);
  localRef.current = local;
  const taRef = useRef(null);
  useEffect(() => {
    if (!multiline && !grow) return;
    fitHeight(taRef.current);
  }, [local, multiline, grow]);

  useEffect(() => { if (value !== prev.current) { setLocal(value ?? ""); prev.current = value; } }, [value]);

  // Auto-save on unmount / navigation
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (localRef.current !== (prev.current ?? "")) onSaveRef.current(localRef.current);
    };
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setLocal(v);
    if (debounceMs) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { if (v !== (prev.current ?? "")) { onSaveRef.current(v); prev.current = v; } }, debounceMs);
    }
  };

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (local !== (value ?? "")) { onSave(local); prev.current = local; }
  };

  const shared = { ...props, value: local, onChange: handleChange, onBlur: handleBlur };
  if (!multiline && !grow) return <input {...shared} />;
  // grow: behaves like a one-line input (Enter commits) but wraps instead of
  // scrolling text out of sight. multiline: a real multi-line note field.
  const growHandlers = grow
    ? { rows: 1, type: undefined, onKeyDown: e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } } }
    : {};
  return (
    <textarea
      {...shared}
      {...growHandlers}
      ref={taRef}
      onFocus={e => { keepInView(e.target); if (props.onFocus) props.onFocus(e); }}
      style={{ ...(props.style || {}), resize: "none", overflow: "hidden" }}
    />
  );
}


/* ---------------------------------------------------------------------------
   THE SCORE BOX

   One place on a test block that says, unmistakably, "this is the number, and
   this is the unit". Everything else on the card - sets, reps, RPE, notes - is
   secondary and looks it.

   Two boxes when the test has a left and a right. One box is exactly how five
   athletes ended up recording the same LSI test as "78 both", "50 left 54 right",
   "79, 79.5", "78L,81R" and "R55,L50", none of which a comparison can read.
   --------------------------------------------------------------------------- */

const SCORE_WRAP = {
  marginBottom: 8, padding: "8px 10px 10px",
  background: "#FFFBEB", border: "2px solid #C8922A", borderRadius: 8,
};
const SCORE_LABEL = {
  fontSize: 10, fontWeight: 800, color: "#92400E",
  textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4,
};
const SCORE_UNIT = { fontWeight: 700, letterSpacing: 0.3, textTransform: "none", color: "#B45309" };
const SCORE_INPUT = {
  width: "100%", padding: "9px 10px", border: "1px solid #C8922A", borderRadius: 6,
  fontSize: 18, fontWeight: 700, fontFamily: "inherit", background: "#fff",
  boxSizing: "border-box",
};
const SIDE_LABEL = { fontSize: 10, fontWeight: 800, color: "#92400E", letterSpacing: 0.4 };

export function ScoreField({ label = "Score", unit, value, onChange, onBlur, placeholder }) {
  return (
    <div style={SCORE_WRAP}>
      <div style={SCORE_LABEL}>
        {label}{unit ? <span style={SCORE_UNIT}> — in {unit}</span> : null}
      </div>
      <input
        inputMode="decimal"
        value={value ?? ""}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder || unit || ""}
        style={SCORE_INPUT}
      />
    </div>
  );
}

export function SideScoreField({ label = "Score", unit, left, right, raw, onLeft, onRight, onBlur }) {
  return (
    <div style={SCORE_WRAP}>
      <div style={SCORE_LABEL}>
        {label} — left and right{unit ? <span style={SCORE_UNIT}> — in {unit}</span> : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={SIDE_LABEL}>LEFT
          <input inputMode="decimal" value={left ?? ""} onChange={onLeft} onBlur={onBlur} placeholder={unit || ""} style={{ ...SCORE_INPUT, marginTop: 2 }} />
        </label>
        <label style={SIDE_LABEL}>RIGHT
          <input inputMode="decimal" value={right ?? ""} onChange={onRight} onBlur={onBlur} placeholder={unit || ""} style={{ ...SCORE_INPUT, marginTop: 2 }} />
        </label>
      </div>
      <div style={{ fontSize: 10, color: "#B45309", marginTop: 5 }}>
        Record both. The gap between the sides is the point, not the total.
      </div>
      {/* An older entry we could not split (e.g. "13 40") is shown rather than
          dropped, so typing into a box never quietly destroys what was there. */}
      {raw ? (
        <div style={{ fontSize: 10, color: "#92400E", marginTop: 4, fontWeight: 700 }}>
          Previously entered, side unclear: “{raw}”
        </div>
      ) : null}
    </div>
  );
}
