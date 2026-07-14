import Phaser from "phaser";
import type { Special } from "../engine/types";

/** Cascades climb through a bright pentatonic run, then keep climbing octaves. */
const PENTATONIC = [1, 1.125, 1.25, 1.5, 1.6875, 2, 2.25, 2.5, 3, 3.375] as const;
const POPS = ["pop_a", "pop_b", "pop_c"] as const;

/**
 * OTTM3's audio director. Every major powerup has a distinct layered sample +
 * synth signature. Sample playback remains the fallback for HTML5 Audio,
 * Canvas, muted WebAudio contexts, and browsers without oscillator support.
 */
export class Sfx {
  private readonly scene: Phaser.Scene;
  private music: Phaser.Sound.BaseSound | null = null;
  private lastLand = -Infinity;
  private gestureReady = false;
  private hapticsEnabled: boolean;
  private activeTones = 0;
  muted: boolean;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.muted = this.readSetting("ottm3.muted") === "1";
    this.hapticsEnabled = this.readSetting("ottm3.haptics") !== "0";
    this.scene.sound.mute = this.muted;

    // Phaser unlocks its own sound manager from the same gesture. We retain a
    // separate flag so vibration and hand-built oscillators can never fire
    // before the player has interacted with the page.
    this.scene.input.once("pointerdown", () => this.unlockFromGesture());
  }

  toggleMute(): boolean {
    this.unlockFromGesture();
    this.muted = !this.muted;
    this.scene.sound.mute = this.muted;
    this.writeSetting("ottm3.muted", this.muted ? "1" : "0");
    if (!this.muted) {
      if (this.music && !this.music.isPlaying) this.music.play();
      else this.startMusic();
      this.tone("sine", 660, 990, 90, 0.08);
    }
    return this.muted;
  }

  toggleHaptics(): boolean {
    this.unlockFromGesture();
    this.hapticsEnabled = !this.hapticsEnabled;
    this.writeSetting("ottm3.haptics", this.hapticsEnabled ? "1" : "0");
    if (this.hapticsEnabled) this.vibrate([10, 18, 18]);
    return this.hapticsEnabled;
  }

  startMusic(): void {
    if (this.music || !this.scene.cache.audio.exists("music")) return;
    try {
      this.music = this.scene.sound.add("music", { loop: true, volume: 0.24 });
    } catch {
      this.music = null;
      return;
    }
    const start = (): void => {
      if (this.music && !this.music.isPlaying && !this.muted) this.music.play();
    };
    if (this.scene.sound.locked) this.scene.sound.once(Phaser.Sound.Events.UNLOCKED, start);
    else start();
  }

  /** One relic detonation. The first pop also resets/raises the music heat. */
  pop(cascade: number, index: number, pan = 0): void {
    const step = Phaser.Math.Clamp(cascade - 1, 0, PENTATONIC.length - 1);
    const pitch = PENTATONIC[step] ?? 1;
    const thud = POPS[(index + cascade) % POPS.length] ?? "pop_a";
    this.play(thud, Math.min(0.62 + cascade * 0.025, 0.84), 0.92 + step * 0.035, 0, pan);
    if (index % 2 === 0) this.play("pluck", 0.5, pitch, 0, pan);
    if (cascade >= 4 && index % 3 === 0) {
      this.play("pluck_soft", 0.34, Math.min(pitch * 1.25, 3.8), 0, -pan, 0.018);
    }
    if (index === 0) {
      this.setMusicHeat(cascade);
      this.vibrate(cascade >= 5 ? [8, 10, 12] : 8);
    }
  }

  /** Cascade fanfare, synth chord, and increasingly unreasonable haptics. */
  combo(cascade: number): void {
    const sample = Phaser.Math.Clamp(cascade - 1, 1, 5);
    const pitch = PENTATONIC[Math.min(cascade - 1, PENTATONIC.length - 1)] ?? 1;
    this.play(`combo_${sample}`, Math.min(0.74 + cascade * 0.025, 1), 1 + (cascade - 2) * 0.025);
    const root = 190 * Math.min(pitch, 2.5);
    this.tone("triangle", root, root * 1.5, 180, 0.055);
    this.tone("sine", root * 1.5, root * 2, 210, 0.045, 45);
    this.tone("square", root * 2, root * 2.5, 130, 0.018, 95);
    if (cascade >= 5) this.vibrate([12, 12, 12, 12, 30 + cascade * 2]);
    else this.vibrate([8, 12, Math.min(10 + cascade * 3, 25)]);
  }

  /** Shared clear-impact layer, synchronized with camera trauma and jiggle. */
  impact(impact: number, fusion: boolean, cascade: number): void {
    const force = Phaser.Math.Clamp(impact, 0, 1);
    const heat = Phaser.Math.Clamp(cascade, 1, 10);
    this.tone(
      "sine",
      fusion ? 82 : 112 - force * 24,
      fusion ? 31 : 58,
      120 + force * 230,
      0.035 + force * (fusion ? 0.105 : 0.055),
    );
    if (force >= 0.42) {
      this.play("pop_c", 0.3 + force * 0.42, 0.72 + heat * 0.018);
    }
    if (fusion) this.vibrate([20, 14, 24, 14, 34 + Math.round(force * 26)]);
    else if (cascade >= 4) this.vibrate([10, 10, 12, 10, 18 + cascade * 2]);
  }

  swap(): void {
    this.play("swap", 0.58, 1.08);
    this.tone("sine", 180, 330, 55, 0.025);
  }

  invalid(): void {
    this.play("invalid", 0.6, 0.86);
    this.tone("square", 150, 78, 105, 0.025);
    this.vibrate([12, 24, 9]);
  }

  select(): void {
    this.play("select", 0.56, 1.14);
    this.tone("sine", 720, 980, 42, 0.025);
  }

  land(): void {
    // Sixty-four simultaneous landing sounds become mush, not spectacle.
    const now = this.scene.time.now;
    if (now - this.lastLand < 42) return;
    this.lastLand = now;
    this.play("land", 0.3, 0.92 + Math.random() * 0.22);
  }

  specialCreate(special: Special = "none"): void {
    const rates: Record<Special, number> = {
      none: 1,
      rocketH: 1.08,
      rocketV: 1.14,
      pulse: 0.9,
      nova: 1.26,
      meteor: 0.8,
      prism: 1.5,
      singularity: 0.68,
    };
    const rate = rates[special];
    this.play("special_create", special === "singularity" ? 1 : 0.88, rate);
    this.play("pluck_soft", 0.48, Math.max(0.7, rate * 1.5), 0, 0, 0.035);
    this.tone("triangle", 320 * rate, 920 * rate, 170, 0.055);
    this.vibrate(special === "singularity" ? [18, 16, 32] : [10, 16, 15]);
  }

  /** Dispatch helper for clients that want to work directly with engine names. */
  activate(special: Exclude<Special, "none">, cascade = 1): void {
    switch (special) {
      case "rocketH":
        this.rocket("h", cascade);
        return;
      case "rocketV":
        this.rocket("v", cascade);
        return;
      case "pulse":
        this.pulse(1, cascade);
        return;
      case "nova":
        this.nova(cascade);
        return;
      case "meteor":
        this.meteor(cascade);
        return;
      case "prism":
        this.prism(cascade);
        return;
      case "singularity":
        this.singularity(cascade);
        return;
    }
  }

  rocket(axis: "h" | "v" = "h", cascade = 1): void {
    const rise = Math.min(1 + (cascade - 1) * 0.055, 1.5);
    this.play("striped_fire", 0.96, axis === "h" ? rise : rise * 1.09);
    this.play("pluck", 0.44, axis === "h" ? 1.5 * rise : 2 * rise, 0, axis === "h" ? 0.35 : -0.35, 0.025);
    if (axis === "h") this.tone("sawtooth", 170, 1250, 175, 0.055, 0, 0.35);
    else this.tone("sawtooth", 1050, 210, 190, 0.055, 0, -0.35);
    this.vibrate([12, 14, 22]);
  }

  pulse(radius = 1, cascade = 1): void {
    const weight = Phaser.Math.Clamp(radius, 1, 4);
    this.play("wrapped_blast", Math.min(0.82 + weight * 0.05, 1), 0.92 - weight * 0.035);
    this.play("pop_c", 0.7, 0.72 + cascade * 0.025, 0, 0, 0.045);
    this.tone("sine", 105 - weight * 8, 42, 250 + weight * 35, 0.105);
    this.tone("triangle", 260, 610, 145, 0.035, 45);
    this.vibrate([15 + weight * 3, 18, 24 + weight * 5]);
  }

  nova(cascade = 1): void {
    const rate = Math.min(1 + cascade * 0.03, 1.4);
    this.play("wrapped_blast", 0.96, 1.08 * rate);
    this.play("striped_fire", 0.88, 0.9 * rate, 0, -0.4, 0.035);
    this.play("striped_fire", 0.88, 1.18 * rate, 0, 0.4, 0.09);
    for (let i = 0; i < 4; i++) {
      this.tone("square", 260 * (1 + i * 0.25), 740 * (1 + i * 0.18), 125, 0.025, i * 34, i % 2 ? 0.55 : -0.55);
    }
    this.vibrate([16, 12, 16, 12, 34]);
  }

  meteor(cascade = 1): void {
    const rate = Math.min(1 + cascade * 0.03, 1.35);
    // A descending whistle followed by a string of staggered ground impacts.
    this.tone("sawtooth", 1650, 130, 430, 0.05);
    this.play("striped_fire", 0.85, 0.7 * rate);
    this.play("wrapped_blast", 0.95, 0.82 * rate, 0, -0.3, 0.16);
    this.play("wrapped_blast", 0.85, 0.94 * rate, 0, 0.3, 0.32);
    this.play("pop_c", 0.7, 0.66 * rate, 0, 0, 0.46);
    this.tone("sine", 92, 36, 320, 0.1, 180);
    this.vibrate([14, 10, 20, 10, 20, 10, 32]);
  }

  prism(cascade = 1): void {
    const rate = Math.min(1 + cascade * 0.025, 1.35);
    this.play("colorbomb", 1, rate);
    this.play("pluck_soft", 0.65, 2.25 * rate, 0, -0.5, 0.035);
    this.play("pluck_soft", 0.65, 3 * rate, 0, 0.5, 0.1);
    this.tone("triangle", 230, 2300, 420, 0.07);
    this.tone("sine", 920, 1840, 300, 0.04, 80);
    this.vibrate([14, 12, 14, 12, 14, 16, 30]);
  }

  singularity(cascade = 1): void {
    const weight = Math.min(1 + cascade * 0.025, 1.25);
    this.play("colorbomb", 1, 0.58 * weight);
    this.play("wrapped_blast", 1, 0.66 * weight, 0, 0, 0.12);
    this.play("combo_5", 0.86, 0.78 * weight, 0, 0, 0.2);
    this.tone("sine", 86, 28, 610, 0.13);
    this.tone("sawtooth", 1450, 55, 720, 0.055, 25);
    this.tone("triangle", 65, 880, 320, 0.06, 360);
    this.vibrate([28, 18, 18, 18, 48]);
  }

  /** The intentionally excessive signature used by any direct powerup fusion. */
  fusion(kind: string | number = "fusion", cascade = 1): void {
    const text = String(kind);
    const tier =
      typeof kind === "number"
        ? Phaser.Math.Clamp(kind, 1, 5)
        : text.includes("singularity")
          ? 5
          : text.includes("prism")
            ? 4
            : text.includes("nova") || text.includes("meteor")
              ? 3
              : text.includes("pulse")
                ? 2
                : 1;
    const heat = Math.min(1 + (cascade - 1) * 0.04, 1.35);
    this.play("colorbomb", Math.min(0.72 + tier * 0.07, 1), (0.82 + tier * 0.06) * heat);
    this.play("wrapped_blast", Math.min(0.7 + tier * 0.06, 1), (0.88 - tier * 0.035) * heat, 0, -0.4, 0.055);
    this.play("striped_fire", 0.9, (1.02 + tier * 0.08) * heat, 0, 0.4, 0.1);
    this.play(`combo_${Math.max(3, tier)}`, 0.94, heat, 0, 0, 0.15);
    this.tone("sine", 72, 34, 430 + tier * 55, 0.13);
    this.tone("sawtooth", 180 + tier * 55, 1550 + tier * 180, 430, 0.055, 70, -0.5);
    this.tone("triangle", 1250 + tier * 100, 240 + tier * 40, 390, 0.055, 125, 0.5);
    this.vibrate([22 + tier * 3, 16, 18 + tier * 4, 14, 34 + tier * 6]);
  }

  /** A dedicated top-of-meter sting for the client's OVERDRIVE transition. */
  overdrive(level = 1): void {
    const tier = Phaser.Math.Clamp(level, 1, 5);
    this.play("levelup", 1, 1 + tier * 0.06);
    this.play("combo_5", 0.92, 1.12 + tier * 0.04, 0, 0, 0.08);
    for (let i = 0; i < 5; i++) {
      this.tone("square", 220 * (1 + i * 0.25), 660 * (1 + i * 0.2), 170, 0.027, i * 55, i % 2 ? 0.7 : -0.7);
    }
    this.vibrate([12, 10, 12, 10, 12, 10, 48]);
  }

  // Legacy names retained while GameScene is migrated to the new vocabulary.
  stripedFire(): void {
    this.rocket();
  }

  wrappedBlast(): void {
    this.pulse();
  }

  colorBomb(): void {
    this.prism();
  }

  shuffle(): void {
    this.play("shuffle", 0.82, 1.04);
    this.tone("triangle", 190, 760, 340, 0.05);
    this.vibrate([8, 16, 8, 16, 12]);
  }

  milestone(): void {
    this.play("levelup", 0.98, 1.08);
    this.tone("square", 330, 1320, 280, 0.04);
    this.vibrate([12, 12, 24]);
  }

  start(): void {
    this.play("start", 0.78, 1.04);
    this.tone("triangle", 130, 780, 380, 0.045, 45);
  }

  private setMusicHeat(cascade: number): void {
    if (!this.music) return;
    const heat = Phaser.Math.Clamp(cascade - 1, 0, 8);
    // BaseSound omits implementation-specific controls from its declaration,
    // although every concrete Phaser sound exposes them at runtime.
    const adjustable = this.music as Phaser.Sound.BaseSound & {
      setRate(value: number): unknown;
      setVolume(value: number): unknown;
    };
    adjustable.setRate(1 + heat * 0.018);
    adjustable.setVolume(Math.min(0.24 + heat * 0.018, 0.38));
  }

  private play(
    key: string,
    volume = 1,
    rate = 1,
    detune = 0,
    pan = 0,
    delay = 0,
  ): void {
    if (this.muted || !this.scene.cache.audio.exists(key)) return;
    try {
      this.scene.sound.play(key, {
        volume: Phaser.Math.Clamp(volume, 0, 1),
        rate: Phaser.Math.Clamp(rate, 0.25, 4),
        detune,
        pan: Phaser.Math.Clamp(pan, -1, 1),
        delay: Math.max(0, delay),
      });
    } catch {
      // Audio is enhancement, never a reason to interrupt the board resolver.
    }
  }

  private tone(
    type: OscillatorType,
    fromHz: number,
    toHz: number,
    durationMs: number,
    volume: number,
    delayMs = 0,
    pan = 0,
  ): void {
    if (this.muted || !this.gestureReady || this.activeTones >= 24) return;
    const manager = this.webAudioManager();
    if (!manager || manager.context.state !== "running") return;

    this.activeTones++;
    try {
      const context = manager.context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + Math.max(0, delayMs) / 1000;
      const end = start + Math.max(30, durationMs) / 1000;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(Math.max(20, fromHz), start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), end);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);

      let output: AudioNode = gain;
      if (typeof context.createStereoPanner === "function") {
        const panner = context.createStereoPanner();
        panner.pan.setValueAtTime(Phaser.Math.Clamp(pan, -1, 1), start);
        gain.connect(panner);
        output = panner;
      }
      output.connect(manager.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        if (output !== gain) output.disconnect();
        this.activeTones = Math.max(0, this.activeTones - 1);
      };
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    } catch {
      this.activeTones = Math.max(0, this.activeTones - 1);
    }
  }

  private webAudioManager(): Phaser.Sound.WebAudioSoundManager | null {
    const manager = this.scene.sound;
    if ("context" in manager && "destination" in manager) {
      return manager as Phaser.Sound.WebAudioSoundManager;
    }
    return null;
  }

  private unlockFromGesture(): void {
    this.gestureReady = true;
    const manager = this.webAudioManager();
    if (manager?.context.state === "suspended") {
      void manager.context.resume().catch(() => undefined);
    }
  }

  private vibrate(pattern: number | number[]): void {
    if (!this.gestureReady || !this.hapticsEnabled) return;
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Safari, embedded webviews, and permission policies may reject this.
    }
  }

  private readSetting(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private writeSetting(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Private browsing/storage denial should not affect play.
    }
  }
}
