"use client";
import { useState, useEffect, useMemo, useRef, Component } from "react";
import { postComment, markCommentsRead, fetchVideoReplies, COMMENT_ROLE } from "../lib/comments";
import { buildMovementTopics, unreadIn, whereLabel, normName } from "../lib/movementTimeline";
import { AttachmentComposer, AttachmentDisplay } from "./MediaAttachments";
import { MediaLink } from "./VideoPlayer";
import { mediaList, mediaErrorMessage } from "../lib/feedbackMedia";

/*
  The conversation about one movement.

  Same component on both sides. Every piece of back-and-forth about this exercise shows
  here as a "topic" - a filmed set and its feedback, a log note and the coach's answer, or
  a plain question - with a Reply under each one, so nobody has to describe which
  exercise or which video they mean. Topics from earlier sessions of the same movement
  sit underneath, so Week 2's bench conversation is still there when bench comes round in
  Week 5.

  Wrapped in a boundary at the bottom of this file. A notification component that threw
  during mount once took every athlete's program down with it; a comment box is a
  convenience and must never be able to do that again.
*/

const C = {
  coachBg: "#EFF6FF", coachBorder: "#BFDBFE", coachName: "#1E40AF",
  athBg: "#F4F4F5", athBorder: "#E4E4E7", athName: "#3F3F46",
  fbBg: "#F0FDF4", fbBorder: "#86EFAC", fbName: "#15803D",
};

