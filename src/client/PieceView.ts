import Phaser from "phaser";
import type { PlacedPiece } from "../engine/types";
import { ACCENTS, CELL, GEM_TEXTURES } from "./constants";

const RELIC_SCALE = (CELL / 256) * 1.18;
const MAX_SPRING_OFFSET = CELL * 0.18;

/**
 * A board relic. The outer container always owns the authoritative grid
 * position; all impact motion happens on `springBody`, so falls and swaps can
 * tween the PieceView without fighting the spring simulation.
 */
export class PieceView extends Phaser.GameObjects.Container {
  readonly pieceId: number;
  readonly color: number;
  readonly special: PlacedPiece["special"];
  gridR: number;
  gridC: number;

  private readonly springBody: Phaser.GameObjects.Container;
  private readonly presentation: Phaser.GameObjects.Container;
  private readonly selectionHalo: Phaser.GameObjects.Image;
  private readonly selectionHaloScale: number;
  private readonly ambientTweens: Phaser.Tweens.Tween[] = [];
  private selectionTween: Phaser.Tweens.Tween | null = null;
  private haloTween: Phaser.Tweens.Tween | null = null;

  private springX = 0;
  private springY = 0;
  private velocityX = 0;
  private velocityY = 0;
  private springAngle = 0;
  private angularVelocity = 0;
  private squash = 0;
  private squashVelocity = 0;

  constructor(scene: Phaser.Scene, piece: PlacedPiece, x: number, y: number) {
    super(scene, x, y);
    this.pieceId = piece.id;
    this.color = piece.color;
    this.special = piece.special;
    this.gridR = piece.r;
    this.gridC = piece.c;

    const accent = ACCENTS[piece.color] ?? 0xffffff;

    this.springBody = scene.add.container(0, 0);
    this.presentation = scene.add.container(0, 0);
    this.springBody.add(this.presentation);
    this.add(this.springBody);

    // Rendering order is chosen so a plain relic never changes blend mode:
    // shadow, relic and gloss all use NORMAL, letting the whole board batch
    // into a single draw call. Only specials (and the selection halo while
    // selected) append ADD-blended layers, so those flushes stay rare.
    const shadow = scene.add
      .ellipse(0, CELL * 0.3, CELL * 0.62, CELL * 0.2, 0x05000d, 0.56)
      .setScale(1, 0.72);
    this.presentation.add(shadow);

    const texture = this.relicTexture(piece);
    const relic = scene.add.image(0, 0, texture).setScale(RELIC_SCALE);
    if (piece.special === "singularity") relic.setTint(0xb56cff);
    this.presentation.add(relic);

    // A separate specular flare makes every relic glint even when post FX are
    // unavailable (Canvas renderer, battery saver, or reduced quality mode).
    const gloss = scene.add
      .image(-CELL * 0.15, -CELL * 0.2, "particle_soft")
      .setDisplaySize(CELL * 0.27, CELL * 0.16)
      .setAlpha(0.38);
    this.presentation.add(gloss);

    this.selectionHalo = scene.add
      .image(0, 0, "ring")
      .setTint(accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.94, CELL * 0.94)
      .setAlpha(0);
    this.selectionHaloScale = this.selectionHalo.scaleX;
    this.presentation.add(this.selectionHalo);

    if (piece.special !== "none") {
      const aura = scene.add
        .image(0, 0, "particle_soft")
        .setTint(accent)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(CELL * 1.18, CELL * 1.18)
        .setAlpha(0.48);
      const auraScale = aura.scaleX;
      this.presentation.add(aura);
      this.track(
        scene.tweens.add({
          targets: aura,
          alpha: { from: 0.34, to: 0.68 },
          scale: { from: auraScale * 0.88, to: auraScale * 1.16 },
          duration: 560,
          delay: (piece.id * 73) % 420,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        }),
      );
    }
    this.track(
      scene.tweens.add({
        targets: gloss,
        x: { from: -CELL * 0.2, to: CELL * 0.14 },
        y: { from: -CELL * 0.23, to: CELL * 0.1 },
        alpha: { from: 0.12, to: 0.82 },
        duration: 660,
        delay: 400 + ((piece.id * 191) % 1250),
        hold: 70,
        yoyo: true,
        repeat: -1,
        repeatDelay: 1050 + ((piece.id * 47) % 850),
        ease: "Sine.easeInOut",
      }),
    );

    this.decorateSpecial(piece.special, accent);

    this.setSize(CELL, CELL);
    scene.add.existing(this);
  }

