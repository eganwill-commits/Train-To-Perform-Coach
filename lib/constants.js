// Key order IS the display order — it drives the Library filter chips, the
// category dropdown, both Dashboard charts and every Badge, via
// Object.keys(PILLAR_COLORS) in CoachApp. Order matches the published
// methodology on traintoperform.fit: MVT → PWR → SKL → STR → COND → FIN,
// then REC.
//
// REC (Recovery) is the cool-down. It is NOT a seventh pillar: it is the label for
// the down-regulation work that closes a session (breathing, easy stretches,
// hangs). It lives here so it gets a badge, a colour and a slot in the dropdown,
// but it is never a must-log category (see MUST_LOG_CATS in lib/logging.js), so a
// cool-down never raises a "no numbers" nudge. Grey on purpose: it should read as
// quieter than the six pillars.
export const PILLAR_COLORS = {
  MVT: { bg: "#F97316", light: "#FFF7ED", text: "#9A3412", border: "#FB923C" },
  PWR: { bg: "#2563EB", light: "#EFF6FF", text: "#1E3A8A", border: "#60A5FA" },
  SKL: { bg: "#16A34A", light: "#F0FDF4", text: "#14532D", border: "#4ADE80" },
  STR: { bg: "#18181B", light: "#F4F4F5", text: "#27272A", border: "#71717A" },
  COND: { bg: "#0D9488", light: "#F0FDFA", text: "#115E59", border: "#5EEAD4" },
  FIN: { bg: "#7C3AED", light: "#F5F3FF", text: "#4C1D95", border: "#A78BFA" },
  REC: { bg: "#64748B", light: "#F8FAFC", text: "#334155", border: "#CBD5E1" },
};

// Full names, for print headers and anywhere a badge needs spelling out.
export const PILLAR_LABELS = {
  MVT: "MVT: Movement",
  PWR: "PWR: Power",
  SKL: "SKL: Skill",
  STR: "STR: Strength",
  COND: "COND: Conditioning",
  FIN: "FIN: Finishing Work",
  REC: "REC: Recovery (cool-down)",
};

// Which library categories to offer for a block. Cool-down drills are mobility
// exercises and live in the library as MVT, so a REC block offers REC exercises
// first (if any are ever added), then MVT, then everything else.
export function libraryCatsFor(cat) {
  return cat === "REC" ? ["REC", "MVT"] : [cat];
}
export function firstExerciseFor(exercises, cat) {
  for (const c of libraryCatsFor(cat)) {
    const ex = (exercises || []).find(e => e.category === c);
    if (ex) return ex;
  }
  return null;
}
export const GENERIC_COLORS = {
  Strength: { bg: "#DC2626", light: "#FEF2F2", text: "#991B1B", border: "#F87171" },
  Conditioning: { bg: "#2563EB", light: "#EFF6FF", text: "#1E3A8A", border: "#60A5FA" },
  Mobility: { bg: "#F59E0B", light: "#FFFBEB", text: "#92400E", border: "#FCD34D" },
  Sport: { bg: "#7C3AED", light: "#F5F3FF", text: "#4C1D95", border: "#A78BFA" },
};
export const NAV_ITEMS = [
  { id: "dashboard", icon: "◉", label: "Dashboard" },
  { id: "seasons", icon: "▣", label: "Seasons" },
  { id: "athletes", icon: "◎", label: "Athletes" },
  { id: "programs", icon: "▦", label: "Programs" },
  { id: "library", icon: "◈", label: "Library" },
  { id: "log", icon: "◇", label: "Log" },
  { id: "timers", icon: "⏱", label: "Timers" },
  { id: "messages", icon: "✉", label: "Messages" },
  { id: "ai-chat", icon: "💬", label: "T2P Assistant" },
  { id: "settings", icon: "⚙", label: "Settings" },
];
export const ATHLETE_NAV = [
  { id: "my-program", icon: "▦", label: "Today" },
  { id: "my-progress", icon: "↗", label: "My Progress" },
  { id: "my-baselines", icon: "◎", label: "My Baselines" },
  { id: "my-logs", icon: "◉", label: "Completed Workouts" },
  { id: "timers", icon: "⏱", label: "Timers" },
  { id: "my-videos", icon: "▶", label: "My Videos" },
  { id: "messages", icon: "✉", label: "Messages" },
  { id: "ai-chat", icon: "💬", label: "T2P Assistant" },
];

// Equipment rooms. Order here is the order the athlete sees in the day picker.
export const EQUIP_OPTIONS = [
  { value: "full_gym", label: "Full gym" },
  { value: "no_barbell", label: "No barbell" },
  { value: "no_machine", label: "No machines" },
  { value: "hotel_gym", label: "Hotel gym" },
  { value: "db_bodyweight", label: "DB / bodyweight" },
];
export const EQUIP_LABEL = Object.fromEntries(EQUIP_OPTIONS.map(o => [o.value, o.label]));
// Full gym is the baseline, so only a room that differs is worth surfacing on a log.
export function roomLabel(tier) {
  return tier && tier !== "full_gym" ? (EQUIP_LABEL[tier] || tier) : "";
}
