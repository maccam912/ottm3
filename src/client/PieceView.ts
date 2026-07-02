import Phaser from "phaser";
import type { PlacedPiece } from "../engine/types";
import { ACCENTS, CELL, DONUT_TEXTURES } from "./constants";

const DONUT_SCALE = (CELL / 256) * 1.06;

/**
 * One donut on the board: base sprite plus decorations for special pieces.
 * Specials advertise themselves with motion (pulse/rotation), not UI chrome.
 */
export class PieceView extends Phaser.GameObjects.Container {
  readonly pieceId: number;
  readonly color: number;
  readonly special: PlacedPiece["special"];
  gridR: number;
  gridC: number;

  private donut: Phaser.GameObjects.Image;
  private idleTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, piece: PlacedPiece, x: number, y: number) {
    super(scene, x, y);
    this.pieceId = piece.id;
    this.color = piece.color;
    this.special = piece.special;
    this.gridR = piece.r;
    this.gridC = piece.c;

    const accent = ACCENTS[piece.color] ?? 0xffffff;

    if (piece.special === "wrapped") {
      const glow = scene.add.image(0, 0, "particle_soft").setTint(accent).setScale(1.15).setAlpha(0.65);
      this.add(glow);
      scene.tweens.add({
        targets: glow,
        scale: { from: 1.0, to: 1.35 },
        alpha: { from: 0.45, to: 0.75 },
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    if (piece.special === "bomb") {
      const glow = scene.add.image(0, 0, "particle_soft").setTint(0xffffff).setScale(1.2).setAlpha(0.5);
      this.add(glow);
      scene.tweens.add({
        targets: glow,
        scale: { from: 1.05, to: 1.4 },
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    const texture =
      piece.special === "bomb" ? "donut_bomb" : (DONUT_TEXTURES[piece.color] ?? "donut_pink");
    this.donut = scene.add.image(0, 0, texture).setScale(DONUT_SCALE);
    this.add(this.donut);

    if (piece.special === "stripedH" || piece.special === "stripedV") {
      const stripes = scene.add
        .image(0, 0, piece.special === "stripedH" ? "stripes_h" : "stripes_v")
        .setAlpha(0.9);
      this.add(stripes);
      scene.tweens.add({
        targets: stripes,
        alpha: { from: 0.55, to: 1 },
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    if (piece.special === "bomb") {
      const star = scene.add.image(0, 0, "star").setScale(0.55).setAlpha(0.9);
      this.add(star);
      scene.tweens.add({ targets: star, angle: 360, duration: 2400, repeat: -1 });
      scene.tweens.add({
        targets: this.donut,
        scale: { from: DONUT_SCALE, to: DONUT_SCALE * 1.08 },
        duration: 540,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    this.setSize(CELL, CELL);
    scene.add.existing(this);
  }

  /** Selected feedback: a happy bounce that keeps bouncing until deselected. */
  setSelected(on: boolean): void {
    this.idleTween?.remove();
    this.idleTween = null;
    if (on) {
      this.idleTween = this.scene.tweens.add({
        targets: this,
        scale: { from: 1, to: 1.12 },
        duration: 260,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
      this.setScale(1);
    }
  }

  /** Gentle "psst, try me" wobble for idle hints. */
  wobble(): void {
    this.scene.tweens.add({
      targets: this,
      angle: { from: -5, to: 5 },
      duration: 90,
      yoyo: true,
      repeat: 5,
      ease: "Sine.easeInOut",
      onComplete: () => this.setAngle(0),
    });
  }
}
