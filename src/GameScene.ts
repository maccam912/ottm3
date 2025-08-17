import Phaser from 'phaser';
import { CONFIG, COLORS, W, H, BOARD_W, BOARD_H, BOARD_X, BOARD_Y } from './config';
import { state } from './state';
import { inBounds, xyToCell, cellToXY, key, parseKey } from './utils';
import { createsMatchAt, findMatches, swapCells, tweenTo } from './boardLogic';
import { Match, Tile } from './state';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    // Nothing external to load. All textures are generated at runtime.
  }

  create() {
    // World bounds for shards
    this.matter.world.setBounds(0, 0, W, H, 32, true, true, true, true);

    // Vignette
    addVignette(this);

    // Title
    this.add.text(W / 2, 46, 'OVER THE TOP MATCH 3', {
      fontFamily: 'Orbitron, Arial Black, Arial',
      fontSize: '32px',
      fontStyle: '900',
      color: '#ffffff',
      stroke: '#8b5cf6',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#22d3ee', blur: 18, fill: true }
    }).setOrigin(0.5).setDepth(1000);

    // Score UI
    state.scoreText = this.add.text(W / 2, 86, 'Score 0', {
      fontFamily: 'Orbitron, Arial Black, Arial',
      fontSize: '22px',
      color: '#e2e8f0'
    }).setOrigin(0.5);

    // Board frame
    this.add.rectangle(BOARD_X + BOARD_W / 2, BOARD_Y + BOARD_H / 2, BOARD_W + 14, BOARD_H + 14, 0x0b1025)
      .setStrokeStyle(4, 0x22d3ee, 0.9).setDepth(-5);

    // Generate textures
    buildTileTextures(this);
    buildParticleTextures(this);
    ensureTexture(this, 'spark');
    ensureTexture(this, 'shard');

    // Particle manager
    state.particles = this.add.particles(0, 0, 'spark', {
        speed: { min: 80, max: 350 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 250, max: 600 },
        quantity: 14,
        angle: { min: 0, max: 360 },
        blendMode: 'ADD',
    });
    state.particles.stop();


    // Initialize board
    initBoard(this);

    // Input
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => onPointerDown(this, pointer));

    // New Game button
    const btn = this.add.text(W - 120, 24, 'New Game', {
      fontFamily: 'Orbitron, Arial', fontSize: '18px', color: '#10b981'
    }).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => newGame(this));
  }

  update() {
    if (state.shardsCount > 450) {
      state.shardsCount = 0;
    }
  }
}

function addVignette(scene: Phaser.Scene) {
  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(0x000000, 0.25);
  g.fillCircle(W / 2, H * 0.55, Math.max(W, H) * 0.72);
  g.setDepth(2000);
}

function ensureTexture(scene: Phaser.Scene, key: string) {
  if (!scene.textures.exists(key)) {
    const c = scene.textures.createCanvas(key, 2, 2);
    if(c) {
        const ctx = c.getContext();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 2, 2);
        c.refresh();
    }
  }
}

function buildTileTextures(scene: Phaser.Scene) {
  for (let i = 0; i < CONFIG.TYPES; i++) {
    const key = 'gem-' + i;
    if (scene.textures.exists(key)) continue;
    const g = scene.add.graphics();
    const s = CONFIG.TILE * 0.78;
    const r = 16;
    g.fillStyle(COLORS[i], 0.25);
    g.fillCircle(s / 2, s / 2, s / 2);
    g.fillStyle(COLORS[i], 1);
    g.fillRoundedRect((s - (s * 0.86)) / 2, (s - (s * 0.86)) / 2, s * 0.86, s * 0.86, r);
    g.fillStyle(0xffffff, 0.25);
    g.fillEllipse(s * 0.45, s * 0.35, s * 0.55, s * 0.28);
    g.generateTexture(key, s, s);
    g.destroy();
  }
}

function buildParticleTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('spark')) {
    const g1 = scene.add.graphics();
    g1.fillStyle(0xffffff, 1);
    g1.fillCircle(8, 8, 8);
    g1.generateTexture('spark', 16, 16);
    g1.destroy();
  }
  if (!scene.textures.exists('shard')) {
    const g2 = scene.add.graphics();
    g2.fillStyle(0xffffff, 1);
    g2.fillRoundedRect(0, 0, 12, 6, 2);
    g2.generateTexture('shard', 12, 6);
    g2.destroy();
  }
}

