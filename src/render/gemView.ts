// The visual + physical wrapper around one logical gem. The controller never
// touches Babylon directly — it talks to GemViews, which own their rigid-body
// motion (grid-anchored spring + free spin + blast knock-back), their squash
// deformation, and their clear animation.

import { Mesh, Scene, Vector3 } from '@babylonjs/core';
import { CONFIG } from '../config';
import { GemBody, SoftBody } from '../physics';
import { GemKind } from '../types';
import { createGem } from './gemMesh';
import { MaterialCache } from './materials';
import { SceneManager } from './scene';

export class GemView {
  readonly mesh: Mesh;
  readonly soft: SoftBody;
  readonly body: GemBody;
  private casters: Mesh[];
  private orbiters: Mesh[];
  private targetWorld: Vector3;
  private selected = false;
  private clearing = false;
  private wasFalling = false;
  private idlePhase = Math.random() * Math.PI * 2;
  private z = 0;

  constructor(
    private sm: SceneManager,
    mats: MaterialCache,
    public readonly id: number,
    public color: number,
    public kind: GemKind,
    r: number,
    c: number,
    spawnFromRow?: number
  ) {
    const gem = createGem(`gem_${id}`, sm.scene, mats, color, kind);
    this.mesh = gem.root;
    this.casters = gem.casters;
    this.orbiters = gem.orbiters;
    for (const m of this.casters) sm.registerShadowCaster(m);

    this.targetWorld = sm.gridToWorld(r, c);
    const startRow = spawnFromRow ?? r;
    const start = sm.gridToWorld(startRow, c);
    this.mesh.position.copyFrom(start);

    const ph = CONFIG.PHYSICS;
    this.body = new GemBody(
      start.x,
      start.y,
      ph.posStiffness,
      ph.posDamping,
      ph.angDamping,
      ph.maxSpin,
      ph.idleSpin
    );
    this.body.anchor(this.targetWorld.x, this.targetWorld.y);

    this.soft = new SoftBody(CONFIG.SPRING.stiffness, CONFIG.SPRING.damping);
  }

  get scene(): Scene {
    return this.sm.scene;
  }

  /** Whether the body is allowed to tumble freely (axis-aligned specials keep
   *  their orientation so the player can still read which way they fire). */
  private get freeSpin(): boolean {
    return this.kind === GemKind.Normal || this.kind === GemKind.Color || this.kind === GemKind.Bomb;
  }

  /** Slide/fall to a new board cell. */
  moveTo(r: number, c: number): void {
    this.targetWorld = this.sm.gridToWorld(r, c);
    this.body.anchor(this.targetWorld.x, this.targetWorld.y);
  }

  /** Teleport with no animation. */
  snapTo(r: number, c: number): void {
    this.targetWorld = this.sm.gridToWorld(r, c);
    this.body.place(this.targetWorld.x, this.targetWorld.y);
    this.mesh.position.x = this.targetWorld.x;
    this.mesh.position.y = this.targetWorld.y;
  }

  setSelected(on: boolean): void {
    if (this.selected === on) return;
    this.selected = on;
    if (on) {
      this.soft.pop(CONFIG.SPRING.selectPop);
      this.body.spinUp((Math.random() < 0.5 ? -1 : 1) * 4);
    }
  }

  /** A blast wave from `(fx, fy)` shoves and spins this body (real impulse +
   *  torque), falling off with distance. */
  knock(fx: number, fy: number, scale = 1): void {
    const dx = this.body.x - fx;
    const dy = this.body.y - fy;
    const d = Math.hypot(dx, dy) || 0.0001;
    const falloff = Math.max(0, 1 - d / CONFIG.PHYSICS.blastRadius);
    if (falloff <= 0) return;
    const imp = CONFIG.PHYSICS.blastImpulse * falloff * scale;
    this.body.impulse((dx / d) * imp, (dy / d) * imp + imp * 0.15);
    this.body.spinUp((Math.random() - 0.5) * CONFIG.PHYSICS.blastTorque * falloff * scale);
    this.soft.pop(0.18 * falloff * scale);
  }

  /** Squash-and-pop the gem, then dispose. Resolves when the animation ends. */
  clear(): Promise<void> {
    if (this.clearing) return Promise.resolve();
    this.clearing = true;
    this.soft.land(CONFIG.SPRING.matchPop);
    this.body.spinUp((Math.random() - 0.5) * 16);
    return new Promise((resolve) => {
      const start = performance.now();
      const dur = 200;
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        const t = (performance.now() - start) / dur;
        if (t >= 1) {
          this.scene.onBeforeRenderObservable.remove(obs);
          this.dispose();
          resolve();
          return;
        }
        // Swell, then collapse to a point — like a star going out.
        const s = t < 0.35 ? 1 + t * 1.3 : 1.46 * (1 - (t - 0.35) / 0.65);
        this.mesh.scaling.setAll(Math.max(0.001, s));
        this.mesh.rotation.z += 0.06;
        this.mesh.visibility = 1 - t * 0.5;
      });
    });
  }

  update(dt: number): void {
    if (this.clearing) return;

    const prevY = this.body.y;
    const vy = this.body.vy;
    this.body.step(dt);

    this.mesh.position.x = this.body.x;
    this.mesh.position.y = this.body.y;

    // Detect a landing: was falling and just settled near the anchor.
    const nearTarget = Math.abs(this.body.y - this.body.ay) < 0.05;
    if (vy < -1.2) this.wasFalling = true;
    if (this.wasFalling && nearTarget && Math.abs(this.body.vy) < 1.0) {
      const strength = Math.min(CONFIG.SPRING.landSquash, Math.abs(prevY - this.body.y) * 4 + 0.14);
      this.soft.land(strength);
      this.wasFalling = false;
    }

    this.soft.step(dt);

    // Squash + a gentle idle breathing for life.
    this.idlePhase += dt * 1.6;
    const breathe = this.selected ? 1.0 : 1 + Math.sin(this.idlePhase) * 0.014;
    const s = this.soft.scales();
    this.mesh.scaling.set(s.x * breathe, s.y * breathe, s.z);

    // Orientation: free bodies tumble; axis-locked specials stay readable.
    if (this.freeSpin) {
      this.mesh.rotation.z = this.body.angle;
    } else {
      this.mesh.rotation.z += (0 - this.mesh.rotation.z) * Math.min(1, dt * 8);
    }
    // Orbiting accents (rings, galaxy stars) always wheel around.
    for (const o of this.orbiters) o.rotation.z += dt * 1.9;

    // Selected gems lift toward the camera.
    const targetZ = this.selected ? -0.4 : 0;
    this.z += (targetZ - this.z) * Math.min(1, dt * 12);
    this.mesh.position.z = this.z;
  }

  atRest(): boolean {
    return this.body.atRest() && this.soft.scale.atRest(0.01);
  }

  worldPos(): Vector3 {
    return this.mesh.position;
  }

  dispose(): void {
    for (const m of this.casters) this.sm.removeShadowCaster(m);
    // Dispose geometry only — materials are shared and cached, never per-gem.
    this.mesh.dispose(false, false);
  }
}
