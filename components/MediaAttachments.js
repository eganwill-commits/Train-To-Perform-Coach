"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { resolveMediaUrl, storageRef } from "../lib/media";
import { uploadFeedbackMedia, mediaKind, mediaList, MAX_ATTACHMENTS } from "../lib/feedbackMedia";

/*
  Attachments on coaching text: the composer (pick, paste a screenshot, drag a file in)
  and the display (thumbnails, tap a photo to see it full screen, clips play inline).

  The composer uploads each file the moment it is added, so pressing Send is not the
  thing that waits on a 40MB clip. It reports busy while anything is still going up and
  the caller disables Send until it isn't.
*/

function useResolved(url) {
  const [u, setU] = useState(url && storageRef(url) ? null : url);
  useEffect(() => {
    let live = true;
    if (!url || !storageRef(url)) { setU(url); return; }
    resolveMediaUrl(url).then(r => { if (live) setU(r); });
    return () => { live = false; };
  }, [url]);
  return u;
}

function Lightbox({ src, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, cursor: "zoom-out" }}
    >
      <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6 }} />
      <button onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 12, right: 14, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", fontSize: 20, width: 36, height: 36, borderRadius: 18, cursor: "pointer" }}>✕</button>
    </div>
  );
}

function Thumb({ item, size, onRemove, progress, error }) {
  const src = useResolved(item.url);
  const [zoom, setZoom] = useState(false);
  const box = { position: "relative", width: size, height: size, borderRadius: 8, overflow: "hidden", background: "#F4F4F5", border: "1px solid #E4E4E7", flex: "0 0 auto" };
  return (
    <div style={box}>
      {!src ? (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#A1A1AA" }}>…</div>
      ) : item.type === "image" ? (
        <img src={src} alt={item.name || ""} onClick={() => setZoom(true)} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in", display: "block" }} />
      ) : (
        <video src={src} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" }} />
      )}
      {item.type === "video" && src && <div style={{ position: "absolute", left: 4, bottom: 4, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,.6)", borderRadius: 4, padding: "1px 5px", pointerEvents: "none" }}>▶ video</div>}
      {progress != null && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.75)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#18181B" }}>{progress}%</div>
      )}
      {error && (
        <div title={error} style={{ position: "absolute", inset: 0, background: "rgba(254,242,242,.92)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#DC2626", textAlign: "center", padding: 4 }}>Failed</div>
      )}
      {onRemove && (
        <button onClick={onRemove} aria-label="Remove attachment" style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 10, border: "none", background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 11, lineHeight: "20px", padding: 0, cursor: "pointer" }}>✕</button>
      )}
      {zoom && src && <Lightbox src={src} onClose={() => setZoom(false)} />}
    </div>
  );
}

/*
  Read-only attachments under a piece of feedback. Photos are thumbnails you can open;
  a single video plays inline at full width (that's usually the point of it).
*/
function InlineVideo({ item }) {
  const src = useResolved(item.url);
  if (!src) return <div style={{ fontSize: 11, color: "#A1A1AA" }}>Loading video…</div>;
  return <video src={src} controls playsInline preload="metadata" style={{ display: "block", width: "100%", maxHeight: 420, borderRadius: 8, background: "#000" }} />;
}

export function AttachmentDisplay({ media, size = 84, style }) {
  const list = mediaList(media);
  if (!list.length) return null;
  const images = list.filter(m => m.type === "image");
  const videos = list.filter(m => m.type === "video");
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {images.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {images.map((m, i) => <Thumb key={m.url + i} item={m} size={size} />)}
        </div>
      )}
      {videos.map((m, i) => <InlineVideo key={m.url + i} item={m} />)}
    </div>
  );
}

