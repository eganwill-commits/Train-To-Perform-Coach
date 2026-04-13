"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import LoginPage from "../components/LoginPage";
import CoachApp from "../components/CoachApp";
import AthleteView from "../components/AthleteView";

export default function Page() {
  const [authState, setAuthState] = useState(null); // null = loading, 'login', 'coach', 'athlete'
  const [coachUser, setCoachUser] = useState(null);
  const [athleteUser, setAthleteUser] = useState(null);

  useEffect(() => {
    // Check for existing Supabase auth session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setCoachUser(session.user);
        setAuthState("coach");
      } else {
        // Check for athlete session in sessionStorage
        const savedAthlete = sessionStorage.getItem("t2p_athlete");
        if (savedAthlete) {
          try {
            setAthleteUser(JSON.parse(savedAthlete));
            setAuthState("athlete");
          } catch { setAuthState("login"); }
        } else {
          setAuthState("login");
        }
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setCoachUser(null);
        setAuthState("login");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleCoachLogin = (user, coach) => {
    setCoachUser(user);
    setAuthState("coach");
  };

  const handleAthleteLogin = (athlete) => {
    setAthleteUser(athlete);
    sessionStorage.setItem("t2p_athlete", JSON.stringify(athlete));
    setAuthState("athlete");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem("t2p_athlete");
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
