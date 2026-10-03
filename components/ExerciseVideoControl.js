"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

/*
  Add / replace / remove the demo video for an exercise, from inside a program block.

  The video lives on the LIBRARY exercise (exercises.video_url), not on the block. That is
  what the athlete view, the Library card and every other program already read, so saving
  here updates all of them at once.

  - Block resolves to a library exercise → update that exercise, plus any other library
    entries with the same name (the library has a few same-name duplicates across
    categories; without this the video would only show on one of them).
  - Block is a custom name with no library entry → create the library card with the video,
    so it shows in the Library and resolves by name everywhere.
*/

const MAX_BYTES = 100 * 1024 * 1024; // matches the `videos` bucket limit
const norm = (s) => (s || "").toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

export default function ExerciseVideoControl({ libraryEx, exerciseName, category, exercises, updateExercise, addExercise, compact }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(null); // status text while working
  const [done, setDone] = useState(false);

  if (!updateExercise) return null;

  const currentUrl = libraryEx?.video_url || "";
  const name = libraryEx?.name || exerciseName || "";

  const saveUrl = async (url) => {
    if (libraryEx) {
      const targets = (exercises || []).filter(e => e.id === libraryEx.id || norm(e.name) === norm(libraryEx.name));
      for (const t of targets) await updateExercise(t.id, { video_url: url });
    } else {
      if (!name.trim() || !addExercise) throw new Error("This exercise has no name to save to the library.");
      await addExercise({ name: name.trim(), category: category || "", notes: "", video_url: url });
    }
  };

  const finish = () => {
    setBusy(null); setOpen(false); setLink(""); setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { alert("Video must be under 100MB. Trim the clip or lower the resolution."); return; }
    setBusy("Uploading…");
    try {
      // Read the bytes now — on iOS the picked File can go stale once the picker closes.
      const contentType = file.type || "video/mp4";
      const blob = new Blob([await file.arrayBuffer()], { type: contentType });
      if (!blob.size) throw new Error("That video came back empty. Try again, or paste a link.");
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const slug = norm(name).replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "exercise";
      const path = `library/${slug}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("videos").upload(path, blob, { contentType, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("videos").getPublicUrl(path);
      setBusy("Saving…");
      await saveUrl(data.publicUrl);
      finish();
    } catch (err) {
      alert("Video upload failed: " + (err?.message || err));
      setBusy(null);
    }
  };

  const handleLink = async () => {
    const url = link.trim();
    if (!/^https?:\/\//i.test(url)) { alert("Paste a full link starting with https://"); return; }
    setBusy("Saving…");
    try { await saveUrl(url); finish(); }
    catch (err) { alert("Could not save: " + (err?.message || err)); setBusy(null); }
  };

  const handleRemove = async () => {
    if (!confirm(`Remove the video from "${name}"? This removes it from the library card and every program that uses it.`)) return;
    setBusy("Removing…");
    try { await saveUrl(""); finish(); }
    catch (err) { alert("Could not remove: " + (err?.message || err)); setBusy(null); }
  };

  const fs = compact ? 13 : 12;
  const chip = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: fs, fontWeight: 600, padding: "4px 10px", borderRadius: 999, border: "1px solid #D4D4D8", background: "#fff", color: "#3F3F46", cursor: "pointer", fontFamily: "inherit" };

  return (
    <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "#71717A" }}>Video</span>
        {currentUrl && <MediaLink url={currentUrl} style={{ fontSize: fs, color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>▶ Watch</MediaLink>}
        {!busy && <button onClick={() => setOpen(o => !o)} style={chip}>{currentUrl ? "Replace" : "+ Add video"}</button>}
        {busy && <span style={{ fontSize: fs, color: "#71717A" }}>{busy}</span>}
        {done && <span style={{ fontSize: fs, color: "#16A34A", fontWeight: 600 }}>✓ Saved to library</span>}
      </div>
      {open && !busy && (
        <div style={{ marginTop: 6, padding: 8, background: "#fff", border: "1px solid #E4E4E7", borderRadius: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ ...chip, justifyContent: "center", background: "#18181B", color: "#fff", border: "none" }}>
            🎥 Upload video file
            <input type="file" accept="video/*" style={{ display: "none" }} onChange={e => { const inp = e.target; const f = inp.files?.[0]; handleFile(f).finally(() => { inp.value = ""; }); }} />
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <input value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleLink(); }} placeholder="…or paste a YouTube / Drive link" style={{ flex: 1, minWidth: 0, padding: "6px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 14, fontFamily: "inherit" }} />
            <button onClick={handleLink} disabled={!link.trim()} style={{ ...chip, opacity: link.trim() ? 1 : 0.5 }}>Save</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#A1A1AA" }}>{libraryEx ? "Updates the library card for this exercise." : "Creates a library card for this exercise."}</span>
            {currentUrl && <button onClick={handleRemove} style={{ background: "none", border: "none", color: "#DC2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Remove</button>}
          </div>
        </div>
      )}
    </div>
  );
}
