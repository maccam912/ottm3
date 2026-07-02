import Phaser from "phaser";

/**
 * All game audio. The core dopamine trick: cascade pops climb a major
 * pentatonic scale, so every chain reaction literally plays a rising melody.
 */
const PENTATONIC = [1, 1.125, 1.25, 1.5, 1.6875, 2, 2.25, 2.5] as const;

export class Sfx {
  private scene: Phaser.Scene;
  private music: Phaser.Sound.BaseSound | null = null;
  private lastLand = 0;
  muted: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.muted = localStorage.getItem("glaze.muted") === "1";
    this.scene.sound.mute = this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.scene.sound.mute = this.muted;
    localStorage.setItem("glaze.muted", this.muted ? "1" : "0");
    return this.muted;
  }

  startMusic(): void {
    if (this.music) return;
    this.music = this.scene.sound.add("music", { loop: true, volume: 0.18 });
    const start = (): void => {
      if (this.music && !this.music.isPlaying) this.music.play();
    };
    if (this.scene.sound.locked) {
      this.scene.sound.once(Phaser.Sound.Events.UNLOCKED, start);
    } else {
      start();
    }
  }

  private play(key: string, volume = 1, rate = 1, detune = 0): void {
    this.scene.sound.play(key, { volume, rate, detune });
  }

  /** One matched piece popping. Pitch climbs with cascade depth. */
  pop(cascade: number, index: number): void {
    const step = Math.min(cascade - 1, PENTATONIC.length - 1);
    const rate = (PENTATONIC[step] ?? 1) * (0.98 + Math.random() * 0.04);
    const thud = ["pop_a", "pop_b", "pop_c"][Math.floor(Math.random() * 3)] ?? "pop_a";
    this.play(thud, 0.55, 0.9 + 0.1 * rate);
    // Musical layer: a pluck per pop, but keep it sparse within one clear.
    if (index % 2 === 0) this.play("pluck", 0.5, rate);
  }

  /** Cascade fanfare (cascade >= 2). */
  combo(cascade: number): void {
    const n = Math.min(cascade - 1, 5);
    this.play(`combo_${n}`, 0.75);
  }

  swap(): void {
    this.play("swap", 0.5, 1.05);
  }

  invalid(): void {
    this.play("invalid", 0.45, 0.9);
  }

  select(): void {
    this.play("select", 0.5, 1.1);
  }

  land(): void {
    // Landing ticks are charming but must never become a hailstorm.
    const now = this.scene.time.now;
    if (now - this.lastLand < 50) return;
    this.lastLand = now;
    this.play("land", 0.25, 0.9 + Math.random() * 0.25);
  }

  specialCreate(): void {
    this.play("special_create", 0.8);
  }

  stripedFire(): void {
    this.play("striped_fire", 0.7);
  }

  wrappedBlast(): void {
    this.play("wrapped_blast", 0.8, 0.95);
  }

  colorBomb(): void {
    this.play("colorbomb", 0.9);
  }

  shuffle(): void {
    this.play("shuffle", 0.7);
  }

  milestone(): void {
    this.play("levelup", 0.85);
  }

  start(): void {
    this.play("start", 0.6);
  }
}
