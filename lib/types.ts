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
  minute: number;
  audioUrl?: string;
}

export interface BanterRequestBody {
  event: MatchEvent;
  history: {
    events: MatchEvent[];
    lines: BanterLine[];
  };
}

export interface TtsRequestBody {
  speaker: Speaker;
  text: string;
}
