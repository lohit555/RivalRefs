"use client";

import { useMemo } from "react";
import { useMatchReplay } from "@/hooks/useMatchReplay";
import Scoreboard from "@/components/Scoreboard";
import Commentator from "@/components/Commentator";
import Transcript from "@/components/Transcript";
import Controls from "@/components/Controls";

export default function Home() {
  const {
    status,
    speed,
    currentMinute,
    score,
    activeSpeaker,
    transcript,
    teamMeta,
    start,
    pause,
    restart,
    setSpeed,
  } = useMatchReplay();

  const latestRedLine = useMemo(
    () => [...transcript].reverse().find((e) => e.speaker === "RED")?.line,
    [transcript]
  );
  const latestBlueLine = useMemo(
    () => [...transcript].reverse().find((e) => e.speaker === "BLUE")?.line,
    [transcript]
  );

  return (
    <main className="flex h-screen flex-col bg-[#050507]">
      <Scoreboard
        teamMeta={teamMeta}
        score={score}
        currentMinute={currentMinute}
        status={status}
      />

      <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
        <Commentator
          side="RED"
          teamName={teamMeta.RED.supports}
          active={activeSpeaker === "RED"}
          latestLine={latestRedLine}
        />
        <div className="hidden w-px bg-white/10 sm:block" />
        <Commentator
          side="BLUE"
          teamName={teamMeta.BLUE.supports}
          active={activeSpeaker === "BLUE"}
          latestLine={latestBlueLine}
        />
      </div>

      <div className="h-56 border-t border-white/10 sm:h-64">
        <Transcript entries={transcript} />
      </div>

      <Controls
        status={status}
        speed={speed}
        onStart={start}
        onPause={pause}
        onRestart={restart}
        onSpeedChange={setSpeed}
      />
    </main>
  );
}
