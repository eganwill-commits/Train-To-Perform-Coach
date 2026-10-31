"use client";
import { useState } from "react";
import { MediaLink } from "./VideoPlayer";
import { AttachmentDisplay } from "./MediaAttachments";
import { mediaList } from "../lib/feedbackMedia";

/*
  "Last time" panel on a video review.

  Shows the athlete's previous review of the same slot in the program (or the same
  exercise, when the clip is not tied to a program block): the feedback written on it,
  a Watch link for each clip, and what the athlete logged that day. Progressions change
  the exercise name week to week (Elevated Counterweight Pistol Squat becomes Elevated
  Pistol Squat), so the previous exercise name is shown whenever it differs.

  Used on the review card and inside the feedback modal, so last week's notes are in
  view while this week's are written.
*/
const pillStyle = {
  display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700,
  padding: "4px 11px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
  color: "#fff", background: "#6D28D9",
};

function shortDate(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const LONG = 280;

export default function PreviousReview({ prev, currentName, compact }) {
  const [expanded, setExpanded] = useState(false);
  if (!prev) return null;
  const { group, logged } = prev;
  const lead = group.lead;
  const clips = group.clips;
  const multi = clips.length > 1;
  const fb = (lead.coach_feedback || "").trim();
  const hasMedia = mediaList(lead.coach_feedback_media).length > 0;
  const week = lead.week_label ? lead.week_label.split(/[·—]/)[0].trim() : "";
  const nameDiffers = (lead.exercise_name || "").trim().toLowerCase() !== (currentName || "").trim().toLowerCase();
  const long = fb.length > LONG;
  const shownFb = long && !expanded ? `${fb.slice(0, LONG).replace(/\s+\S*$/, "")}…` : fb;
  const loggedBits = logged ? [
    logged.reps ? String(logged.reps) : null,
    logged.load ? `@ ${logged.load}` : null,
  ].filter(Boolean).join(" ") : "";
  const loggedNote = (logged?.notes || "").trim();

  return (
    <div style={{ marginTop: compact ? 0 : 10, padding: "10px 12px", background: "#FAF5FF", border: "1px solid #DDD6FE", borderRadius: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#5B21B6", textTransform: "uppercase", letterSpacing: 0.5 }}>
        Last time · {[week, shortDate(group.latest.created_at)].filter(Boolean).join(" · ")}
      </div>
      {nameDiffers && lead.exercise_name && (
        <div style={{ fontSize: 13, fontWeight: 700, color: "#18181B", marginTop: 3 }}>{lead.exercise_name}</div>
      )}

      <div style={{ marginTop: 6, fontSize: 13, color: "#27272A", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
        {fb ? shownFb : (
          <span style={{ color: "#71717A", fontStyle: "italic" }}>
            {hasMedia ? "Photo or clip feedback only." : group.state === "needs-work" ? "Marked needs work, no written feedback." : group.state === "reviewed-silent" ? "Marked reviewed, no written feedback." : "Not reviewed yet."}
          </span>
        )}
      </div>
      {long && (
        <button onClick={() => setExpanded(x => !x)} style={{ background: "none", border: "none", padding: 0, marginTop: 2, color: "#6D28D9", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
      <AttachmentDisplay media={lead.coach_feedback_media} size={56} />

      {(loggedBits || loggedNote) && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#52525B" }}>
          <b style={{ color: "#15803D" }}>Logged</b>{loggedBits ? ` ${loggedBits}` : ""}
          {loggedNote && <span style={{ fontStyle: "italic" }}>{loggedBits ? " · " : " "}"{loggedNote}"</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {clips.map((c, i) => (
          <MediaLink key={c.id} url={c.video_url} title={`${c.exercise_name || "Video"} · last time${multi ? ` · clip ${i + 1}` : ""}`} style={pillStyle}>
            ▶ Watch last time{multi ? ` · clip ${i + 1}` : ""}
          </MediaLink>
        ))}
      </div>
    </div>
  );
}
