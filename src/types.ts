export interface AppSettings {
  defaultCashBuilderMaxQuestions: number;
  defaultCashBuilderTimeSeconds: number;
  defaultChaseTimePerQuestionSeconds: number;
  defaultPartyMode: boolean;
  defaultChaserAccuracyPercentage: number;
  defaultCashPerCorrectAnswer: number;
  defaultChaserRoundLength: number;
  defaultLastChanceLowerPct: number;
  defaultLastChanceUpperPct: number;
  defaultHighOfferMultiplier: number;
  defaultLowOfferMultiplier: number;
}

export interface GameSettings {
  cashBuilderMaxQuestions?: number;
  cashBuilderTimeSeconds: number;
  chaseTimePerQuestionSeconds: number;
  partyMode: boolean;
  chaserAccuracyPercentage: number;
  cashPerCorrectAnswer?: number;
  chaserRoundLength?: number;
  lastChanceLowerPct?: number;
  lastChanceUpperPct?: number;
  highOfferMultiplier?: number;
  lowOfferMultiplier?: number;
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

export type GamePhase = 'MENU' | 'CASH_BUILDER' | 'CHASE_SETUP' | 'THE_CHASE' | 'END_WIN' | 'END_LOSE' | 'LAST_CHANCE';

export interface GameState {
  phase: GamePhase;
  bank: number;
  config: GameConfig | null;
  playerPos: number; // For the chase (distance to home)
  chaserPos: number; // Distance to home (0 is caught)
  activeAccuracy?: number;
}
