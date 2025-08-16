import { BOARD_X, BOARD_Y, CONFIG } from './config';

export function inBounds(c: number, r: number): boolean {
  return c >= 0 && c < CONFIG.COLS && r >= 0 && r < CONFIG.ROWS;
}

export function cellToXY(c: number, r: number): { x: number; y: number } {
  return {
    x: BOARD_X + c * CONFIG.TILE + CONFIG.TILE / 2,
    y: BOARD_Y + r * CONFIG.TILE + CONFIG.TILE / 2
  };
}

export function xyToCell(x: number, y: number): { c: number; r: number } {
  return {
    c: Math.floor((x - BOARD_X) / CONFIG.TILE),
    r: Math.floor((y - BOARD_Y) / CONFIG.TILE)
  };
}

export function key(r: number, c: number): string {
  return r + ':' + c;
}

export function parseKey(k: string): { r: number, c: number } {
  const [r, c] = k.split(':').map(Number);
  return { r, c };
}
