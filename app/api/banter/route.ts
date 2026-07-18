import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, ApiError } from "@google/genai";
import { RED_SYSTEM_PROMPT, BLUE_SYSTEM_PROMPT } from "@/lib/personas";
import type { BanterLine, BanterRequestBody } from "@/lib/types";

export const runtime = "nodejs";

// Each model draws from its own separate free-tier quota. If the primary
// model's daily quota is exhausted (HTTP 429 / RESOURCE_EXHAUSTED), fall
// through to the next one instead of giving up immediately.
const MODEL_CHAIN = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3-flash-preview"];

function fallbackLine(body: BanterRequestBody | null): BanterLine[] {
  const team = body?.event?.team;
  const speaker = team === "BLUE" ? "BLUE" : "RED";
  return [
    {
      speaker,
      line: "Big moment there, commentary booth's gone quiet, but the game rolls on!",
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

// Backstop in case the model ignores the no-dash instruction — dashes
// spoken aloud by TTS sound like an odd pause, so strip them deterministically.
function stripDashes(lines: BanterLine[]): BanterLine[] {
  return lines.map((l) => ({
    ...l,
    line: l.line
      .replace(/\s*[—–]\s*/g, ", ")
      .replace(/,\s*,/g, ",")
      .replace(/,\s*$/, "")
      .trim(),
  }));
}

export async function POST(req: NextRequest) {
  let body: BanterRequestBody | null = null;

  try {
    body = (await req.json()) as BanterRequestBody;
  } catch {
    return NextResponse.json({ lines: fallbackLine(null) });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    return NextResponse.json({ lines: fallbackLine(body) });
  }

  const { event, history, matchMeta } = body;
  if (!event) {
    return NextResponse.json({ lines: fallbackLine(body) });
  }

  const priorEventsSummary = (history?.events ?? [])
    .slice(-8)
    .map((e) => `- [${e.minute}'] ${e.type.toUpperCase()}${e.team ? ` (${e.team})` : ""}: ${e.player ? e.player + ", " : ""}${e.detail}`)
    .join("\n");

  const priorLinesSummary = (history?.lines ?? [])
    .slice(-6)
    .map((l) => `${l.speaker}: ${l.line}`)
    .join("\n");

  const reactsFirst = event.team === "BLUE" ? "BLUE" : "RED";

  const detailLower = event.detail.toLowerCase();
  const isExtraTimeKickoff =
    event.type === "kickoff" &&
    (detailLower.includes("period 3") || detailLower.includes("period 4"));
  const isShootoutKickoff =
    event.type === "kickoff" && detailLower.includes("period 5");
  const isGoalOrPenalty = event.type === "goal" || event.type === "penalty";

  const specialInstructions: string[] = [];

  if (matchMeta?.isFirstEvent) {
    specialInstructions.push(
      `This is the VERY FIRST line of the whole broadcast, before any match action. One commentator opens hyped and enthusiastic, welcoming everyone: something in the spirit of "Ladies and gentlemen, welcome to the match, ${matchMeta.redTeam} vs ${matchMeta.blueTeam}, here we go!" — then the other jumps in with their own hyped-up spin. Full pre-match excitement, not a reaction to a specific play yet.`
    );
  }

  if (isExtraTimeKickoff) {
    specialInstructions.push(
      `This kickoff marks the start of EXTRA TIME. Both commentators must explicitly tell the audience we're now in extra time, with their own spin on it (nerves, excitement, exhaustion, whatever fits their personality).`
    );
  }

  if (isShootoutKickoff) {
    specialInstructions.push(
      `The match is going to a PENALTY SHOOTOUT. Both commentators must explicitly announce this to the audience and hype up the tension before the first kick.`
    );
  }

  if (isGoalOrPenalty) {
    specialInstructions.push(
      `Explicitly name the player (${event.player || "the player"}) and state the outcome clearly using the detail field ("${event.detail}") — for a penalty, make it unambiguous whether it was scored, saved, or missed. Call it like a real goal or a real miss, not vaguely.`
    );
  }

  if (matchMeta?.isFinalEvent) {
    specialInstructions.push(
      `This is the LAST event of the entire match. After reacting to it, both commentators must wrap up the broadcast: clearly state the winning team and the final result ("${matchMeta?.finalScore ?? ""}"), then close with a proper sign-off conclusion to the broadcast (a memorable, satisfying final line each, in character). This exchange can run up to 4 lines total instead of the usual 2-3 to fit the reaction plus the wrap-up.`
    );
  }

  const systemMessage = `You are simulating a live two-person football commentary booth for a replayed match. This should read like real roast battle content: sharp, personal, competitive trash talk between two rival fans, not polite sports commentary.

There are two commentator personas, defined below. Combine both personas into how you voice each speaker's lines. Make sure the two voices stay clearly distinct in tone: one loud/passionate, one dry/smug, never blur together.

--- RED PERSONA ---
${RED_SYSTEM_PROMPT}

--- BLUE PERSONA ---
${BLUE_SYSTEM_PROMPT}

--- MATCH CONTEXT ---
${matchMeta ? `${matchMeta.redTeam} (RED) vs ${matchMeta.blueTeam} (BLUE).` : "RED commentator roots for one side, BLUE roots for the other."}

Recent match events:
${priorEventsSummary || "(this is the first event of the match)"}

Recent commentary lines said so far:
${priorLinesSummary || "(no lines said yet)"}

--- YOUR TASK ---
Generate the NEXT exchange of commentary reacting to the CURRENT event below. Rules:
- Output 2 to 3 lines total (unless a special instruction below says otherwise), alternating speakers (RED, BLUE, RED or RED, BLUE — never the same speaker twice in a row).
- Whoever's team the event favors (or who would be more emotionally affected) reacts FIRST. For this event, that is ${reactsFirst}.
- Keep every line under 20 words. Make it spoken-word style, punchy. Real roast energy: sharp jabs, confident trash talk, competitive needling — still football banter, never genuinely hateful, no slurs, nothing about real tragedies.
- NEVER use an em dash (—) or en dash (–) anywhere in any line. Use commas, periods, or exclamation marks instead.
- Reference earlier match moments when natural, so the commentary feels continuous, not one-off.
${specialInstructions.length > 0 ? `\nSPECIAL INSTRUCTIONS FOR THIS EXCHANGE:\n${specialInstructions.map((s) => `- ${s}`).join("\n")}\n` : ""}
- Output ONLY a raw JSON array, no prose, no markdown code fences, no explanation. Format exactly:
[{"speaker":"RED","line":"..."},{"speaker":"BLUE","line":"..."}]`;

  const userMessage = `CURRENT EVENT:
Minute: ${event.minute}
Type: ${event.type}
Team: ${event.team ?? "N/A"}
Player: ${event.player || "N/A"}
Detail: ${event.detail}

Generate the next exchange now. JSON array only.`;

  const callGemini = async (
    ai: GoogleGenAI,
    model: string
  ): Promise<BanterLine[] | null> => {
    const response = await ai.models.generateContent({
      model,
      contents: userMessage,
      config: {
        systemInstruction: systemMessage,
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const rawText = response.text ?? "";
    const jsonCandidate = extractJson(rawText);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch {
      return null;
    }

    if (!isBanterLineArray(parsed)) {
      return null;
    }

    return parsed;
  };

  try {
    const ai = new GoogleGenAI({ apiKey });
    let lines: BanterLine[] | null = null;

    for (let i = 0; i < MODEL_CHAIN.length; i += 1) {
      const model = MODEL_CHAIN[i];
      const isLastModel = i === MODEL_CHAIN.length - 1;

      try {
        lines = await callGemini(ai, model);
        break;
      } catch (err) {
        const isQuotaExhausted = err instanceof ApiError && err.status === 429;
        if (isQuotaExhausted && !isLastModel) {
          console.error(`${model} quota exhausted, falling through to next model`);
          continue;
        }
        throw err;
      }
    }

    if (!lines) {
      return NextResponse.json({ lines: fallbackLine(body) });
    }

    return NextResponse.json({ lines: stripDashes(lines) });
  } catch (err) {
    console.error("Banter generation failed:", err);
    return NextResponse.json({ lines: fallbackLine(body) });
  }
}
