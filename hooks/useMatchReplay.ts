"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import matchData from "@/data/match.json";
import { AudioQueue } from "@/lib/audioQueue";
import { getSpeakerVoices, isSpeechSupported } from "@/lib/speech";
import type { SpeakerVoiceProfile } from "@/lib/speech";
import type {
  BanterLine,
  MatchData,
  MatchEvent,
  Speaker,
  TranscriptEntry,
} from "@/lib/types";

const typedMatchData = matchData as MatchData;

export type ReplayStatus = "idle" | "playing" | "paused" | "finished";
export type ReplaySpeed = 1 | 10 | 30;

interface UseMatchReplayResult {
  status: ReplayStatus;
  speed: ReplaySpeed;
  currentMinute: string;
  score: { RED: number; BLUE: number };
  activeSpeaker: Speaker | null;
  transcript: TranscriptEntry[];
  teamMeta: MatchData["teamMeta"];
  currentEvent: MatchEvent | null;
  start: () => void;
  pause: () => void;
  restart: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
}

// At 1x, one match-minute plays out over a realistic 60 real seconds.
// At 10x (default), that's 6 real seconds/match-minute, so a 90-min
// match completes in ~9 real minutes, as spec'd.
const SECONDS_PER_MATCH_MINUTE_AT_1X = 60;

// Real match lulls (e.g. an 18-minute gap with no scripted event) would
// otherwise stall the replay for minutes at a time. Cap every gap so the
// commentary keeps flowing continuously for a demo. The cap scales with
// speed so 1x/10x/30x still feel meaningfully different from each other
// instead of all collapsing to the same capped wait.
const MAX_GAP_MS_BY_SPEED: Record<ReplaySpeed, number> = {
  1: 15000,
  10: 8000,
  30: 4000,
};

// Nominal end-of-period minute, like a real broadcast clock. Stoppage time
// within a period is shown as "<nominalEnd>+<extra>" (e.g. "45+6") instead
// of a raw minute that can run past the next period's kickoff and look like
// the clock jumped backward. Period 5 (the shootout) has no fixed length,
// so its events just display their own raw minute.
const PERIOD_NOMINAL_END: Record<number, number> = {
  1: 45,
  2: 90,
  3: 105,
  4: 120,
  5: Infinity,
};

function periodFromKickoffDetail(detail: string): number | null {
  const match = detail.match(/period (\d+) start/i);
  return match ? Number(match[1]) : null;
}

function formatMinuteLabel(rawMinute: number, periodNominalEnd: number): string {
  if (rawMinute <= periodNominalEnd) return `${rawMinute}`;
  return `${periodNominalEnd}+${rawMinute - periodNominalEnd}`;
}

function sleepInterruptible(
  ms: number,
  isCancelled: () => boolean,
  isPaused: () => boolean
): Promise<void> {
  return new Promise((resolve) => {
    const step = 150;
    let remaining = ms;

    const tick = () => {
      if (isCancelled()) {
        resolve();
        return;
      }
      if (isPaused()) {
        setTimeout(tick, step);
        return;
      }
      remaining -= step;
      if (remaining <= 0) {
        resolve();
        return;
      }
      setTimeout(tick, step);
    };

    tick();
  });
}

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `line-${idCounter}-${Date.now()}`;
}

