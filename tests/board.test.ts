import { describe, it, expect } from '@jest/globals';
import { findMatches, toBoard, wouldSwapCreateMatch } from '../src/boardLogic';
import { state } from '../src/state';
import { createsMatchAt } from '../src/boardLogic';
import Phaser from 'phaser';

// Mock scene for initBoard
const mockScene = {
    add: {
        image: () => ({
            setOrigin: () => ({
                setScale: () => ({
                    setInteractive: () => ({
                        setData: () => ({
                            setDepth: () => ({
                                angle: 0
                            })
                        })
                    })
                })
            })
        }),
        tween: () => {}
    },
    tweens: {
        add: () => {}
    }
}

function initBoard(scene: any) {
    state.board = [];
    for (let r = 0; r < 8; r++) {
      state.board[r] = [];
      for (let c = 0; c < 8; c++) {
        let type;
        do {
          type = Phaser.Math.Between(0, 5);
        } while (createsMatchAt(state.board, r, c, type));
        const sprite = {};
        state.board[r][c] = { type, sprite: sprite as any };
      }
    }
  }

describe('Match-3 Logic', () => {
  it('should detect horizontal matches', () => {
    const b1 = toBoard([
      [0, 0, 0, 1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5, 0, 1, 2],
      [2, 3, 4, 5, 0, 1, 2, 3],
      [3, 4, 5, 0, 1, 2, 3, 4],
      [4, 5, 0, 1, 2, 3, 4, 5],
      [5, 0, 1, 2, 3, 4, 5, 0],
      [0, 1, 2, 3, 4, 5, 0, 1],
      [1, 2, 3, 4, 5, 0, 1, 2],
    ]);
    const m1 = findMatches(b1);
    expect(m1.some(m => m.dir === 'h' && m.len >= 3)).toBe(true);
  });

  it('should detect vertical matches', () => {
    const b2 = toBoard([
      [0, 1, 2, 3, 4, 5, 0, 1],
      [0, 2, 3, 4, 5, 0, 1, 2],
      [0, 3, 4, 5, 0, 1, 2, 3],
      [0, 4, 5, 0, 1, 2, 3, 4],
      [4, 5, 0, 1, 2, 3, 4, 5],
      [5, 0, 1, 2, 3, 4, 5, 0],
      [0, 1, 2, 3, 4, 5, 0, 1],
      [1, 2, 3, 4, 5, 0, 1, 2],
    ]);
    const m2 = findMatches(b2);
    expect(m2.some(m => m.dir === 'v' && m.len >= 3)).toBe(true);
  });

  it('should determine if a swap would create a match', () => {
    const b3 = toBoard([
      [0, 1, 2, 3, 4, 5, 0, 1],
      [1, 1, 2, 3, 4, 5, 0, 1],
      [1, 2, 2, 3, 4, 5, 0, 1],
      [3, 4, 5, 0, 1, 2, 3, 4],
      [4, 5, 0, 1, 2, 3, 4, 5],
      [5, 0, 1, 2, 3, 4, 5, 0],
      [0, 1, 2, 3, 4, 5, 0, 1],
      [1, 2, 3, 4, 5, 0, 1, 2],
    ]);
    expect(wouldSwapCreateMatch(b3, { r: 1, c: 0 }, { r: 0, c: 0 }, 8, 8)).toBe(true);
  });

  it('should create an initial board with no matches', () => {
    initBoard(mockScene);
    const initialMatches = findMatches(state.board);
    expect(initialMatches.length).toBe(0);
  });
});
