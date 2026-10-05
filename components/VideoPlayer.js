"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { embedUrl, isDirectVideo, storageRef, resolveMediaUrl } from "../lib/media";

/*
  Plays a video where the athlete already is.

  YouTube/Vimeo/Loom embed; uploaded clips play in a <video>; anything else (Instagram,
  a web page) falls back to a link, because those cannot be embedded reliably.
  Storage URLs are signed first - see lib/media.js.
*/
export default function VideoPlayer({ url, title, compact, wide }) {
  const embed = embedUrl(url);
  const needsResolve = !embed && (storageRef(url) || isDirectVideo(url));
  const [src, setSrc] = useState(needsResolve ? null : url);

  useEffect(() => {
    let live = true;
    if (!needsResolve) { setSrc(url); return; }
    setSrc(null);
    resolveMediaUrl(url).then(u => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [url, needsResolve]);

  if (!url) return null;

  const frame = {
    position: "relative", width: "100%", maxWidth: wide ? "100%" : compact ? 420 : 560,
    aspectRatio: "16 / 9", background: "#000", borderRadius: 10, overflow: "hidden", marginTop: 8,
  };

  if (embed) {
    return (
      <div style={frame}>
        <iframe
          src={embed}
          title={title || "Exercise video"}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    );
  }

  if (needsResolve) {
    if (!src) return <div style={{ ...frame, display: "flex", alignItems: "center", justifyContent: "center", color: "#A1A1AA", fontSize: 12 }}>Loading video…</div>;
    return (
      <video src={src} controls playsInline preload="metadata"
        style={{ width: "100%", maxWidth: wide ? "100%" : compact ? 420 : 560, borderRadius: 10, marginTop: 8, background: "#000" }} />
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#fff", background: "#2563EB", textDecoration: "none", fontWeight: 700, padding: "5px 12px", borderRadius: 999, marginTop: 6 }}>
      ▶ Open video ↗
    </a>
  );
}

/*
  A "Watch" button that plays the video INSIDE the app, in an overlay, instead of
  opening a new tab. Used everywhere a video used to be a plain link: the coach's
  Programs and Library screens, the block video control, video review, and the
  athlete's own submissions. Videos that cannot be embedded (Instagram, a web page)
  show an "Open video" link inside the overlay instead.

  Rendered through a portal so it sits above everything; clicks inside it are stopped
  so they never reach the card it was opened from (Library cards open an editor).
*/
export function MediaLink({ url, children, style, onClick, title }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const overlay = open && typeof document !== "undefined" ? createPortal(
    <div
      onClick={e => { e.stopPropagation(); setOpen(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 10 }}>
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title || ""}</span>
          <button onClick={() => setOpen(false)} aria-label="Close video" style={{ flexShrink: 0, background: "#fff", color: "#18181B", border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕ Close</button>
        </div>
        <VideoPlayer url={url} title={title} wide />
      </div>
    </div>,
    document.body
  ) : null;
  return (
    <>
      <button
        type="button"
        onClick={e => { if (onClick) onClick(e); e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        style={{ border: "none", cursor: "pointer", fontFamily: "inherit", background: "none", padding: 0, ...style }}
      >
        {children}
      </button>
      {overlay}
    </>
  );
}
