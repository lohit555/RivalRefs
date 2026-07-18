export type Speaker = "RED" | "BLUE";

export type EventType =
  | "goal"
  | "chance"
  | "card"
  | "sub"
  | "kickoff"
  | "fulltime"
  | "penalty";

export interface MatchEvent {
  id?: number;
  minute: number;
  type: EventType;
  team: Speaker | null;
  player: string;
  detail: string;
}

export interface TeamInfo {
  supports: string;
  shortName: string;
}

export interface TeamMeta {
  RED: TeamInfo;
  BLUE: TeamInfo;
  finalScore: string;
  competition: string;
  venue: string;
}

export interface MatchData {
  teamMeta: TeamMeta;
  events: MatchEvent[];
}

export interface BanterLine {
  speaker: Speaker;
  line: string;
}

export interface TranscriptEntry extends BanterLine {
  id: string;
  // A display label like "45" or "45+6" (stoppage time), not a raw number —
  // see hooks/useMatchReplay.ts for why.
  minute: string;
  voiced: boolean;
}

export interface BanterRequestBody {
  event: MatchEvent;
  history: {
    events: MatchEvent[];
    lines: BanterLine[];
  };
  matchMeta?: {
    redTeam: string;
    blueTeam: string;
    finalScore: string;
    isFirstEvent: boolean;
    isFinalEvent: boolean;
  };
}
