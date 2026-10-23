"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { pushSupported, pushPermission, needsHomeScreenInstall, enablePush, isCoachRegisteredHere } from "../lib/push";

/*
  "Buzz me when an athlete sends something."

  The coach only heard about a new video or comment by opening the app and looking at
  the bell. This turns on phone notifications for THIS device, so a video, an exercise
  comment, a message or a note from an athlete reaches the coach's lock screen.

  Per device: turning it on from the laptop does not buzz the phone. On an iPhone it
  only works from the Home Screen app (iOS 16.4+), so Safari gets the one extra step.
*/
const DISMISS_KEY = "t2p_coach_push_prompt_dismissed_at";

export default function CoachPushPrompt() {
  const [state, setState] = useState("hidden"); // hidden | ask | ios-install | blocked | working | done | error
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (dismissed && Date.now() - dismissed < 7 * 86400000) return;
      } catch { /* storage blocked: still offer */ }
      const { data: { session } } = await supabase.auth.getSession();
      if (!live || !session) return;
      if (await isCoachRegisteredHere()) return;
      if (!live) return;
      if (needsHomeScreenInstall()) { setState("ios-install"); return; }
      if (!pushSupported()) return;
      const perm = pushPermission();
      if (perm === "denied") { setState("blocked"); return; }
      // Permission already granted (e.g. by the in-app toast prompt) but this device was
      // never registered as the coach's: register silently, no system prompt appears.
      if (perm === "granted") {
        const r = await enablePush({ athleteId: null, role: "coach" });
        if (live && !r.ok) { setDetail(r.reason || ""); setState("error"); }
        return;
      }
      setState("ask");
    })();
    return () => { live = false; };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setState("hidden");
  };

  const turnOn = async () => {
    setState("working");
    const r = await enablePush({ athleteId: null, role: "coach" });
    if (r.ok) { setState("done"); setTimeout(() => setState("hidden"), 4000); return; }
    if (r.reason === "denied") { setState("blocked"); return; }
    setDetail(r.reason || "");
    setState("error");
  };

  if (state === "hidden") return null;

  const box = { marginBottom: 14, padding: "12px 14px", borderRadius: 10, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", gap: 10, alignItems: "flex-start" };
  const btn = { padding: "7px 14px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const later = { padding: "7px 10px", background: "none", color: "#52525B", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div style={box}>
      <span style={{ fontSize: 20 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#1E3A8A" }}>
        {state === "ask" && (<>
          <div style={{ fontWeight: 700 }}>Get a buzz when athletes send something</div>
          <div style={{ marginTop: 2 }}>New videos, exercise comments, messages and notes will notify this device.</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={turnOn} style={btn}>Turn on notifications</button>
            <button onClick={dismiss} style={later}>Not now</button>
          </div>
        </>)}
        {state === "working" && <div style={{ fontWeight: 700 }}>Turning on…</div>}
        {state === "done" && <div style={{ fontWeight: 700 }}>✓ Notifications on for this device.</div>}
        {state === "ios-install" && (<>
          <div style={{ fontWeight: 700 }}>Notifications need the Home Screen app</div>
          <div style={{ marginTop: 2 }}>In Safari tap Share, then Add to Home Screen. Open T2P from that icon and this button will appear.</div>
          <button onClick={dismiss} style={{ ...later, paddingLeft: 0, marginTop: 4 }}>Got it</button>
        </>)}
        {state === "blocked" && (<>
          <div style={{ fontWeight: 700 }}>Notifications are blocked on this device</div>
          <div style={{ marginTop: 2 }}>Allow notifications for T2P in your phone or browser settings, then reopen the app.</div>
          <button onClick={dismiss} style={{ ...later, paddingLeft: 0, marginTop: 4 }}>Dismiss</button>
        </>)}
        {state === "error" && (<>
          <div style={{ fontWeight: 700 }}>Could not turn notifications on{detail ? ` (${detail})` : ""}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={turnOn} style={btn}>Try again</button>
            <button onClick={dismiss} style={later}>Not now</button>
          </div>
        </>)}
      </div>
    </div>
  );
}
