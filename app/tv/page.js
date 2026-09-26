"use client";
import { useState } from "react";

// TV code entry: short to type with a TV remote. /tv -> /tv/<code>
export default function TvCodePage() {
  const [code, setCode] = useState("");
  const go = (e) => { e.preventDefault(); const c = code.trim().toLowerCase().replace(/[^a-z0-9]/g, ""); if (c) window.location.href = "/tv/" + c; };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#1a1a1a", color: "#f2f2f2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, fontFamily: "'DM Sans', sans-serif", padding: 24, textAlign: "center" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 64, letterSpacing: "0.08em", lineHeight: 1 }}>TRAIN TO <span style={{ color: "#cc1f1f" }}>PERFORM</span></div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, letterSpacing: "0.12em", color: "#c8922a" }}>Timer · enter code</div>
      <form onSubmit={go} style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <input autoFocus value={code} onChange={e => setCode(e.target.value)} maxLength={12} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Timer code"
          style={{ fontSize: "44px", fontFamily: "monospace", letterSpacing: "0.2em", width: 320, padding: "10px 16px", borderRadius: 10, border: "3px solid #444", background: "#2b2b2b", color: "#f2f2f2", textAlign: "center" }} />
        <button type="submit" style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "40px", letterSpacing: "0.08em", padding: "8px 28px", borderRadius: 10, border: "none", background: "#cc1f1f", color: "#fff", cursor: "pointer" }}>Open</button>
      </form>
      <div style={{ color: "#888", fontSize: 18, maxWidth: 640, lineHeight: 1.5 }}>Find the code in the T2P app under Timers → TV link.</div>
    </div>
  );
}