  /**
   * Add a physical shock to this relic. `force` is an impulse-strength value:
   * roughly 4 is a nearby normal pop and 30 is a reality-ending combination.
   * `angle`, when provided, is in radians.
   */
  impact(force: number, angle?: number): void {
    if (!Number.isFinite(force) || force <= 0) return;
    const trauma = Phaser.Math.Clamp(force, 0, 40);
    const direction = angle ?? Phaser.Math.FloatBetween(-Math.PI, Math.PI);
    const impulse = 18 * trauma;
    this.velocityX += Math.cos(direction) * impulse;
    this.velocityY += Math.sin(direction) * impulse;
    this.angularVelocity += Phaser.Math.FloatBetween(-20, 20) * trauma;
    this.squashVelocity += (0.18 + trauma * 0.01) * trauma;
  }

  /** Advance the damped spring. Call once per scene update for each live view. */
  updatePhysics(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    const dt = Math.min(deltaMs, 40) / 1000;

    // Slightly under-damped on purpose: explosions should leave the whole
    // board wobbling instead of easing politely back into place.
    this.velocityX += (-150 * this.springX - 17 * this.velocityX) * dt;
    this.velocityY += (-150 * this.springY - 17 * this.velocityY) * dt;
    this.springX += this.velocityX * dt;
    this.springY += this.velocityY * dt;

    this.angularVelocity += (-112 * this.springAngle - 15 * this.angularVelocity) * dt;
    this.springAngle += this.angularVelocity * dt;

    this.squashVelocity += (-185 * this.squash - 18 * this.squashVelocity) * dt;
    this.squash += this.squashVelocity * dt;

    this.springX = Phaser.Math.Clamp(this.springX, -MAX_SPRING_OFFSET, MAX_SPRING_OFFSET);
    this.springY = Phaser.Math.Clamp(this.springY, -MAX_SPRING_OFFSET, MAX_SPRING_OFFSET);
    this.springAngle = Phaser.Math.Clamp(this.springAngle, -16, 16);
    this.squash = Phaser.Math.Clamp(this.squash, -0.16, 0.2);

    if (Math.abs(this.springX) < 0.005 && Math.abs(this.velocityX) < 0.02) {
      this.springX = 0;
      this.velocityX = 0;
    }
    if (Math.abs(this.springY) < 0.005 && Math.abs(this.velocityY) < 0.02) {
      this.springY = 0;
      this.velocityY = 0;
    }
    if (Math.abs(this.springAngle) < 0.005 && Math.abs(this.angularVelocity) < 0.02) {
      this.springAngle = 0;
      this.angularVelocity = 0;
    }
    if (Math.abs(this.squash) < 0.0001 && Math.abs(this.squashVelocity) < 0.001) {
      this.squash = 0;
      this.squashVelocity = 0;
    }

    this.springBody.setPosition(this.springX, this.springY);
    this.springBody.setAngle(this.springAngle);
    this.springBody.setScale(1 + this.squash, 1 - this.squash * 0.72);
  }

