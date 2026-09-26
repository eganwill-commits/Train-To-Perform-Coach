"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import TimerRunner from "../../../components/TimerRunner";

// Public, no-login TV display for a saved timer: /tv/<code>
export default function TvTimerPage({ params }) {
  const slug = String(params.slug || "").toLowerCase().trim();
  const [timer, setTimer] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("timers").select("name, format, config, slug").eq("slug", slug).maybeSingle();
      if (cancelled) return;
      if (error) setState("error");
      else if (!data) setState("missing");
      else { setTimer(data); setState("ready"); }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (state === "ready") return <TimerRunner timer={timer} tv />;
  const msg = state === "loading" ? "Loading…" : state === "missing" ? `No timer found for code "${slug}". Check the code in the T2P app under Timers → TV link.` : "Couldn't reach the server. Check the TV's internet connection and reload.";
  return (
    <div style={{ position: "fixed", inset: 0, background: "#1a1a1a", color: "#f2f2f2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, fontFamily: "'DM Sans', sans-serif", padding: 24, textAlign: "center" }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: "0.08em" }}>TRAIN TO <span style={{ color: "#cc1f1f" }}>PERFORM</span></div>
      <div style={{ fontSize: 22, maxWidth: 720, lineHeight: 1.4, color: "#e0e0e0" }}>{msg}</div>
      {state !== "loading" && <a href="/tv" style={{ color: "#c8922a", fontSize: 20, fontWeight: 700 }}>Enter a different code</a>}
    </div>
  );
}
