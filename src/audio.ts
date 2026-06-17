// Procedural audio. No sample files — everything is synthesised with the Web
// Audio API so the build stays tiny and works offline on GitHub Pages. The
// palette is deliberately calm: soft sine/triangle bells tuned to a major
// pentatonic scale, gentle filtered noise for whooshes, and a warm pad bed.

// Major pentatonic (C) across a couple of octaves — every note is consonant
// with every other, so cascades always sound pleasant no matter the timing.
const PENTATONIC = [
  261.63, 293.66, 329.63, 392.0, 440.0, // C D E G A
  523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5, 1174.66, 1318.51,
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private muted = false;

  /** Must be called from a user gesture (browser autoplay policy). */
  init(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);

    // A short synthetic plate reverb for a soft, spacious tail.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.6);
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.35;
    this.reverb.connect(reverbGain).connect(this.master);
    this.reverbSend = reverbGain;
  }

  private reverbSend!: GainNode;

  resume(): void {
    this.ctx?.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private makeImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  private now(): number {
    return this.ctx!.currentTime;
  }

  /** One bell voice: an enveloped oscillator with a touch of detune and reverb. */
  private bell(freq: number, opts: { gain?: number; type?: OscillatorType; attack?: number; release?: number; pan?: number } = {}): void {
    if (!this.ctx || this.muted) return;
    const { gain = 0.22, type = 'sine', attack = 0.005, release = 0.9, pan = 0 } = opts;
    const t = this.now();

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const osc2 = this.ctx.createOscillator();
    osc2.type = type;
    osc2.frequency.value = freq * 2.001; // shimmer overtone

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    const overtone = this.ctx.createGain();
    overtone.gain.value = 0.18;
    osc2.connect(overtone).connect(g);
    osc.connect(g);
    g.connect(panner);
    panner.connect(this.master);
    panner.connect(this.reverbSend);

    osc.start(t);
    osc2.start(t);
    osc.stop(t + attack + release + 0.05);
    osc2.stop(t + attack + release + 0.05);
  }

  /** Soft filtered-noise whoosh for swaps. */
  private whoosh(intensity = 1, pan = 0): void {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const dur = 0.22;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(2200 * intensity, t + dur);
    filter.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1 * intensity, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(filter).connect(g).connect(panner).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  // --- Public game cues --------------------------------------------------

  select(): void {
    this.bell(PENTATONIC[4], { gain: 0.12, type: 'triangle', release: 0.4 });
  }

  swap(pan = 0): void {
    this.whoosh(1, pan);
  }

  swapBack(pan = 0): void {
    this.whoosh(0.7, pan);
    this.bell(PENTATONIC[1], { gain: 0.08, type: 'triangle', release: 0.3 });
  }

  /** A match clears: play a rising arpeggio whose pitch climbs with the
   *  cascade level, so longer chains feel euphoric without getting loud. */
  match(comboLevel: number, gemCount: number, pan = 0): void {
    const base = Math.min(comboLevel, 6);
    const notes = Math.min(gemCount, 5);
    for (let i = 0; i < notes; i++) {
      const idx = Math.min(PENTATONIC.length - 1, base + i + 2);
      setTimeout(() => this.bell(PENTATONIC[idx], { gain: 0.16, release: 0.8, pan }), i * 45);
    }
  }

  /** A special gem is created — a brighter, fuller chord. */
  special(pan = 0): void {
    this.bell(PENTATONIC[5], { gain: 0.18, release: 1.1, pan });
    this.bell(PENTATONIC[7], { gain: 0.14, release: 1.1, pan: pan + 0.1 });
    this.bell(PENTATONIC[9], { gain: 0.1, release: 1.2, pan: pan - 0.1 });
  }

  /** A supernova detonates — a deep gravitational collapse: a sub-bass drop, a
   *  filtered-noise shock, and a consonant bell over the top. */
  detonate(): void {
    if (!this.ctx || this.muted) return;
    const t = this.now();

    // Sub-bass plunge (the "weight" of the collapse).
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(160, t);
    sub.frequency.exponentialRampToValueAtTime(38, t + 0.6);
    const subG = this.ctx.createGain();
    subG.gain.setValueAtTime(0.0001, t);
    subG.gain.linearRampToValueAtTime(0.38, t + 0.02);
    subG.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    sub.connect(subG).connect(this.master);
    sub.connect(subG).connect(this.reverbSend);
    sub.start(t);
    sub.stop(t + 0.8);

    // Noise shockwave, swept downward — the blast front.
    const dur = 0.5;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(3200, t);
    filt.frequency.exponentialRampToValueAtTime(180, t + dur);
    const nG = this.ctx.createGain();
    nG.gain.setValueAtTime(0.0001, t);
    nG.gain.linearRampToValueAtTime(0.22, t + 0.015);
    nG.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(nG).connect(this.master);
    src.connect(nG).connect(this.reverbSend);
    src.start(t);
    src.stop(t + dur);

    this.bell(PENTATONIC[2], { gain: 0.16, release: 1.5 });
  }

  /** Gentle "no" for an illegal move. */
  invalid(): void {
    this.bell(PENTATONIC[0] * 0.97, { gain: 0.07, type: 'triangle', release: 0.25 });
  }

  /** A slow, spacious drone, triggered occasionally — distant and cosmic. */
  ambientPad(): void {
    if (!this.ctx || this.muted) return;
    const root = PENTATONIC[0] * 0.5; // an octave down for a deeper bed
    [1, 1.5, 2, 3].forEach((mult, i) =>
      this.bell(root * mult, { gain: 0.035, type: 'sine', attack: 2.4, release: 6, pan: (i - 1.5) * 0.6 })
    );
  }
}

export const audio = new AudioEngine();
