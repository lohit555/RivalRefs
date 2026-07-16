"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import matchData from "@/data/match.json";
import { AudioQueue } from "@/lib/audioQueue";
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
  currentMinute: number;
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
  const [currentMinute, setCurrentMinute] = useState(0);
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
  const historyRef = useRef<{ events: MatchEvent[]; lines: BanterLine[] }>({
    events: [],
    lines: [],
  });

  useEffect(() => {
    audioQueueRef.current = new AudioQueue();
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
    async (event: MatchEvent): Promise<BanterLine[]> => {
      try {
        const res = await fetch("/api/banter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event,
            history: historyRef.current,
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
            line: "Big moment there — booth's lost for words, but the match rolls on!",
          },
        ];
      }
    },
    []
  );

  const fetchTts = useCallback(
    async (speaker: Speaker, text: string): Promise<string | undefined> => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speaker, text }),
        });
        if (!res.ok) throw new Error("tts request failed");
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch (err) {
        console.error("TTS fetch failed, falling back to text-only:", err);
        return undefined;
      }
    },
    []
  );

  const playExchange = useCallback(
    async (lines: BanterLine[], minute: number, isCancelled: () => boolean) => {
      const queue = audioQueueRef.current;
      if (!queue) return;

      for (const line of lines) {
        if (isCancelled()) return;

        const audioUrl = await fetchTts(line.speaker, line.line);
        if (isCancelled()) return;

        const entry: TranscriptEntry = {
          id: nextId(),
          minute,
          speaker: line.speaker,
          line: line.line,
          audioUrl,
        };
        setTranscript((prev) => [...prev, entry]);
        historyRef.current.lines.push({
          speaker: line.speaker,
          line: line.line,
        });

        await new Promise<void>((resolve) => {
          queue.enqueue({
            audioUrl,
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
    [fetchTts]
  );

  const runReplay = useCallback(
    async (myRunId: number) => {
      const isCancelled = () => runIdRef.current !== myRunId;

      const events = typedMatchData.events;
      let prevMinute = 0;

      for (let i = 0; i < events.length; i += 1) {
        if (isCancelled()) return;

        const event = events[i];
        const deltaMinutes = Math.max(event.minute - prevMinute, 0);
        prevMinute = event.minute;

        const delayMs =
          (deltaMinutes * SECONDS_PER_MATCH_MINUTE_AT_1X * 1000) /
          speedRef.current;

        await sleepInterruptible(delayMs, isCancelled, () => pausedRef.current);

        if (isCancelled()) return;

        setCurrentMinute(event.minute);
        setCurrentEvent(event);

        if (event.type === "goal" && event.team) {
          const team = event.team;
          setScore((prev) => ({ ...prev, [team]: prev[team] + 1 }));
        }

        const lines = await fetchBanter(event);
        if (isCancelled()) return;

        await playExchange(lines, event.minute, isCancelled);
        if (isCancelled()) return;

        historyRef.current.events.push(event);
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
    setCurrentMinute(0);
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
