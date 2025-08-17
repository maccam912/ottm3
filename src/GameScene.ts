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
    
    // Set physics simulation speed
    this.matter.world.engine.timing.timeScale = CONFIG.TIME_SCALE;

    // Add disco lighting effects
    addDiscoLights(this);

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
    ensureTexture(this, 'shard');

    // Particle manager - we'll create multiple emitters for rainbow colors
    const rainbowEmitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
    for(let i = 0; i < 12; i++) {
      const emitter = this.add.particles(0, 0, `spark-${i}`, {
        speed: { min: 80, max: 350 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 800, max: 1200 },
        quantity: 1,
        angle: { min: 0, max: 360 },
        blendMode: 'ADD',
        gravity: { x: 0, y: 50 }
      });
      emitter.stop();
      rainbowEmitters.push(emitter);
    }
    state.particles = rainbowEmitters[0]; // Store first one for compatibility
    state.rainbowEmitters = rainbowEmitters;


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
    
    // Update gem physics - attract to target positions
    for (let r = 0; r < CONFIG.ROWS; r++) {
      for (let c = 0; c < CONFIG.COLS; c++) {
        const tile = state.board[r][c];
        if (tile && tile.sprite && tile.type !== null) {
          const targetX = tile.sprite.getData('targetX');
          const targetY = tile.sprite.getData('targetY');
          
          if (targetX !== undefined && targetY !== undefined) {
            const dx = targetX - tile.sprite.x;
            const dy = targetY - tile.sprite.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 2) {
              // Apply spring force towards target position
              const force = 0.0005;
              const forceX = dx * force;
              const forceY = dy * force;
              tile.sprite.applyForce({ x: forceX, y: forceY });
              
              // Configurable damping to prevent oscillation
              const individualDamping = tile.sprite.getData('individualDampingFactor') || CONFIG.DAMPING_FACTOR;
              if (individualDamping > 0) {
                const velocity = tile.sprite.body.velocity;
                // Make damping more aggressive so variation is more visible
                const dampingMultiplier = 1 - (individualDamping * 0.15); // Increased from 0.05 to 0.15
                tile.sprite.setVelocity(velocity.x * dampingMultiplier, velocity.y * dampingMultiplier);
                
                // Angular damping - also more aggressive
                const angularVelocity = tile.sprite.body.angularVelocity;
                const angularDampingMultiplier = 1 - (individualDamping * 0.1); // Increased from 0.03 to 0.1
                tile.sprite.setAngularVelocity(angularVelocity * angularDampingMultiplier);
              }
            }
          }
        }
      }
    }
  }
}

function addDiscoLights(scene: Phaser.Scene) {
  // Create animated disco lights that move around the screen
  for (let i = 0; i < 8; i++) {
    const light = scene.add.graphics();
    const hue = (i / 8) * 360;
    const color = Phaser.Display.Color.HSVToRGB(hue / 360, 0.8, 1);
    const colorHex = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    
    light.fillStyle(colorHex, 0.3);
    light.fillCircle(0, 0, 40 + Math.random() * 30);
    light.setBlendMode(Phaser.BlendModes.ADD);
    light.setDepth(-10);
    
    // Animate the disco light
    scene.tweens.add({
      targets: light,
      x: { from: Math.random() * W, to: Math.random() * W },
      y: { from: Math.random() * H, to: Math.random() * H },
      alpha: { from: 0.1, to: 0.4 },
      scaleX: { from: 0.5, to: 1.5 },
      scaleY: { from: 0.5, to: 1.5 },
      duration: 3000 + Math.random() * 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
      delay: i * 200
    });
  }
}

function addVignette(scene: Phaser.Scene) {
  const g = scene.add.graphics({ x: 0, y: 0 });
  g.fillStyle(0x000000, 0.25);
  g.fillCircle(W / 2, H * 0.55, Math.max(W, H) * 0.72);
  g.setDepth(2000);
}

