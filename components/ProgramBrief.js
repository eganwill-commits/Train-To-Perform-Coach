"use client";

/**
 * Renders a program description as a structured brief.
 *
 * Format (plain text in programs.description):
 *   SECTION HEADING IN CAPS
 *   Body line.
 *   · bullet line
 *   · bullet line
 *   <blank line separates sections>
 *
 * Any description without CAPS headings falls back to a plain paragraph,
 * so existing programs are unaffected.
 */
export default function ProgramBrief({ text, compact = false }) {
  if (!text) return null;

  const chunks = text.split(/\n\s*\n/).map(c => c.trim()).filter(Boolean);
  const sections = chunks.map(chunk => {
    const lines = chunk.split("\n").map(l => l.trim()).filter(Boolean);
    const first = lines[0] || "";
    const isHeading = first.length <= 70 && first === first.toUpperCase() && /[A-Z]/.test(first);
    return {
      heading: isHeading ? first : null,
      lines: isHeading ? lines.slice(1) : lines,
    };
  });

  if (!sections.some(s => s.heading)) {
    return <p style={{ color: "#71717A", fontSize: compact ? 12 : 14, margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{text}</p>;
  }

  return (
    <div style={{
      border: "1px solid #E4E4E7", borderRadius: 10, background: "#FAFAFA",
      padding: compact ? "12px 14px" : "16px 18px", marginBottom: 16,
    }}>
      {sections.map((s, i) => (
        <div key={i} style={{
          paddingTop: i === 0 ? 0 : compact ? 10 : 14,
          marginTop: i === 0 ? 0 : compact ? 10 : 14,
          borderTop: i === 0 ? "none" : "1px solid #E4E4E7",
        }}>
          {s.heading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span style={{ width: 3, height: 13, borderRadius: 2, background: "#18181B", flexShrink: 0 }} />
              <span style={{
                fontSize: compact ? 10 : 11, fontWeight: 700, letterSpacing: ".11em",
                color: "#18181B", textTransform: "uppercase",
              }}>{s.heading}</span>
            </div>
          )}
          {s.lines.map((line, j) => {
            const bullet = line.startsWith("·");
            return (
              <div key={j} style={{
                display: "flex", gap: 8,
                paddingLeft: bullet ? (compact ? 11 : 13) : 0,
                marginBottom: j === s.lines.length - 1 ? 0 : 4,
              }}>
                {bullet && <span style={{ color: "#A1A1AA", flexShrink: 0, lineHeight: 1.55 }}>·</span>}
                <span style={{
                  fontSize: compact ? 12 : 13.5, lineHeight: 1.55,
                  color: bullet ? "#52525B" : "#3F3F46",
                }}>{bullet ? line.replace(/^·\s*/, "") : line}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** One-line preview for program cards — drops CAPS headings and bullets. */
export function briefSummary(text, max = 150) {
  if (!text) return "";
  const body = text.split("\n").map(l => l.trim())
    .filter(l => l && !l.startsWith("\u00b7") && !(l === l.toUpperCase() && /[A-Z]/.test(l) && l.length <= 70));
  const joined = body.join(" ");
  return joined.length > max ? joined.slice(0, max).trimEnd() + "\u2026" : joined;
}
