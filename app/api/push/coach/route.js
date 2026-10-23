import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey, VAPID_PUBLIC_KEY } from "../../../../lib/publicConfig";

export const runtime = "nodejs";

/*
  Sends a phone notification to the COACH.

  Called by the database, not by a browser: triggers on video_submissions,
  exercise_comments, messages, athlete_notes and logs (see
  supabase/migrations/20261022_coach_push.sql) post here through pg_net the moment an
  athlete sends something. Doing it in the database means every way an athlete can
  submit - any screen, any app version still cached on their phone - buzzes the coach.

  Authorised by a shared secret the trigger includes in the body. This route never
  sees or stores the secret itself; it hands it to coach_push_targets(), which checks
  it inside the database and only then returns the coach's subscriptions. A request
  without the secret gets nothing to send to.

  Needs VAPID_PRIVATE_KEY on Vercel (already set for athlete notifications).
*/
export async function POST(request) {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) return NextResponse.json({ ok: false, error: "VAPID_PRIVATE_KEY not set" }, { status: 503 });

  let payload;
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const { secret, title, body, page, refId, target, tag } = payload || {};
  if (!secret || !title) return NextResponse.json({ ok: false, error: "secret and title required" }, { status: 400 });

  const db = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: subs, error } = await db.rpc("coach_push_targets", { p_secret: secret });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0, note: "coach has not turned on notifications on any device" });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:coach@traintoperform.fit", VAPID_PUBLIC_KEY, privateKey);

  const message = JSON.stringify({
    title: String(title).slice(0, 80),
    body: String(body || "").slice(0, 180),
    page: page || "videos",
    refId: refId || null,
    target: target || null,
    tag: tag || `t2p-coach-${page || "alert"}-${refId || Date.now()}`,
  });

  let sent = 0;
  const gone = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      // 404/410: that device unsubscribed or the app was removed.
      if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.id);
      else console.error("coach push failed", e?.statusCode, e?.body);
    }
  }));
  await db.rpc("coach_push_sent", { p_secret: secret, p_sent: sent > 0, p_gone: gone });

  return NextResponse.json({ ok: true, sent, removed: gone.length });
}
