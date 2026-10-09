import { supabase } from "./supabase";

/*
  Phone notifications.

  57 coach messages, 56 unread; 9 exercise questions, 9 unread. Nothing the coach wrote
  reached a phone - it waited inside the app until the athlete happened to open
  Messages. This is the missing piece: when the coach writes, the athlete's phone buzzes.

  Web Push, through the service worker the app already installs. On iPhone it works
  once the app is added to the Home Screen (iOS 16.4+), which is how athletes run it.

  The public key is not a secret (it identifies the sender); the private half lives only
  in the VAPID_PRIVATE_KEY environment variable on the server.
*/
import { VAPID_PUBLIC_KEY } from "./publicConfig";
export { VAPID_PUBLIC_KEY };

function b64ToUint8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// iPhone Safari only allows push for an app opened from the Home Screen.
export function needsHomeScreenInstall() {
  if (typeof window === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  return ios && !standalone;
}

export function pushPermission() {
  if (!pushSupported()) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing || navigator.serviceWorker.register("/sw.js");
}

/*
  Ask, subscribe, store. Returns { ok, reason }.
  Needs a real Supabase session: the row is owned by auth.uid().
*/
export async function enablePush({ athleteId, role = "athlete" }) {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: perm };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, reason: "no-session" };

  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY) });
  }
  const json = sub.toJSON();
  const row = {
    user_id: session.user.id,
    athlete_id: athleteId || null,
    role,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent.slice(0, 200),
  };
  // Same device re-enabling: replace our own row for this endpoint.
  await supabase.from("push_subscriptions").delete().eq("endpoint", json.endpoint).eq("user_id", session.user.id);
  const { error } = await supabase.from("push_subscriptions").insert(row);
  if (error) { console.error("enablePush: store failed", error); return { ok: false, reason: "store-failed" }; }
  try { localStorage.setItem("t2p_push_on", "1"); } catch {}
  return { ok: true };
}

/*
  Is THIS device registered for THIS athlete?

  isPushEnabledHere() only says the browser has a subscription. A device can hold one
  from a different sign-in (the coach testing as TEST on a laptop, a shared family
  iPad), and the prompt used to treat that as "already on" and never register the
  athlete now signed in. This checks the stored row for this athlete and endpoint.
*/
export async function isRegisteredHereFor(athleteId) {
  if (!athleteId || !pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return false;
    const { data, error } = await supabase.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).eq("athlete_id", athleteId).limit(1);
    if (error) return true; // cannot tell: do not nag or re-register on a read error
    return (data || []).length > 0;
  } catch { return true; }
}

// "iPhone", "Mac (Safari)", "Android (Chrome)" ... from a stored user agent.
export function deviceLabel(ua) {
  const u = ua || "";
  const device = /iphone/i.test(u) ? "iPhone" : /ipad/i.test(u) ? "iPad" : /android/i.test(u) ? "Android"
    : /macintosh|mac os x/i.test(u) ? "Mac" : /windows/i.test(u) ? "Windows" : "device";
  if (device === "iPhone" || device === "iPad") return device;
  const browser = /edg\//i.test(u) ? "Edge" : /chrome|crios/i.test(u) ? "Chrome" : /firefox/i.test(u) ? "Firefox" : /safari/i.test(u) ? "Safari" : "";
  return browser ? `${device} (${browser})` : device;
}

// Coach view: who has notifications on, and on what. { [athleteId]: [{ device, since, lastSent }] }
export async function fetchPushStatus() {
  const { data, error } = await supabase.from("push_subscriptions").select("athlete_id, user_agent, created_at, last_sent_at");
  if (error || !data) return {};
  const out = {};
  data.forEach(r => {
    if (!r.athlete_id) return;
    (out[r.athlete_id] = out[r.athlete_id] || []).push({ device: deviceLabel(r.user_agent), since: r.created_at, lastSent: r.last_sent_at });
  });
  return out;
}

export async function isPushEnabledHere() {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    return !!sub;
  } catch { return false; }
}

/*
  Coach side: tell the server to push to an athlete. Fire-and-forget by design - the
  message/alert is already saved, and a failed buzz must never fail the coach's action.
  Uses the coach's own session token; the server checks it is the coach.
*/
export async function notifyAthlete({ athleteId, title, body, page, refId }) {
  if (!athleteId || !title) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch("/api/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ athleteId, title, body: (body || "").slice(0, 180), page: page || "my-program", refId: refId || null }),
      keepalive: true,
    });
  } catch (e) {
    console.warn("notifyAthlete failed (message itself was saved)", e);
  }
}

// Sign-out on this device: drop this device's subscription row and unsubscribe, so the
// next person to use the phone does not get the last athlete's notifications.
export async function disablePushHere() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("user_id", session.user.id);
    await sub.unsubscribe();
    try { localStorage.removeItem("t2p_push_on"); } catch {}
  } catch (e) {
    console.warn("disablePushHere failed", e);
  }
}
