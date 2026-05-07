export interface Celebrity {
  id: number;
  name: string;
  popularity: number;
  isAlive: boolean;
  birthYear: number;
  deathDate: string | null;
  deathAge: number | null;
  profilePath: string | null;
  knownFor: string[];
}

export interface DailyData {
  generatedAt: string;
  celebrities: Celebrity[];
}

export type HintType = 'photo' | 'birthYear' | 'knownFor0' | 'knownFor1' | 'knownFor2';

export interface RowState {
  answered: boolean;
  correct: boolean | null;
  hintsUsed: HintType[];
}

export interface GameState {
  rows: RowState[];
  allAnswered: boolean;
}

export interface GameResult {
  rows: RowState[];
  celebrities: Celebrity[];
  totalScore: number;
  date: string;
}