  /** Selected feedback with a radioactive pulse that does not fight physics. */
  setSelected(on: boolean): void {
    this.selectionTween?.remove();
    this.haloTween?.remove();
    this.selectionTween = null;
    this.haloTween = null;

    if (on) {
      this.selectionHalo.setAlpha(0.9).setScale(this.selectionHaloScale * 0.88);
      this.selectionTween = this.scene.tweens.add({
        targets: this.presentation,
        scale: { from: 1, to: 1.1 },
        duration: 180,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.haloTween = this.scene.tweens.add({
        targets: this.selectionHalo,
        scale: {
          from: this.selectionHaloScale * 0.82,
          to: this.selectionHaloScale * 1.2,
        },
        alpha: { from: 0.92, to: 0.24 },
        duration: 390,
        repeat: -1,
        ease: "Quad.easeOut",
      });
    } else {
      this.presentation.setScale(1);
      this.selectionHalo.setAlpha(0).setScale(this.selectionHaloScale);
    }
  }

  /** Aggressive "pick me" wobble for idle hints. */
  wobble(): void {
    this.scene.tweens.add({
      targets: this.presentation,
      angle: { from: -8, to: 8 },
      duration: 72,
      yoyo: true,
      repeat: 6,
      ease: "Sine.easeInOut",
      onComplete: () => this.presentation.setAngle(0),
    });
  }

  override destroy(fromScene?: boolean): void {
    this.selectionTween?.remove();
    this.haloTween?.remove();
    for (const tween of this.ambientTweens) tween.remove();
    this.ambientTweens.length = 0;
    super.destroy(fromScene);
  }

  private relicTexture(piece: PlacedPiece): string {
    if (piece.special === "singularity") return "relic_void";
    if (piece.special === "prism") return "relic_diamond";
    return GEM_TEXTURES[piece.color] ?? "relic_star";
  }

  private decorateSpecial(special: PlacedPiece["special"], accent: number): void {
    switch (special) {
      case "none":
        return;
      case "rocketH":
        this.decorateRocket("h", accent);
        return;
      case "rocketV":
        this.decorateRocket("v", accent);
        return;
      case "pulse":
        this.decoratePulse(accent);
        return;
      case "nova":
        this.decorateNova(accent);
        return;
      case "prism":
        this.decoratePrism();
        return;
      case "singularity":
        this.decorateSingularity();
        return;
    }
  }

  private decorateRocket(axis: "h" | "v", accent: number): void {
    const wake = this.scene.add
      .image(0, 0, `rocket_${axis}`)
      .setTint(accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.82, CELL * 0.82)
      .setAlpha(0.52);
    const wakeScaleX = wake.scaleX;
    const wakeScaleY = wake.scaleY;
    const rails = this.scene.add
      .image(0, 0, `rocket_${axis}`)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.72, CELL * 0.72)
      .setAlpha(0.96);
    this.presentation.add([wake, rails]);
    this.track(
      this.scene.tweens.add({
        targets: wake,
        alpha: { from: 0.18, to: 0.9 },
        scaleX:
          axis === "h"
            ? { from: wakeScaleX * 0.8, to: wakeScaleX * 1.22 }
            : { from: wakeScaleX * 0.94, to: wakeScaleX * 1.06 },
        scaleY:
          axis === "v"
            ? { from: wakeScaleY * 0.8, to: wakeScaleY * 1.22 }
            : { from: wakeScaleY * 0.94, to: wakeScaleY * 1.06 },
        duration: 270,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }),
    );
    this.track(
      this.scene.tweens.add({
        targets: rails,
        alpha: { from: 0.62, to: 1 },
        duration: 110,
        yoyo: true,
        repeat: -1,
      }),
    );
  }

  private decoratePulse(accent: number): void {
    const ring = this.scene.add
      .image(0, 0, "double_ring")
      .setTint(accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.82, CELL * 0.82)
      .setAlpha(0.92);
    const echo = this.scene.add
      .image(0, 0, "ring")
      .setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.58, CELL * 0.58)
      .setAlpha(0.68);
    const echoScale = echo.scaleX;
    this.presentation.add([ring, echo]);
    this.track(this.scene.tweens.add({ targets: ring, angle: 360, duration: 1250, repeat: -1 }));
    this.track(
      this.scene.tweens.add({
        targets: echo,
        scale: { from: echoScale * 0.48, to: echoScale * 1.35 },
        alpha: { from: 0.95, to: 0 },
        duration: 560,
        repeat: -1,
        ease: "Cubic.easeOut",
      }),
    );
  }

