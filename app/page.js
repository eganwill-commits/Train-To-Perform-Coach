"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import LoginPage from "../components/LoginPage";
import CoachApp from "../components/CoachApp";
import AthleteView from "../components/AthleteView";

/* ---------------------------------------------------------------------------
   Athlete session persistence
   ---------------------------------------------------------------------------
   Athletes stay signed in on a device until they explicitly log out.

   Two kinds of athlete login exist:
     - "session": the athlete-login edge function returned a real Supabase
       session. supabase-js keeps that in localStorage and auto-refreshes it.
     - "legacy":  the athlete's auth user has not been provisioned yet, so the
       access-code lookup is all we have. The cached row IS the session.

   The cached record lives in localStorage (survives closing the tab or the
   PWA). It used to live in sessionStorage, which is wiped the moment the app
   is closed — that is why athletes had to re-enter their code every time.
--------------------------------------------------------------------------- */

const ATHLETE_KEY = "t2p_athlete_v2"; // { athlete, mode }
const LEGACY_ATHLETE_KEY = "t2p_athlete"; // pre-fix shape: the athlete row itself

function readStoredAthlete() {
  if (typeof window === "undefined") return null;
  // Wrapped because storage throws outright in some private/in-app browsers.
  try {
    const raw = window.localStorage.getItem(ATHLETE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.athlete) return parsed;
    }
  } catch {}
  // Migrate anyone still holding the old key (either storage area).
  try {
    const old =
      window.localStorage.getItem(LEGACY_ATHLETE_KEY) ||
      window.sessionStorage.getItem(LEGACY_ATHLETE_KEY);
    if (old) return { athlete: JSON.parse(old), mode: "legacy" };
  } catch {}
  return null;
}

function writeStoredAthlete(athlete, mode) {
  try {
    window.localStorage.setItem(ATHLETE_KEY, JSON.stringify({ athlete, mode }));
    window.localStorage.removeItem(LEGACY_ATHLETE_KEY);
    window.sessionStorage.removeItem(LEGACY_ATHLETE_KEY);
  } catch {}
}

function clearStoredAthlete() {
  try {
    window.localStorage.removeItem(ATHLETE_KEY);
    window.localStorage.removeItem(LEGACY_ATHLETE_KEY);
    window.sessionStorage.removeItem(LEGACY_ATHLETE_KEY);
  } catch {}
}

export default function Page() {
  const [authState, setAuthState] = useState(null); // null = loading, 'login', 'coach', 'athlete'
  const [coachUser, setCoachUser] = useState(null);
  const [athleteUser, setAthleteUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = readStoredAthlete();

      // Show the athlete their program immediately on a cold start instead of
      // holding the splash screen while we round-trip to Supabase. The checks
      // below still run and will correct the state if the session is gone.
      if (stored) {
        setAthleteUser(stored.athlete);
        setAuthState("athlete");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (session) {
        // A restored session is only a coach session if it does NOT map to a
        // row in athletes. Without this check every returning athlete was
        // dropped into the full coach app.
        const { data: athlete } = await supabase
          .from("athletes")
          .select("*")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        if (cancelled) return;

        if (athlete) {
          writeStoredAthlete(athlete, "session");
          setCoachUser(null);
          setAthleteUser(athlete);
          setAuthState("athlete");
          return;
        }

        clearStoredAthlete();
        setAthleteUser(null);
        setCoachUser(session.user);
        setAuthState("coach");
        return;
      }

      // No Supabase session from here down.
      if (stored && stored.mode === "legacy") {
        // Refresh the cached row so the athlete does not train off stale
        // program/equipment data; keep the cache if the fetch fails offline.
        const { data: fresh } = await supabase
          .from("athletes")
          .select("*")
          .eq("id", stored.athlete.id)
          .maybeSingle();
        if (cancelled) return;
        if (fresh) {
          writeStoredAthlete(fresh, "legacy");
          setAthleteUser(fresh);
        }
        setAuthState("athlete");
        return;
      }

      // A "session" athlete with no session means the refresh token expired or
      // was revoked — send them back to the code screen rather than leaving
      // them in a view whose queries will fail.
      if (stored) clearStoredAthlete();
      setAthleteUser(null);
      setAuthState("login");
    })();

    // Listen for auth changes. Keep this callback synchronous — awaiting
    // Supabase calls inside it can deadlock the auth client.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearStoredAthlete();
        setCoachUser(null);
        setAthleteUser(null);
        setAuthState("login");
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleCoachLogin = (user, coach) => {
    clearStoredAthlete(); // a coach signing in on a shared device replaces the athlete
    setAthleteUser(null);
    setCoachUser(user);
    setAuthState("coach");
  };

  const handleAthleteLogin = (athlete, meta) => {
    writeStoredAthlete(athlete, meta && meta.mode === "session" ? "session" : "legacy");
    setAthleteUser(athlete);
    setAuthState("athlete");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearStoredAthlete();
    setCoachUser(null);
    setAthleteUser(null);
    setAuthState("login");
  };

  if (!authState) {
    return (
      <div className="t2p-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", background: "#18181B" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 48, color: "#fff", margin: 0 }}>T2P</h1>
          <p style={{ color: "#71717A", marginTop: 8 }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (authState === "login") {
    return <LoginPage onCoachLogin={handleCoachLogin} onAthleteLogin={handleAthleteLogin} />;
  }

  if (authState === "coach") {
    return <CoachApp onLogout={handleLogout} />;
  }

  if (authState === "athlete" && athleteUser) {
    return <AthleteView athlete={athleteUser} onLogout={handleLogout} />;
  }

  return <LoginPage onCoachLogin={handleCoachLogin} onAthleteLogin={handleAthleteLogin} />;
}
