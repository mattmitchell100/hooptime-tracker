
export interface Player {
  id: string;
  name: string;
  number: string;
}

export type PeriodType = 'Quarters' | 'Halves';

export interface GameConfig {
  periodCount: number;
  periodMinutes: number;
  periodSeconds: number;
  periodType: PeriodType;
  opponentName: string;
}

export interface PlayerStats {
  playerId: string;
  periodMinutes: { [period: number]: number }; // seconds per period
  totalMinutes: number; // total seconds
}

export interface GameState {
  currentPeriod: number;
  remainingSeconds: number; // For the current period
  isRunning: boolean;
  onCourtIds: string[];
  lastClockUpdate: number | null; // Timestamp
}

export type GameHistoryOutcome = 'COMPLETE' | 'RESET';

export interface GameHistoryEntry {
  id: string;
  completedAt: string; // ISO timestamp
  outcome: GameHistoryOutcome;
  configSnapshot: GameConfig;
  rosterSnapshot: Player[];
  statsSnapshot: PlayerStats[];
  aiAnalysis: string | null;
  durationSeconds: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  periodCount: 4,
  periodMinutes: 7,
  periodSeconds: 30,
  periodType: 'Quarters',
  opponentName: ''
};
