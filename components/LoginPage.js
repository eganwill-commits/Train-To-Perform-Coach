"use client";
import { useState } from "react";
import { supabase, supabaseUrl, supabaseAnonKey } from "../lib/supabase";
import { Btn, Input } from "./ui";
import T2PLogo from "./T2PLogo";

export default function LoginPage({ onCoachLogin, onAthleteLogin }) {
  const [mode, setMode] = useState(null); // null, 'coach', 'athlete'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signUp, setSignUp] = useState(false);
  const [name, setName] = useState("");

  const handleCoachLogin = async () => {
    setError(""); setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }
    // Check if coach exists in coaches table
    const { data: coach } = await supabase.from("coaches").select("*").eq("email", email).single();
    if (!coach) {
      // Auto-add as coach on first login
      await supabase.from("coaches").insert({ email, name: email.split("@")[0] });
    }
    onCoachLogin(data.user, coach);
    setLoading(false);
  };

  const handleCoachSignUp = async () => {
    setError(""); setLoading(true);
    if (!name.trim()) { setError("Name is required"); setLoading(false); return; }
    const { data, error: err } = await supabase.auth.signUp({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }
    await supabase.from("coaches").insert({ email, name }).select().single();
    onCoachLogin(data.user, { email, name });
    setLoading(false);
  };

  const handleAthleteLogin = async () => {
    setError(""); setLoading(true);
    const entered = code.toUpperCase().trim();

    // Preferred path: the code is validated server-side and we get a real session,
    // so every request afterwards carries an identity the database can enforce against.
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/athlete-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: supabaseAnonKey },
        body: JSON.stringify({ access_code: entered }),
      });
      const out = await res.json();
      if (res.ok && out?.ok && out.access_token) {
        await supabase.auth.setSession({ access_token: out.access_token, refresh_token: out.refresh_token });
        const { data: full } = await supabase.from("athletes").select("*").eq("id", out.athlete.id).single();
        onAthleteLogin(full || out.athlete);
        setLoading(false);
        return;
      }
    } catch {
      // network/function problem — fall through to the legacy path below
    }

    // Fallback for athletes whose login has not been provisioned yet.
    const { data: athlete, error: err } = await supabase
      .from("athletes")
      .select("*")
      .eq("access_code", entered)
      .single();
    if (err || !athlete) { setError("Invalid access code. Check with your coach."); setLoading(false); return; }
    onAthleteLogin(athlete);
    setLoading(false);
  };

  return (
    <div className="t2p-root" style={{ fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #18181B 0%, #27272A 50%, #18181B 100%)", padding: "20px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@700&display=swap" rel="stylesheet" />
      <div style={{ width: 400, maxWidth: "100%" }}>
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 40 }}>
          <T2PLogo size="large" />
        </div>

        {/* Mode selection */}
        {!mode && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => setMode("coach")} style={{
              background: "#fff", border: "none", borderRadius: 12, padding: "20px 24px",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "transform .1s",
            }}>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#18181B" }}>Coach Login</div>
              <div style={{ fontSize: 14, color: "#71717A", marginTop: 4 }}>Full access to program, athletes, and analytics</div>
            </button>
            <button onClick={() => setMode("athlete")} style={{
              background: "transparent", border: "2px solid #3F3F46", borderRadius: 12, padding: "20px 24px",
              cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "transform .1s",
            }}>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#fff" }}>Athlete Login</div>
              <div style={{ fontSize: 14, color: "#A1A1AA", marginTop: 4 }}>View your program and log workouts</div>
            </button>
          </div>
        )}

        {/* Coach login */}
        {mode === "coach" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 28 }}>
            <h2 style={{ margin: "0 0 20px", fontSize: 20 }}>{signUp ? "Create Coach Account" : "Coach Login"}</h2>
            {error && <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {signUp && <Input label="Full Name" value={name} onChange={e => setName(e.target.value)} placeholder="Will Egan" />}
              <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="coach@example.com" />
              <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && (signUp ? handleCoachSignUp() : handleCoachLogin())} />
              <Btn onClick={signUp ? handleCoachSignUp : handleCoachLogin} disabled={loading} style={{ marginTop: 4 }}>
                {loading ? "Loading…" : signUp ? "Create Account" : "Sign In"}
              </Btn>
              <button onClick={() => { setSignUp(!signUp); setError(""); }} style={{ background: "none", border: "none", color: "#71717A", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                {signUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
              </button>
            </div>
            <button onClick={() => { setMode(null); setError(""); }} style={{ background: "none", border: "none", color: "#A1A1AA", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginTop: 16 }}>← Back</button>
          </div>
        )}

        {/* Athlete login */}
        {mode === "athlete" && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 28 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Athlete Login</h2>
            <p style={{ fontSize: 14, color: "#71717A", margin: "0 0 20px" }}>Enter the access code from your coach</p>
            {error && <div style={{ background: "#FEE2E2", color: "#DC2626", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Input
                label="Access Code"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. A3F2B1"
                style={{ fontSize: 24, textAlign: "center", letterSpacing: 6, fontWeight: 700 }}
                onKeyDown={e => e.key === "Enter" && handleAthleteLogin()}
                maxLength={6}
              />
              <Btn onClick={handleAthleteLogin} disabled={loading || code.length < 4}>
                {loading ? "Loading…" : "Access My Program"}
              </Btn>
            </div>
            <button onClick={() => { setMode(null); setError(""); }} style={{ background: "none", border: "none", color: "#A1A1AA", fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginTop: 16 }}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
