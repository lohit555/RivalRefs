import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { RED_SYSTEM_PROMPT, BLUE_SYSTEM_PROMPT } from "@/lib/personas";
import type { BanterLine, BanterRequestBody } from "@/lib/types";

export const runtime = "nodejs";

const MODEL = "claude-haiku-4-5-20251001";

function fallbackLine(body: BanterRequestBody | null): BanterLine[] {
  const team = body?.event?.team;
  const speaker = team === "BLUE" ? "BLUE" : "RED";
  return [
    {
      speaker,
      line: "Big moment there — commentary booth's gone quiet, but the game rolls on!",
    },
  ];
}

function extractJson(raw: string): string {
  let text = raw.trim();
  // Strip markdown code fences if the model wrapped its output.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  // If there's leading/trailing prose, grab the first [...] block.
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    text = arrayMatch[0];
  }
  return text;
}

function isBanterLineArray(value: unknown): value is BanterLine[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        (item.speaker === "RED" || item.speaker === "BLUE") &&
        typeof item.line === "string" &&
        item.line.trim().length > 0
    )
  );
}

export async function POST(req: NextRequest) {
  let body: BanterRequestBody | null = null;

  try {
    body = (await req.json()) as BanterRequestBody;
  } catch {
    return NextResponse.json({ lines: fallbackLine(null) });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set");
    return NextResponse.json({ lines: fallbackLine(body) });
  }

  const { event, history } = body;
  if (!event) {
    return NextResponse.json({ lines: fallbackLine(body) });
  }

  const priorEventsSummary = (history?.events ?? [])
    .slice(-8)
    .map((e) => `- [${e.minute}'] ${e.type.toUpperCase()}${e.team ? ` (${e.team})` : ""}: ${e.player ? e.player + " — " : ""}${e.detail}`)
    .join("\n");

  const priorLinesSummary = (history?.lines ?? [])
    .slice(-6)
    .map((l) => `${l.speaker}: ${l.line}`)
    .join("\n");

  const reactsFirst = event.team === "BLUE" ? "BLUE" : "RED";

  const systemMessage = `You are simulating a live two-person football commentary booth for a replayed match.

There are two commentator personas, defined below. Combine both personas into how you voice each speaker's lines.

--- RED PERSONA ---
${RED_SYSTEM_PROMPT}

--- BLUE PERSONA ---
${BLUE_SYSTEM_PROMPT}

--- MATCH CONTEXT ---
Competition: ${history?.events?.length ? "in progress" : "kickoff"} football match. RED commentator roots for one side, BLUE roots for the other.

Recent match events:
${priorEventsSummary || "(this is the first event of the match)"}

Recent commentary lines said so far:
${priorLinesSummary || "(no lines said yet)"}

--- YOUR TASK ---
Generate the NEXT exchange of commentary reacting to the CURRENT event below. Rules:
- Output 2 to 3 lines total, alternating speakers (RED, BLUE, RED or RED, BLUE — never the same speaker twice in a row).
- Whoever's team the event favors (or who would be more emotionally affected) reacts FIRST. For this event, that is ${reactsFirst}.
- Keep every line under 20 words. Make it spoken-word style, punchy, playful banter — never mean-spirited.
- Reference earlier match moments when natural, so the commentary feels continuous, not one-off.
- Output ONLY a raw JSON array, no prose, no markdown code fences, no explanation. Format exactly:
[{"speaker":"RED","line":"..."},{"speaker":"BLUE","line":"..."}]`;

  const userMessage = `CURRENT EVENT:
Minute: ${event.minute}
Type: ${event.type}
Team: ${event.team ?? "N/A"}
Player: ${event.player || "N/A"}
Detail: ${event.detail}

Generate the next exchange now. JSON array only.`;

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: systemMessage,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";

    const jsonCandidate = extractJson(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch {
      return NextResponse.json({ lines: fallbackLine(body) });
    }

    if (!isBanterLineArray(parsed)) {
      return NextResponse.json({ lines: fallbackLine(body) });
    }

    return NextResponse.json({ lines: parsed });
  } catch (err) {
    console.error("Banter generation failed:", err);
    return NextResponse.json({ lines: fallbackLine(body) });
  }
}
