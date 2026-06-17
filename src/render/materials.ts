// Material cache. Each gem is a little celestial body: a glossy surface lit
// from a hot inner core, wrapped in a Fresnel "atmosphere" halo that rims with
// light at grazing angles. Materials are shared per colour to keep draw calls
// low. The strong, saturated emissives are what make the six bodies read as
// unmistakably different colours against the black of space.

import {
  Color3,
  FresnelParameters,
  PBRMaterial,
  Scene,
  StandardMaterial,
} from '@babylonjs/core';
import { PALETTE } from '../config';

export class MaterialCache {
  private gems = new Map<number, PBRMaterial>();
  private halos = new Map<number, StandardMaterial>();
  private accents = new Map<string, StandardMaterial>();
  rainbow: PBRMaterial;

  constructor(private scene: Scene) {
    this.rainbow = this.buildRainbow();
  }

  /** Glossy planet surface for a colour index, lit from a hot core. */
  gem(color: number): PBRMaterial {
    let m = this.gems.get(color);
    if (m) return m;
    const p = PALETTE[color % PALETTE.length];
    m = new PBRMaterial(`gem_${color}`, this.scene);
    m.albedoColor = new Color3(...p.base);
    m.metallic = 0.0;
    m.roughness = 0.34;
    // A gentle self-illumination tints the body; the directional lighting +
    // clearcoat sculpt the sphere so each body reads as round, not as a disc.
    m.emissiveColor = new Color3(...p.base).scale(0.2);
    m.clearCoat.isEnabled = true;
    m.clearCoat.intensity = 1.0;
    m.clearCoat.roughness = 0.06;
    m.subSurface.isTranslucencyEnabled = true;
    m.subSurface.translucencyIntensity = 0.55;
    m.subSurface.tintColor = new Color3(...p.core);
    m.environmentIntensity = 0.7;
    this.gems.set(color, m);
    return m;
  }

  /** Additive Fresnel shell — the planet's glowing atmosphere/rim. Rendered on
   *  a slightly larger back-faced sphere so light wraps the silhouette. */
  halo(color: number): StandardMaterial {
    let m = this.halos.get(color);
    if (m) return m;
    const p = PALETTE[color % PALETTE.length];
    m = new StandardMaterial(`halo_${color}`, this.scene);
    m.disableLighting = true;
    m.diffuseColor = new Color3(0, 0, 0);
    m.specularColor = new Color3(0, 0, 0);
    m.emissiveColor = new Color3(...p.glow);
    m.alpha = 0.32;
    m.backFaceCulling = false;
    const fres = new FresnelParameters();
    fres.bias = 0.18;
    fres.power = 3.0; // tighter rim so neighbouring halos don't merge to white
    fres.leftColor = new Color3(...p.glow).scale(0.8); // edge (grazing) = bright
    fres.rightColor = new Color3(0, 0, 0); // facing camera = transparent
    m.emissiveFresnelParameters = fres;
    m.opacityFresnelParameters = fres;
    this.halos.set(color, m);
    return m;
  }

  glowColor(color: number): Color3 {
    const p = PALETTE[color % PALETTE.length];
    return new Color3(...p.glow);
  }

  coreColor(color: number): Color3 {
    const p = PALETTE[color % PALETTE.length];
    return new Color3(...p.core);
  }

  /** Dark, faintly self-lit body for a collapsing-star (bomb) gem. */
  bombBase(color: number): StandardMaterial {
    const k = `bomb_${color}`;
    let m = this.accents.get(k);
    if (m) return m;
    m = new StandardMaterial(`bombBase_${color}`, this.scene);
    m.diffuseColor = new Color3(0.02, 0.02, 0.04);
    m.specularColor = new Color3(0.4, 0.4, 0.5);
    m.emissiveColor = this.glowColor(color).scale(0.06);
    this.accents.set(k, m);
    return m;
  }

  /** Bright emissive material for special-gem accents (rings, cores, comets). */
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
    m.metallic = 0.4;
    m.roughness = 0.1;
    m.emissiveColor = new Color3(0.6, 0.6, 0.7);
    m.clearCoat.isEnabled = true;
    m.clearCoat.intensity = 1.0;
    m.clearCoat.roughness = 0.04;
    m.environmentIntensity = 1.2;
    return m;
  }
}