  private decorateNova(accent: number): void {
    const horizontal = this.scene.add
      .image(0, 0, "rocket_h")
      .setTint(accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.76, CELL * 0.76)
      .setAlpha(0.78);
    const vertical = this.scene.add
      .image(0, 0, "rocket_v")
      .setTint(accent)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.76, CELL * 0.76)
      .setAlpha(0.78);
    const beamScale = horizontal.scaleX;
    const star = this.scene.add
      .image(0, 0, "star")
      .setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.68, CELL * 0.68);
    this.presentation.add([horizontal, vertical, star]);
    this.track(this.scene.tweens.add({ targets: star, angle: 360, duration: 920, repeat: -1 }));
    this.track(
      this.scene.tweens.add({
        targets: [horizontal, vertical],
        alpha: { from: 0.38, to: 1 },
        scale: { from: beamScale * 0.86, to: beamScale * 1.16 },
        duration: 330,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }),
    );
  }

  private decoratePrism(): void {
    const orbit = this.scene.add.container(0, 0);
    const colors = [0xff2bd6, 0x36f1ff, 0xffe53b, 0x55ff8a];
    colors.forEach((tint, i) => {
      const angle = (i / colors.length) * Math.PI * 2;
      const shard = this.scene.add
        .image(Math.cos(angle) * CELL * 0.34, Math.sin(angle) * CELL * 0.34, "shard")
        .setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(CELL * 0.1, CELL * 0.18)
        .setAngle(Phaser.Math.RadToDeg(angle) + 90);
      orbit.add(shard);
    });
    const ringA = this.scene.add
      .image(0, 0, "double_ring")
      .setTint(0x36f1ff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.9, CELL * 0.9)
      .setAlpha(0.82);
    const ringB = this.scene.add
      .image(0, 0, "double_ring")
      .setTint(0xff2bd6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.72, CELL * 0.72)
      .setAlpha(0.78)
      .setAngle(45);
    this.presentation.add([ringA, ringB, orbit]);
    this.track(this.scene.tweens.add({ targets: orbit, angle: 360, duration: 920, repeat: -1 }));
    this.track(this.scene.tweens.add({ targets: ringA, angle: 360, duration: 1700, repeat: -1 }));
    this.track(this.scene.tweens.add({ targets: ringB, angle: -315, duration: 1150, repeat: -1 }));
    this.track(
      this.scene.tweens.add({
        targets: [ringA, ringB],
        alpha: { from: 0.42, to: 1 },
        duration: 240,
        yoyo: true,
        repeat: -1,
      }),
    );
  }

  private decorateSingularity(): void {
    const corona = this.scene.add
      .image(0, 0, "particle_soft")
      .setTint(0xb56cff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 1.22, CELL * 1.22)
      .setAlpha(0.78);
    const coronaScale = corona.scaleX;
    const orbit = this.scene.add.container(0, 0);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const shard = this.scene.add
        .image(Math.cos(angle) * CELL * 0.34, Math.sin(angle) * CELL * 0.22, "shard")
        .setTint(i % 2 === 0 ? 0xff2bd6 : 0x36f1ff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDisplaySize(CELL * 0.08, CELL * 0.16)
        .setAngle(Phaser.Math.RadToDeg(angle) + 90);
      orbit.add(shard);
    }
    const warpedRing = this.scene.add
      .image(0, 0, "double_ring")
      .setTint(0xff2bd6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.86, CELL * 0.58)
      .setAngle(-18)
      .setAlpha(0.9);
    const core = this.scene.add
      .circle(0, 0, CELL * 0.18, 0x030006, 1)
      .setStrokeStyle(3, 0xffffff, 0.9);
    const pin = this.scene.add
      .image(-CELL * 0.045, -CELL * 0.055, "particle_soft")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(CELL * 0.12, CELL * 0.12)
      .setAlpha(0.95);
    this.presentation.add([corona, warpedRing, orbit, core, pin]);
    this.track(this.scene.tweens.add({ targets: orbit, angle: 360, duration: 610, repeat: -1 }));
    this.track(this.scene.tweens.add({ targets: warpedRing, angle: 342, duration: 980, repeat: -1 }));
    this.track(
      this.scene.tweens.add({
        targets: corona,
        scale: { from: coronaScale * 0.82, to: coronaScale * 1.22 },
        alpha: { from: 0.42, to: 0.94 },
        duration: 310,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }),
    );
    this.track(
      this.scene.tweens.add({
        targets: core,
        scale: { from: 0.84, to: 1.16 },
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }),
    );
  }

  private track(tween: Phaser.Tweens.Tween): void {
    this.ambientTweens.push(tween);
  }
}
