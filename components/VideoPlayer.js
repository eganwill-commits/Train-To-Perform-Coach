"use client";
import { useEffect, useState } from "react";
import { embedUrl, isDirectVideo, storageRef, resolveMediaUrl } from "../lib/media";

/*
  Plays a video where the athlete already is.

  YouTube/Vimeo/Loom embed; uploaded clips play in a <video>; anything else (Instagram,
  a web page) falls back to a link, because those cannot be embedded reliably.
  Storage URLs are signed first - see lib/media.js.
*/
export default function VideoPlayer({ url, title, compact }) {
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
    position: "relative", width: "100%", maxWidth: compact ? 420 : 560,
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
        style={{ width: "100%", maxWidth: compact ? 420 : 560, borderRadius: 10, marginTop: 8, background: "#000" }} />
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
  A link that resolves a storage URL before opening it - for places that keep a
  "Watch" button rather than an inline player (the coach's review list).
*/
export function MediaLink({ url, children, style, onClick }) {
  const [href, setHref] = useState(storageRef(url) ? null : url);
  useEffect(() => {
    let live = true;
    if (!storageRef(url)) { setHref(url); return; }
    resolveMediaUrl(url).then(u => { if (live) setHref(u); });
    return () => { live = false; };
  }, [url]);
  return (
    <a href={href || "#"} target="_blank" rel="noopener noreferrer" onClick={e => { if (onClick) onClick(e); if (!href) e.preventDefault(); }} style={style}>
      {children}
    </a>
  );
}
