"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const TOAST_DURATION = 6000;
const POLL_INTERVAL = 5000;

function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setExiting(true); setTimeout(() => onDismiss(toast.id), 300); }, TOAST_DURATION);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const iconMap = { message: "✉️", note: "📋" };
  const bgMap = { message: "#18181B", note: "#1E3A5F" };

  return (
    <div onClick={() => { setExiting(true); setTimeout(() => onDismiss(toast.id), 100); if (toast.onClick) toast.onClick(); }} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
      background: bgMap[toast.type] || "#18181B", color: "#fff", borderRadius: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)", cursor: "pointer",
      transform: exiting ? "translateY(-20px)" : "translateY(0)",
      opacity: exiting ? 0 : 1, transition: "all .3s ease",
      maxWidth: 380, width: "calc(100vw - 32px)", fontFamily: "'DM Sans', sans-serif",
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{iconMap[toast.type] || "🔔"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{toast.title}</div>
        <div style={{ fontSize: 12, color: "#D4D4D8", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.body}</div>
      </div>
      <span style={{ fontSize: 14, color: "#71717A", flexShrink: 0 }}>✕</span>
    </div>
  );
}

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = "sine";
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch (e) { /* silent */ }
}

function sendBrowserNotif(title, body, onClick) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (!document.hidden) return; // only when tab not focused
  try {
    const n = new Notification(title, { body, icon: "/icon.png", tag: `t2p-${Date.now()}`, requireInteraction: false });
    n.onclick = () => { window.focus(); n.close(); if (onClick) onClick(); };
  } catch (e) { /* silent */ }
}

export default function ToastNotifications({ isCoach, currentUserId, onNavigate }) {
  const [toasts, setToasts] = useState([]);
  const seenMsgIds = useRef(new Set());
  const seenNoteIds = useRef(new Set());
  const initialized = useRef(false);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [{ ...toast, id }, ...prev].slice(0, 3));
    playNotifSound();
    sendBrowserNotif(toast.title, toast.body, toast.onClick);
  }, []);

  // Request browser notification permission
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      const t = setTimeout(() => Notification.requestPermission(), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  // Poll for new messages every 5 seconds
  useEffect(() => {
    const myRole = isCoach ? "coach" : "athlete";

    const pollMessages = async () => {
      let q = supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(5);
      if (isCoach) {
        q = q.eq("sender_role", "athlete").is("read_at", null);
      } else {
        q = q.eq("athlete_id", currentUserId).eq("sender_role", "coach").is("read_at", null);
      }
      const { data } = await q;
      if (!data) return;

      // On first poll, just seed the seen set — don't show toasts for existing unreads
      if (!initialized.current) {
        data.forEach(m => seenMsgIds.current.add(m.id));
        return;
      }

      data.forEach(msg => {
        if (seenMsgIds.current.has(msg.id)) return;
        seenMsgIds.current.add(msg.id);
        addToast({
          type: "message",
          title: `New message from ${msg.sender_name}`,
          body: msg.content || (msg.media_url ? "Sent a photo/video" : msg.video_url ? "Shared a link" : "New message"),
          onClick: onNavigate ? () => onNavigate("messages", msg.athlete_id) : undefined,
        });
      });
    };

    const pollNotes = async () => {
      let q = supabase.from("athlete_notes").select("*").order("created_at", { ascending: false }).limit(5);
      if (!isCoach) {
        q = q.eq("athlete_id", currentUserId).eq("author_role", "coach");
      } else {
        q = q.eq("author_role", "athlete");
      }
      // Only get notes from last 60 seconds to avoid old ones
      const cutoff = new Date(Date.now() - 60000).toISOString();
      q = q.gt("created_at", cutoff);
      const { data } = await q;
      if (!data) return;

      if (!initialized.current) {
        data.forEach(n => seenNoteIds.current.add(n.id));
        initialized.current = true;
        return;
      }

      data.forEach(note => {
        if (seenNoteIds.current.has(note.id)) return;
        seenNoteIds.current.add(note.id);
        addToast({
          type: "note",
          title: `New note from ${note.author_name}`,
          body: note.content?.slice(0, 100) || "New note",
          onClick: onNavigate ? () => onNavigate("programs", note.athlete_id) : undefined,
        });
      });
    };

    // Initial poll (seed seen IDs)
    pollMessages().then(() => pollNotes());

    const iv = setInterval(() => {
      pollMessages();
      pollNotes();
    }, POLL_INTERVAL);

    return () => clearInterval(iv);
  }, [isCoach, currentUserId, addToast, onNavigate]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, alignItems: "center",
    }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={dismiss} />)}
    </div>
  );
}
