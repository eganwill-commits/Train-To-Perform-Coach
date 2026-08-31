"use client";
import { Btn, Card } from "./ui";

export default function Settings({ usePillars, saveSettings, athletes, programs, exercises, logs, resetAll, isMobile }) {
  const handleReset = async () => {
    if (!confirm("Reset all athletes, programs, and logs? Exercises will remain. This cannot be undone.")) return;
    await resetAll();
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ margin: "0 0 24px", fontSize: isMobile ? 22 : 28, fontFamily: "'Space Mono', monospace" }}>Settings</h2>
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>Category Mode</h3>
        <p style={{ fontSize: 14, color: "#71717A", margin: "0 0 14px" }}>Toggle between T2P pillars and generic categories.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant={usePillars ? "primary" : "secondary"} small={isMobile} onClick={() => saveSettings(true)}>T2P Pillars</Btn>
          <Btn variant={!usePillars ? "primary" : "secondary"} small={isMobile} onClick={() => saveSettings(false)}>Generic</Btn>
        </div>
      </Card>
      <Card style={{ marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Data</h3>
        <p style={{ fontSize: 14, color: "#71717A" }}>{athletes.length} athletes · {programs.length} programs · {exercises.length} exercises · {logs.length} logs</p>
        <p style={{ fontSize: 12, color: "#A1A1AA", marginTop: 8 }}>Data syncs across all devices via Supabase.</p>
      </Card>
      <Card>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, color: "#DC2626" }}>Danger Zone</h3>
        <Btn variant="danger" onClick={handleReset}>Reset All Data</Btn>
      </Card>
    </div>
  );
}
