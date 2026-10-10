import { NextResponse } from "next/server";

/*
  Turns a coach's video feedback into a cue the athlete can read mid-set, and says which
  of the athlete's programmed exercises it should follow.

  The coach always approves or edits the result before it is saved; this only drafts.
  Uses the same ANTHROPIC_API_KEY as the T2P Assistant.
*/
const SYSTEM = `You write coaching cues for the Train To Perform (T2P) app.

A coach has written feedback on an athlete's movement video. Write the cue the athlete will see at the top of that exercise in every later session: what to do, not what went wrong.

Rules for the cue:
- 1 or 2 short lines, under 160 characters total. Glanceable between sets.
- Imperative, plain language, in the coach's own words where possible.
- Keep the specific fixes and any decision rule the coach gave (for example "if you can't hold it, use a heavier band"). Drop praise, observations about the video itself (camera angle, "I can't see your feet"), and explanations of why.
- No em dashes or en dashes. No emojis. No quotation marks around the cue.

Rules for applies_to:
- Choose from the candidate list only, by key.
- Always include the filmed exercise if it is in the list.
- Also include candidates that are the same movement or a direct substitute where the same cue clearly applies (for example a chest-supported dumbbell row and a single-arm dumbbell row). Do not include merely related exercises (a pull-up is not a row; a scap pull-up is not a strict pull-up).

Reply with JSON only: {"cue": "...", "applies_to": ["key", ...]}`;

export async function POST(request) {
  try {
    const { feedback, exerciseName, candidates } = await request.json();
    if (!feedback || !String(feedback).trim()) {
      return NextResponse.json({ error: "No feedback to work from" }, { status: 400 });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    const list = (Array.isArray(candidates) ? candidates : []).slice(0, 300)
      .map(c => `- key: ${String(c.key).slice(0, 80)} | ${String(c.name || "").slice(0, 120)}${c.category ? ` [${c.category}]` : ""}${c.weeks ? ` (${c.weeks})` : ""}`)
      .join("\n");

    const user = `Filmed exercise: ${String(exerciseName || "unknown").slice(0, 120)}

Coach's feedback:
${String(feedback).slice(0, 4000)}

Candidate exercises in the athlete's program:
${list || "(none)"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `API error (${response.status}): ${errText.slice(0, 200)}` }, { status: 502 });
    }
    const data = await response.json();
    const text = data.content?.map(c => c.text || "").join("") || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "No suggestion returned" }, { status: 502 });
    const parsed = JSON.parse(match[0]);
    const cue = String(parsed.cue || "").replace(/[–—]/g, ",").trim();
    if (!cue) return NextResponse.json({ error: "Empty suggestion" }, { status: 502 });
    const keys = new Set((Array.isArray(candidates) ? candidates : []).map(c => String(c.key)));
    const applies_to = (Array.isArray(parsed.applies_to) ? parsed.applies_to : []).map(String).filter(k => keys.has(k));
    return NextResponse.json({ cue, applies_to });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
