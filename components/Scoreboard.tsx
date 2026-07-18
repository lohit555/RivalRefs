"use client";

import type { TeamMeta } from "@/lib/types";
import type { ReplayStatus } from "@/hooks/useMatchReplay";

interface ScoreboardProps {
  teamMeta: TeamMeta;
  score: { RED: number; BLUE: number };
  currentMinute: string;
  status: ReplayStatus;
}

export default function Scoreboard({
  teamMeta,
  score,
  currentMinute,
  status,
}: ScoreboardProps) {
  return (
    <div className="flex w-full items-center justify-between border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur sm:px-8">
      <div className="flex items-center gap-3 sm:gap-6">
        <TeamPill label={teamMeta.RED.shortName} color="text-red-glow" />
        <div className="flex items-baseline gap-2 rounded-md bg-white/5 px-3 py-1.5 font-mono text-xl font-bold text-white sm:text-2xl">
          <span>{score.RED}</span>
          <span className="text-white/30">–</span>
          <span>{score.BLUE}</span>
        </div>
        <TeamPill label={teamMeta.BLUE.shortName} color="text-blue-glow" />
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <div className="hidden text-xs text-white/40 sm:block">
          {teamMeta.competition} · {teamMeta.venue}
        </div>
        <div className="font-mono text-sm font-semibold text-white sm:text-base">
          {currentMinute}&apos;
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function TeamPill({ label, color }: { label: string; color: string }) {
  return (
    <span className={`text-sm font-bold uppercase tracking-wide sm:text-base ${color}`}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: ReplayStatus }) {
  const isLive = status === "playing";
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest sm:text-xs ${
        isLive
          ? "bg-red-glow/20 text-red-glow"
          : "bg-white/10 text-white/50"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isLive ? "animate-pulse bg-red-glow" : "bg-white/40"
        }`}
      />
      Replay
    </span>
  );
}
