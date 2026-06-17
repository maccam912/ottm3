// A small, bespoke physics engine — no external dependency, so the game still
// ships as one tiny offline static site. It is "real" in the sense that matters
// for feel: every body integrates genuine Newtonian forces, impulses and
// torque each frame. Gems are spring-anchored to their grid cell, but they are
// free to be knocked off it, flung by blast waves, spun up, and sucked toward
// collapsing stars (gravity wells) before the anchor reels them back in.

// ---------------------------------------------------------------------------
// Damped harmonic oscillator (scalar). Used for squash/scale where we just want
// a value to chase a target on a spring.
// ---------------------------------------------------------------------------
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

  step(dt: number): number {
    const accel = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    return this.value;
  }

  atRest(epsilon = 0.0008): boolean {
    return Math.abs(this.velocity) < epsilon && Math.abs(this.value - this.target) < epsilon;
  }
}

// ---------------------------------------------------------------------------
// GemBody — a 2D point mass with orientation. This is the rigid-body core for a
// gem: it lives at a grid anchor via a stiff spring, but accumulates real
// external forces (gravity wells, drag), takes linear/angular impulses, and
// spins freely with angular damping. Sub-stepped for stability when frames
// spike.
// ---------------------------------------------------------------------------
export class GemBody {
  // Linear state (offset from, then absolute, world position).
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  // Where the grid wants this gem to sit.
  ax: number;
  ay: number;

  // Angular state.
  angle: number;
  spin = 0; // angular velocity, rad/s
  /** Per-gem gentle baseline drift so nothing is ever perfectly static. */
  idleSpin: number;

  // Accumulated force for the current step (reset after integration).
  private fx = 0;
  private fy = 0;

  constructor(
    x: number,
    y: number,
    public stiffness: number,
    public damping: number,
    public angDamping: number,
    private maxSpin: number,
    idleSpin: number
  ) {
    this.x = this.ax = x;
    this.y = this.ay = y;
    this.angle = Math.random() * Math.PI * 2;
    // Half the gems drift clockwise, half anticlockwise.
    this.idleSpin = (Math.random() < 0.5 ? -1 : 1) * idleSpin * (0.5 + Math.random());
  }

  /** Move the grid anchor (the rest position the spring pulls toward). */
  anchor(x: number, y: number): void {
    this.ax = x;
    this.ay = y;
  }

  /** Teleport, killing all motion. */
  place(x: number, y: number): void {
    this.x = this.ax = x;
    this.y = this.ay = y;
    this.vx = this.vy = 0;
    this.spin = 0;
  }

  /** Instantaneous change in velocity (mass = 1). */
  impulse(ix: number, iy: number): void {
    this.vx += ix;
    this.vy += iy;
  }

  /** Instantaneous change in angular velocity. */
  spinUp(s: number): void {
    this.spin += s;
  }

  /** A continuous force applied this frame (accumulates with others). */
  addForce(fx: number, fy: number): void {
    this.fx += fx;
    this.fy += fy;
  }

  /** Pull toward (or, with negative strength, blast away from) a point — an
   *  inverse-square-ish gravity well, softened near the centre so it never
   *  explodes numerically. Returns the distance for the caller's convenience. */
  attract(cx: number, cy: number, strength: number, softening = 0.6): number {
    const dx = cx - this.x;
    const dy = cy - this.y;
    const d2 = dx * dx + dy * dy + softening * softening;
    const d = Math.sqrt(d2);
    const f = strength / d2;
    this.fx += (dx / d) * f;
    this.fy += (dy / d) * f;
    return d;
  }

  /** Integrate one full step (sub-stepped internally for stiff springs). */
  step(dt: number): void {
    const sub = 2;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      // Anchor spring + damping + accumulated external force.
      const ax = -this.stiffness * (this.x - this.ax) - this.damping * this.vx + this.fx;
      const ay = -this.stiffness * (this.y - this.ay) - this.damping * this.vy + this.fy;
      this.vx += ax * h;
      this.vy += ay * h;
      this.x += this.vx * h;
      this.y += this.vy * h;

      // Spin eases toward its gentle idle drift, with angular drag on top so a
      // blast's torque bleeds off smoothly.
      this.spin += (this.idleSpin - this.spin) * this.angDamping * h;
      if (this.spin > this.maxSpin) this.spin = this.maxSpin;
      else if (this.spin < -this.maxSpin) this.spin = -this.maxSpin;
      this.angle += this.spin * h;
    }
    this.fx = this.fy = 0;
  }

  /** Roughly settled at its anchor and drifting only gently. */
  atRest(): boolean {
    const off = Math.hypot(this.x - this.ax, this.y - this.ay);
    const vel = Math.hypot(this.vx, this.vy);
    return off < 0.012 && vel < 0.04;
  }
}

// ---------------------------------------------------------------------------
// SoftBody — squash/stretch deformation on top of the rigid motion. Positive
// squash = flatter & wider (just landed / compressed), negative = taller &
// thinner (stretched). Volume is roughly preserved so it reads like jelly.
// ---------------------------------------------------------------------------
export class SoftBody {
  readonly squash: Spring;
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

  /** Per-axis scale factors. */
  scales(): { x: number; y: number; z: number } {
    const s = this.squash.value;
    const u = this.scale.value;
    const wide = 1 + s * 0.5;
    const tall = 1 - s * 0.5;
    return { x: u * wide, y: u * tall, z: u * (1 + Math.abs(s) * 0.12) };
  }
}

// ---------------------------------------------------------------------------
// Free-floating debris particle — a genuinely free rigid body (no anchor) used
// for supernova chunks. Integrates velocity, drag, spin and any gravity-well
// pull applied by the caller. Pure data; the renderer maps it to a mesh.
// ---------------------------------------------------------------------------
export class Debris {
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  spinAxis: { x: number; y: number; z: number };
  life = 0;

  constructor(
    public x: number,
    public y: number,
    public z: number,
    speed: number,
    public readonly ttl: number,
    public readonly drag = 1.1
  ) {
    // Random direction, biased outward in the screen plane.
    const a = Math.random() * Math.PI * 2;
    const elev = (Math.random() - 0.5) * 0.9;
    const sp = speed * (0.5 + Math.random());
    this.vx = Math.cos(a) * sp;
    this.vy = Math.sin(a) * sp;
    this.vz = elev * sp * 0.5 - 0.4; // tend toward the camera a touch
    this.spin = (Math.random() - 0.5) * 18;
    const ax = Math.random() - 0.5;
    const ay = Math.random() - 0.5;
    const az = Math.random() - 0.5;
    const m = Math.hypot(ax, ay, az) || 1;
    this.spinAxis = { x: ax / m, y: ay / m, z: az / m };
  }

  /** @returns false once the particle has expired. */
  step(dt: number, gravityY = -6): boolean {
    this.life += dt;
    if (this.life >= this.ttl) return false;
    this.vx -= this.vx * this.drag * dt;
    this.vy += gravityY * dt - this.vy * this.drag * dt;
    this.vz -= this.vz * this.drag * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    return true;
  }

  fade(): number {
    return 1 - this.life / this.ttl;
  }
}
