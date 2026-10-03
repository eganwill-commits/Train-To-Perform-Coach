import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey, VAPID_PUBLIC_KEY } from "../../../../lib/publicConfig";

export const runtime = "nodejs";

/*
  Sends a phone notification to one athlete.

  Called by the coach's browser right after it saves a message, nudge, comment or
  feedback. Authorised by the coach's own Supabase session: the request is run AS the
  caller, so the database's own rules decide what it can read. Only the coach can read
  another person's push subscriptions (push_subscriptions RLS), so an athlete token
  that reached this route would find nothing to send to.

  Needs one environment variable on Vercel: VAPID_PRIVATE_KEY.
  Optional: VAPID_SUBJECT (defaults to mailto:coach@traintoperform.fit).
*/
export async function POST(request) {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ ok: false, error: "VAPID_PRIVATE_KEY not set" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });

  let payload;
  try { payload = await request.json(); } catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }
  const { athleteId, title, body, page, refId } = payload || {};
  if (!athleteId || !title) return NextResponse.json({ ok: false, error: "athleteId and title required" }, { status: 400 });

  const db = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: isCoach, error: coachErr } = await db.rpc("is_t2p_coach");
  if (coachErr || !isCoach) return NextResponse.json({ ok: false, error: "coach only" }, { status: 403 });

  const { data: subs, error } = await db.from("push_subscriptions").select("*").eq("athlete_id", athleteId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0, note: "athlete has not turned on notifications" });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:coach@traintoperform.fit", VAPID_PUBLIC_KEY, privateKey);

  const message = JSON.stringify({
    title: String(title).slice(0, 80),
    body: String(body || "").slice(0, 180),
    page: page || "my-program",
    refId: refId || null,
    tag: `t2p-${page || "msg"}`,
  });

  let sent = 0;
  const gone = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (e) {
      // 404/410: the phone unsubscribed or the app was removed. Clean it up.
      if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.id);
      else console.error("push send failed", e?.statusCode, e?.body);
    }
  }));
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  if (sent) await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("athlete_id", athleteId);

  return NextResponse.json({ ok: true, sent, removed: gone.length });
}