function newGame(scene: Phaser.Scene) {
  for (let r = 0; r < CONFIG.ROWS; r++) {
    for (let c = 0; c < CONFIG.COLS; c++) {
      const t = state.board[r][c];
      if (t && t.sprite) t.sprite.destroy();
    }
  }
  state.board = [];
  state.score = 0;
  state.combo = 0;
  if(state.scoreText) state.scoreText.setText('Score 0');
  initBoard(scene);
}

function initBoard(scene: Phaser.Scene) {
  state.board = [];
  for (let r = 0; r < CONFIG.ROWS; r++) {
    state.board[r] = [];
    for (let c = 0; c < CONFIG.COLS; c++) {
      let type;
      do {
        type = Phaser.Math.Between(0, CONFIG.TYPES - 1);
      } while (createsMatchAt(state.board, r, c, type));
      const sprite = makeTileSprite(scene, c, r, type);
      state.board[r][c] = { type, sprite };
    }
  }
}

function makeTileSprite(scene: Phaser.Scene, c: number, r: number, type: number) {
  const key = 'gem-' + type;
  const { x, y } = cellToXY(c, r);
  const s = scene.add.image(x, y, key).setOrigin(0.5).setScale(1);
  s.setInteractive();
  s.setData('c', c);
  s.setData('r', r);
  s.setDepth(10);
  scene.tweens.add({ targets: s, angle: { from: -2, to: 2 }, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  return s;
}

function onPointerDown(scene: Phaser.Scene, pointer: Phaser.Input.Pointer) {
  if (state.inputLocked) return;
  const { c, r } = xyToCell(pointer.x, pointer.y);
  if (!inBounds(c, r)) return;
  const tile = state.board[r][c];
  if (!tile || !tile.sprite) return;
  if (!state.selected) {
    selectTile(scene, tile);
  } else {
    const sel = state.selected;
    if (sel === tile) {
      deselectTile(scene, sel);
      return;
    }
    const sc = sel.sprite?.getData('c');
    const sr = sel.sprite?.getData('r');
    if (Math.abs(sc - c) + Math.abs(sr - r) === 1) {
      swapAttempt(scene, { c: sc, r: sr }, { c, r });
    } else {
      deselectTile(scene, sel);
      selectTile(scene, tile);
    }
  }
}

function selectTile(scene: Phaser.Scene, tile: Tile) {
  state.selected = tile;
  if (!tile.sprite) return;
  scene.tweens.add({ targets: tile.sprite, scale: 1.12, duration: 80, yoyo: false });
  tile.sprite.setTint(0xffffff).setBlendMode(Phaser.BlendModes.SCREEN);
}

function deselectTile(scene: Phaser.Scene, tile: Tile) {
  if (!tile || !tile.sprite) return;
  scene.tweens.add({ targets: tile.sprite, scale: 1.0, duration: 80 });
  tile.sprite.clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
  state.selected = null;
}

function swapAttempt(scene: Phaser.Scene, a: {c: number, r: number}, b: {c: number, r: number}) {
  state.inputLocked = true;
  const aTile = state.board[a.r][a.c];
  const bTile = state.board[b.r][b.c];

  tweenSwap(scene, aTile.sprite!, bTile.sprite!, () => {
    swapCells(state.board, a, b);
    const matches = findMatches(state.board);
    if (matches.length > 0) {
      deselectTile(scene, aTile);
      state.selected = null;
      resolveMatches(scene, matches);
    } else {
      tweenSwap(scene, aTile.sprite!, bTile.sprite!, () => {
        swapCells(state.board, a, b); // revert
        state.inputLocked = false;
        deselectTile(scene, aTile);
      });
    }
  });
}

function tweenSwap(scene: Phaser.Scene, s1: Phaser.GameObjects.Image, s2: Phaser.GameObjects.Image, onComplete: () => void) {
  const p1 = { x: s1.x, y: s1.y };
  const p2 = { x: s2.x, y: s2.y };
  scene.tweens.addCounter({
    from: 0, to: 100, duration: 140, ease: 'Sine.inOut', onUpdate: t => {
      const k = t.progress;
      s1.x = Phaser.Math.Interpolation.Linear([p1.x, p2.x], k);
      s1.y = Phaser.Math.Interpolation.Linear([p1.y, p2.y], k);
      s2.x = Phaser.Math.Interpolation.Linear([p2.x, p1.x], k);
      s2.y = Phaser.Math.Interpolation.Linear([p2.y, p1.y], k);
    }, onComplete
  });
}

function resolveMatches(scene: Phaser.Scene, matches: Match[]) {
  state.combo++;
  const toClear = new Set<string>();
  for (const m of matches) {
    if (m.dir === 'h') {
      for (let i = 0; i < m.len; i++) toClear.add(key(m.r, m.c + i));
    } else {
      for (let i = 0; i < m.len; i++) toClear.add(key(m.r + i, m.c));
    }
  }

  const clearList = [...toClear].map(k => parseKey(k));
  const tilesCleared = clearList.length;

  const intensity = Math.min(0.005 + tilesCleared * 0.0015, 0.025);
  scene.cameras.main.flash(120, 255, 255, 255);
  scene.cameras.main.shake(160, intensity);

  clearList.forEach(({ r, c }) => explodeTile(scene, r, c));

  const add = Math.floor(tilesCleared * 10 * Math.max(1, state.combo * 0.6));
  state.score += add;
  if(state.scoreText) state.scoreText.setText(`Score ${state.score}`);

  scene.time.delayedCall(180, () => {
    dropTiles(scene, () => {
      const next = findMatches(state.board);
      if (next.length > 0) {
        resolveMatches(scene, next);
      } else {
        state.combo = 0;
        state.inputLocked = false;
      }
    });
  });
}

function explodeTile(scene: Phaser.Scene, r: number, c: number) {
  const t = state.board[r][c];
  if (!t || !t.sprite) return;
  const { x, y } = cellToXY(c, r);

  if(state.particles) {
    state.particles.setAngle({min: 0, max: 360});
    state.particles.setSpeed({min: 80, max: 350});
    state.particles.setLifespan({min: 250, max: 600});
    state.particles.setParticleTint(COLORS[t.type as number]);
    state.particles.emitParticleAt(x, y, 14);
  }

  spawnShards(scene, x, y, COLORS[t.type as number]);

  scene.tweens.add({ targets: t.sprite, scale: 1.4, alpha: 0, duration: 130, ease: 'Back.easeIn', onComplete: () => t.sprite?.destroy() });

  state.board[r][c] = { type: null, sprite: null };
}

function spawnShards(scene: Phaser.Scene, x: number, y: number, color: number) {
  for (let i = 0; i < CONFIG.SHARDS_PER_TILE; i++) {
    const shard = scene.matter.add.image(x, y, 'shard', undefined, { restitution: 0.9, frictionAir: 0.02, slop: 0.5 });
    shard.setTint(color);
    shard.setScale(Phaser.Math.FloatBetween(0.7, 1.3));
    shard.setBounce(0.9);
    shard.setFriction(0.005, 0.0001, 0.0001);
    const sp = Phaser.Math.Between(160, 520);
    const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
    shard.setVelocity(Math.cos(ang) * sp / 100, Math.sin(ang) * sp / 100 - 2);
    shard.setAngularVelocity(Phaser.Math.FloatBetween(-0.25, 0.25));
    shard.setIgnoreGravity(false);
    state.shardsCount++;
    scene.time.delayedCall(1500 + Math.random() * 800, () => shard.destroy());
  }
}

function dropTiles(scene: Phaser.Scene, onComplete: () => void) {
  const promises: Promise<void>[] = [];
  for (let c = 0; c < CONFIG.COLS; c++) {
    let writeRow = CONFIG.ROWS - 1;
    for (let r = CONFIG.ROWS - 1; r >= 0; r--) {
      const t = state.board[r][c];
      if (t && t.type !== null) {
        if (writeRow !== r) {
          const dest = cellToXY(c, writeRow);
          if (t.sprite) promises.push(tweenTo(scene, t.sprite, dest.x, dest.y));
          if (t.sprite) t.sprite.setData('r', writeRow);
          state.board[writeRow][c] = t;
          state.board[r][c] = { type: null, sprite: null };
        }
        writeRow--;
      }
    }
    for (let r = writeRow; r >= 0; r--) {
      const type = Phaser.Math.Between(0, CONFIG.TYPES - 1);
      const s = makeTileSprite(scene, c, r, type);
      const start = cellToXY(c, -1 - Phaser.Math.Between(0, 2));
      s.x = start.x;
      s.y = start.y;
      const dest = cellToXY(c, r);
      s.alpha = 0;
      s.scale = 0.8;
      const t = { type, sprite: s };
      state.board[r][c] = t;
      promises.push(new Promise(res => {
        scene.tweens.add({ targets: s, x: dest.x, y: dest.y, alpha: 1, scale: 1, duration: 220 + (writeRow - r) * 30, ease: 'Back.out', onComplete: res });
      }));
    }
  }
  Promise.all(promises).then(() => onComplete && onComplete());
}
