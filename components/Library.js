"use client";
import { useState } from "react";
import { Badge, Btn, Card, Input, Select, Modal } from "./ui";

export default function Library({ exercises, addExercise, deleteExercise, updateExercise, cats, colors, isMobile }) {
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", category: "", notes: "", video_url: "" });

  const openNew = () => { setForm({ name: "", category: cats[0], notes: "", video_url: "" }); setEditId(null); setModal(true); };
  const openEdit = (e) => { setForm({ name: e.name, category: e.category, notes: e.notes || "", video_url: e.video_url || "" }); setEditId(e.id); setModal(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editId) {
      await updateExercise(editId, form);
    } else {
      await addExercise(form);
    }
    setModal(false);
  };

  let filtered = filter === "All" ? exercises : exercises.filter(e => e.category === filter);
  if (search.trim()) {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    filtered = filtered.filter(e => {
      const text = (e.name + " " + (e.notes || "")).toLowerCase();
      return words.every(w => text.includes(w));
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Library</h2>
        <Btn onClick={openNew} small={isMobile}>+ Add</Btn>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setFilter("All")} style={{ padding: "4px 12px", borderRadius: 999, border: filter === "All" ? "2px solid #18181B" : "1px solid #E4E4E7", background: filter === "All" ? "#18181B" : "#fff", color: filter === "All" ? "#fff" : "#52525B", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>All</button>
        {cats.map(c => <button key={c} onClick={() => setFilter(c)} style={{ padding: "4px 12px", borderRadius: 999, border: filter === c ? `2px solid ${colors[c].bg}` : "1px solid #E4E4E7", background: filter === c ? colors[c].bg : "#fff", color: filter === c ? "#fff" : "#52525B", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>)}
      </div>
      <div style={{ marginBottom: 16, position: "relative" }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search exercises..."
          style={{ width: "100%", padding: "9px 12px 9px 36px", border: "1px solid #E4E4E7", borderRadius: 8, fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fff" }}
        />
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#A1A1AA" }}>⌕</span>
        {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", fontSize: 16, color: "#A1A1AA", cursor: "pointer" }}>✕</button>}
      </div>
      {filtered.length === 0 && search ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#A1A1AA" }}>
          <p style={{ fontSize: 14 }}>No exercises match "{search}"</p>
        </div>
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {filtered.map(e => (
          <div key={e.id} onClick={() => openEdit(e)} style={{ background: colors[e.category]?.light || "#F9FAFB", border: `1px solid ${colors[e.category]?.border || "#E5E7EB"}`, borderRadius: 10, padding: 12, borderLeft: `4px solid ${colors[e.category]?.bg || "#999"}`, display: "flex", justifyContent: "space-between", alignItems: "start", cursor: "pointer" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Badge color={colors[e.category]?.bg || "#999"}>{e.category}</Badge>
                {e.video_url && (
                  <a href={e.video_url} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "2px 10px", borderRadius: 999 }}>
                    ▶ Video
                  </a>
                )}
              </div>
              {e.notes && <div style={{ fontSize: 12, color: "#71717A", marginTop: 6 }}>{e.notes}</div>}
            </div>
            <button onClick={(ev) => { ev.stopPropagation(); deleteExercise(e.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#A1A1AA", fontSize: 14, flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
      )}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? "Edit Exercise" : "New Exercise"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Exercise Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Box Jump" />
          <Select label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={cats} />
          <Input label="Video URL" value={form.video_url} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="https://youtube.com/watch?v=..." />
          {form.video_url && (
            <a href={form.video_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#2563EB", textDecoration: "none" }}>
              ▶ Preview link
            </a>
          )}
          <Input label="Notes / Coaching Cues" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Cues, variations…" />
          <Btn onClick={save} style={{ marginTop: 8 }}>{editId ? "Save Changes" : "Add Exercise"}</Btn>
        </div>
      </Modal>
    </div>
  );
}
