// Transient visual flourishes: a sparkle burst when a gem clears and an
// expanding shockwave ring when a special detonates. Everything created here
// auto-disposes so nothing leaks during long play sessions.

import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import { PALETTE, RAINBOW_COLOR } from '../config';

export class Effects {
  private sparkTex: Texture;

  constructor(private scene: Scene) {
    this.sparkTex = new Texture(this.sparkUrl(), scene);
  }

  private color(color: number): Color4 {
    if (color === RAINBOW_COLOR) return new Color4(1, 1, 1, 1);
    const p = PALETTE[color % PALETTE.length];
    return new Color4(p.glow[0], p.glow[1], p.glow[2], 1);
  }

  /** A short, soft sparkle puff in the gem's colour. */
  burst(pos: Vector3, color: number, scale = 1): void {
    const ps = new ParticleSystem(`burst`, 40, this.scene);
    ps.particleTexture = this.sparkTex;
    ps.emitter = pos.clone();
    ps.minEmitBox = new Vector3(-0.1, -0.1, -0.1);
    ps.maxEmitBox = new Vector3(0.1, 0.1, 0.1);
    const c = this.color(color);
    ps.color1 = c;
    ps.color2 = new Color4(1, 1, 1, 1);
    ps.colorDead = new Color4(c.r, c.g, c.b, 0);
    ps.minSize = 0.08 * scale;
    ps.maxSize = 0.3 * scale;
    ps.minLifeTime = 0.25;
    ps.maxLifeTime = 0.6;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, -2.2, 0);
    ps.createSphereEmitter(0.2);
    ps.minEmitPower = 1.5 * scale;
    ps.maxEmitPower = 4 * scale;
    ps.updateSpeed = 0.02;
    ps.disposeOnStop = true;
    ps.manualEmitCount = Math.floor(28 * scale);
    ps.start();
    ps.stop();
  }

  /** A glowing ring that expands and fades — for detonations. */
  shockwave(pos: Vector3, color: number, maxRadius = 2.4): void {
    const ring = MeshBuilder.CreateTorus(
      'shock',
      { diameter: 0.4, thickness: 0.12, tessellation: 40 },
      this.scene
    );
    ring.position = pos.clone();
    ring.position.z = -0.3;
    ring.rotation.x = Math.PI / 2;
    ring.isPickable = false;
    const mat = new StandardMaterial('shockMat', this.scene);
    const c = this.color(color);
    mat.emissiveColor = new Color3(c.r, c.g, c.b);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.alpha = 0.9;
    ring.material = mat;

    const start = performance.now();
    const dur = 420;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - start) / dur;
      if (t >= 1) {
        this.scene.onBeforeRenderObservable.remove(obs);
        ring.dispose();
        mat.dispose();
        return;
      }
      const e = 1 - Math.pow(1 - t, 2); // easeOut
      const s = 1 + e * (maxRadius / 0.2);
      ring.scaling.setAll(s);
      mat.alpha = 0.9 * (1 - t);
    });
  }

  /** Bright full-board flash for big board-clearing combos. */
  flash(intensity = 0.6): Mesh {
    const plane = MeshBuilder.CreatePlane('flash', { size: 60 }, this.scene);
    plane.position.z = -6;
    plane.isPickable = false;
    const mat = new StandardMaterial('flashMat', this.scene);
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.alpha = intensity;
    plane.material = mat;
    const start = performance.now();
    const dur = 360;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - start) / dur;
      if (t >= 1) {
        this.scene.onBeforeRenderObservable.remove(obs);
        plane.dispose();
        mat.dispose();
        return;
      }
      mat.alpha = intensity * (1 - t);
    });
    return plane;
  }

  private sparkUrl(): string {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return c.toDataURL();
  }
}
