#!/usr/bin/env node
// Builds /data/match.json from StatsBomb open data (free, no API key) for
// the 2022 World Cup Final (Argentina vs France, match_id 3869685).
// Run with: node scripts/build-match.mjs

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "..", "data", "match.json");

const RAW_EVENTS_URL =
  "https://raw.githubusercontent.com/statsbomb/open-data/master/data/events/3869685.json";

// One-line flip: which StatsBomb team name maps to which commentator side.
const TEAM_MAP = { Argentina: "RED", France: "BLUE" };

function toSpeaker(teamName) {
  return TEAM_MAP[teamName] ?? null;
}

function opposite(speaker) {
  return speaker === "RED" ? "BLUE" : "RED";
}

// Common names for key players; anyone else falls back to the last word
// of their full StatsBomb name.
const PLAYER_NAME_MAP = {
  "Lionel Andrés Messi Cuccittini": "Messi",
  "Kylian Mbappé Lottin": "Mbappé",
  "Ángel Fabián Di María Hernández": "Di María",
  "Nicolás Hernán Otamendi": "Otamendi",
  "Antoine Griezmann": "Griezmann",
  "Olivier Giroud": "Giroud",
  "Ousmane Dembélé": "Dembélé",
  "Julián Álvarez": "Álvarez",
  "Gonzalo Ariel Montiel": "Montiel",
  "Randal Kolo Muani": "Kolo Muani",
  "Kingsley Coman": "Coman",
  "Aurélien Djani Tchouaméni": "Tchouaméni",
};