/*
  Composer. Wrap the textarea in it:

    <AttachmentComposer athleteId={id} value={media} onChange={setMedia} onBusyChange={setBusy}>
      <textarea ... />
    </AttachmentComposer>

  - "Add photo / video" opens the picker (camera roll on a phone).
  - ⌘V with a screenshot on the clipboard attaches it; pasting text still pastes text.
  - Dragging files onto the box attaches them.
*/
export function AttachmentComposer({ athleteId, value, onChange, onBusyChange, children, compact, disabled }) {
  const list = mediaList(value);
  const [pending, setPending] = useState([]); // { id, name, type, preview, progress, error }
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const valueRef = useRef(list);
  valueRef.current = list;

  useEffect(() => { if (onBusyChange) onBusyChange(pending.some(p => !p.error)); }, [pending, onBusyChange]);

  const addFiles = useCallback(async (files) => {
    const arr = Array.from(files || []).filter(f => mediaKind(f));
    if (!arr.length) return;
    const room = MAX_ATTACHMENTS - valueRef.current.length - pending.filter(p => !p.error).length;
    if (room <= 0) { window.alert(`Up to ${MAX_ATTACHMENTS} attachments per note.`); return; }
    const take = arr.slice(0, room);
    if (arr.length > room) window.alert(`Only the first ${room} added: up to ${MAX_ATTACHMENTS} attachments per note.`);

    await Promise.all(take.map(async (file) => {
      const id = Math.random().toString(36).slice(2);
      const type = mediaKind(file);
      const preview = URL.createObjectURL(file);
      setPending(p => [...p, { id, name: file.name, type, preview, progress: 0, error: null }]);
      try {
        const item = await uploadFeedbackMedia(file, athleteId, {
          onProgress: (pct) => setPending(p => p.map(x => x.id === id ? { ...x, progress: pct } : x)),
        });
        valueRef.current = [...valueRef.current, item];
        onChange(valueRef.current);
        setPending(p => p.filter(x => x.id !== id));
        URL.revokeObjectURL(preview);
      } catch (e) {
        setPending(p => p.map(x => x.id === id ? { ...x, error: e.message || "Upload failed" } : x));
        window.alert(e.message || "That attachment could not be uploaded.");
      }
    }));
  }, [athleteId, onChange, pending]);

  const onPaste = (e) => {
    if (disabled) return;
    const files = Array.from(e.clipboardData?.files || []).filter(f => mediaKind(f));
    if (!files.length) return; // plain text paste
    e.preventDefault();
    addFiles(files);
  };

  const onDrop = (e) => {
    if (disabled) return;
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  };

  const remove = (url) => onChange(valueRef.current.filter(m => m.url !== url));
  const size = compact ? 56 : 72;
  const hasAny = list.length > 0 || pending.length > 0;

  return (
    <div
      onPaste={onPaste}
      onDragOver={(e) => { if (!disabled && e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={onDrop}
      style={{ position: "relative", borderRadius: 10, outline: drag ? "2px dashed #2563EB" : "none", outlineOffset: 3 }}
    >
      {children}
      {hasAny && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {list.map((m, i) => <Thumb key={m.url + i} item={m} size={size} onRemove={disabled ? null : () => remove(m.url)} />)}
          {pending.map(p => (
            <Thumb
              key={p.id}
              item={{ url: p.preview, type: p.type, name: p.name }}
              size={size}
              progress={p.error ? null : p.progress}
              error={p.error}
              onRemove={p.error ? () => setPending(x => x.filter(y => y.id !== p.id)) : null}
            />
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: compact ? "4px 10px" : "6px 12px", borderRadius: 999, border: "1px solid #D4D4D8", background: "#fff", color: "#3F3F46", fontSize: compact ? 11 : 12, fontWeight: 700, fontFamily: "inherit", cursor: disabled ? "default" : "pointer" }}
        >
          📎 Add photo / video
        </button>
        {!compact && <span style={{ fontSize: 11, color: "#A1A1AA" }}>or paste a screenshot (⌘V) / drag files here</span>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          style={{ display: "none" }}
        />
      </div>
      {drag && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(37,99,235,.06)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#2563EB", pointerEvents: "none" }}>Drop to attach</div>
      )}
    </div>
  );
}