const when = (x) => {
  if (!x) return "";
  const d = new Date(x);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
         d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

function Bubble({ who, at, tone, children }) {
  const t = tone === "coach" ? [C.coachBg, C.coachBorder, C.coachName]
          : tone === "feedback" ? [C.fbBg, C.fbBorder, C.fbName]
          : [C.athBg, C.athBorder, C.athName];
  return (
    <div style={{ marginTop: 5, padding: "6px 9px", borderRadius: 8, background: t[0], border: `1px solid ${t[1]}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: t[2] }}>{who}</span>
        {at && <span style={{ fontSize: 10, color: "#A1A1AA" }}>{at}</span>}
      </div>
      {children}
    </div>
  );
}

const Text = ({ children }) => children
  ? <div style={{ fontSize: 13, color: "#18181B", whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2, lineHeight: 1.45 }}>{children}</div>
  : null;

function Composer({ athleteId, role, placeholder, onSend, onCancel, autoFocus, compact }) {
  const [text, setText] = useState("");
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 30); }, [autoFocus]);

  const empty = !text.trim() && !media.length;
  const send = async () => {
    if (empty || busy || uploading) return;
    setBusy(true);
    try {
      await onSend(text.trim(), media);
      setText(""); setMedia([]);
    } catch (e) {
      // Keep what they wrote on screen.
      window.alert(mediaErrorMessage(e) || "That could not be sent. Your text is still here - try again.");
    } finally { setBusy(false); }
  };
  return (
    <div style={{ marginTop: 6 }}>
      <AttachmentComposer athleteId={athleteId} value={media} onChange={setMedia} onBusyChange={setUploading} compact disabled={busy}>
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); } }}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          style={{
            width: "100%", padding: "8px 10px", border: "1px solid #E4E4E7", borderRadius: 8,
            fontSize: 14, fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
            resize: "vertical", color: "#18181B", minHeight: 52, background: "#fff",
          }}
        />
      </AttachmentComposer>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
        <button
          onClick={send}
          disabled={busy || uploading || empty}
          style={{
            padding: "6px 14px", background: "#18181B", color: "#fff", border: "none",
            borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            cursor: busy || uploading || empty ? "default" : "pointer",
            opacity: busy || uploading || empty ? 0.4 : 1,
          }}
        >{uploading ? "Uploading…" : busy ? "Sending…" : "Send"}</button>
        {onCancel && <button onClick={onCancel} style={{ background: "none", border: "none", color: "#71717A", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Cancel</button>}
        <span style={{ fontSize: 10, color: "#A1A1AA", marginLeft: "auto" }}>{role === COMMENT_ROLE.COACH ? "They'll get a notification" : "Your coach gets a notification"}</span>
      </div>
    </div>
  );
}

function Topic({ t, role, athleteId, here, replyOpen, onReply, onCancel, onSend, compact, cardName }) {
  const coach = role === COMMENT_ROLE.COACH;
  const you = (r) => r === role;
  const nameOf = (c) => you(c.author_role) ? "You" : (c.author_name || (c.author_role === COMMENT_ROLE.COACH ? "Coach" : "Athlete"));
  const where = whereLabel(t.weekLabel, t.dayLabel);

  const head = t.kind === "video"
    ? { icon: "🎥", label: coach ? "Filmed set" : "Your video" }
    : t.kind === "log"
      ? { icon: "📝", label: coach ? "Log note" : "Your log note" }
      : { icon: "💬", label: "Question" };

  const v = t.video, l = t.log;
  const fb = v && ((v.coach_feedback || "").trim() || mediaList(v.coach_feedback_media).length);
  const cr = l && ((l.coach_reply || "").trim() || mediaList(l.coach_reply_media).length);

  return (
    <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "#fff", border: "1px solid #E4E4E7" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "#18181B", letterSpacing: 0.2 }}>{head.icon} {head.label}</span>
        {where && (
          <span style={{ fontSize: 10, fontWeight: 700, color: here ? "#B45309" : "#52525B", background: here ? "#FEF3C7" : "#F4F4F5", padding: "1px 7px", borderRadius: 999 }}>
            {here ? "This session" : where}
          </span>
        )}
        {t.exerciseName && normName(t.exerciseName) !== normName(cardName) && <span style={{ fontSize: 10, color: "#A1A1AA" }}>as {t.exerciseName}</span>}
        {v && (
          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
            {(t.clips || [v]).map((c, i, arr) => (
              <MediaLink key={c.id} url={c.video_url} title={c.exercise_name} style={{ fontSize: 11.5, color: "#2563EB", fontWeight: 700, textDecoration: "none" }}>
                ▶ {arr.length > 1 ? `Clip ${i + 1}` : "Watch"}
              </MediaLink>
            ))}
          </span>
        )}
      </div>

      {v && (t.clips || [v]).filter(c => (c.notes || "").trim()).map(c => (
        <Bubble key={"q" + c.id} who={coach ? (c.athlete_name || "Athlete") : "You"} at={when(c.created_at)} tone="athlete"><Text>{c.notes}</Text></Bubble>
      ))}
      {v && (fb ? (
        <Bubble who={coach ? "Your feedback" : "Coach feedback"} tone="feedback">
          <Text>{v.coach_feedback}</Text>
          <AttachmentDisplay media={v.coach_feedback_media} size={compact ? 64 : 80} style={{ marginTop: 4 }} />
        </Bubble>
      ) : (
        <div style={{ marginTop: 5, fontSize: 11.5, color: "#C2410C", fontWeight: 600 }}>
          {coach ? "Waiting on your feedback" : "Waiting on coach feedback"}
        </div>
      ))}

      {l && (l.notes || "").trim() && (
        <Bubble who={coach ? (l.athlete_name || "Athlete") : "You"} at={when(l.logged_at)} tone="athlete"><Text>{l.notes}</Text></Bubble>
      )}
      {l && cr && (
        <Bubble who={coach ? "You" : "Coach"} at={when(l.coach_reply_at)} tone="coach">
          <Text>{l.coach_reply}</Text>
          <AttachmentDisplay media={l.coach_reply_media} size={compact ? 64 : 80} style={{ marginTop: 4 }} />
        </Bubble>
      )}

      {t.replies.map(c => (
        <Bubble key={c.id} who={nameOf(c)} at={when(c.created_at) + (c.edited_at ? " · edited" : "")} tone={c.author_role === COMMENT_ROLE.COACH ? "coach" : "athlete"}>
          <Text>{c.body}</Text>
          <AttachmentDisplay media={c.media} size={compact ? 64 : 80} style={{ marginTop: 4 }} />
        </Bubble>
      ))}

      {replyOpen ? (
        <Composer
          athleteId={athleteId} role={role} compact={compact} autoFocus
          placeholder={t.kind === "video" ? (coach ? "Reply about this video…" : "Reply to the feedback on this video…")
            : t.kind === "log" ? (coach ? "Reply about this log…" : "Reply to your coach about this…")
            : "Reply…"}
          onSend={onSend}
          onCancel={onCancel}
        />
      ) : (
        <button onClick={onReply} style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ↩ Reply
        </button>
      )}
    </div>
  );
}

function ExerciseThreadInner({
  athleteId, programId, weekLabel, dayLabel, dayId, blockId, exerciseName,
  names, relatedNames, role, authorName, compact, autoOpen,
  // Every comment, video and log for this athlete, already loaded by the parent in one
  // query each. The thread picks out this movement's share; fifty cards on a week must
  // not mean fifty round trips.
  comments, videos, logs, currentLogId,
  onChanged,
}) {
  const coach = role === COMMENT_ROLE.COACH;
  const allNames = useMemo(() => [exerciseName, ...(names || [])].filter(Boolean), [exerciseName, names]);
  const { current, earlier } = useMemo(() => buildMovementTopics({
    athleteId, blockId, names: allNames, relatedNames, weekLabel, dayLabel,
    comments, videos, logs, currentLogId,
  }), [athleteId, blockId, allNames, relatedNames, weekLabel, dayLabel, comments, videos, logs, currentLogId]);

  const unreadNow = unreadIn(current, role);
  const unreadEarlier = unreadIn(earlier, role);
  const unread = unreadNow.length + unreadEarlier.length;

  // Anything said in this session is shown without a tap: feedback you can't see is
  // feedback you can't answer.
  const [open, setOpen] = useState(!!autoOpen || current.length > 0 || unread > 0);
  const [showEarlier, setShowEarlier] = useState(unreadEarlier.length > 0);
  const [replyTo, setReplyTo] = useState(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  useEffect(() => { if (current.length > 0 || unread > 0) setOpen(true); }, [current.length, unread]);
  useEffect(() => { if (unreadEarlier.length > 0) setShowEarlier(true); }, [unreadEarlier.length]);

  // Opening is what marks the other side's messages read - only the ones on screen.
  const visibleUnread = [...(open ? unreadNow : []), ...(open && showEarlier ? unreadEarlier : [])];
  const visibleKey = visibleUnread.join(",");
  useEffect(() => {
    if (!visibleKey) return;
    markCommentsRead(visibleKey.split(",")).then(() => onChanged && onChanged());
  }, [visibleKey]);

  const send = (topic) => async (body, media) => {
    // A reply lands on the card the thing it answers came from, so the notification
    // opens the right session. A new question lands on this card.
    // Anything with no card of its own (an old log, a clip sent from the Videos page)
    // is answered on this card, labelled as this session.
    const target = topic && topic.blockId && topic.blockId !== blockId ? topic : null;
    await postComment({
      athleteId, programId,
      weekLabel: target ? (target.weekLabel || weekLabel) : weekLabel,
      dayLabel: target ? (target.dayLabel || dayLabel) : dayLabel,
      dayId: target ? null : dayId,
      blockId: target ? target.blockId : blockId,
      exerciseName: topic?.exerciseName || exerciseName,
      authorRole: role, authorName, body, media,
      videoId: topic?.kind === "video" ? topic.video.id : null,
      logId: topic?.kind === "log" ? topic.log.id : null,
    });
    setReplyTo(null);
    setAsking(false);
    if (onChanged) await onChanged();
  };

  const total = current.length + earlier.length;
  const label = coach
    ? (total ? "Conversation" : "Add note / question")
    : (total ? "Coach conversation" : "Ask your coach");

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #D4D4D8" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          padding: 0, cursor: "pointer", fontFamily: "inherit", width: "100%", textAlign: "left", flexWrap: "wrap",
          fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
          color: unread > 0 ? "#B45309" : "#71717A",
        }}
      >
        <span>{"💬"}</span>
        <span>{label}</span>
        {total > 0 && (
          <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, color: "#A1A1AA", whiteSpace: "nowrap" }}>
            {[current.length ? `${current.length} now` : "", earlier.length ? `${earlier.length} earlier` : ""].filter(Boolean).join(" · ")}
          </span>
        )}
        {unread > 0 && (
          <span style={{ background: "#DC2626", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 9, padding: "1px 6px", letterSpacing: 0 }}>
            {unread} new
          </span>
        )}
        <span style={{ fontSize: 9, color: "#A1A1AA", marginLeft: "auto" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div>
          {current.map(t => (
            <Topic key={t.key} t={t} role={role} athleteId={athleteId} here compact={compact} cardName={exerciseName}
              replyOpen={replyTo === t.key}
              onReply={() => { setReplyTo(t.key); setAsking(false); }}
              onCancel={() => setReplyTo(null)}
              onSend={send(t)} />
          ))}

          {asking ? (
            <Composer
              athleteId={athleteId} role={role} compact={compact} autoFocus
              placeholder={coach ? "Note or question on this exercise…" : "Ask your coach about this exercise…"}
              onSend={send(null)}
              onCancel={total ? () => setAsking(false) : null}
            />
          ) : (
            <button
              onClick={() => { setAsking(true); setReplyTo(null); }}
              style={{ marginTop: 8, display: "block", background: "none", border: "1px dashed #D4D4D8", borderRadius: 8, padding: "6px 10px", width: "100%", color: "#52525B", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
            >
              + {coach ? "New note or question" : "New question for your coach"}
            </button>
          )}

          {earlier.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => setShowEarlier(!showEarlier)}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: unreadEarlier.length ? "#B45309" : "#52525B" }}
              >
                {showEarlier ? "▾" : "▸"} Earlier on this movement ({earlier.length})
                {unreadEarlier.length > 0 && <span style={{ marginLeft: 6, background: "#DC2626", color: "#fff", fontSize: 9, borderRadius: 9, padding: "1px 6px" }}>{unreadEarlier.length} new</span>}
              </button>
              {showEarlier && earlier.map(t => (
                <Topic key={t.key} t={t} role={role} athleteId={athleteId} here={false} compact={compact} cardName={exerciseName}
                  replyOpen={replyTo === t.key}
                  onReply={() => { setReplyTo(t.key); setAsking(false); }}
                  onCancel={() => setReplyTo(null)}
                  onSend={send(t)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/*
  Replies under one video's feedback, for screens that list videos rather than exercises
  (the athlete's Videos page, the coach's review queue). Posts the same exercise comment
  the exercise card does, so whichever screen a reply is written on, it shows on both.
*/
function VideoRepliesInner({ video, clips, role, authorName, compact, onChanged }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const coach = role === COMMENT_ROLE.COACH;
  const load = async () => {
    setRows(await fetchVideoReplies(video.athlete_id, (clips && clips.length ? clips : [video]).map(c => c.id)));
  };
  useEffect(() => { if (video?.id) load(); }, [video?.id]);

  const other = coach ? COMMENT_ROLE.ATHLETE : COMMENT_ROLE.COACH;
  const unreadIds = rows.filter(r => r.author_role === other && !r.read_at).map(r => r.id);
  const unreadKey = unreadIds.join(",");
  useEffect(() => { if (unreadKey) markCommentsRead(unreadKey.split(",")).then(load); }, [unreadKey]);

  if (!video) return null;
  const send = async (body, media) => {
    await postComment({
      athleteId: video.athlete_id, programId: video.program_id,
      weekLabel: video.week_label, dayLabel: video.day_label,
      blockId: video.block_id || "video-" + video.id,
      exerciseName: video.exercise_name,
      authorRole: role, authorName, body, media, videoId: video.id,
    });
    setOpen(false);
    await load();
    if (onChanged) onChanged();
  };
  return (
    <div style={{ marginTop: 6 }}>
      {rows.map(c => (
        <Bubble key={c.id} who={c.author_role === role ? "You" : (c.author_name || (c.author_role === COMMENT_ROLE.COACH ? "Coach" : "Athlete"))} at={when(c.created_at) + (c.edited_at ? " · edited" : "")} tone={c.author_role === COMMENT_ROLE.COACH ? "coach" : "athlete"}>
          <Text>{c.body}</Text>
          <AttachmentDisplay media={c.media} size={compact ? 64 : 80} style={{ marginTop: 4 }} />
        </Bubble>
      ))}
      {open ? (
        <Composer athleteId={video.athlete_id} role={role} compact={compact} autoFocus
          placeholder={coach ? "Reply about this video…" : "Reply to the feedback on this video…"}
          onSend={send} onCancel={() => setOpen(false)} />
      ) : (
        <button onClick={() => setOpen(true)} style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ↩ Reply{rows.length ? ` (${rows.length} in thread)` : ""}
        </button>
      )}
    </div>
  );
}

export class VideoReplies extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error("VideoReplies crashed", error, info); }
  render() {
    if (this.state.failed) return null;
    return <VideoRepliesInner {...this.props} />;
  }
}

class ExerciseThread extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) { console.error("ExerciseThread crashed", error, info); }
  render() {
    if (this.state.failed) return null;
    return <ExerciseThreadInner {...this.props} />;
  }
}

export default ExerciseThread;
