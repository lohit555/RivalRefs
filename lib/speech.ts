import type { Speaker } from "./types";

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSupported()) return Promise.resolve([]);
  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

    const handleVoicesChanged = () => {
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        handleVoicesChanged
      );
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      handleVoicesChanged
    );

    // Some browsers never fire voiceschanged if voices load synchronously
    // moments later — don't block the app waiting forever.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
  });

  return voicesPromise;
}

export interface SpeakerVoiceProfile {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rate: number;
}

// Both Tano and Rémy are written as men (see lib/personas.ts) — so both
// speakers should use male-sounding system voices, never a female one.
// They're distinguished by pitch (Tano higher/brighter, Rémy lower/smoother)
// and, when the system offers more than one male-sounding voice, by using
// two different ones. Speaking rate is kept equal for both.
const MALE_HINTS = ["male", "david", "guy", "mark", "daniel", "george", "james", "alex"];

function scoreVoiceFor(voice: SpeechSynthesisVoice, hints: string[]): number {
  const name = voice.name.toLowerCase();
  // "female" contains the substring "male" (fe-male), so a naive substring
  // check would wrongly score a voice named e.g. "Google UK English Female"
  // as male-matching. Explicitly exclude anything actually labeled female.
  if (name.includes("female")) return 0;
  return hints.some((h) => name.includes(h)) ? 1 : 0;
}

export async function getSpeakerVoices(): Promise<
  Record<Speaker, SpeakerVoiceProfile>
> {
  const voices = await loadVoices();
  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  const sortedByMale = [...pool].sort(
    (a, b) => scoreVoiceFor(b, MALE_HINTS) - scoreVoiceFor(a, MALE_HINTS)
  );

  const redVoice = sortedByMale[0] ?? null;
  // Prefer a second, distinct male-sounding voice for BLUE if the system has
  // one; otherwise both speakers share the same voice, told apart by pitch.
  const secondMaleVoice =
    sortedByMale.find(
      (v) => v !== redVoice && scoreVoiceFor(v, MALE_HINTS) === 1
    ) ?? null;
  const blueVoice = secondMaleVoice ?? redVoice;

  return {
    // Tano: loud, dramatic, quick to celebrate — brighter/higher pitch.
    RED: { voice: redVoice, pitch: 1.3, rate: 1.0 },
    // Rémy: cool, dry, smug — lower pitch. Same rate as RED.
    BLUE: { voice: blueVoice, pitch: 0.75, rate: 1.0 },
  };
}
