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

// Where a new athlete upload goes. Prefixed with the athlete id so ownership is
// readable from the path as well as from the row that references it.
export function athleteUploadPath(athleteId, fileName) {
  const ext = ((fileName || "").split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  return `${athleteId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
}
