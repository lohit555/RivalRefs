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

// RED (Tano) is loud, passionate, dramatic — a male-leaning voice read faster
// and higher-pitched fits. BLUE (Rémy) is cool, dry, smug — a contrasting
// voice read slower and lower-pitched fits. We actively search for two
// voices that sound different (by name hint, not just index order), and
// push pitch/rate further apart on top so the two are unmistakable even if
// the system only exposes one or two English voices.
const MALE_HINTS = ["male", "david", "guy", "mark", "daniel", "george", "james", "alex"];
const FEMALE_HINTS = ["female", "zira", "susan", "samantha", "victoria", "karen", "linda"];

function scoreVoiceFor(voice: SpeechSynthesisVoice, hints: string[]): number {
  const name = voice.name.toLowerCase();
  return hints.some((h) => name.includes(h)) ? 1 : 0;
}

export async function getSpeakerVoices(): Promise<
  Record<Speaker, SpeakerVoiceProfile>
> {
  const voices = await loadVoices();
  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  let redVoice: SpeechSynthesisVoice | null = null;
  let blueVoice: SpeechSynthesisVoice | null = null;

  if (pool.length > 0) {
    const sortedForRed = [...pool].sort(
      (a, b) => scoreVoiceFor(b, MALE_HINTS) - scoreVoiceFor(a, MALE_HINTS)
    );
    redVoice = sortedForRed[0];

    const remaining = pool.filter((v) => v !== redVoice);
    const candidates = remaining.length > 0 ? remaining : pool;
    const sortedForBlue = [...candidates].sort(
      (a, b) => scoreVoiceFor(b, FEMALE_HINTS) - scoreVoiceFor(a, FEMALE_HINTS)
    );
    blueVoice = sortedForBlue[0];
  }

  return {
    // Tano: loud, dramatic, quick to celebrate — faster and higher.
    RED: { voice: redVoice, pitch: 1.3, rate: 1.15 },
    // Rémy: cool, dry, smug — slower and lower.
    BLUE: { voice: blueVoice, pitch: 0.7, rate: 0.9 },
  };
}
