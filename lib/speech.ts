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

  // Prefer voices that run locally (no network round-trip needed) over
  // "network" voices like Chrome's "Google UK English Male" — network
  // voices can silently fail to load or fall back to a default without any
  // error, which is what made RED and BLUE sound identical previously.
  // Reliability comes first; accent/engine variety is a secondary bonus.
  const sorted = [...pool].sort((a, b) => {
    const maleScore = scoreVoiceFor(b, MALE_HINTS) - scoreVoiceFor(a, MALE_HINTS);
    if (maleScore !== 0) return maleScore;
    const localScore = Number(b.localService) - Number(a.localService);
    return localScore;
  });

  const maleVoices = sorted.filter((v) => scoreVoiceFor(v, MALE_HINTS) === 1);
  const redVoice = maleVoices[0] ?? sorted[0] ?? null;

  // Among the remaining male voices, prefer one that's both reliable
  // (local) AND sounds different (different accent/locale) from RED's —
  // but never sacrifice reliability just for accent variety.
  const remainingMale = maleVoices.filter((v) => v !== redVoice);
  const localDifferentAccent = remainingMale.find(
    (v) => v.localService && v.lang !== redVoice?.lang
  );
  const anyLocal = remainingMale.find((v) => v.localService);
  const anyOther = remainingMale[0];
  const blueVoice = localDifferentAccent ?? anyLocal ?? anyOther ?? redVoice;

  return {
    // Tano: loud, dramatic, quick to celebrate — brighter/higher pitch.
    RED: { voice: redVoice, pitch: 1.3, rate: 1.0 },
    // Rémy: cool, dry, smug — lower pitch. Same rate as RED.
    BLUE: { voice: blueVoice, pitch: 0.75, rate: 1.0 },
  };
}
