// Babylon scene setup for the "Gravity Wells" board: a perspective camera with
// a gentle 2.5D tilt that can be violently shaken, dim lighting so the gems' own
// glow carries the image, a deep-space nebula backdrop with a parallax
// starfield and drifting dust, a glow layer for emissive bodies, and punchy
// bloom + chromatic-aberration + vignette + grain post-processing.

import {
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PointLight,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  Vector3,
} from '@babylonjs/core';
import { CONFIG } from '../config';

export class SceneManager {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly glow: GlowLayer;
  readonly shadowGen: ShadowGenerator;
  readonly keyLight: DirectionalLight;
  private fitSpan = Math.max(CONFIG.COLS, CONFIG.ROWS) + 1.6;

  // Trauma-based screen shake state.
  private trauma = 0;
  private shakeTime = 0;
  private readonly baseAlpha = -Math.PI / 2;
  private readonly baseBeta = Math.PI / 2 - CONFIG.CAMERA_TILT;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: true,
    });
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.01, 0.012, 0.03, 1);
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.exposure = 1.0;
    this.scene = scene;

    // --- Camera: fixed front view, slight 2.5D tilt, no user control ---
    this.camera = new ArcRotateCamera(
      'cam',
      this.baseAlpha,
      this.baseBeta,
      CONFIG.CAMERA_DISTANCE,
      Vector3.Zero(),
      scene
    );
    this.camera.fov = 0.72;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 200;

    // --- Lighting: dim, cool, so the bodies' own emission carries the frame ---
    const ambient = new HemisphericLight('ambient', new Vector3(0.2, 1, -0.3), scene);
    ambient.intensity = 0.42;
    ambient.diffuse = new Color3(0.7, 0.78, 1.0);
    ambient.groundColor = new Color3(0.1, 0.08, 0.2);

    this.keyLight = new DirectionalLight('key', new Vector3(-0.5, -0.8, 1), scene);
    this.keyLight.position = new Vector3(6, 9, -9);
    this.keyLight.intensity = 1.15;
    this.keyLight.diffuse = new Color3(0.95, 0.92, 1.0);

    const rim = new PointLight('rim', new Vector3(0, 0, -6), scene);
    rim.intensity = 0.4;
    rim.diffuse = new Color3(0.5, 0.7, 1.0);

    // --- Soft shadows onto the nebula backdrop for grounding ---
    this.shadowGen = new ShadowGenerator(1024, this.keyLight);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.blurKernel = 32;
    this.shadowGen.darkness = 0.6;

    this.buildBackdrop(scene);
    this.buildStarfield(scene);
    this.buildDust(scene);
    this.scheduleShootingStars(scene);

    // --- Glow layer for emissive bodies / specials ---
    this.glow = new GlowLayer('glow', scene, { blurKernelSize: 64 });
    this.glow.intensity = 0.45;

    // --- Post-processing ---
    const pipeline = new DefaultRenderingPipeline('post', true, scene, [this.camera]);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.9;
    pipeline.bloomWeight = 0.4;
    pipeline.bloomKernel = 64;
    pipeline.bloomScale = 0.6;
    pipeline.chromaticAberrationEnabled = true;
    pipeline.chromaticAberration.aberrationAmount = 8;
    pipeline.chromaticAberration.radialIntensity = 0.6;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 3.0;
    pipeline.imageProcessing.vignetteColor = new Color4(0.0, 0.0, 0.02, 1);
    pipeline.grainEnabled = true;
    pipeline.grain.intensity = 8;
    pipeline.grain.animated = true;
    pipeline.imageProcessing.contrast = 1.2;

    // Drive the screen-shake every frame, decaying trauma over time.
    scene.onBeforeRenderObservable.add(() => this.tickShake());

    this.fitCamera();
    window.addEventListener('resize', () => {
      this.engine.resize();
      this.fitCamera();
    });
  }

  /** Nebula gradient plane behind the board that also catches shadows. */
  private buildBackdrop(scene: Scene): void {
    const size = this.fitSpan * 2.8;
    const plane = MeshBuilder.CreatePlane('backdrop', { size }, scene);
    plane.position.z = 2.0;

    const tex = new Texture(this.nebulaDataUrl(), scene);
    const mat = new StandardMaterial('backdropMat', scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.emissiveColor = new Color3(0.22, 0.22, 0.32);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = false;
    plane.material = mat;
    plane.receiveShadows = true;
    plane.isPickable = false;
  }

  /** A deep-space nebula: dark base with a few soft coloured clouds and a dense
   *  field of baked pinprick stars. Cheap (one texture), and the bright clouds
   *  echo the gem palette so the board feels at home in its sky. */
  private nebulaDataUrl(): string {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;

    // Base void.
    ctx.fillStyle = '#04030c';
    ctx.fillRect(0, 0, S, S);

    // Soft coloured nebula clouds (screen-blended for that gaseous glow).
    ctx.globalCompositeOperation = 'screen';
    const clouds: [number, number, number, string][] = [
      [0.32, 0.34, 0.55, 'rgba(120,40,160,0.55)'], // violet
      [0.7, 0.62, 0.62, 'rgba(20,90,150,0.5)'], // blue
      [0.55, 0.28, 0.42, 'rgba(150,30,110,0.4)'], // magenta
      [0.2, 0.72, 0.4, 'rgba(20,120,120,0.35)'], // teal
    ];
    for (const [x, y, r, col] of clouds) {
      const g = ctx.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * S);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }

    // A subtle central vignette of light so the board sits in a clearing.
    const cg = ctx.createRadialGradient(S / 2, S * 0.46, S * 0.05, S / 2, S / 2, S * 0.6);
    cg.addColorStop(0, 'rgba(60,70,120,0.4)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, S, S);

    // Baked stars.
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      const r = Math.random() < 0.92 ? Math.random() * 1.1 + 0.2 : Math.random() * 2.2 + 1;
      const a = 0.3 + Math.random() * 0.7;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return c.toDataURL();
  }

  /** A foreground layer of brighter, slowly twinkling parallax stars. */
  private buildStarfield(scene: Scene): void {
    const ps = new ParticleSystem('stars', 260, scene);
    ps.particleTexture = new Texture(this.dotDataUrl(), scene);
    ps.emitter = new Vector3(0, 0, 1.4);
    ps.minEmitBox = new Vector3(-this.fitSpan * 1.4, -this.fitSpan * 1.4, 0);
    ps.maxEmitBox = new Vector3(this.fitSpan * 1.4, this.fitSpan * 1.4, 0.6);
    ps.color1 = new Color4(0.8, 0.85, 1.0, 0.9);
    ps.color2 = new Color4(1.0, 0.9, 0.8, 0.7);
    ps.colorDead = new Color4(0.6, 0.7, 1.0, 0);
    ps.minSize = 0.02;
    ps.maxSize = 0.1;
    ps.minLifeTime = 5;
    ps.maxLifeTime = 9;
    ps.emitRate = 40;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.direction1 = new Vector3(-0.02, 0, 0);
    ps.direction2 = new Vector3(0.02, 0, 0);
    ps.minEmitPower = 0.01;
    ps.maxEmitPower = 0.04;
    ps.updateSpeed = 0.02;
    ps.start();
  }

  /** Slow-drifting motes of coloured dust for a living, gaseous foreground. */
  private buildDust(scene: Scene): void {
    const ps = new ParticleSystem('dust', 220, scene);
    ps.particleTexture = new Texture(this.dotDataUrl(), scene);
    ps.emitter = new Vector3(0, -this.fitSpan, 0.9);
    ps.minEmitBox = new Vector3(-this.fitSpan, 0, -0.5);
    ps.maxEmitBox = new Vector3(this.fitSpan, 0, 0.5);
    ps.color1 = new Color4(0.7, 0.4, 1.0, 0.4);
    ps.color2 = new Color4(0.3, 0.8, 1.0, 0.28);
    ps.colorDead = new Color4(0.5, 0.3, 0.9, 0);
    ps.minSize = 0.05;
    ps.maxSize = 0.2;
    ps.minLifeTime = 9;
    ps.maxLifeTime = 18;
    ps.emitRate = 12;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 0.16, 0);
    ps.direction1 = new Vector3(-0.12, 0.3, 0);
    ps.direction2 = new Vector3(0.12, 0.5, 0);
    ps.minEmitPower = 0.05;
    ps.maxEmitPower = 0.18;
    ps.updateSpeed = 0.02;
    ps.start();
  }

  /** Occasionally streak a shooting star across the sky. */
  private scheduleShootingStars(scene: Scene): void {
    const fire = () => {
      const span = this.fitSpan;
      const fromTop = Math.random() < 0.5;
      const startP = new Vector3(
        (Math.random() * 2 - 1) * span,
        (fromTop ? 1 : -1) * span,
        1.0
      );
      const dir = new Vector3((Math.random() - 0.5) * 1.4, fromTop ? -1 : 1, 0).normalize();

      const ps = new ParticleSystem('shoot', 60, scene);
      ps.particleTexture = new Texture(this.dotDataUrl(), scene);
      ps.emitter = startP.clone();
      ps.color1 = new Color4(1, 1, 1, 1);
      ps.color2 = new Color4(0.7, 0.85, 1.0, 0.9);
      ps.colorDead = new Color4(0.6, 0.7, 1.0, 0);
      ps.minSize = 0.04;
      ps.maxSize = 0.14;
      ps.minLifeTime = 0.35;
      ps.maxLifeTime = 0.6;
      ps.emitRate = 120;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.direction1 = dir.scale(-1);
      ps.direction2 = dir.scale(-1);
      ps.minEmitPower = 1;
      ps.maxEmitPower = 2;
      ps.updateSpeed = 0.02;
      ps.start();

      const speed = 16 + Math.random() * 10;
      const start = performance.now();
      const life = 700;
      const obs = scene.onBeforeRenderObservable.add(() => {
        const t = performance.now() - start;
        const dt = this.engine.getDeltaTime() / 1000;
        (ps.emitter as Vector3).addInPlace(dir.scale(speed * dt));
        if (t > life) {
          ps.stop();
          scene.onBeforeRenderObservable.remove(obs);
          setTimeout(() => ps.dispose(), 800);
        }
      });
      schedule();
    };
    const schedule = () => setTimeout(fire, 3500 + Math.random() * 7000);
    schedule();
  }

  private dotDataUrl(): string {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return c.toDataURL();
  }

  /** World position for a board cell. Row 0 is the top row. */
  gridToWorld(r: number, c: number): Vector3 {
    return new Vector3(c - (CONFIG.COLS - 1) / 2, (CONFIG.ROWS - 1) / 2 - r, 0);
  }

  /** Adjust camera radius so the whole board fits any aspect ratio. */
  fitCamera(): void {
    const aspect = this.engine.getRenderWidth() / this.engine.getRenderHeight();
    const halfFov = this.camera.fov / 2;
    const rForHeight = this.fitSpan / 2 / Math.tan(halfFov);
    const rForWidth = this.fitSpan / 2 / (Math.tan(halfFov) * aspect);
    this.camera.radius = Math.max(rForHeight, rForWidth);
  }

  registerShadowCaster(mesh: Mesh): void {
    this.shadowGen.addShadowCaster(mesh, false);
  }

  removeShadowCaster(mesh: Mesh): void {
    this.shadowGen.removeShadowCaster(mesh, false);
  }

  /** Add trauma to the screen shake. It decays and is felt as the square of the
   *  remaining trauma, so small knocks read soft and big ones read violent. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  private tickShake(): void {
    const dt = this.engine.getDeltaTime() / 1000;
    if (this.trauma <= 0) return;
    this.shakeTime += dt;
    const s = this.trauma * this.trauma;
    const t = this.shakeTime;
    // Smooth multi-frequency wobble in position and a touch of camera roll.
    const nx = Math.sin(t * 37.1) + 0.6 * Math.sin(t * 71.3);
    const ny = Math.sin(t * 43.7) + 0.6 * Math.sin(t * 67.9);
    this.camera.target.x = nx * 0.26 * s;
    this.camera.target.y = ny * 0.26 * s;
    this.camera.alpha = this.baseAlpha + Math.sin(t * 59.0) * 0.03 * s;
    this.camera.beta = this.baseBeta + Math.cos(t * 53.0) * 0.025 * s;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    if (this.trauma === 0) {
      this.camera.target.set(0, 0, 0);
      this.camera.alpha = this.baseAlpha;
      this.camera.beta = this.baseBeta;
    }
  }

  start(loop: (dt: number) => void): void {
    this.engine.runRenderLoop(() => {
      const dt = this.engine.getDeltaTime() / 1000;
      loop(Math.min(dt, 0.05));
      this.scene.render();
    });
  }
}
