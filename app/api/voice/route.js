import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "../../../lib/supabase";

// Character voices for timer voice lines, via ElevenLabs.
//   GET  /api/voice          -> list of available voices (name, description, preview)
//   POST /api/voice {text, voice_id} -> MP3 of that line in that voice
// Needs ELEVENLABS_API_KEY in the Vercel environment. Only the coach login can
// call it, so athletes and the public TV pages can't spend voice credits.

export const runtime = "nodejs";
export const maxDuration = 30;

const EL = "https://api.elevenlabs.io/v1";

async function requireCoach(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const sb = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return false;
  // Same rule the database enforces on voice lines: only the T2P coach login.
  const { data: ok } = await sb.rpc("is_t2p_coach");
  return ok === true;
}

function keyOrError() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { error: NextResponse.json({ error: "missing_key", message: "Add ELEVENLABS_API_KEY in Vercel → Settings → Environment Variables, then redeploy." }, { status: 501 }) };
  return { key };
}

export async function GET(req) {
  if (!(await requireCoach(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key, error } = keyOrError();
  if (error) return error;
  const r = await fetch(`${EL}/voices`, { headers: { "xi-api-key": key }, cache: "no-store" });
  if (!r.ok) return NextResponse.json({ error: "voice_list_failed", message: `ElevenLabs returned ${r.status}. Check the API key has voice read access.` }, { status: 502 });
  const j = await r.json();
  const voices = (j.voices || []).map(v => ({
    id: v.voice_id,
    name: v.name,
    category: v.category,
    description: v.description || v.labels?.description || "",
    gender: v.labels?.gender || "",
    accent: v.labels?.accent || "",
    age: v.labels?.age || "",
    use: v.labels?.use_case || v.labels?.["use case"] || "",
    preview: v.preview_url || "",
  }));
  return NextResponse.json({ voices });
}

export async function POST(req) {
  if (!(await requireCoach(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key, error } = keyOrError();
  if (error) return error;
  let body = {};
  try { body = await req.json(); } catch {}
  const text = String(body.text || "").trim().slice(0, 200);
  const voiceId = String(body.voice_id || "").replace(/[^A-Za-z0-9]/g, "");
  if (!text || !voiceId) return NextResponse.json({ error: "bad_request", message: "Need text and voice_id." }, { status: 400 });

  const r = await fetch(`${EL}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      // Lower stability + some style = more energy and variation, which suits hype lines.
      voice_settings: { stability: 0.3, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true },
    }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return NextResponse.json({ error: "tts_failed", message: `ElevenLabs returned ${r.status}. ${detail.slice(0, 200)}` }, { status: 502 });
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return new NextResponse(buf, { status: 200, headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
