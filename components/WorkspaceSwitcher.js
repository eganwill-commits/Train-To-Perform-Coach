// components/WorkspaceSwitcher.js
"use client";

import { useWorkspace } from "../lib/WorkspaceContext";
import { WORKSPACES, isAdult } from "../lib/workspaces";

/**
 * Two-level workspace switcher, styled for the dark sidebar (#18181B).
 *
 * Level 1: TEEN | ADULT  (segmented pill)
 * Level 2: ANCHOR | ASCEND  (reveals when ADULT is active)
 *
 * Drop into the sidebar above the nav items.
 */
export default function WorkspaceSwitcher() {
  const { activeProgramType, setActiveProgramType, workspace } = useWorkspace();
  const adultActive = isAdult(activeProgramType);

  // When user clicks ADULT and they're currently on TEEN, default to Anchor
  const handleAdultClick = () => {
    if (!adultActive) setActiveProgramType("adult_anchor");
  };

  return (
    <div style={S.wrap}>
      {/* Label header */}
      <div style={S.header}>
        <span style={{ ...S.dot, background: workspace.accent }} />
        <span style={S.headerLabel}>WORKSPACE</span>
      </div>

      {/* Level 1: Teen | Adult */}
      <div style={S.level1}>
        <PrimaryPill
          label="TEEN"
          active={activeProgramType === "teen"}
          accent={WORKSPACES.teen.accent}
          onClick={() => setActiveProgramType("teen")}
        />
        <PrimaryPill
          label="ADULT"
          active={adultActive}
          accent={adultActive ? WORKSPACES[activeProgramType].accent : WORKSPACES.adult_anchor.accent}
          onClick={handleAdultClick}
        />
      </div>

      {/* Level 2: Anchor | Ascend (only when Adult active) */}
      {adultActive && (
        <div style={S.level2}>
          <SubPill
            label="Anchor"
            active={activeProgramType === "adult_anchor"}
            accent={WORKSPACES.adult_anchor.accent}
            onClick={() => setActiveProgramType("adult_anchor")}
          />
          <SubPill
            label="Ascend"
            active={activeProgramType === "adult_ascend"}
            accent={WORKSPACES.adult_ascend.accent}
            onClick={() => setActiveProgramType("adult_ascend")}
          />
        </div>
      )}

      {/* Tagline in active accent */}
      <div style={{ ...S.tagline, color: workspace.accent }}>
        {workspace.tagline}
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────── */

function PrimaryPill({ label, active, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...S.primaryBtn,
        background: active ? accent : "transparent",
        color: active ? "#fff" : "#A1A1AA",
        boxShadow: active ? `0 1px 6px ${accent}55` : "none",
      }}
    >
      {label}
    </button>
  );
}

function SubPill({ label, active, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...S.subBtn,
        background: active ? accent : "transparent",
        color: active ? "#fff" : "#A1A1AA",
        borderColor: active ? accent : "#3F3F46",
      }}
    >
      {label}
    </button>
  );
}

/* ─── Styles (dark sidebar) ──────────────────────────────── */

const S = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px",
    margin: "12px 10px 8px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid #27272A",
    fontFamily: '"DM Sans", system-ui, sans-serif',
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    display: "inline-block",
    transition: "background 0.2s ease",
    boxShadow: "0 0 6px currentColor",
  },
  headerLabel: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: "#71717A",
    fontFamily: '"Space Mono", monospace',
  },
  level1: {
    display: "flex",
    gap: 3,
    background: "#0F0F11",
    borderRadius: 7,
    padding: 3,
  },
  primaryBtn: {
    flex: 1,
    padding: "7px 10px",
    borderRadius: 5,
    border: "none",
    fontFamily: '"DM Sans", system-ui, sans-serif',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.8,
    cursor: "pointer",
    transition: "all 0.18s ease",
  },
  level2: {
    display: "flex",
    gap: 5,
    marginLeft: 6,
  },
  subBtn: {
    flex: 1,
    padding: "5px 8px",
    borderRadius: 5,
    border: "1px solid",
    fontFamily: '"DM Sans", system-ui, sans-serif',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.4,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  tagline: {
    fontSize: 10,
    fontStyle: "italic",
    letterSpacing: 0.2,
    marginTop: 2,
    opacity: 0.9,
    textAlign: "center",
  },
};
