import Phaser from 'phaser';

export interface Tile {
  type: number | null;
  sprite: Phaser.GameObjects.Image | null;
}

export interface Match {
  dir: 'h' | 'v';
  r: number;
  c: number;
  len: number;
}

export interface GameState {
  board: Tile[][];
  selected: Tile | null;
  inputLocked: boolean;
  score: number;
  combo: number;
  shardsCount: number;
  testResults: [string, boolean][];
  scoreText?: Phaser.GameObjects.Text;
  particles?: Phaser.GameObjects.Particles.ParticleEmitterManager;
}

export const state: GameState = {
  board: [], // {type, sprite}
  selected: null,
  inputLocked: false,
  score: 0,
  combo: 0,
  shardsCount: 0,
  testResults: []
};
