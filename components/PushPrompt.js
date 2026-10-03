"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { pushSupported, pushPermission, needsHomeScreenInstall, enablePush, isPushEnabledHere } from "../lib/push";

/*
  "Get a buzz when your coach writes."

  Shown at the top of Today until the athlete either turns notifications on or says
  not now. On an iPhone that is still in Safari it explains the one extra step (Add to
  Home Screen) instead of offering a button that cannot work there.
*/
const DISMISS_KEY = "t2p_push_prompt_dismissed_at";

export default function PushPrompt({ athleteId, compact }) {
  const [state, setState] = useState("hidden"); // hidden | ask | ios-install | blocked | working | done | error
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (dismissed && Date.now() - dismissed < 14 * 86400000) return;
      } catch {}
      const { data: { session } } = await supabase.auth.getSession();
      if (!live || !session) return; // needs a real login to store the subscription
      if (await isPushEnabledHere()) return;
      if (needsHomeScreenInstall()) { setState("ios-install"); return; }
      if (!pushSupported()) return;
      const perm = pushPermission();
      if (perm === "denied") { setState("blocked"); return; }
      setState("ask");
    })();
    return () => { live = false; };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setState("hidden");
  };

  const turnOn = async () => {
    setState("working");
    const r = await enablePush({ athleteId, role: "athlete" });
    if (r.ok) { setState("done"); setTimeout(() => setState("hidden"), 4000); return; }
    if (r.reason === "denied") { setState("blocked"); return; }
    setDetail(r.reason || "");
    setState("error");
  };

  if (state === "hidden") return null;

  const box = { marginBottom: 12, padding: compact ? "10px 12px" : "12px 14px", borderRadius: 10, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", gap: 10, alignItems: "flex-start" };
  const btn = { fontSize: 13, fontWeight: 700, color: "#fff", background: "#2563EB", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit" };
  const later = { fontSize: 12, fontWeight: 600, color: "#64748B", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "8px 4px" };

  return (
    <div style={box}>
      <span style={{ fontSize: 20, lineHeight: 1 }}>🔔</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {state === "ask" || state === "working" ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1E3A8A" }}>Get a buzz when your coach writes</div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 2, lineHeight: 1.45 }}>Messages, form-video feedback and questions on your exercises go straight to your phone.</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
              <button onClick={turnOn} disabled={state === "working"} style={{ ...btn, opacity: state === "working" ? 0.6 : 1 }}>{state === "working" ? "Turning on…" : "Turn on notifications"}</button>
              <button onClick={dismiss} style={later}>Not now</button>
            </div>
          </>
        ) : state === "ios-install" ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1E3A8A" }}>Want a buzz when your coach writes?</div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 2, lineHeight: 1.5 }}>
              On iPhone, add the app to your Home Screen first: tap <b>Share</b> <span aria-hidden>⎋</span> then <b>Add to Home Screen</b>. Open T2P from the new icon and this button will appear.
            </div>
            <button onClick={dismiss} style={{ ...later, paddingLeft: 0 }}>Got it</button>
          </>
        ) : state === "blocked" ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1E3A8A" }}>Notifications are blocked for T2P</div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 2, lineHeight: 1.5 }}>Turn them on in your phone's Settings → Notifications → T2P, then reopen the app.</div>
            <button onClick={dismiss} style={{ ...later, paddingLeft: 0 }}>OK</button>
          </>
        ) : state === "done" ? (
          <div style={{ fontWeight: 700, fontSize: 14, color: "#166534" }}>✓ You're set. Your phone will buzz when your coach writes.</div>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#991B1B" }}>Couldn't turn notifications on</div>
            <div style={{ fontSize: 12, color: "#334155", marginTop: 2 }}>Try again in a minute. {detail ? `(${detail})` : ""}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button onClick={turnOn} style={btn}>Try again</button>
              <button onClick={dismiss} style={later}>Not now</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
