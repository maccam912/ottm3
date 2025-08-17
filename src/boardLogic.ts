import Phaser from 'phaser';
import { CONFIG } from './config';
import { Match, Tile } from './state';

export function createsMatchAt(board: Tile[][], r: number, c: number, type: number): boolean {
  // Horizontal check: [X, X, new]
  if (c >= 2 && board[r]?.[c - 1]?.type === type && board[r]?.[c - 2]?.type === type) {
    return true;
  }
  // Horizontal check: [X, new, X]
  if (c >= 1 && c < CONFIG.COLS - 1 && board[r]?.[c - 1]?.type === type && board[r]?.[c + 1]?.type === type) {
    return true;
  }

  // Vertical check: [X, X, new] (stacked)
  if (r >= 2 && board[r - 1]?.[c]?.type === type && board[r - 2]?.[c]?.type === type) {
    return true;
  }
  // Vertical check: [X, new, X] (stacked)
  if (r >= 1 && r < CONFIG.ROWS - 1 && board[r - 1]?.[c]?.type === type && board[r + 1]?.[c]?.type === type) {
    return true;
  }

  return false;
}

export function findMatches(board: Tile[][], rows: number = CONFIG.ROWS, cols: number = CONFIG.COLS): Match[] {
  const matches: Match[] = [];
  // Horizontal
  for (let r = 0; r < rows; r++) {
    let run = 1;
    for (let c = 1; c <= cols; c++) {
      const same = c < cols && board[r][c] && board[r][c - 1] && board[r][c].type !== null && board[r][c].type === board[r][c - 1].type;
      if (same) run++; else {
        if (run >= 3) matches.push({ dir: 'h', r, c: c - run, len: run });
        run = 1;
      }
    }
  }
  // Vertical
  for (let c = 0; c < cols; c++) {
    let run = 1;
    for (let r = 1; r <= rows; r++) {
      const same = r < rows && board[r][c] && board[r - 1][c] && board[r][c].type !== null && board[r][c].type === board[r - 1][c].type;
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

  const had = findMatches(clone, rows, cols).length > 0;

  return had;
}