function ensureTexture(scene: Phaser.Scene, key: string) {
  if (key === 'spark') return; // Don't create white spark texture
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
    
    // Create a more 3D-looking gem with multiple layers
    // Base shadow/depth
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(s / 2 + 2, s / 2 + 2, s / 2);
    
    // Main gem body with gradient effect
    g.fillStyle(COLORS[i], 0.9);
    g.fillRoundedRect((s - (s * 0.86)) / 2, (s - (s * 0.86)) / 2, s * 0.86, s * 0.86, r);
    
    // Inner facet reflections
    g.fillStyle(COLORS[i], 0.7);
    g.fillRoundedRect((s - (s * 0.7)) / 2, (s - (s * 0.7)) / 2, s * 0.7, s * 0.7, r * 0.8);
    
    // Highlight reflections
    g.fillStyle(0xffffff, 0.6);
    g.fillEllipse(s * 0.3, s * 0.25, s * 0.3, s * 0.15);
    
    // Secondary highlight
    g.fillStyle(0xffffff, 0.4);
    g.fillEllipse(s * 0.6, s * 0.4, s * 0.15, s * 0.1);
    
    // Prismatic edge effect
    g.lineStyle(2, 0xffffff, 0.8);
    g.strokeRoundedRect((s - (s * 0.86)) / 2, (s - (s * 0.86)) / 2, s * 0.86, s * 0.86, r);
    
    g.generateTexture(key, s, s);
    g.destroy();
  }
}

