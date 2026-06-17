// The visual + soft-body wrapper around one logical gem. The controller never
// touches Babylon directly — it talks to GemViews, which own their position
// springs, squash/stretch deformation, and clear animation.

import { Mesh, Scene, Vector3 } from '@babylonjs/core';
import { CONFIG } from '../config';
import { Spring, SoftBody } from '../physics';
import { GemKind } from '../types';
import { createGem } from './gemMesh';
import { MaterialCache } from './materials';
import { SceneManager } from './scene';

export class GemView {
  readonly mesh: Mesh;
  readonly soft: SoftBody;
  private px: Spring;
  private py: Spring;
  private targetWorld: Vector3;
  private selected = false;
  private clearing = false;
  private wasFalling = false;
  private idlePhase = Math.random() * Math.PI * 2;

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
    sm.registerShadowCaster(this.mesh); // includes accent children

    this.targetWorld = sm.gridToWorld(r, c);
    const startRow = spawnFromRow ?? r;
    const start = sm.gridToWorld(startRow, c);
    this.mesh.position.copyFrom(start);

    const { stiffness, damping } = CONFIG.SPRING;
    this.px = new Spring(start.x, stiffness, damping);
    this.py = new Spring(start.y, stiffness, damping);
    this.px.setTarget(this.targetWorld.x);
    this.py.setTarget(this.targetWorld.y);

    this.soft = new SoftBody(stiffness, damping);
  }

  get scene(): Scene {
    return this.sm.scene;
  }

  /** Slide/fall to a new board cell. */
  moveTo(r: number, c: number): void {
    this.targetWorld = this.sm.gridToWorld(r, c);
    this.px.setTarget(this.targetWorld.x);
    this.py.setTarget(this.targetWorld.y);
  }

  /** Teleport with no animation. */
  snapTo(r: number, c: number): void {
    this.targetWorld = this.sm.gridToWorld(r, c);
    this.px.set(this.targetWorld.x);
    this.py.set(this.targetWorld.y);
    this.mesh.position.copyFrom(this.targetWorld);
  }

  setSelected(on: boolean): void {
    if (this.selected === on) return;
    this.selected = on;
    if (on) this.soft.pop(CONFIG.SPRING.selectPop);
  }

  /** Squash-and-pop the gem, then dispose. Resolves when the animation ends. */
  clear(): Promise<void> {
    if (this.clearing) return Promise.resolve();
    this.clearing = true;
    this.soft.land(CONFIG.SPRING.matchPop);
    return new Promise((resolve) => {
      const start = performance.now();
      const dur = 180;
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        const t = (performance.now() - start) / dur;
        if (t >= 1) {
          this.scene.onBeforeRenderObservable.remove(obs);
          this.dispose();
          resolve();
          return;
        }
        // Swell briefly, then collapse to nothing.
        const s = t < 0.4 ? 1 + t * 0.9 : (1.36 * (1 - (t - 0.4) / 0.6));
        this.mesh.scaling.setAll(Math.max(0.001, s));
        this.mesh.visibility = 1 - t * 0.4;
      });
    });
  }

  update(dt: number): void {
    if (this.clearing) return;

    this.px.step(dt);
    const prevY = this.py.value;
    const vy = this.py.velocity;
    this.py.step(dt);

    this.mesh.position.x = this.px.value;
    this.mesh.position.y = this.py.value;

    // Detect a landing: was falling (downward velocity) and just reached rest.
    const nearTarget = Math.abs(this.py.value - this.py.target) < 0.04;
    const falling = vy < -1.2;
    if (falling) this.wasFalling = true;
    if (this.wasFalling && nearTarget && Math.abs(this.py.velocity) < 0.8) {
      const strength = Math.min(CONFIG.SPRING.landSquash, Math.abs(prevY - this.py.value) * 4 + 0.12);
      this.soft.land(strength);
      this.wasFalling = false;
    }

    this.soft.step(dt);

    // Apply soft-body deformation + a gentle idle breathing for life.
    this.idlePhase += dt * 1.6;
    const breathe = this.selected ? 1.0 : 1 + Math.sin(this.idlePhase) * 0.012;
    const s = this.soft.scales();
    this.mesh.scaling.set(s.x * breathe, s.y * breathe, s.z);

    // Selected gems lift toward the camera and spin a touch.
    const targetZ = this.selected ? -0.35 : 0;
    this.mesh.position.z += (targetZ - this.mesh.position.z) * Math.min(1, dt * 12);
    if (this.kind === GemKind.Color) this.mesh.rotation.z += dt * 0.8;
    else if (this.selected) this.mesh.rotation.z += dt * 1.2;
    else this.mesh.rotation.z *= 1 - Math.min(1, dt * 4);
  }

  atRest(): boolean {
    return this.px.atRest(0.01) && this.py.atRest(0.01) && this.soft.scale.atRest(0.01);
  }

  worldPos(): Vector3 {
    return this.mesh.position;
  }

  dispose(): void {
    this.sm.removeShadowCaster(this.mesh);
    // Dispose geometry only — materials are shared and cached, never per-gem.
    this.mesh.dispose(false, false);
  }
}
