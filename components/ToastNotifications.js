"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

const TOAST_DURATION = 5000;

function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setExiting(true); setTimeout(() => onDismiss(toast.id), 300); }, TOAST_DURATION);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const iconMap = { message: "✉", note: "📋" };
  const bgMap = { message: "#18181B", note: "#1E3A5F" };

  return (
    <div onClick={() => { setExiting(true); setTimeout(() => onDismiss(toast.id), 100); if (toast.onClick) toast.onClick(); }} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
      background: bgMap[toast.type] || "#18181B", color: "#fff", borderRadius: 12,
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)", cursor: "pointer",
      transform: exiting ? "translateY(-20px)" : "translateY(0)",
      opacity: exiting ? 0 : 1,
      transition: "all .3s ease",
      maxWidth: 380, width: "calc(100vw - 32px)",
      fontFamily: "'DM Sans', sans-serif",
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

export default function ToastNotifications({ isCoach, currentUserId, onNavigate }) {
  const [toasts, setToasts] = useState([]);
  const [permissionAsked, setPermissionAsked] = useState(false);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [{ ...toast, id }, ...prev].slice(0, 3));

    // Browser notification (if tab not focused)
    if (document.hidden && Notification.permission === "granted") {
      try {
        const n = new Notification(toast.title, {
          body: toast.body,
          icon: "/icon.png",
          tag: `t2p-${toast.type}-${id}`,
          requireInteraction: false,
        });
        n.onclick = () => { window.focus(); n.close(); if (toast.onClick) toast.onClick(); };
      } catch (e) { /* silent */ }
    }

    // Play sound
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) { /* silent */ }
  }, []);

  // Request browser notification permission
  useEffect(() => {
    if (permissionAsked) return;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      const timer = setTimeout(() => {
        Notification.requestPermission();
        setPermissionAsked(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
    setPermissionAsked(true);
  }, [permissionAsked]);

  // Subscribe to messages
  useEffect(() => {
    const myRole = isCoach ? "coach" : "athlete";
    let filter;
    if (isCoach) {
      // Coach gets notified of all athlete messages
      filter = "sender_role=eq.athlete";
    } else {
      // Athlete gets notified of coach messages to them
      filter = `athlete_id=eq.${currentUserId}`;
    }

    const ch = supabase.channel(`toast-msg-${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter }, (p) => {
        const msg = p.new;
        // Don't notify on own messages
        if (msg.sender_role === myRole) return;
        addToast({
          type: "message",
          title: `New message from ${msg.sender_name}`,
          body: msg.content || (msg.media_url ? "Sent a photo/video" : msg.video_url ? "Shared a link" : ""),
          onClick: onNavigate ? () => onNavigate("messages", msg.athlete_id) : undefined,
        });
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [isCoach, currentUserId, addToast, onNavigate]);

  // Subscribe to notes
  useEffect(() => {
    const myRole = isCoach ? "coach" : "athlete";

    const ch = supabase.channel(`toast-notes-${currentUserId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "athlete_notes" }, (p) => {
        const note = p.new;
        if (note.author_role === myRole) return;
        // For coach: notify on all athlete notes. For athlete: only their own notes
        if (!isCoach && note.athlete_id !== currentUserId) return;
        addToast({
          type: "note",
          title: `New note from ${note.author_name}`,
          body: note.content?.slice(0, 100) || "",
          onClick: onNavigate ? () => onNavigate("programs", note.athlete_id) : undefined,
        });
      })
      .subscribe();

    return () => supabase.removeChannel(ch);
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