function buildParticleTextures(scene: Phaser.Scene) {
  // Create rainbow colored spark textures
  const rainbowColors = [0xff0000, 0xff8000, 0xffff00, 0x80ff00, 0x00ff00, 0x00ff80, 0x00ffff, 0x0080ff, 0x0000ff, 0x8000ff, 0xff00ff, 0xff0080];
  
  rainbowColors.forEach((color, index) => {
    const key = `spark-${index}`;
    if (!scene.textures.exists(key)) {
      const g1 = scene.add.graphics();
      g1.fillStyle(color, 1);
      g1.fillCircle(8, 8, 8);
      g1.generateTexture(key, 16, 16);
      g1.destroy();
    }
  });

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
  
  // Create physics body for the gem - use individual damping for air friction too
  const baseFrictionAir = 0.15; // Increased base friction so variation is more noticeable
  const gemDampingVariation = (Math.random() - 0.5) * CONFIG.DAMPING_VARIATION;
  const gemIndividualDampingFactor = Math.max(0, Math.min(1, CONFIG.DAMPING_FACTOR + gemDampingVariation));
  const adjustedFrictionAir = baseFrictionAir * gemIndividualDampingFactor;
  
  const s = scene.matter.add.image(x, y, key, undefined, {
    isStatic: false,
    frictionAir: adjustedFrictionAir,
    friction: 0.001,
    restitution: 0.5,
    density: 0.001,
    isSensor: true  // Turn off collision between gems
  }).setOrigin(0.5).setScale(1);
  
  s.setInteractive();
  s.setData('c', c);
  s.setData('r', r);
  s.setData('targetX', x);
  s.setData('targetY', y);
  s.setData('individualDampingFactor', gemIndividualDampingFactor);
  
  // Add subtle glow effect to each gem
  const glow = scene.add.graphics();
  const glowColor = COLORS[type];
  glow.fillStyle(glowColor, 0.2);
  glow.fillCircle(x, y, CONFIG.TILE * 0.6);
  glow.setBlendMode(Phaser.BlendModes.ADD);
  glow.setDepth(5);
  
  // Animate the glow
  scene.tweens.add({
    targets: glow,
    alpha: { from: 0.1, to: 0.3 },
    scaleX: { from: 0.8, to: 1.2 },
    scaleY: { from: 0.8, to: 1.2 },
    duration: 2000 + Math.random() * 1000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.inOut'
  });
  
  s.setData('glow', glow);
  s.setDepth(10);
  
  // Physics bodies will naturally rotate from explosion forces
  // No need for artificial rotation tweens
  
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

function tweenSwap(scene: Phaser.Scene, s1: Phaser.Physics.Matter.Image, s2: Phaser.Physics.Matter.Image, onComplete: () => void) {
  const p1 = { x: s1.x, y: s1.y };
  const p2 = { x: s2.x, y: s2.y };
  
  // Update target positions
  s1.setData('targetX', p2.x);
  s1.setData('targetY', p2.y);
  s2.setData('targetX', p1.x);
  s2.setData('targetY', p1.y);
  
  // Apply forces to move gems via physics instead of direct position manipulation
  const force = 0.004;
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p1.x - p2.x;
  const dy2 = p1.y - p2.y;
  
  s1.applyForce({ x: dx1 * force, y: dy1 * force });
  s2.applyForce({ x: dx2 * force, y: dy2 * force });
  
  // Complete after physics has time to work
  scene.time.delayedCall(400, onComplete);
}

function resolveMatches(scene: Phaser.Scene, matches: Match[]) {
  state.combo++;
  state.chainReactionCount++;
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
  
  // Apply explosion forces to nearby gems
  clearList.forEach(({ r, c }) => {
    const { x: blastX, y: blastY } = cellToXY(c, r);
    applyExplosionForce(scene, blastX, blastY, CONFIG.EXPLOSION_RADIUS, CONFIG.EXPLOSION_FORCE);
  });

  const add = Math.floor(tilesCleared * 10 * Math.max(1, state.combo * 0.6));
  state.score += add;
  if(state.scoreText) state.scoreText.setText(`Score ${state.score}`);

  // Accelerating delay - starts at 180ms, reduces by 20ms per chain reaction, minimum 40ms
  const baseDelay = 180;
  const accelerationRate = 20;
  const minDelay = 40;
  const delay = Math.max(minDelay, baseDelay - (state.chainReactionCount - 1) * accelerationRate);

  scene.time.delayedCall(delay, () => {
    dropTiles(scene, () => {
      const next = findMatches(state.board);
      if (next.length > 0) {
        resolveMatches(scene, next);
      } else {
        state.combo = 0;
        state.chainReactionCount = 0;
        state.inputLocked = false;
      }
    });
  });
}

function explodeTile(scene: Phaser.Scene, r: number, c: number) {
  const t = state.board[r][c];
  if (!t || !t.sprite) return;
  const { x, y } = cellToXY(c, r);

  if(state.rainbowEmitters) {
    // Emit rainbow colored particles
    for(let i = 0; i < 14; i++) {
      const randomEmitterIndex = Math.floor(Math.random() * state.rainbowEmitters.length);
      const emitter = state.rainbowEmitters[randomEmitterIndex];
      emitter.emitParticleAt(x, y, 1);
    }
  }

  spawnShards(scene, x, y, COLORS[t.type as number]);

  // Create spectacular explosion effect
  createExplosionEffect(scene, x, y, COLORS[t.type as number]);
  
  scene.tweens.add({ 
    targets: t.sprite, 
    scale: 1.4, 
    alpha: 0, 
    duration: 130, 
    ease: 'Back.easeIn', 
    onComplete: () => {
      // Destroy glow effect too
      const glow = t.sprite?.getData('glow');
      if (glow) glow.destroy();
      t.sprite?.destroy();
    }
  });

  state.board[r][c] = { type: null, sprite: null };
}

function applyExplosionForce(scene: Phaser.Scene, blastX: number, blastY: number, radius: number, baseForce: number) {
  for (let r = 0; r < CONFIG.ROWS; r++) {
    for (let c = 0; c < CONFIG.COLS; c++) {
      const tile = state.board[r][c];
      if (tile && tile.sprite && tile.type !== null) {
        const dx = tile.sprite.x - blastX;
        const dy = tile.sprite.y - blastY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < radius && distance > 5) { // Avoid division by zero
          // Inverse square law: F = k / d²
          const distanceSquared = distance * distance;
          const forceMagnitude = (baseForce * radius * radius) / distanceSquared;
          
          // Normalize direction vector
          const dirX = dx / distance;
          const dirY = dy / distance;
          
          // Add some angular variation to make it less rigid
          const angleVariation = (Math.random() - 0.5) * 0.6; // ±17 degrees variation
          const cos = Math.cos(angleVariation);
          const sin = Math.sin(angleVariation);
          
          // Rotate the direction vector
          const rotatedDirX = dirX * cos - dirY * sin;
          const rotatedDirY = dirX * sin + dirY * cos;
          
          // Apply the force
          const forceX = rotatedDirX * forceMagnitude;
          const forceY = rotatedDirY * forceMagnitude;
          
          tile.sprite.applyForce({ x: forceX, y: forceY });
          
          // Add rotational impulse based on force magnitude
          const torque = (Math.random() - 0.5) * forceMagnitude * 0.5;
          tile.sprite.setAngularVelocity(tile.sprite.body.angularVelocity + torque);
        }
      }
    }
  }
}

