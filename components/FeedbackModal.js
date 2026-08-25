"use client";
import { useState, useEffect, useRef } from "react";
import { Modal, Btn } from "./ui";

/*
  A proper editor for coaching text.

  Video feedback and note replies both used window.prompt, which gives a single cramped
  line with no wrapping, no newlines and no way to review what you wrote. Real coaching
  notes run to a paragraph - the input should not be the reason they get shortened.

  Closing with unsaved text asks first. Losing a written paragraph to a stray click is
  the same class of problem as losing a logged workout.
*/
export default function FeedbackModal({
  open,
  title,
  label,
  initialValue = "",
  placeholder = "",
  saveLabel = "Save",
  onSave,
  onClose,
}) {
  const [text, setText] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const areaRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setText(initialValue || "");
    setSaving(false);
    const t = setTimeout(() => {
      const el = areaRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 60);
    return () => clearTimeout(t);
  }, [open, initialValue]);

  const dirty = (text || "") !== (initialValue || "");

  const attemptClose = () => {
    if (saving) return;
    if (dirty && !window.confirm("Discard what you've written?")) return;
    onClose();
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(text);
      onClose();
    } catch (e) {
      // onSave surfaces its own message; keep the modal open so the text is not lost.
      console.error("FeedbackModal save failed", e);
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); }
  };

  return (
    <Modal open={open} onClose={attemptClose} title={title}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {label && <div style={{ fontSize: 12, color: "#71717A", lineHeight: 1.5 }}>{label}</div>}
        <textarea
          ref={areaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={9}
          style={{
            width: "100%", minHeight: 180, padding: "10px 12px",
            border: "1px solid #E4E4E7", borderRadius: 8,
            fontSize: 14, fontFamily: "inherit", lineHeight: 1.55,
            boxSizing: "border-box", resize: "vertical", color: "#18181B",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Btn onClick={save} disabled={saving || !text.trim()}>
            {saving ? "Saving…" : saveLabel}
          </Btn>
          <Btn variant="secondary" onClick={attemptClose} disabled={saving}>Cancel</Btn>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#A1A1AA" }}>
            {text.trim().length} characters · {"⌘↵"} to save
          </span>
        </div>
      </div>
    </Modal>
  );
}
