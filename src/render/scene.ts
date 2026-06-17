// Babylon scene setup for the 2.5D board: a perspective camera with a gentle
// downward tilt, soft three-point-ish lighting, a glow layer for the special
// gems, bloom + vignette post-processing, and a calm atmospheric backdrop.

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

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: true,
      antialias: true,
    });
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.04, 0.05, 0.11, 1);
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.exposure = 1.05;
    this.scene = scene;

    // --- Camera: fixed front view, slight 2.5D tilt, no user control ---
    this.camera = new ArcRotateCamera(
      'cam',
      -Math.PI / 2,
      Math.PI / 2 - CONFIG.CAMERA_TILT,
      CONFIG.CAMERA_DISTANCE,
      Vector3.Zero(),
      scene
    );
    this.camera.fov = 0.72;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 100;

    // --- Lighting ---
    const ambient = new HemisphericLight('ambient', new Vector3(0.2, 1, -0.3), scene);
    ambient.intensity = 0.55;
    ambient.diffuse = new Color3(0.8, 0.85, 1.0);
    ambient.groundColor = new Color3(0.18, 0.16, 0.3);

    this.keyLight = new DirectionalLight('key', new Vector3(-0.5, -0.8, 1), scene);
    this.keyLight.position = new Vector3(6, 9, -9);
    this.keyLight.intensity = 1.1;
    this.keyLight.diffuse = new Color3(1.0, 0.96, 0.9);

    const rim = new PointLight('rim', new Vector3(0, 0, -6), scene);
    rim.intensity = 0.35;
    rim.diffuse = new Color3(0.5, 0.7, 1.0);

    // --- Soft shadows onto a backdrop plane for a grounded, premium feel ---
    this.shadowGen = new ShadowGenerator(1024, this.keyLight);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.blurKernel = 32;
    this.shadowGen.darkness = 0.55;

    this.buildBackdrop(scene);
    this.buildAtmosphere(scene);

    // --- Glow layer for emissive specials ---
    this.glow = new GlowLayer('glow', scene, { blurKernelSize: 48 });
    this.glow.intensity = 0.85;

    // --- Post-processing: bloom + vignette + grain + FXAA ---
    const pipeline = new DefaultRenderingPipeline('post', true, scene, [this.camera]);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.62;
    pipeline.bloomWeight = 0.5;
    pipeline.bloomKernel = 64;
    pipeline.bloomScale = 0.6;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 2.4;
    pipeline.imageProcessing.vignetteColor = new Color4(0.02, 0.02, 0.06, 1);
    pipeline.grainEnabled = true;
    pipeline.grain.intensity = 6;
    pipeline.grain.animated = true;
    pipeline.imageProcessing.contrast = 1.12;

    this.fitCamera();
    window.addEventListener('resize', () => {
      this.engine.resize();
      this.fitCamera();
    });
  }

  /** Big soft-gradient plane sitting behind the board to catch shadows. */
  private buildBackdrop(scene: Scene): void {
    const size = this.fitSpan * 2.6;
    const plane = MeshBuilder.CreatePlane('backdrop', { size }, scene);
    plane.position.z = 1.6;

    const tex = new Texture(this.gradientDataUrl(), scene);
    const mat = new StandardMaterial('backdropMat', scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.emissiveColor = new Color3(0.12, 0.12, 0.2);
    mat.specularColor = new Color3(0, 0, 0);
    mat.disableLighting = false;
    plane.material = mat;
    plane.receiveShadows = true;
    plane.isPickable = false;
  }

  /** A radial gradient baked to a data URL — calm indigo vignette. */
  private gradientDataUrl(): string {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(256, 200, 40, 256, 256, 380);
    g.addColorStop(0, '#222a52');
    g.addColorStop(0.45, '#161a38');
    g.addColorStop(1, '#080a18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    return c.toDataURL();
  }

  /** Slow-drifting motes of light for a tranquil, living background. */
  private buildAtmosphere(scene: Scene): void {
    const ps = new ParticleSystem('motes', 220, scene);
    ps.particleTexture = new Texture(this.dotDataUrl(), scene);
    ps.emitter = new Vector3(0, -this.fitSpan, 0.8);
    ps.minEmitBox = new Vector3(-this.fitSpan, 0, -0.5);
    ps.maxEmitBox = new Vector3(this.fitSpan, 0, 0.5);
    ps.color1 = new Color4(0.6, 0.7, 1.0, 0.5);
    ps.color2 = new Color4(0.9, 0.8, 1.0, 0.3);
    ps.colorDead = new Color4(0.4, 0.5, 0.9, 0);
    ps.minSize = 0.04;
    ps.maxSize = 0.16;
    ps.minLifeTime = 8;
    ps.maxLifeTime = 16;
    ps.emitRate = 14;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 0.18, 0);
    ps.direction1 = new Vector3(-0.1, 0.3, 0);
    ps.direction2 = new Vector3(0.1, 0.5, 0);
    ps.minEmitPower = 0.05;
    ps.maxEmitPower = 0.18;
    ps.updateSpeed = 0.02;
    ps.start();
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
    this.shadowGen.addShadowCaster(mesh, true);
  }

  /** Remove a caster (and its children) when its gem is disposed, so the
   *  shadow map's render list never accumulates dangling references. */
  removeShadowCaster(mesh: Mesh): void {
    this.shadowGen.removeShadowCaster(mesh, true);
  }

  /** Subtle, calm screen shake by nudging the camera target. Decays itself. */
  shake(amount: number): void {
    const start = performance.now();
    const dur = 260;
    const base = this.camera.target.clone();
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - start) / dur;
      if (t >= 1) {
        this.camera.setTarget(base);
        this.scene.onBeforeRenderObservable.remove(obs);
        return;
      }
      const decay = (1 - t) * amount;
      this.camera.setTarget(
        base.add(new Vector3((Math.random() - 0.5) * decay, (Math.random() - 0.5) * decay, 0))
      );
    });
  }

  start(loop: (dt: number) => void): void {
    this.engine.runRenderLoop(() => {
      const dt = this.engine.getDeltaTime() / 1000;
      loop(Math.min(dt, 0.05));
      this.scene.render();
    });
  }
}
