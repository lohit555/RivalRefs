"use client";

import type { ReplaySpeed, ReplayStatus } from "@/hooks/useMatchReplay";

interface ControlsProps {
  status: ReplayStatus;
  speed: ReplaySpeed;
  onStart: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
}

const SPEEDS: ReplaySpeed[] = [1, 10, 30];

export default function Controls({
  status,
  speed,
  onStart,
  onPause,
  onRestart,
  onSpeedChange,
}: ControlsProps) {
  const isPlaying = status === "playing";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/60 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={isPlaying ? onPause : onStart}
          className="rounded-md bg-white px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-black transition hover:bg-white/80"
        >
          {isPlaying ? "Pause" : status === "paused" ? "Resume" : "Start"}
        </button>
        <button
          onClick={onRestart}
          className="rounded-md border border-white/20 px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-white/70 transition hover:border-white/40 hover:text-white"
        >
          Restart
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-white/40">
          Speed
        </span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`rounded-md px-3 py-1 text-xs font-bold transition ${
              speed === s
                ? "bg-red-glow text-white"
                : "bg-white/5 text-white/50 hover:bg-white/10"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
