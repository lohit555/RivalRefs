import { NextRequest, NextResponse } from "next/server";
import type { TtsRequestBody } from "@/lib/types";

export const runtime = "nodejs";

const ELEVENLABS_TTS_URL = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

export async function POST(req: NextRequest) {
  let body: TtsRequestBody;

  try {
    body = (await req.json()) as TtsRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { speaker, text } = body ?? {};

  if (!speaker || !text || typeof text !== "string") {
    return NextResponse.json(
      { error: "Missing speaker or text" },
      { status: 400 }
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId =
    speaker === "RED"
      ? process.env.ELEVENLABS_VOICE_ID_RED
      : process.env.ELEVENLABS_VOICE_ID_BLUE;

  if (!apiKey || !voiceId) {
    console.error("ElevenLabs API key or voice ID not configured");
    return NextResponse.json(
      { error: "TTS not configured" },
      { status: 503 }
    );
  }

  try {
    const elevenLabsRes = await fetch(ELEVENLABS_TTS_URL(voiceId), {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!elevenLabsRes.ok || !elevenLabsRes.body) {
      const errText = await elevenLabsRes.text().catch(() => "");
      console.error("ElevenLabs TTS failed:", elevenLabsRes.status, errText);
      return NextResponse.json(
        { error: "TTS generation failed" },
        { status: 502 }
      );
    }

    const audioBuffer = await elevenLabsRes.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("TTS request error:", err);
    return NextResponse.json(
      { error: "TTS generation failed" },
      { status: 502 }
    );
  }
}