function shortenName(fullName) {
  if (!fullName) return "";
  if (PLAYER_NAME_MAP[fullName]) return PLAYER_NAME_MAP[fullName];
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

const HALF_START_DETAIL = {
  1: "First half kicks off.",
  2: "Second half underway.",
  3: "Extra time: first half begins.",
  4: "Extra time: second half begins.",
  5: "Penalty shootout begins.",
};

function capitalize(word) {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function buildGoalDetail(shot) {
  const bodyPart = shot?.body_part?.name || "unknown";
  const isPenalty = shot?.type?.name === "Penalty";
  return isPenalty
    ? `Penalty converted — ${bodyPart}.`
    : `${capitalize(bodyPart)} finish.`;
}

function buildChanceDetail(shot) {
  const bodyPart = shot?.body_part?.name || "unknown";
  const outcome = shot?.outcome?.name || "Chance";
  return `${outcome} — ${bodyPart}.`;
}

async function main() {
  console.log(`Fetching StatsBomb events from ${RAW_EVENTS_URL} ...`);
  const res = await fetch(RAW_EVENTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch StatsBomb data: ${res.status} ${res.statusText}`);
  }
  const rawEvents = await res.json();
  console.log(`Fetched ${rawEvents.length} raw events.`);

  const maxPeriod = Math.max(...rawEvents.map((e) => e.period ?? 0));
  const seenHalfStartPeriods = new Set();
  let fulltimeEmitted = false;
  const kept = [];

  for (const e of rawEvents) {
    const typeName = e.type?.name;
    const teamName = e.team?.name;

    if (typeName === "Shot" && e.period !== 5) {
      const outcome = e.shot?.outcome?.name;
      if (outcome === "Goal") {
        kept.push({
          minute: e.minute,
          period: e.period,
          second: e.second,
          type: "goal",
          team: toSpeaker(teamName),
          player: shortenName(e.player?.name),
          detail: buildGoalDetail(e.shot),
        });
      } else if (outcome === "Saved" || outcome === "Post") {
        kept.push({
          minute: e.minute,
          period: e.period,
          second: e.second,
          type: "chance",
          team: toSpeaker(teamName),
          player: shortenName(e.player?.name),
          detail: buildChanceDetail(e.shot),
        });
      }
      continue;
    }

    if (typeName === "Own Goal Against") {
      // Own Goal Against is logged on the team it happened against; the
      // opposing side is credited with the goal.
      const scoringSide = opposite(toSpeaker(teamName));
      kept.push({
        minute: e.minute,
        period: e.period,
        second: e.second,
        type: "goal",
        team: scoringSide,
        player: shortenName(e.player?.name),
        detail: "own goal",
      });
      continue;
    }

    if (typeName === "Foul Committed" && e.foul_committed?.card) {
      kept.push({
        minute: e.minute,
        period: e.period,
        second: e.second,
        type: "card",
        team: toSpeaker(teamName),
        player: shortenName(e.player?.name),
        detail: e.foul_committed.card.name,
      });
      continue;
    }

    if (typeName === "Bad Behaviour" && e.bad_behaviour?.card) {
      kept.push({
        minute: e.minute,
        period: e.period,
        second: e.second,
        type: "card",
        team: toSpeaker(teamName),
        player: shortenName(e.player?.name),
        detail: e.bad_behaviour.card.name,
      });
      continue;
    }

    if (typeName === "Substitution") {
      const off = shortenName(e.player?.name);
      const on = shortenName(e.substitution?.replacement?.name);
      kept.push({
        minute: e.minute,
        period: e.period,
        second: e.second,
        type: "sub",
        team: toSpeaker(teamName),
        player: off,
        detail: `off ${off}, on ${on}`,
      });
      continue;
    }

    if (typeName === "Half Start") {
      if (seenHalfStartPeriods.has(e.period)) continue; // dedupe: one per period
      seenHalfStartPeriods.add(e.period);
      kept.push({
        minute: e.minute,
        period: e.period,
        second: e.second,
        type: "kickoff",
        team: null,
        player: "",
        detail: HALF_START_DETAIL[e.period] || "Play resumes.",
      });
      continue;
    }

    if (typeName === "Half End" && e.period === maxPeriod) {
      if (fulltimeEmitted) continue; // dedupe: StatsBomb logs one per team
      fulltimeEmitted = true;
      kept.push({
        minute: e.minute,
        period: e.period,
        second: e.second,
        type: "fulltime",
        team: null,
        player: "",
        detail:
          "Full-time: Argentina win 4-2 on penalties after a 3-3 draw. World champions!",
      });
      continue;
    }

    if (typeName === "Shot" && e.period === 5) {
      kept.push({
        minute: e.minute,
        period: e.period,
        second: e.second,
        type: "penalty",
        team: toSpeaker(teamName),
        player: shortenName(e.player?.name),
        detail: e.shot?.outcome?.name || "Penalty",
      });
      continue;
    }
  }

  // Safety net: sort by (period, minute, second) rather than trusting
  // chronological order blindly — keeps the shootout (period 5) last
  // even though minute stays 120 throughout.
  kept.sort((a, b) => {
    if (a.period !== b.period) return a.period - b.period;
    if (a.minute !== b.minute) return a.minute - b.minute;
    return a.second - b.second;
  });

  const events = kept.map((e, i) => {
    const { period, second, ...rest } = e;
    return { id: i + 1, ...rest };
  });

  const teamMeta = {
    RED: { supports: "Argentina", shortName: "ARG" },
    BLUE: { supports: "France", shortName: "FRA" },
    finalScore: "3–3 (Argentina won 4–2 on penalties)",
    competition: "2022 World Cup Final",
    venue: "Lusail Stadium, Lusail",
  };

  const output = { teamMeta, events };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");

  // Summary
  const counts = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;

  console.log(`\nWrote ${events.length} events to ${OUTPUT_PATH}`);
  console.log("Counts by type:");
  for (const [type, count] of Object.entries(counts)) {
    console.log(`  ${type}: ${count}`);
  }

  const period5Count = kept.filter((e) => e.period === 5).length;
  const tailPeriods = kept.slice(-period5Count).map((e) => e.period);
  const shootoutIsLast = tailPeriods.every((p) => p === 5);
  console.log(
    `\nShootout (period 5, ${period5Count} events) confirmed last in output: ${shootoutIsLast}`
  );
  console.log(
    "Tail:",
    events
      .slice(-period5Count)
      .map((e) => `${e.type}${e.team ? `(${e.team})` : ""}`)
      .join(", ")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
