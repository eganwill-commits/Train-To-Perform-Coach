"use client";
/*
  Pictures and clips attached to coaching text.

  Written feedback only gets you so far: "land taller" lands better next to a paused frame
  of the landing, and a 10-second demo clip beats a paragraph about the dip. So every
  place the coach writes to an athlete - video feedback, a reply to a log note, an
  exercise thread - can carry attachments, and the athlete can attach to a thread reply.

  Stored as a jsonb array on the row the text lives on:
    video_submissions.coach_feedback_media
    logs.coach_reply_media
    exercise_comments.media
  Each item: { url, type: "image" | "video", name }

  Files go in the messages-media bucket under the athlete's folder
  (<athleteId>/feedback/...), so the private-bucket policy (athlete reads own folder)
  covers them with no new rule. URLs are stored as written and resolved to signed URLs
  for display (lib/media.js), same as message attachments.

  Backward compatible by design: callers only send the media column when there is
  something to send (or something to clear), so text-only feedback keeps working even
  before the migration that adds the columns has been run.
*/
import { supabase } from "./supabase";
import { uploadVideo, readVideo } from "./videoUpload";
import { isSandbox } from "./sandbox";

export const BUCKET = "messages-media";
export const MAX_ATTACHMENTS = 6;
const MAX_VIDEO_MB = 200;
const MAX_IMAGE_EDGE = 2000; // px, long edge after downscale
const IMAGE_REENCODE_OVER = 1.5 * 1024 * 1024; // bytes

export const mediaKind = (file) => {
  const t = (file?.type || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("video/")) return "video";
  const n = (file?.name || "").toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|heif)$/.test(n)) return "image";
  if (/\.(mp4|mov|m4v|webm)$/.test(n)) return "video";
  return null;
};

// Normalise whatever the column holds (null, array, or a JSON string) into an array.
export function mediaList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(m => m && m.url);
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter(m => m && m.url) : []; } catch { return []; }
  }
  return [];
}

export const sameMedia = (a, b) => {
  const x = mediaList(a), y = mediaList(b);
  return x.length === y.length && x.every((m, i) => m.url === y[i].url);
};

/*
  Screenshots straight off a Mac are often 3-6MB PNGs at retina size. Shrink anything big
  to a 2000px JPEG: still sharp enough to read a joint angle, a fraction of the upload.
  Small images (and anything the browser can't decode, e.g. HEIC outside Safari) go up
  untouched.
*/
async function prepareImage(file) {
  if (file.size <= IMAGE_REENCODE_OVER || /gif$/i.test(file.type)) return { blob: file, ext: extOf(file) };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); // PNG transparency -> white, not black
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", 0.88));
    if (blob && blob.size && blob.size < file.size) return { blob, ext: "jpg", type: "image/jpeg" };
  } catch { /* fall back to the original */ }
  return { blob: file, ext: extOf(file) };
}

function extOf(file) {
  const fromName = ((file?.name || "").split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && fromName.length <= 5 && fromName !== (file?.name || "").toLowerCase()) return fromName;
  const t = (file?.type || "").split("/")[1] || "";
  return ({ jpeg: "jpg", quicktime: "mov", "x-m4v": "m4v" })[t] || t || "bin";
}

/*
  uploadFeedbackMedia(file, athleteId, { onProgress }) -> { url, type, name }
  Throws an Error with a message that can be shown as-is.
*/
export async function uploadFeedbackMedia(file, athleteId, { onProgress } = {}) {
  const type = mediaKind(file);
  if (!type) throw new Error(`"${file?.name || "That file"}" isn't a photo or video.`);
  if (!athleteId) throw new Error("No athlete selected to attach this to.");

  let blob, ext, contentType;
  if (type === "image") {
    const p = await prepareImage(file);
    blob = p.blob; ext = p.ext; contentType = p.type || file.type || "image/jpeg";
  } else {
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      throw new Error(`That clip is over ${MAX_VIDEO_MB}MB. Trim it to the part that matters and try again.`);
    }
    blob = await readVideo(file); // materialise now (iOS stale-reference issue)
    ext = extOf(file); contentType = file.type || "video/mp4";
  }

  const name = file.name || (type === "image" ? "Screenshot" : "Clip");

  // "View as athlete" preview: show it locally, send nothing.
  if (isSandbox()) return { url: URL.createObjectURL(blob), type, name };

  const path = `${athleteId}/feedback/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await uploadVideo(BUCKET, path, blob, { contentType, onProgress });
  if (error) throw new Error(error.message || "Upload failed");
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, type, name };
}

/*
  Build the update payload for a text column plus its media column. The media column is
  only included when it has content or is being cleared, so text-only saves never touch
  a column that may not exist yet.
*/
export function withMedia(fields, mediaColumn, media, previous) {
  const next = mediaList(media);
  const prev = mediaList(previous);
  if (next.length || prev.length) return { ...fields, [mediaColumn]: next };
  return fields;
}

// The column isn't there yet: say what to do instead of a raw Postgres error.
export function mediaErrorMessage(err) {
  const msg = String(err?.message || err || "");
  if (/media/i.test(msg) && /column|schema cache/i.test(msg)) {
    return "Attachments need a one-time database update (supabase/migrations/20261027_feedback_media.sql). Your text is still here.";
  }
  return null;
}

export const mediaSummary = (media) => {
  const l = mediaList(media);
  if (!l.length) return "";
  const imgs = l.filter(m => m.type === "image").length, vids = l.length - imgs;
  const parts = [];
  if (imgs) parts.push(`${imgs} photo${imgs === 1 ? "" : "s"}`);
  if (vids) parts.push(`${vids} video${vids === 1 ? "" : "s"}`);
  return parts.join(" + ");
};
