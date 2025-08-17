import Phaser from 'phaser';
import { CONFIG, WILD_TYPE } from './config';
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

export function tweenTo(scene: Phaser.Scene, sprite: Phaser.Physics.Matter.Image, x: number, y: number): Promise<void> {
  return new Promise(res => {
    // Update target position for physics attraction
    sprite.setData('targetX', x);
    sprite.setData('targetY', y);
    
    // Apply stronger initial force towards target
    const dx = x - sprite.x;
    const dy = y - sprite.y;
    const force = 0.003;
    sprite.applyForce({ x: dx * force, y: dy * force });
    
    // Complete after a delay to allow physics movement
    scene.time.delayedCall(600, res);
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

export interface SpecialMatch {
  type: 'four_row' | 'square' | 'five_row' | 'l_shape' | 't_shape';
  positions: {r: number, c: number}[];
  targetPos: {r: number, c: number};
  gemType: number;
}

export function findSpecialCombinations(board: Tile[][]): SpecialMatch[] {
  const specials: SpecialMatch[] = [];
  const rows = CONFIG.ROWS;
  const cols = CONFIG.COLS;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = board[r][c];
      if (!tile || tile.type === null || tile.type === WILD_TYPE) continue;
      
      const type = tile.type;
      
      // Check for 4 in a row (horizontal)
      if (c <= cols - 4) {
        let count = 0;
        for (let i = 0; i < 4; i++) {
          if (board[r][c + i]?.type === type) count++;
        }
        if (count === 4) {
          specials.push({
            type: 'four_row',
            positions: Array.from({length: 4}, (_, i) => ({r, c: c + i})),
            targetPos: {r, c: c + 1},
            gemType: type
          });
        }
      }
      
      // Check for 4 in a row (vertical)
      if (r <= rows - 4) {
        let count = 0;
        for (let i = 0; i < 4; i++) {
          if (board[r + i][c]?.type === type) count++;
        }
        if (count === 4) {
          specials.push({
            type: 'four_row',
            positions: Array.from({length: 4}, (_, i) => ({r: r + i, c})),
            targetPos: {r: r + 1, c},
            gemType: type
          });
        }
      }
      
      // Check for 2x2 square
      if (r <= rows - 2 && c <= cols - 2) {
        if (board[r][c]?.type === type &&
            board[r][c + 1]?.type === type &&
            board[r + 1][c]?.type === type &&
            board[r + 1][c + 1]?.type === type) {
          specials.push({
            type: 'square',
            positions: [{r, c}, {r, c: c + 1}, {r: r + 1, c}, {r: r + 1, c: c + 1}],
            targetPos: {r, c},
            gemType: type
          });
        }
      }
      
      // Check for 5 in a row (horizontal)
      if (c <= cols - 5) {
        let count = 0;
        for (let i = 0; i < 5; i++) {
          if (board[r][c + i]?.type === type) count++;
        }
        if (count === 5) {
          specials.push({
            type: 'five_row',
            positions: Array.from({length: 5}, (_, i) => ({r, c: c + i})),
            targetPos: {r, c: c + 2},
            gemType: type
          });
        }
      }
      
      // Check for 5 in a row (vertical)
      if (r <= rows - 5) {
        let count = 0;
        for (let i = 0; i < 5; i++) {
          if (board[r + i][c]?.type === type) count++;
        }
        if (count === 5) {
          specials.push({
            type: 'five_row',
            positions: Array.from({length: 5}, (_, i) => ({r: r + i, c})),
            targetPos: {r: r + 2, c},
            gemType: type
          });
        }
      }
      
      // Check for L-shaped 5 (4 patterns)
      if (r <= rows - 3 && c <= cols - 3) {
        // L shape: top-left corner
        if (board[r][c]?.type === type &&
            board[r][c + 1]?.type === type &&
            board[r][c + 2]?.type === type &&
            board[r + 1][c]?.type === type &&
            board[r + 2][c]?.type === type) {
          specials.push({
            type: 'l_shape',
            positions: [{r, c}, {r, c: c + 1}, {r, c: c + 2}, {r: r + 1, c}, {r: r + 2, c}],
            targetPos: {r, c},
            gemType: type
          });
        }
        
        // L shape: top-right corner
        if (board[r][c]?.type === type &&
            board[r][c + 1]?.type === type &&
            board[r][c + 2]?.type === type &&
            board[r + 1][c + 2]?.type === type &&
            board[r + 2][c + 2]?.type === type) {
          specials.push({
            type: 'l_shape',
            positions: [{r, c}, {r, c: c + 1}, {r, c: c + 2}, {r: r + 1, c: c + 2}, {r: r + 2, c: c + 2}],
            targetPos: {r, c: c + 2},
            gemType: type
          });
        }
        
        // L shape: bottom-left corner
        if (board[r][c]?.type === type &&
            board[r + 1][c]?.type === type &&
            board[r + 2][c]?.type === type &&
            board[r + 2][c + 1]?.type === type &&
            board[r + 2][c + 2]?.type === type) {
          specials.push({
            type: 'l_shape',
            positions: [{r, c}, {r: r + 1, c}, {r: r + 2, c}, {r: r + 2, c: c + 1}, {r: r + 2, c: c + 2}],
            targetPos: {r: r + 2, c},
            gemType: type
          });
        }
        
        // L shape: bottom-right corner
        if (board[r][c + 2]?.type === type &&
            board[r + 1][c + 2]?.type === type &&
            board[r + 2][c + 2]?.type === type &&
            board[r + 2][c + 1]?.type === type &&
            board[r + 2][c]?.type === type) {
          specials.push({
            type: 'l_shape',
            positions: [{r, c: c + 2}, {r: r + 1, c: c + 2}, {r: r + 2, c: c + 2}, {r: r + 2, c: c + 1}, {r: r + 2, c}],
            targetPos: {r: r + 2, c: c + 2},
            gemType: type
          });
        }
      }
      
      // Check for T-shaped 5 (4 orientations)
      if (r >= 1 && r <= rows - 2 && c <= cols - 3) {
        // T shape: horizontal base, vertical top
        if (board[r][c]?.type === type &&
            board[r][c + 1]?.type === type &&
            board[r][c + 2]?.type === type &&
            board[r - 1][c + 1]?.type === type &&
            board[r + 1][c + 1]?.type === type) {
          specials.push({
            type: 't_shape',
            positions: [{r, c}, {r, c: c + 1}, {r, c: c + 2}, {r: r - 1, c: c + 1}, {r: r + 1, c: c + 1}],
            targetPos: {r, c: c + 1},
            gemType: type
          });
        }
      }
      
      if (r <= rows - 3 && c >= 1 && c <= cols - 2) {
        // T shape: vertical base, horizontal right
        if (board[r][c]?.type === type &&
            board[r + 1][c]?.type === type &&
            board[r + 2][c]?.type === type &&
            board[r + 1][c - 1]?.type === type &&
            board[r + 1][c + 1]?.type === type) {
          specials.push({
            type: 't_shape',
            positions: [{r, c}, {r: r + 1, c}, {r: r + 2, c}, {r: r + 1, c: c - 1}, {r: r + 1, c: c + 1}],
            targetPos: {r: r + 1, c},
            gemType: type
          });
        }
      }
    }
  }
  
  return specials;
}
