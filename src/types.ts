export interface GameSettings {
  cashBuilderTimeSeconds: number;
  chaseTimePerQuestionSeconds: number;
  partyMode: boolean;
  chaserAccuracyPercentage: number;
}

export interface CashBuilderQuestion {
  question: string;
  answer: string;
}

export interface ChaseQuestion {
  question: string;
  options: string[];
  correct: string;
}

export interface GameConfig {
  settings: GameSettings;
  cashBuilder: CashBuilderQuestion[];
  theChase: ChaseQuestion[];
}

export type GamePhase = 'MENU' | 'CASH_BUILDER' | 'CHASE_SETUP' | 'THE_CHASE' | 'END_WIN' | 'END_LOSE';

export interface GameState {
  phase: GamePhase;
  bank: number;
  config: GameConfig | null;
  playerPos: number; // For the chase (distance to home)
  chaserPos: number; // Distance to home (0 is caught)
}