export function useMatchReplay(): UseMatchReplayResult {
  const [status, setStatus] = useState<ReplayStatus>("idle");
  const [speed, setSpeedState] = useState<ReplaySpeed>(10);
  const [currentMinute, setCurrentMinute] = useState("0");
  const [score, setScore] = useState<{ RED: number; BLUE: number }>({
    RED: 0,
    BLUE: 0,
  });
  const [activeSpeaker, setActiveSpeaker] = useState<Speaker | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentEvent, setCurrentEvent] = useState<MatchEvent | null>(null);

  const speedRef = useRef<ReplaySpeed>(10);
  const pausedRef = useRef(false);
  const runningRef = useRef(false);
  const runIdRef = useRef(0);
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const voiceProfilesRef = useRef<Record<Speaker, SpeakerVoiceProfile> | null>(
    null
  );
  const historyRef = useRef<{ events: MatchEvent[]; lines: BanterLine[] }>({
    events: [],
    lines: [],
  });

  useEffect(() => {
    audioQueueRef.current = new AudioQueue();
    getSpeakerVoices().then((profiles) => {
      voiceProfilesRef.current = profiles;
    });
    return () => {
      audioQueueRef.current?.clear();
    };
  }, []);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const setSpeed = useCallback((s: ReplaySpeed) => {
    setSpeedState(s);
  }, []);

  const fetchBanter = useCallback(
    async (
      event: MatchEvent,
      isFirstEvent: boolean,
      isFinalEvent: boolean
    ): Promise<BanterLine[]> => {
      try {
        const res = await fetch("/api/banter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event,
            history: historyRef.current,
            matchMeta: {
              redTeam: typedMatchData.teamMeta.RED.supports,
              blueTeam: typedMatchData.teamMeta.BLUE.supports,
              finalScore: typedMatchData.teamMeta.finalScore,
              isFirstEvent,
              isFinalEvent,
            },
          }),
        });
        if (!res.ok) throw new Error("banter request failed");
        const data = await res.json();
        if (Array.isArray(data.lines) && data.lines.length > 0) {
          return data.lines as BanterLine[];
        }
        throw new Error("empty banter lines");
      } catch (err) {
        console.error("Banter fetch failed, using fallback:", err);
        const speaker: Speaker = event.team === "BLUE" ? "BLUE" : "RED";
        return [
          {
            speaker,
            line: "Big moment there, booth's lost for words, but the match rolls on!",
          },
        ];
      }
    },
    []
  );

  const playExchange = useCallback(
    async (lines: BanterLine[], minute: string, isCancelled: () => boolean) => {
      const queue = audioQueueRef.current;
      if (!queue) return;

      for (const line of lines) {
        if (isCancelled()) return;

        const entry: TranscriptEntry = {
          id: nextId(),
          minute,
          speaker: line.speaker,
          line: line.line,
          voiced: isSpeechSupported(),
        };
        setTranscript((prev) => [...prev, entry]);
        historyRef.current.lines.push({
          speaker: line.speaker,
          line: line.line,
        });

        await new Promise<void>((resolve) => {
          queue.enqueue({
            text: line.line,
            voiceProfile: voiceProfilesRef.current?.[line.speaker] ?? null,
            onStart: () => setActiveSpeaker(line.speaker),
            onEnd: () => {
              setActiveSpeaker(null);
              resolve();
            },
          });
        });

        if (isCancelled()) return;
      }
    },
    []
  );

  const runReplay = useCallback(
    async (myRunId: number) => {
      const isCancelled = () => runIdRef.current !== myRunId;

      const events = typedMatchData.events;
      let prevMinute = 0;
      // Stoppage-time events (e.g. a card at raw minute 51, still first-half
      // added time) can appear before the next period's kickoff in event
      // order. Track which period we're in and its nominal end so stoppage
      // time displays as "45+6" instead of a raw minute that would look
      // like it ran past the next period's kickoff.
      let periodNominalEnd = PERIOD_NOMINAL_END[1];
      let displayMinuteLabel = "0";
      // Holds the in-flight fetch for the event we're about to process,
      // kicked off during the PREVIOUS iteration's audio playback. This
      // overlaps Gemini's network/generation latency with playback and the
      // pacing wait instead of stacking it on top, so gaps feel much shorter
      // without making any extra API calls.
      let pendingBanter: Promise<BanterLine[]> | null = null;

      for (let i = 0; i < events.length; i += 1) {
        if (isCancelled()) return;

        const event = events[i];
        const isFirstEvent = i === 0;
        const isFinalEvent = i === events.length - 1;

        const deltaMinutes = Math.max(event.minute - prevMinute, 0);
        prevMinute = event.minute;

        const delayMs = Math.min(
          (deltaMinutes * SECONDS_PER_MATCH_MINUTE_AT_1X * 1000) /
            speedRef.current,
          MAX_GAP_MS_BY_SPEED[speedRef.current]
        );

        const banterPromise =
          pendingBanter ?? fetchBanter(event, isFirstEvent, isFinalEvent);

        await sleepInterruptible(delayMs, isCancelled, () => pausedRef.current);

        if (isCancelled()) return;

        if (event.type === "kickoff") {
          const period = periodFromKickoffDetail(event.detail);
          periodNominalEnd =
            period !== null && period in PERIOD_NOMINAL_END
              ? PERIOD_NOMINAL_END[period]
              : event.minute;
          displayMinuteLabel = `${event.minute}`;
        } else {
          displayMinuteLabel = formatMinuteLabel(event.minute, periodNominalEnd);
        }
        setCurrentMinute(displayMinuteLabel);
        setCurrentEvent(event);

        if (event.type === "goal" && event.team) {
          const team = event.team;
          setScore((prev) => ({ ...prev, [team]: prev[team] + 1 }));
        }

        const lines = await banterPromise;
        if (isCancelled()) return;

        historyRef.current.events.push(event);

        const nextEvent = events[i + 1];
        pendingBanter = nextEvent
          ? fetchBanter(nextEvent, false, i + 2 === events.length)
          : null;

        await playExchange(lines, displayMinuteLabel, isCancelled);
        if (isCancelled()) return;
      }

      runningRef.current = false;
      if (!isCancelled()) {
        setStatus("finished");
      }
    },
    [fetchBanter, playExchange]
  );

  const start = useCallback(() => {
    if (status === "playing") return;

    if (runningRef.current) {
      // Resuming from pause — same run, just unpause.
      pausedRef.current = false;
      setStatus("playing");
      audioQueueRef.current?.resume();
      return;
    }

    pausedRef.current = false;
    runningRef.current = true;
    setStatus("playing");
    const myRunId = runIdRef.current;
    void runReplay(myRunId);
  }, [status, runReplay]);

  const pause = useCallback(() => {
    if (!runningRef.current) return;
    pausedRef.current = true;
    setStatus("paused");
    audioQueueRef.current?.pause();
  }, []);

  const restart = useCallback(() => {
    runIdRef.current += 1;
    pausedRef.current = false;
    runningRef.current = false;
    audioQueueRef.current?.clear();
    audioQueueRef.current?.reset();
    historyRef.current = { events: [], lines: [] };
    setTranscript([]);
    setScore({ RED: 0, BLUE: 0 });
    setCurrentMinute("0");
    setCurrentEvent(null);
    setActiveSpeaker(null);
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      audioQueueRef.current?.clear();
    };
  }, []);

  return {
    status,
    speed,
    currentMinute,
    score,
    activeSpeaker,
    transcript,
    teamMeta: typedMatchData.teamMeta,
    currentEvent,
    start,
    pause,
    restart,
    setSpeed,
  };
}
