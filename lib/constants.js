// Key order IS the display order — it drives the Library filter chips, the
// category dropdown, both Dashboard charts and every Badge, via
// Object.keys(PILLAR_COLORS) in CoachApp. Order matches the published
// methodology on traintoperform.fit: MVT → PWR → SKL → STR → COND → FIN.
export const PILLAR_COLORS = {
  MVT: { bg: "#F97316", light: "#FFF7ED", text: "#9A3412", border: "#FB923C" },
  PWR: { bg: "#2563EB", light: "#EFF6FF", text: "#1E3A8A", border: "#60A5FA" },
  SKL: { bg: "#16A34A", light: "#F0FDF4", text: "#14532D", border: "#4ADE80" },
  STR: { bg: "#18181B", light: "#F4F4F5", text: "#27272A", border: "#71717A" },
  COND: { bg: "#0D9488", light: "#F0FDFA", text: "#115E59", border: "#5EEAD4" },
  FIN: { bg: "#7C3AED", light: "#F5F3FF", text: "#4C1D95", border: "#A78BFA" },
};
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
  { id: "messages", icon: "✉", label: "Messages" },
  { id: "ai-chat", icon: "💬", label: "T2P Assistant" },
  { id: "settings", icon: "⚙", label: "Settings" },
];
export const ATHLETE_NAV = [
  { id: "my-program", icon: "▦", label: "My Program" },
  { id: "my-baselines", icon: "◎", label: "My Baselines" },
  { id: "my-logs", icon: "◉", label: "Completed Workouts" },
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
