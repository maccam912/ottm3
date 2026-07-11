import Phaser from "phaser";

/**
 * Lightweight full-screen shader used as the game's global intensity dial.
 * At rest it only adds a restrained vignette. Impacts push RGB separation,
 * scan-line shimmer, saturation and a radial pulse; the value decays in the
 * scene so cascades visibly stack instead of playing as isolated animations.
 */
const FRAGMENT_SHADER = `
#define SHADER_NAME OTTM3_OVERDRIVE_FS
precision mediump float;

uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uIntensity;
varying vec2 outTexCoord;

void main () {
  vec2 uv = outTexCoord;
  vec2 centered = uv - 0.5;
  float radius = length(centered);
  float pulse = sin(radius * 38.0 - uTime * 10.0) * uIntensity * 0.0025;
  vec2 warped = uv + normalize(centered + vec2(0.0001)) * pulse;

  float split = (0.0007 + uIntensity * 0.0045) * (0.35 + radius);
  vec4 base = texture2D(uMainSampler, warped);
  float red = texture2D(uMainSampler, warped + vec2(split, 0.0)).r;
  float blue = texture2D(uMainSampler, warped - vec2(split, 0.0)).b;
  vec3 color = vec3(red, base.g, blue);

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, 1.08 + uIntensity * 0.45);
  float scan = sin((uv.y * 1280.0) + uTime * 9.0) * 0.018 * (0.2 + uIntensity);
  color += scan;

  float vignette = smoothstep(0.82, 0.24, radius);
  color *= mix(0.72, 1.08, vignette);
  color += vec3(0.12, 0.025, 0.18) * uIntensity * (1.0 - radius);
  gl_FragColor = vec4(color, base.a);
}
`;

export class OverdrivePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  intensity = 0;
  private elapsed = 0;

  constructor(game: Phaser.Game) {
    super({ game, fragShader: FRAGMENT_SHADER });
  }

  onPreRender(): void {
    this.elapsed += this.game.loop.delta / 1000;
    this.set1f("uTime", this.elapsed);
    this.set1f("uIntensity", Phaser.Math.Clamp(this.intensity, 0, 1));
  }
}
