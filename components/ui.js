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
        <span style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: 1.3, textAlign: "left" }}>{selectedLabel || placeholder}</span>
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
export function BlurInput({ value, onSave, multiline, ...props }) {
  const [local, setLocal] = useState(value ?? "");
  const prev = useRef(value);
  useEffect(() => { if (value !== prev.current) { setLocal(value ?? ""); prev.current = value; } }, [value]);
  const shared = { ...props, value: local, onChange: e => setLocal(e.target.value), onBlur: () => { if (local !== (value ?? "")) onSave(local); } };
  return multiline ? <textarea {...shared} /> : <input {...shared} />;
}
