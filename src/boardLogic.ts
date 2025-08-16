import Phaser from 'phaser';
import { CONFIG } from './config';
import { Match, Tile } from './state';

export function createsMatchAt(board: Tile[][], r: number, c: number, type: number): boolean {
  // Horizontal check
  if (c >= 2 && board[r][c - 1] && board[r][c - 2] && board[r][c - 1].type === type && board[r][c - 2].type === type) return true;
  // Vertical check
  if (r >= 2 && board[r - 1][c] && board[r - 2][c] && board[r - 1][c].type === type && board[r - 2][c].type === type) return true;
  return false;
}

export function findMatches(board: Tile[][]): Match[] {
  const matches: Match[] = [];
  // Horizontal
  for (let r = 0; r < CONFIG.ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= CONFIG.COLS; c++) {
      const same = c < CONFIG.COLS && board[r][c] && board[r][c - 1] && board[r][c].type === board[r][c - 1].type;
      if (same) run++; else {
        if (run >= 3) matches.push({ dir: 'h', r, c: c - run, len: run });
        run = 1;
      }
    }
  }
  // Vertical
  for (let c = 0; c < CONFIG.COLS; c++) {
    let run = 1;
    for (let r = 1; r <= CONFIG.ROWS; r++) {
      const same = r < CONFIG.ROWS && board[r][c] && board[r - 1][c] && board[r][c].type === board[r - 1][c].type;
      if (same) run++; else {
        if (run >= 3) matches.push({ dir: 'v', c, r: r - run, len: run });
        run = 1;
      }
    }
  }
  return matches;
}

export function swapCells(board: Tile[][], a: {r: number, c: number}, b: {r: number, c: number}) {
  const aTile = board[a.r][a.c];
  const bTile = board[b.r][b.c];
  // Swap data
  board[a.r][a.c] = bTile;
  board[b.r][b.c] = aTile;
  // Update sprite data
  if (bTile.sprite) bTile.sprite.setData('c', a.c).setData('r', a.r);
  if (aTile.sprite) aTile.sprite.setData('c', b.c).setData('r', b.r);
}

export function tweenTo(scene: Phaser.Scene, sprite: Phaser.GameObjects.Image, x: number, y: number): Promise<void> {
  return new Promise(res => {
    scene.tweens.add({ targets: sprite, x, y, duration: 160, ease: 'Quad.out', onComplete: res });
  });
}

export function toBoard(types2D: (number | null)[][]): Tile[][] {
  return types2D.map(row => row.map(t => ({ type: t, sprite: {} as Phaser.GameObjects.Image })));
}

export function wouldSwapCreateMatch(board: Tile[][], a: {r: number, c: number}, b: {r: number, c: number}, rows: number = CONFIG.ROWS, cols: number = CONFIG.COLS): boolean {
  // shallow clone indices only
  const clone: Tile[][] = board.map(row => row.map(tile => ({...tile})));
  const tmp = clone[a.r][a.c];
  clone[a.r][a.c] = clone[b.r][b.c];
  clone[b.r][b.c] = tmp;

  const originalRows = CONFIG.ROWS;
  const originalCols = CONFIG.COLS;

  Object.assign(CONFIG, { ROWS: rows, COLS: cols });

  const had = findMatches(clone).length > 0;

  Object.assign(CONFIG, { ROWS: originalRows, COLS: originalCols });

  return had;
}
