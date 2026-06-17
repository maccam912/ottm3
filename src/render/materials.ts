// Material cache. One glossy PBR material per gem colour, plus emissive
// accents for the special variants. Materials are shared across all gems of a
// colour to keep draw calls and memory low.

import { Color3, PBRMaterial, Scene, StandardMaterial } from '@babylonjs/core';
import { PALETTE } from '../config';

export class MaterialCache {
  private gems = new Map<number, PBRMaterial>();
  private accents = new Map<string, StandardMaterial>();
  rainbow: PBRMaterial;

  constructor(private scene: Scene) {
    this.rainbow = this.buildRainbow();
  }

  /** Glossy, slightly translucent jewel for a colour index. */
  gem(color: number): PBRMaterial {
    let m = this.gems.get(color);
    if (m) return m;
    const p = PALETTE[color % PALETTE.length];
    m = new PBRMaterial(`gem_${color}`, this.scene);
    m.albedoColor = new Color3(...p.base);
    m.metallic = 0.0;
    m.roughness = 0.22;
    m.emissiveColor = new Color3(p.glow[0], p.glow[1], p.glow[2]).scale(0.12);
    m.clearCoat.isEnabled = true;
    m.clearCoat.intensity = 0.9;
    m.clearCoat.roughness = 0.08;
    m.subSurface.isTranslucencyEnabled = true;
    m.subSurface.translucencyIntensity = 0.45;
    m.subSurface.tintColor = new Color3(...p.base);
    m.environmentIntensity = 0.6;
    this.gems.set(color, m);
    return m;
  }

  glowColor(color: number): Color3 {
    const p = PALETTE[color % PALETTE.length];
    return new Color3(...p.glow);
  }

  /** Dark, faintly self-lit body for a bomb gem (shared per colour). */
  bombBase(color: number): StandardMaterial {
    const k = `bomb_${color}`;
    let m = this.accents.get(k);
    if (m) return m;
    m = new StandardMaterial(`bombBase_${color}`, this.scene);
    m.diffuseColor = new Color3(0.08, 0.07, 0.12);
    m.specularColor = new Color3(0.3, 0.3, 0.4);
    m.emissiveColor = this.glowColor(color).scale(0.08);
    this.accents.set(k, m);
    return m;
  }

  /** Bright emissive material for special-gem accents (bars, cores, rings). */
  accent(color: number, intensity = 1): StandardMaterial {
    const k = `${color}_${intensity}`;
    let m = this.accents.get(k);
    if (m) return m;
    const p = PALETTE[color % PALETTE.length];
    m = new StandardMaterial(`accent_${k}`, this.scene);
    m.emissiveColor = new Color3(p.glow[0], p.glow[1], p.glow[2]).scale(intensity);
    m.diffuseColor = new Color3(0, 0, 0);
    m.specularColor = new Color3(0, 0, 0);
    m.disableLighting = true;
    this.accents.set(k, m);
    return m;
  }

  whiteAccent(intensity = 1.4): StandardMaterial {
    const k = `white_${intensity}`;
    let m = this.accents.get(k);
    if (m) return m;
    m = new StandardMaterial(`accent_${k}`, this.scene);
    m.emissiveColor = new Color3(intensity, intensity, intensity);
    m.diffuseColor = new Color3(0, 0, 0);
    m.specularColor = new Color3(0, 0, 0);
    m.disableLighting = true;
    this.accents.set(k, m);
    return m;
  }

  private buildRainbow(): PBRMaterial {
    const m = new PBRMaterial('gem_rainbow', this.scene);
    m.albedoColor = new Color3(0.95, 0.95, 1.0);
    m.metallic = 0.3;
    m.roughness = 0.12;
    m.emissiveColor = new Color3(0.5, 0.5, 0.6);
    m.clearCoat.isEnabled = true;
    m.clearCoat.intensity = 1.0;
    m.clearCoat.roughness = 0.05;
    m.environmentIntensity = 1.0;
    return m;
  }
}
