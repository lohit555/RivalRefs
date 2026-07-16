"use client";

import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "@/lib/types";

interface TranscriptProps {
  entries: TranscriptEntry[];
}

export default function Transcript({ entries }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white/40 sm:px-6">
        Live Transcript
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 sm:px-6">
        {entries.length === 0 ? (
          <p className="text-sm italic text-white/30">
            Commentary will appear here once the match kicks off…
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-baseline gap-2 text-sm sm:text-base">
              <span className="shrink-0 font-mono text-xs text-white/30">
                {entry.minute}&apos;
              </span>
              <span
                className={`shrink-0 text-xs font-bold uppercase tracking-wide ${
                  entry.speaker === "RED" ? "text-red-glow" : "text-blue-glow"
                }`}
              >
                {entry.speaker}
              </span>
              <span className="text-white/80">{entry.line}</span>
              {!entry.audioUrl && (
                <span className="shrink-0 text-[10px] italic text-white/25">
                  (text only)
                </span>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
