"use client";

interface CommentatorProps {
  side: "RED" | "BLUE";
  teamName: string;
  active: boolean;
  latestLine?: string;
}

const SIDE_STYLES = {
  RED: {
    ring: "ring-red-glow",
    text: "text-red-glow",
    glow: "shadow-[0_0_40px_10px_rgba(255,59,78,0.55)]",
    gradient: "from-red-glow/20 via-transparent to-transparent",
    avatarBg: "bg-gradient-to-br from-red-glow to-rose-900",
  },
  BLUE: {
    ring: "ring-blue-glow",
    text: "text-blue-glow",
    glow: "shadow-[0_0_40px_10px_rgba(43,141,255,0.55)]",
    gradient: "from-blue-glow/20 via-transparent to-transparent",
    avatarBg: "bg-gradient-to-br from-blue-glow to-indigo-900",
  },
} as const;

export default function Commentator({
  side,
  teamName,
  active,
  latestLine,
}: CommentatorProps) {
  const styles = SIDE_STYLES[side];

  return (
    <div
      className={`relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-gradient-to-b ${styles.gradient} px-6 py-10 transition-all duration-300`}
    >
      <div
        className={`relative flex h-28 w-28 items-center justify-center rounded-full ${styles.avatarBg} ring-4 ${styles.ring} transition-shadow duration-300 sm:h-36 sm:w-36 ${
          active ? styles.glow : ""
        }`}
      >
        <span className="text-3xl font-black tracking-tight text-white/90 sm:text-4xl">
          {side === "RED" ? "R" : "B"}
        </span>
        {active && (
          <span
            className={`absolute -inset-2 rounded-full border-2 ${
              side === "RED" ? "border-red-glow" : "border-blue-glow"
            } animate-ping opacity-60`}
          />
        )}
      </div>

      <div className="text-center">
        <div className={`text-xs font-bold uppercase tracking-[0.3em] ${styles.text}`}>
          {side} Commentator
        </div>
        <div className="mt-1 text-sm text-white/60">supports {teamName}</div>
      </div>

      <div className="mt-2 min-h-[4.5rem] max-w-xs text-center">
        {latestLine ? (
          <p
            className={`text-base font-medium leading-snug text-white/90 transition-opacity duration-300 sm:text-lg ${
              active ? "opacity-100" : "opacity-60"
            }`}
          >
            &ldquo;{latestLine}&rdquo;
          </p>
        ) : (
          <p className="text-sm italic text-white/30">Waiting for kickoff…</p>
        )}
      </div>

      <div
        className={`text-xs font-semibold uppercase tracking-widest transition-colors ${
          active ? styles.text : "text-white/20"
        }`}
      >
        {active ? "● Speaking" : "Standing by"}
      </div>
    </div>
  );
}
