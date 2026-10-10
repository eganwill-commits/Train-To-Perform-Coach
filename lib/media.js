import { supabase } from "./supabase";

/*
  Media URLs, one place.

  Two jobs:
  1. Turn a YouTube / Vimeo / Loom link into something that plays INSIDE the app, so a
     demo does not send the athlete out of their session into another tab.
  2. Turn a Supabase Storage URL into a short-lived signed URL.

  (2) is what lets the athlete-video and message-media buckets go private. Rows written
  before today hold public URLs ("/storage/v1/object/public/<bucket>/<path>"). Signing
  works whether the bucket is public or private, so this code is safe to ship first and
  the bucket can be flipped to private afterwards with nothing rewritten in the database.
*/

export function embedUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  let m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if (m) {
    const t = s.match(/[?&](?:t|start)=(\d+)/);
    return `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0&playsinline=1${t ? `&start=${t[1]}` : ""}`;
  }
  m = s.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  m = s.match(/loom\.com\/share\/([\w-]+)/i);
  if (m) return `https://www.loom.com/embed/${m[1]}`;
  return null;
}

export const isDirectVideo = (u) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u || "");

const STORAGE_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/;

export function storageRef(u) {
  const m = String(u || "").match(STORAGE_RE);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

const cache = new Map(); // url -> { url, exp }

export async function resolveMediaUrl(u) {
  const ref = storageRef(u);
  if (!ref) return u;
  const hit = cache.get(u);
  if (hit && hit.exp > Date.now()) return hit.url;
  try {
    const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 60 * 60);
    if (error || !data?.signedUrl) return u; // fall back to the stored URL (works while public)
    cache.set(u, { url: data.signedUrl, exp: Date.now() + 55 * 60 * 1000 });
    return data.signedUrl;
  } catch {
    return u;
  }
}

/*
  Export an athlete's submitted clip for offline review (e.g. frame-by-frame with Claude).

  The file name carries the context so a folder of exports explains itself:
    2026-10-09_Brooks-Egan_Back-Squat_W3-Day-2.mov
  The signed URL is created with `download`, so Storage sends it as an attachment and the
  browser saves it instead of playing it - this works on iOS Safari too, and the clip is
  never pulled into page memory.
*/
const slug = (s) => String(s || "").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40);

export function reviewFileName(sub, athleteName) {
  const ref = storageRef(sub?.video_url);
  const ext = ((ref?.path || "").split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const date = sub?.created_at ? new Date(sub.created_at).toLocaleDateString("en-CA") : "";
  const week = sub?.week_label ? (sub.week_label.match(/week\s*(\d+)/i) ? `W${sub.week_label.match(/week\s*(\d+)/i)[1]}` : slug(sub.week_label.split(/[·—]/)[0])) : "";
  const parts = [date, slug(athleteName), slug(sub?.exercise_name || "Movement"), [week, slug((sub?.day_label || "").split("·").pop())].filter(Boolean).join("-")];
  return `${parts.filter(Boolean).join("_")}.${ext}`;
}

// The text that goes alongside the clip: who, what, when, and what the athlete asked.
export function reviewBrief(sub, athleteName) {
  const lines = [
    `Athlete: ${athleteName || "Unknown"}`,
    `Movement: ${sub?.exercise_name || "Movement video"}`,
    sub?.created_at ? `Submitted: ${new Date(sub.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : null,
    (sub?.week_label || sub?.day_label) ? `Session: ${[sub.week_label, sub.day_label].filter(Boolean).join(" · ")}` : null,
    sub?.notes ? `Athlete asked: ${sub.notes}` : null,
    sub?.coach_feedback ? `Feedback already sent: ${sub.coach_feedback}` : null,
    `File: ${reviewFileName(sub, athleteName)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

// Returns false when the clip is a link (YouTube etc.) rather than an uploaded file.
export const canExport = (u) => !!storageRef(u);

export async function exportForReview(sub, athleteName) {
  const ref = storageRef(sub?.video_url);
  if (!ref) throw new Error("Only uploaded clips can be exported.");
  const fileName = reviewFileName(sub, athleteName);
  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 10 * 60, { download: fileName });
  if (error || !data?.signedUrl) throw error || new Error("Could not sign the video URL.");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return fileName;
}

// Where a new athlete upload goes. Prefixed with the athlete id so ownership is
// readable from the path as well as from the row that references it.
export function athleteUploadPath(athleteId, fileName) {
  const ext = ((fileName || "").split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  return `${athleteId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
}
