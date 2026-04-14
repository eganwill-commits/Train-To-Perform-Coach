"use client";
import { useState, useRef, useEffect } from "react";
import { Btn, Card } from "./ui";

const QUICK_PROMPTS = [
  "How should I warm up before heavy squats?",
  "What's a good substitute for pull-ups?",
  "Explain tempo 3-1-2-0",
  "How do I know if my load is right?",
  "What does RPE 7 mean?",
  "How to scale a workout if I'm sore?",
];

export default function AIChat({ isMobile, athleteName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages([...newMessages, { role: "assistant", content: "⚠️ " + data.error }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: data.text }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Connection error. Please try again." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: "100%", overflowX: "hidden", display: "flex", flexDirection: "column", height: isMobile ? "calc(100dvh - 60px)" : "calc(100dvh - 64px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0, padding: isMobile ? "0" : "0" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 28, fontFamily: "'Space Mono', monospace" }}>T2P Assistant</h2>
          <p style={{ fontSize: 12, color: "#71717A", marginTop: 2 }}>Ask about movements, form, scaling, recovery & more</p>
        </div>
        {messages.length > 0 && (
          <Btn small variant="secondary" onClick={() => setMessages([])}>Clear</Btn>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", marginBottom: 8 }}>
        {messages.length === 0 ? (
          <div style={{ padding: isMobile ? "20px 0" : "40px 0" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💪</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#18181B" }}>How can I help{athleteName ? `, ${athleteName}` : ""}?</div>
              <p style={{ fontSize: 13, color: "#71717A", marginTop: 4 }}>I know T2P programming, exercises, form cues, scaling, and recovery.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400, margin: "0 auto" }}>
              {QUICK_PROMPTS.map((q, i) => (
                <button key={i} onClick={() => send(q)} style={{
                  padding: "10px 14px", border: "1px solid #E4E4E7", borderRadius: 10,
                  background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                  textAlign: "left", color: "#52525B", fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ color: "#F97316", fontWeight: 700, fontSize: 14 }}>→</span>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: m.role === "user" ? "#18181B" : "#F4F4F5",
                  color: m.role === "user" ? "#fff" : "#18181B",
                  fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "10px 14px", borderRadius: "14px 14px 14px 4px", background: "#F4F4F5", fontSize: 14, color: "#A1A1AA" }}>
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, display: "flex", gap: 8, paddingTop: 8, borderTop: "1px solid #E4E4E7" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about an exercise, modification, or technique…"
          style={{
            flex: 1, padding: "10px 14px", border: "1px solid #E4E4E7", borderRadius: 10,
            fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
            background: "#fff",
          }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{
            padding: "10px 16px", background: loading || !input.trim() ? "#D4D4D8" : "#F97316",
            color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: loading || !input.trim() ? "default" : "pointer", fontFamily: "inherit",
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
