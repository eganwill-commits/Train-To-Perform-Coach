"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";

const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
};
const getInitials = (name) => {
  const p = (name || "").trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : (p[0]?.[0] || "?").toUpperCase();
};
const isImageUrl = (u) => /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(u || "");
const isVideoUrl = (u) => /youtube|youtu\.be|vimeo|loom|\.mp4|\.mov|\.webm/i.test(u || "");
const getEmbedUrl = (u) => {
  if (!u) return null;
  let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;
  m = u.match(/vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  m = u.match(/loom\.com\/share\/([\w-]+)/);
  if (m) return `https://www.loom.com/embed/${m[1]}`;
  return null;
};
const MAX_FILE_MB = 50;

function MediaDisplay({ msg }) {
  if (msg.media_url) {
    if (msg.media_type === "image") return <img src={msg.media_url} alt="" style={{ maxWidth: "100%", borderRadius: 8, marginTop: 6, cursor: "pointer" }} onClick={() => window.open(msg.media_url, "_blank")} />;
    if (msg.media_type === "video") return <video src={msg.media_url} controls playsInline style={{ maxWidth: "100%", borderRadius: 8, marginTop: 6 }} />;
  }
  if (msg.video_url) {
    const embed = getEmbedUrl(msg.video_url);
    if (embed) return <iframe src={embed} style={{ width: "100%", aspectRatio: "16/9", border: "none", borderRadius: 8, marginTop: 6 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />;
    if (isVideoUrl(msg.video_url)) return <video src={msg.video_url} controls playsInline style={{ maxWidth: "100%", borderRadius: 8, marginTop: 6 }} />;
    if (isImageUrl(msg.video_url)) return <img src={msg.video_url} alt="" style={{ maxWidth: "100%", borderRadius: 8, marginTop: 6 }} />;
    return <a href={msg.video_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 12, color: "#2563EB", wordBreak: "break-all" }}>🔗 {msg.video_url}</a>;
  }
  return null;
}

export default function Messages({ isCoach, currentUserId, currentUserName, athleteId, athleteName, athletes, isMobile }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedAthlete, setSelectedAthlete] = useState(athleteId || null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingFile, setPendingFile] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch messages
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let q = supabase.from("messages").select("*").order("created_at", { ascending: true });
      if (isCoach && selectedAthlete) q = q.eq("athlete_id", selectedAthlete);
      else if (!isCoach) q = q.eq("athlete_id", currentUserId);
      else { setMessages([]); setLoading(false); return; }
      const { data } = await q;
      setMessages(data || []);
      setLoading(false);
      if (data) {
        const myRole = isCoach ? "coach" : "athlete";
        const unread = data.filter(m => !m.read_at && m.sender_role !== myRole);
        if (unread.length) {
          const ids = unread.map(m => m.id);
          supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", ids).then(() => {
            setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m));
          });
        }
      }
    };
    load();
  }, [isCoach, selectedAthlete, currentUserId]);

  // Realtime
  useEffect(() => {
    const tid = isCoach ? selectedAthlete : currentUserId;
    if (!tid) return;
    const ch = supabase.channel(`msg-${tid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `athlete_id=eq.${tid}` }, (p) => {
        setMessages(prev => {
          if (prev.some(m => m.id === p.new.id)) return prev;
          if (p.new.sender_role !== (isCoach ? "coach" : "athlete")) {
            supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", p.new.id);
          }
          return [...prev, p.new];
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
        setMessages(prev => prev.filter(m => m.id !== p.old.id));
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [isCoach, selectedAthlete, currentUserId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Unread counts (coach)
  useEffect(() => {
    if (!isCoach) return;
    const f = async () => {
      const { data } = await supabase.from("messages").select("athlete_id").eq("sender_role", "athlete").is("read_at", null);
      if (data) { const c = {}; data.forEach(m => { c[m.athlete_id] = (c[m.athlete_id] || 0) + 1; }); setUnreadCounts(c); }
    };
    f();
    const iv = setInterval(f, 15000);
    return () => clearInterval(iv);
  }, [isCoach]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) { alert(`File too large. Max ${MAX_FILE_MB}MB.`); return; }
    const type = file.type.startsWith("image/") ? "image" : "video";
    const preview = type === "image" ? URL.createObjectURL(file) : null;
    setPendingFile({ file, name: file.name, size: file.size, type, preview });
    e.target.value = "";
  };

  const uploadFile = async (file) => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    setUploadProgress(10);
    const { error } = await supabase.storage.from("messages-media").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    setUploadProgress(80);
    const { data: urlData } = supabase.storage.from("messages-media").getPublicUrl(path);
    setUploadProgress(100);
    return urlData.publicUrl;
  };

  const send = async () => {
    const text = input.trim();
    const link = videoUrl.trim();
    if (!text && !link && !pendingFile) return;
    const targetId = isCoach ? selectedAthlete : currentUserId;
    const targetName = isCoach ? (athletes || []).find(a => a.id === selectedAthlete)?.name || "Athlete" : currentUserName;
    let mediaUrl = null, mediaType = null;
    if (pendingFile) {
      try { setUploading(true); mediaUrl = await uploadFile(pendingFile.file); mediaType = pendingFile.type; }
      catch (err) { alert("Upload failed: " + (err.message || "Unknown error")); setUploading(false); return; }
      setUploading(false);
    }
    const msg = { athlete_id: targetId, athlete_name: targetName, sender_id: currentUserId, sender_name: currentUserName, sender_role: isCoach ? "coach" : "athlete", content: text || null, video_url: link || null, media_url: mediaUrl, media_type: mediaType };
    const { data, error } = await supabase.from("messages").insert([msg]).select().single();
    if (!error && data) setMessages(prev => [...prev, data]);
    setInput(""); setVideoUrl(""); setShowLinkInput(false); setPendingFile(null); setUploadProgress(0);
    inputRef.current?.focus();
  };

  const deleteMsg = async (id) => {
    await supabase.from("messages").delete().eq("id", id);
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const filteredAthletes = useMemo(() => {
    if (!athletes) return [];
    const list = search ? athletes.filter(a => a.name.toLowerCase().includes(search.toLowerCase())) : athletes;
    return [...list].sort((a, b) => (unreadCounts[b.id] || 0) - (unreadCounts[a.id] || 0) || a.name.localeCompare(b.name));
  }, [athletes, search, unreadCounts]);

  /* ── Thread ── */
  const renderThread = () => {
    if (loading) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA" }}>Loading…</div>;
    if (!messages.length) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA", fontSize: 14, padding: 40, textAlign: "center" }}>No messages yet. Send a message, photo, or video to get started.</div>;
    let lastDate = "";
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
        {messages.map(msg => {
          const isMine = msg.sender_id === currentUserId;
          const d = new Date(msg.created_at).toLocaleDateString();
          const showDate = d !== lastDate; lastDate = d;
          return (
            <div key={msg.id}>
              {showDate && <div style={{ textAlign: "center", margin: "16px 0 8px", fontSize: 11, color: "#A1A1AA", fontWeight: 600 }}>{d}</div>}
              <div style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                <div style={{ maxWidth: "80%" }}>
                  {!isMine && <div style={{ fontSize: 10, color: "#A1A1AA", marginBottom: 2, fontWeight: 600 }}>{msg.sender_name}</div>}
                  <div style={{ background: isMine ? "#18181B" : "#F4F4F5", color: isMine ? "#fff" : "#18181B", padding: msg.content ? "8px 12px" : "4px", borderRadius: 12, borderBottomRightRadius: isMine ? 4 : 12, borderBottomLeftRadius: isMine ? 12 : 4, fontSize: 14, lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                    {msg.content && <div>{msg.content}</div>}
                    <MediaDisplay msg={msg} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, justifyContent: isMine ? "flex-end" : "flex-start" }}>
                    <span style={{ fontSize: 10, color: "#A1A1AA" }}>{timeAgo(msg.created_at)}</span>
                    {isMine && msg.read_at && <span style={{ fontSize: 10, color: "#16A34A" }}>✓ Read</span>}
                    {isCoach && <button onClick={() => deleteMsg(msg.id)} style={{ background: "none", border: "none", fontSize: 10, color: "#DC2626", cursor: "pointer", padding: 0, opacity: 0.5 }}>Delete</button>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    );
  };

  /* ── Compose bar ── */
  const renderCompose = () => (
    <div style={{ borderTop: "1px solid #E4E4E7", padding: "8px 12px", background: "#FAFAFA", flexShrink: 0 }}>
      {pendingFile && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 8px", background: "#F0F9FF", borderRadius: 8, border: "1px solid #BAE6FD" }}>
          {pendingFile.type === "image" ? <img src={pendingFile.preview} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover" }} /> : <div style={{ width: 48, height: 48, borderRadius: 6, background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🎬</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.name}</div>
            <div style={{ fontSize: 11, color: "#71717A" }}>{(pendingFile.size / 1024 / 1024).toFixed(1)} MB</div>
          </div>
          {uploading ? <div style={{ fontSize: 11, color: "#2563EB", fontWeight: 600 }}>{uploadProgress}%</div> : <button onClick={() => setPendingFile(null)} style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "#A1A1AA", padding: 0 }}>✕</button>}
        </div>
      )}
      {showLinkInput && (
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="Paste video/image URL (YouTube, Loom, etc.)" style={{ flex: 1, padding: "6px 8px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit" }} />
          <button onClick={() => { setShowLinkInput(false); setVideoUrl(""); }} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: "#A1A1AA" }}>✕</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <label title="Take photo or video" style={{ width: 34, height: 34, borderRadius: 8, background: "#F4F4F5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }}>
            📷<input type="file" accept="image/*" capture="environment" onChange={handleFileSelect} style={{ display: "none" }} />
          </label>
          <label title="Choose photo from library" style={{ width: 34, height: 34, borderRadius: 8, background: "#F4F4F5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }}>
            🖼<input type="file" accept="image/*" onChange={handleFileSelect} style={{ display: "none" }} />
          </label>
          <label title="Choose video from library" style={{ width: 34, height: 34, borderRadius: 8, background: "#F4F4F5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }}>
            🎬<input type="file" accept="video/*,video/quicktime,video/mp4,.mov,.mp4,.m4v" onChange={handleFileSelect} style={{ display: "none" }} />
          </label>
          <button onClick={() => setShowLinkInput(v => !v)} title="Paste a link" style={{ width: 34, height: 34, borderRadius: 8, background: showLinkInput ? "#DBEAFE" : "#F4F4F5", border: "none", cursor: "pointer", fontSize: 16 }}>🔗</button>
        </div>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Type a message…" rows={1} style={{ flex: 1, padding: "8px 10px", border: "1px solid #E4E4E7", borderRadius: 10, fontSize: 14, fontFamily: "inherit", resize: "none", maxHeight: 100, lineHeight: 1.4, boxSizing: "border-box" }} onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }} />
        <button onClick={send} disabled={uploading} style={{ width: 36, height: 36, borderRadius: 10, background: "#18181B", color: "#fff", border: "none", cursor: uploading ? "default" : "pointer", fontSize: 16, flexShrink: 0, opacity: uploading ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>↑</button>
      </div>
    </div>
  );

  /* ── Coach with athlete list ── */
  if (isCoach && !athleteId) {
    return (
      <div style={{ display: "flex", height: "calc(100vh - 60px)", background: "#fff" }}>
        <div style={{ width: isMobile ? (selectedAthlete ? 0 : "100%") : 280, borderRight: "1px solid #E4E4E7", overflow: "hidden", flexShrink: 0, transition: "width .2s", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "16px 12px 8px", borderBottom: "1px solid #F4F4F5" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Messages</h3>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search athletes…" style={{ width: "100%", padding: "6px 10px", border: "1px solid #E4E4E7", borderRadius: 6, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredAthletes.map(a => {
              const unread = unreadCounts[a.id] || 0;
              const active = selectedAthlete === a.id;
              return (
                <div key={a.id} onClick={() => setSelectedAthlete(a.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", cursor: "pointer", background: active ? "#F4F4F5" : "transparent", borderBottom: "1px solid #FAFAFA" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 18, background: active ? "#18181B" : "#E4E4E7", color: active ? "#fff" : "#52525B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{getInitials(a.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: "#A1A1AA" }}>{a.sport || ""}{a.age ? ` · ${a.age}` : ""}</div>
                  </div>
                  {unread > 0 && <span style={{ background: "#DC2626", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "2px 6px", minWidth: 18, textAlign: "center" }}>{unread}</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {selectedAthlete ? (
            <>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #E4E4E7", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {isMobile && <button onClick={() => setSelectedAthlete(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: 0 }}>←</button>}
                <div style={{ width: 32, height: 32, borderRadius: 16, background: "#18181B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{getInitials((athletes || []).find(a => a.id === selectedAthlete)?.name || "")}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{(athletes || []).find(a => a.id === selectedAthlete)?.name || "Athlete"}</div>
              </div>
              {renderThread()}
              {renderCompose()}
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA", fontSize: 14 }}>Select an athlete to start messaging</div>
          )}
        </div>
      </div>
    );
  }

  /* ── Athlete view ── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", background: "#fff" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #E4E4E7", flexShrink: 0 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Messages — Coach</h3>
      </div>
      {renderThread()}
      {renderCompose()}
    </div>
  );
}
