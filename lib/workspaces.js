// lib/workspaces.js
// Single source of truth for the three program workspaces.
// Edit accent colors here to retune the visual identity.

export const WORKSPACES = {
  teen: {
    id: "teen",
    label: "Teen",
    group: "teen",
    accent: "#c8922a",          // T2P gold
    accentSoft: "#F5E9D2",      // pale gold wash
    description: "Teen Performance — ages 15–17",
    tagline: "Build the foundation",
  },
  adult_anchor: {
    id: "adult_anchor",
    label: "Anchor",
    group: "adult",
    accent: "#3E7CB1",          // steel blue
    accentSoft: "#DDE9F2",
    description: "Adult Anchor — foundation tier",
    tagline: "Strength · Structure · Longevity",
  },
  adult_ascend: {
    id: "adult_ascend",
    label: "Ascend",
    group: "adult",
    accent: "#C04A2F",          // burnt orange / crimson
    accentSoft: "#F5DCD6",
    description: "Adult Ascend — performance tier",
    tagline: "Train to compete",
  },
};

// Top-level groups for the two-level switcher
export const WORKSPACE_GROUPS = [
  { id: "teen",  label: "Teen",  members: ["teen"] },
  { id: "adult", label: "Adult", members: ["adult_anchor", "adult_ascend"] },
];

export const DEFAULT_WORKSPACE = "teen";

// Helpers
export const getWorkspace = (id) => WORKSPACES[id] || WORKSPACES[DEFAULT_WORKSPACE];
export const getGroup = (id) => WORKSPACE_GROUPS.find(g => g.members.includes(id));
export const isAdult = (id) => id === "adult_anchor" || id === "adult_ascend";
export const ALL_PROGRAM_TYPES = Object.keys(WORKSPACES);

// Convenience: workspace order for UIs that show all three
export const ALL_WORKSPACES = [WORKSPACES.teen, WORKSPACES.adult_anchor, WORKSPACES.adult_ascend];
