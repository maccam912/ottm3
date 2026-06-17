// Transient visual flourishes. A normal clear gets a quick plasma puff; a
// special detonation gets a full supernova — a blinding core flash, a dense
// spark burst, expanding shockwave rings, and a spray of physically-simulated
// debris chunks (real free bodies with velocity, drag, gravity and spin).
// Everything created here auto-disposes so nothing leaks during long sessions.

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
import { Debris } from '../physics';

export class Effects {
  private sparkTex: Texture;

  constructor(private scene: Scene) {
    this.sparkTex = new Texture(this.sparkUrl(), scene);
  }

  private glow(color: number): Color4 {
    if (color === RAINBOW_COLOR) return new Color4(1, 1, 1, 1);
    const p = PALETTE[color % PALETTE.length];
    return new Color4(p.glow[0], p.glow[1], p.glow[2], 1);
  }

  private coreCol(color: number): Color4 {
    if (color === RAINBOW_COLOR) return new Color4(1, 1, 1, 1);
    const p = PALETTE[color % PALETTE.length];
    return new Color4(p.core[0], p.core[1], p.core[2], 1);
  }

  /** A short, bright plasma puff in the gem's colour — for ordinary clears. */
  burst(pos: Vector3, color: number, scale = 1): void {
    const ps = new ParticleSystem('burst', 80, this.scene);
    ps.particleTexture = this.sparkTex;
    ps.emitter = pos.clone();
    ps.minEmitBox = new Vector3(-0.1, -0.1, -0.1);
    ps.maxEmitBox = new Vector3(0.1, 0.1, 0.1);
    ps.color1 = this.glow(color);
    ps.color2 = this.coreCol(color);
    ps.colorDead = new Color4(this.glow(color).r, this.glow(color).g, this.glow(color).b, 0);
    ps.minSize = 0.08 * scale;
    ps.maxSize = 0.36 * scale;
    ps.minLifeTime = 0.25;
    ps.maxLifeTime = 0.7;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, -3.0, 0);
    ps.createSphereEmitter(0.22);
    ps.minEmitPower = 2 * scale;
    ps.maxEmitPower = 6 * scale;
    ps.updateSpeed = 0.02;
    ps.disposeOnStop = true;
    ps.manualEmitCount = Math.floor(46 * scale);
    ps.start();
    ps.stop();
  }

  /** A full supernova for special detonations: core flash, spark storm,
   *  shockwave rings, and physical debris. */
  supernova(pos: Vector3, color: number, scale = 1): void {
    this.coreFlash(pos, color, scale);
    this.sparkStorm(pos, color, scale);
    this.shockwave(pos, color, 2.4 * scale);
    this.shockwave(pos, RAINBOW_COLOR, 1.4 * scale);
    this.debrisSpray(pos, color, Math.round(10 * scale));
  }

  /** A blinding sphere that swells and snaps out of existence. */
  private coreFlash(pos: Vector3, color: number, scale: number): void {
    const ball = MeshBuilder.CreateSphere('nova', { diameter: 0.5, segments: 16 }, this.scene);
    ball.position = pos.clone();
    ball.isPickable = false;
    const mat = new StandardMaterial('novaMat', this.scene);
    const c = this.coreCol(color);
    mat.emissiveColor = new Color3(c.r, c.g, c.b);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.alpha = 1;
    ball.material = mat;

    const start = performance.now();
    const dur = 280;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - start) / dur;
      if (t >= 1) {
        this.scene.onBeforeRenderObservable.remove(obs);
        ball.dispose();
        mat.dispose();
        return;
      }
      const e = 1 - Math.pow(1 - t, 2.4);
      ball.scaling.setAll((0.5 + e * 3.4 * scale) / 0.5);
      mat.alpha = Math.pow(1 - t, 1.6);
    });
  }

  /** A dense, fast storm of sparks. */
  private sparkStorm(pos: Vector3, color: number, scale: number): void {
    const ps = new ParticleSystem('nova_sparks', 220, this.scene);
    ps.particleTexture = this.sparkTex;
    ps.emitter = pos.clone();
    ps.color1 = this.glow(color);
    ps.color2 = new Color4(1, 1, 1, 1);
    ps.colorDead = new Color4(this.glow(color).r, this.glow(color).g, this.glow(color).b, 0);
    ps.minSize = 0.1 * scale;
    ps.maxSize = 0.5 * scale;
    ps.minLifeTime = 0.3;
    ps.maxLifeTime = 0.95;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, -2.2, 0);
    ps.createSphereEmitter(0.3);
    ps.minEmitPower = 4 * scale;
    ps.maxEmitPower = 11 * scale;
    ps.updateSpeed = 0.018;
    ps.disposeOnStop = true;
    ps.manualEmitCount = Math.floor(150 * scale);
    ps.start();
    ps.stop();
  }

  /** A spray of small chunks that fly out as genuine rigid bodies — each with
   *  its own velocity, drag, gravity and tumbling spin. */
  private debrisSpray(pos: Vector3, color: number, count: number): void {
    const glow = this.glow(color);
    const mat = new StandardMaterial('debrisMat', this.scene);
    mat.emissiveColor = new Color3(glow.r, glow.g, glow.b);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;

    const bodies: { d: Debris; m: Mesh }[] = [];
    for (let i = 0; i < count; i++) {
      const m = MeshBuilder.CreatePolyhedron('chunk', { type: Math.floor(Math.random() * 3), size: 0.07 + Math.random() * 0.06 }, this.scene);
      m.material = mat;
      m.position.copyFrom(pos);
      m.isPickable = false;
      bodies.push({ d: new Debris(pos.x, pos.y, pos.z - 0.1, 7 + Math.random() * 4, 0.7 + Math.random() * 0.5), m });
    }

    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000);
      let alive = 0;
      for (const b of bodies) {
        if (b.m.isDisposed()) continue;
        if (b.d.step(dt, -10)) {
          alive++;
          b.m.position.set(b.d.x, b.d.y, b.d.z);
          b.m.rotate(new Vector3(b.d.spinAxis.x, b.d.spinAxis.y, b.d.spinAxis.z), b.d.spin * dt);
          b.m.scaling.setAll(Math.max(0.001, b.d.fade()));
        } else {
          b.m.dispose();
        }
      }
      if (alive === 0) {
        this.scene.onBeforeRenderObservable.remove(obs);
        mat.dispose();
      }
    });
  }

  /** A glowing ring that expands and fades — for shockwaves. */
  shockwave(pos: Vector3, color: number, maxRadius = 2.4): void {
    const ring = MeshBuilder.CreateTorus(
      'shock',
      { diameter: 0.4, thickness: 0.1, tessellation: 48 },
      this.scene
    );
    ring.position = pos.clone();
    ring.position.z = -0.3;
    ring.rotation.x = Math.PI / 2;
    ring.isPickable = false;
    const mat = new StandardMaterial('shockMat', this.scene);
    const c = this.glow(color);
    mat.emissiveColor = new Color3(c.r, c.g, c.b);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.alpha = 0.95;
    ring.material = mat;

    const start = performance.now();
    const dur = 460;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - start) / dur;
      if (t >= 1) {
        this.scene.onBeforeRenderObservable.remove(obs);
        ring.dispose();
        mat.dispose();
        return;
      }
      const e = 1 - Math.pow(1 - t, 2.2); // easeOut
      const s = 1 + e * (maxRadius / 0.2);
      ring.scaling.set(s, s, 1 + e * 6);
      mat.alpha = 0.95 * (1 - t);
    });
  }

  /** Bright full-board flash for big board-clearing combos. */
  flash(intensity = 0.6): Mesh {
    const plane = MeshBuilder.CreatePlane('flash', { size: 80 }, this.scene);
    plane.position.z = -6;
    plane.isPickable = false;
    const mat = new StandardMaterial('flashMat', this.scene);
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.disableLighting = true;
    mat.alpha = intensity;
    plane.material = mat;
    const start = performance.now();
    const dur = 420;
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
