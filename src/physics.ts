// A small, bespoke soft-body spring engine. This replaces the old Matter.js
// rigid-body physics. For a *calm* match-3 the satisfying part isn't rigid
// collisions — it's the organic squash, stretch and settle of each gem. So
// every gem is driven by damped harmonic springs we can shape precisely.

/** A single damped harmonic oscillator: value chases `target` like it's on a
 *  spring with the given stiffness, bleeding energy via `damping`. */
export class Spring {
  value: number;
  velocity = 0;
  target: number;

  constructor(
    initial: number,
    public stiffness: number,
    public damping: number
  ) {
    this.value = initial;
    this.target = initial;
  }

  /** Jolt the spring's velocity — used for landing bounces and pops. */
  impulse(v: number): this {
    this.velocity += v;
    return this;
  }

  /** Hard-set without motion. */
  set(v: number): this {
    this.value = v;
    this.target = v;
    this.velocity = 0;
    return this;
  }

  setTarget(v: number): this {
    this.target = v;
    return this;
  }

  /** Semi-implicit Euler step. Sub-stepped by the caller for stability when
   *  frame times spike. Returns the new value. */
  step(dt: number): number {
    const accel = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    return this.value;
  }

  /** True once the spring has effectively come to rest at its target. */
  atRest(epsilon = 0.0008): boolean {
    return Math.abs(this.velocity) < epsilon && Math.abs(this.value - this.target) < epsilon;
  }
}

/**
 * Soft-body deformation state for one gem. Tracks a "squash" scalar that maps
 * to anisotropic scaling: positive squash = flatter & wider (just landed),
 * negative = taller & thinner (being stretched up while falling fast). The
 * scalar is itself a spring so deformation always eases back to round.
 */
export class SoftBody {
  /** -1 .. +1-ish. 0 means perfectly round. */
  readonly squash: Spring;
  /** Uniform scale multiplier spring (selection pops, match swell). */
  readonly scale: Spring;

  constructor(stiffness: number, damping: number) {
    this.squash = new Spring(0, stiffness, damping);
    this.scale = new Spring(1, stiffness * 1.3, damping * 0.9);
  }

  /** Squash on impact. `strength` typically scales with landing speed. */
  land(strength: number): void {
    this.squash.set(strength);
    this.squash.setTarget(0);
    this.scale.impulse(strength * 0.6);
  }

  pop(amount: number): void {
    this.scale.impulse(amount);
  }

  step(dt: number): void {
    this.squash.step(dt);
    this.scale.step(dt);
  }

  /** Convert current state into per-axis scale factors. Volume is roughly
   *  preserved so squash looks like a real soft body. */
  scales(): { x: number; y: number; z: number } {
    const s = this.squash.value;
    const u = this.scale.value;
    const wide = 1 + s * 0.45;
    const tall = 1 - s * 0.45;
    return { x: u * wide, y: u * tall, z: u * (1 + Math.abs(s) * 0.1) };
  }
}
