import Phaser from "phaser";

/**
 * Full-screen shader used as the game's global intensity dial.
 * At rest it only adds a restrained vignette. Impacts push RGB separation,
 * scan-line shimmer, saturation and a radial pulse; the value decays in the
 * scene so cascades visibly stack instead of playing as isolated animations.
 *
 * On top of the base grade it carries three event channels:
 *  - a shockwave ripple that explosions detonate from their screen position,
 *  - a hue rotation used by FEVER mode and the DISCO INFERNO stage modifier,
 *  - a slow-mo grade (desaturate + cool tint + letterbox) for bullet time.
 */
const FRAGMENT_SHADER = `
#define SHADER_NAME OTTM3_OVERDRIVE_FS
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uIntensity;
uniform vec2 uShockCenter;
uniform float uShockAge;
uniform float uShockPower;
uniform float uHue;
uniform float uSlowMo;
varying vec2 outTexCoord;

vec3 hueRotate (vec3 color, float angle) {
  const vec3 k = vec3(0.57735, 0.57735, 0.57735);
  float c = cos(angle);
  float s = sin(angle);
  return color * c + cross(k, color) * s + k * dot(k, color) * (1.0 - c);
}

void main () {
  vec2 uv = outTexCoord;
  vec2 centered = uv - 0.5;
  float radius = length(centered);
  float pulse = sin(radius * 38.0 - uTime * 10.0) * uIntensity * 0.0025;
  vec2 warped = uv + normalize(centered + vec2(0.0001)) * pulse;

  // Expanding shockwave ring: a travelling band of refraction that decays.
  vec2 fromShock = uv - uShockCenter;
  float shockDist = length(fromShock);
  float band = shockDist - uShockAge * 1.35;
  float ripple = exp(-band * band * 220.0) * exp(-uShockAge * 3.2) * uShockPower;
  warped += normalize(fromShock + vec2(0.0001)) * ripple * 0.05;

  float split = (0.0007 + (uIntensity + ripple * 2.0) * 0.0045) * (0.35 + radius);
  vec4 base = texture2D(uMainSampler, warped);
  float red = texture2D(uMainSampler, warped + vec2(split, 0.0)).r;
  float blue = texture2D(uMainSampler, warped - vec2(split, 0.0)).b;
  vec3 color = vec3(red, base.g, blue);

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, 1.08 + uIntensity * 0.45);
  float scan = sin((uv.y * 1280.0) + uTime * 9.0) * 0.018 * (0.2 + uIntensity);
  color += scan;

  if (uHue > 0.001) {
    color = hueRotate(color, uHue * 6.28318);
  }

  float vignette = smoothstep(0.82, 0.24, radius);
  color *= mix(0.72, 1.08, vignette);
  color += vec3(0.12, 0.025, 0.18) * uIntensity * (1.0 - radius);
  color += ripple * 0.55;

  // Bullet-time grade: drain saturation, cool the shadows, drop letterbox
  // bars so a slow-motion moment reads as cinema rather than as lag.
  if (uSlowMo > 0.001) {
    float slowLuma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, vec3(slowLuma) * vec3(0.78, 0.9, 1.18), uSlowMo * 0.5);
    float bars = smoothstep(0.0, 0.07, uv.y) * smoothstep(1.0, 0.93, uv.y);
    color *= mix(1.0, bars, uSlowMo);
  }

  gl_FragColor = vec4(color, base.a);
}
`;

export class OverdrivePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  intensity = 0;
  /** 0..1 hue rotation driven by FEVER / disco stages. */
  hue = 0;
  /** 0..1 slow-motion grade; the scene lerps this toward its target. */
  slowMo = 0;

  private elapsed = 0;
  private shockStart = -100;
  private shockPower = 0;
  private shockX = 0.5;
  private shockY = 0.5;

  constructor(game: Phaser.Game) {
    super({ game, fragShader: FRAGMENT_SHADER });
  }

  /** Detonate a screen-space shockwave ripple. Coordinates are 0..1. */
  triggerShock(x: number, y: number, power: number): void {
    this.shockX = Phaser.Math.Clamp(x, 0, 1);
    this.shockY = Phaser.Math.Clamp(y, 0, 1);
    this.shockPower = Phaser.Math.Clamp(power, 0, 1);
    this.shockStart = this.elapsed;
  }

  onPreRender(): void {
    this.elapsed += this.game.loop.delta / 1000;
    this.set1f("uTime", this.elapsed);
    this.set1f("uIntensity", Phaser.Math.Clamp(this.intensity, 0, 1));
    // Texture coordinates have Y up in the render target, so flip the center.
    this.set2f("uShockCenter", this.shockX, 1 - this.shockY);
    this.set1f("uShockAge", Math.max(0, this.elapsed - this.shockStart));
    this.set1f("uShockPower", this.shockPower);
    this.set1f("uHue", Phaser.Math.Clamp(this.hue, 0, 1));
    this.set1f("uSlowMo", Phaser.Math.Clamp(this.slowMo, 0, 1));
  }
}
