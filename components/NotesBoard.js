"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { raiseAlert, ALERT_KIND, ALERT_PAGE } from "../lib/alerts";

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
};

export default function NotesBoard({ athleteId, authorName, authorRole, isMobile }) {
  const [notes, setNotes] = useState([]);
  const [input, setInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!athleteId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from("athlete_notes").select("*").eq("athlete_id", athleteId).order("pinned", { ascending: false }).order("created_at", { ascending: false });
      setNotes(data || []);
      setLoading(false);
    };
    load();
    // Realtime
    const ch = supabase.channel(`notes-${athleteId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "athlete_notes", filter: `athlete_id=eq.${athleteId}` }, (p) => {
        setNotes(prev => prev.some(n => n.id === p.new.id) ? prev : [p.new, ...prev]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "athlete_notes", filter: `athlete_id=eq.${athleteId}` }, (p) => {
        setNotes(prev => prev.filter(n => n.id !== p.old.id));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "athlete_notes", filter: `athlete_id=eq.${athleteId}` }, (p) => {
        setNotes(prev => prev.map(n => n.id === p.new.id ? p.new : n));
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [athleteId]);

  const addNote = async () => {
    const text = input.trim();
    if (!text) return;
    const note = { athlete_id: athleteId, author_name: authorName, author_role: authorRole, content: text, pinned: false };
    const { data, error } = await supabase.from("athlete_notes").insert([note]).select().single();
    if (!error && data) setNotes(prev => [data, ...prev]);
    // A note from the coach rings the athlete's bell. A note from the athlete does not -
    // the coach already has their own alerts feed watching athlete_notes.
    if (!error && data && authorRole === "coach") {
      const raised = await raiseAlert({
        athleteId,
        kind: ALERT_KIND.NOTE,
        title: `New note from ${authorName || "your coach"}`,
        body: text,
        refTable: "athlete_notes",
        refId: data.id,
        linkPage: ALERT_PAGE.PROGRAM,
      });
      if (!raised) window.alert("Note posted, but the notification to the athlete could not be sent.");
    }
    setInput("");
    inputRef.current?.focus();
  };

  const deleteNote = async (id) => {
    await supabase.from("athlete_notes").delete().eq("id", id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const togglePin = async (note) => {
    const newPinned = !note.pinned;
    await supabase.from("athlete_notes").update({ pinned: newPinned }).eq("id", note.id);
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, pinned: newPinned } : n).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)));
  };

  const isCoach = authorRole === "coach";
  const pinnedNotes = notes.filter(n => n.pinned);
  const regularNotes = notes.filter(n => !n.pinned);

  return (
    <div style={{ background: "#fff", border: "1px solid #E4E4E7", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      {/* Header */}
      <div onClick={() => setCollapsed(!collapsed)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", background: "#FAFAFA", borderBottom: collapsed ? "none" : "1px solid #E4E4E7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Notes Board</span>
          {notes.length > 0 && <span style={{ fontSize: 11, color: "#71717A", fontWeight: 500 }}>({notes.length})</span>}
        </div>
        <span style={{ fontSize: 12, color: "#A1A1AA", transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform .15s" }}>▼</span>
      </div>

      {!collapsed && (
        <div style={{ padding: "12px 16px" }}>
          {/* Compose */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
              placeholder={isCoach ? "Add a note for this athlete…" : "Add a note for your coach…"}
              rows={1}
              style={{ flex: 1, padding: "8px 10px", border: "1px solid #E4E4E7", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "none", maxHeight: 80, lineHeight: 1.4, boxSizing: "border-box" }}
              onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px"; }}
            />
            <button onClick={addNote} style={{ padding: "8px 14px", background: "#18181B", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, alignSelf: "flex-end" }}>Post</button>
          </div>

          {loading && <div style={{ textAlign: "center", color: "#A1A1AA", fontSize: 13, padding: 12 }}>Loading…</div>}

          {/* Pinned notes */}
          {pinnedNotes.map(note => (
            <div key={note.id} style={{ padding: "10px 12px", marginBottom: 6, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, borderLeft: "3px solid #F59E0B" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: note.author_role === "coach" ? "#2563EB" : "#16A34A" }}>{note.author_name}</span>
                  <span style={{ fontSize: 10, color: "#D97706", fontWeight: 600 }}>📌 Pinned</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "#A1A1AA" }}>{timeAgo(note.created_at)}</span>
                  {isCoach && (
                    <>
                      <button onClick={() => togglePin(note)} style={{ background: "none", border: "none", fontSize: 10, color: "#D97706", cursor: "pointer", padding: 0 }}>Unpin</button>
                      <button onClick={() => deleteNote(note.id)} style={{ background: "none", border: "none", fontSize: 10, color: "#DC2626", cursor: "pointer", padding: 0, opacity: 0.5 }}>Delete</button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{note.content}</div>
            </div>
          ))}

          {/* Regular notes */}
          {regularNotes.map(note => (
            <div key={note.id} style={{ padding: "10px 12px", marginBottom: 6, background: "#F9FAFB", border: "1px solid #F4F4F5", borderRadius: 8, borderLeft: `3px solid ${note.author_role === "coach" ? "#2563EB" : "#16A34A"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: note.author_role === "coach" ? "#2563EB" : "#16A34A" }}>{note.author_name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: "#A1A1AA" }}>{timeAgo(note.created_at)}</span>
                  {isCoach && (
                    <>
                      <button onClick={() => togglePin(note)} style={{ background: "none", border: "none", fontSize: 10, color: "#D97706", cursor: "pointer", padding: 0 }}>Pin</button>
                      <button onClick={() => deleteNote(note.id)} style={{ background: "none", border: "none", fontSize: 10, color: "#DC2626", cursor: "pointer", padding: 0, opacity: 0.5 }}>Delete</button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{note.content}</div>
            </div>
          ))}

          {!loading && notes.length === 0 && <div style={{ textAlign: "center", color: "#A1A1AA", fontSize: 13, padding: 8 }}>No notes yet</div>}
        </div>
      )}
    </div>
  );
}
