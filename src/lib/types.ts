export type CellType = 'empty' | 'core' | 'pylon';

export interface Cell {
  x: number;
  y: number;
  owner: 0 | 1 | 2; // 0 = neutral, 1 = Player 1 (Cyan), 2 = Player 2 (Crimson)
  type: CellType;
  hp: number;
  maxHp: number;
  shield: number; // 0..4
}

export interface Player {
  index: 1 | 2;
  name: string;
  energy: number;
  coreHp: number;
  tilesOwned: number;
  isBot: boolean;
}

export type ActionType = 'expand' | 'fortify' | 'overcharge' | 'emp' | 'pass';

export interface Move {
  action: ActionType;
  x?: number;
  y?: number;
  cost: number;
  description: string;
}

export interface MoveInput {
  player: 1 | 2;
  action: ActionType;
  x?: number;
  y?: number;
}

export interface HistoryEntry {
  turn: number;
  player: 1 | 2;
  action: ActionType;
  text: string;
  timestamp: string;
  target?: { x: number; y: number };
}

export interface MatchState {
  id: string;
  status: 'waiting' | 'active' | 'finished';
  mode: 'bot' | 'pvp';
  turn: number; // 1..30
  activePlayer: 1 | 2;
  winner: 1 | 2 | 'draw' | null;
  winReason: string | null;
  players: [Player, Player];
  grid: Cell[][];
  validMoves: Move[];
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}