function createExplosionEffect(scene: Phaser.Scene, x: number, y: number, color: number) {
  // Create a burst of prismatic light rays
  for (let i = 0; i < 12; i++) {
    const ray = scene.add.graphics();
    const angle = (i / 12) * Math.PI * 2;
    const length = 60 + Math.random() * 40;
    
    // Create rainbow effect by shifting hue
    const hue = ((color >> 16) & 0xFF) / 255 * 360;
    const shiftedHue = (hue + i * 30) % 360;
    const shiftedColor = Phaser.Display.Color.HSVToRGB(shiftedHue / 360, 0.8, 1);
    const rayColor = Phaser.Display.Color.GetColor(shiftedColor.r, shiftedColor.g, shiftedColor.b);
    
    ray.lineStyle(4, rayColor, 0.8);
    ray.lineBetween(x, y, x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ray.setBlendMode(Phaser.BlendModes.ADD);
    ray.setDepth(50);
    
    // Animate the ray
    scene.tweens.add({
      targets: ray,
      alpha: { from: 0.8, to: 0 },
      scaleX: { from: 0.1, to: 1 },
      scaleY: { from: 0.1, to: 1 },
      duration: 300,
      ease: 'Quad.out',
      onComplete: () => ray.destroy()
    });
  }
  
  // Central flash
  const flash = scene.add.graphics();
  flash.fillStyle(0xffffff, 0.9);
  flash.fillCircle(x, y, 20);
  flash.setBlendMode(Phaser.BlendModes.ADD);
  flash.setDepth(60);
  
  scene.tweens.add({
    targets: flash,
    alpha: { from: 0.9, to: 0 },
    scaleX: { from: 0.1, to: 3 },
    scaleY: { from: 0.1, to: 3 },
    duration: 200,
    ease: 'Quad.out',
    onComplete: () => flash.destroy()
  });
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
          if (t.sprite) {
            promises.push(tweenTo(scene, t.sprite, dest.x, dest.y));
            t.sprite.setData('r', writeRow);
            t.sprite.setData('c', c);
          }
          state.board[writeRow][c] = t;
          state.board[r][c] = { type: null, sprite: null };
        }
        writeRow--;
      }
    }
    for (let r = writeRow; r >= 0; r--) {
      const type = Phaser.Math.Between(0, CONFIG.TYPES - 1);
      const dest = cellToXY(c, r);
      const s = makeTileSprite(scene, c, r, type);
      const start = cellToXY(c, -1 - Phaser.Math.Between(0, 2));
      s.setPosition(start.x, start.y);
      s.alpha = 0;
      s.scale = 0.8;
      const t = { type, sprite: s };
      state.board[r][c] = t;
      
      promises.push(new Promise(res => {
        // Only animate alpha and scale, let physics handle position
        scene.tweens.add({ 
          targets: s, 
          alpha: 1, 
          scale: 1, 
          duration: 800 + (writeRow - r) * 100, 
          ease: 'Sine.out', 
          onComplete: res
        });
        
        // Apply physics force to move to destination
        const dx = dest.x - s.x;
        const dy = dest.y - s.y;
        const force = 0.003;
        s.applyForce({ x: dx * force, y: dy * force });
      }));
    }
  }
  Promise.all(promises).then(() => onComplete && onComplete());
}
