"use client";
/*
  One way to put a video into Storage, used by every upload button in the app.

  Why this exists (Oct 2026, Mark's Test Day 1): his phone clip never arrived. The
  preflight reached Storage and the upload itself never did. Every clip that ever landed
  in the `videos` bucket was under 47MB, even though the bucket and the app both said
  100MB. A single-request upload of a large iPhone clip either hits the project-wide
  Storage upload cap or dies mid-transfer on gym wifi / LTE, and there is nothing to
  resume from.

  So anything over one chunk now goes up as a resumable (TUS) upload in 6MB pieces:
  - no single huge request, so a dropped connection retries one piece, not the clip;
  - progress can be shown, so a 60MB clip on a slow connection doesn't look frozen;
  - a cap rejection comes back as a readable message instead of a silent failure.
  Small files keep the plain one-request upload.

  Supabase requires TUS chunks of exactly 6MB.
*/
import * as tus from "tus-js-client";
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabase";
import { isSandbox } from "./sandbox";

const CHUNK = 6 * 1024 * 1024;

async function authToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || supabaseAnonKey;
  } catch {
    return supabaseAnonKey;
  }
}

function friendly(err) {
  const msg = String((err && (err.message || err.error)) || err || "Unknown error");
  if (/413|too large|exceeded the maximum|maximum allowed size|payload/i.test(msg)) {
    return "That clip is too big to upload. Trim it to just the set, or film at 1080p, and try again.";
  }
  if (/network|failed to fetch|load failed|timeout|offline/i.test(msg)) {
    return "The upload lost its connection. Check your signal and try again.";
  }
  return msg;
}

/*
  uploadVideo(bucket, path, blob, { contentType, onProgress })
  Resolves { error: null } on success, { error: { message } } on failure (never throws),
  so it drops in where `supabase.storage.from(bucket).upload(...)` was.
*/
export async function uploadVideo(bucket, path, blob, { contentType, onProgress } = {}) {
  const type = contentType || blob.type || "video/mp4";

  // "View as athlete" preview: pretend it worked, send nothing (lib/sandbox.js).
  if (isSandbox()) return { error: null };

  if (blob.size <= CHUNK) {
    const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: type, cacheControl: "3600", upsert: false });
    return { error: error ? { message: friendly(error) } : null };
  }

  const token = await authToken();
  return new Promise((resolve) => {
    const upload = new tus.Upload(blob, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      chunkSize: CHUNK,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: type,
        cacheControl: "3600",
      },
      onProgress: (sent, total) => {
        if (onProgress && total) onProgress(Math.round((sent / total) * 100));
      },
      onError: (err) => resolve({ error: { message: friendly(err) } }),
      onSuccess: () => resolve({ error: null }),
    });
    upload.start();
  });
}
