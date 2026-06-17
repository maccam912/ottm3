// Builds the 3D mesh for a gem — a little celestial body. Every gem is a glossy
// sphere lit from a hot core and wrapped in a Fresnel atmosphere halo, so the
// silhouette always rims with its own colour against deep space. The special
// kinds become recognisable cosmic objects:
//   Line  → a comet: a luminous streak across the body firing along one axis
//   Bomb  → a collapsing star: dark core, blazing accretion rings, white pinpoint
//   Color → a galaxy: a bright nucleus ringed by orbiting stars

import { Mesh, MeshBuilder, Scene, Vector3 } from '@babylonjs/core';
import { GemKind } from '../types';
import { MaterialCache } from './materials';
import { RAINBOW_COLOR } from '../config';

export interface GemMesh {
  root: Mesh;
  /** Solid meshes that should cast shadows (excludes the transparent halo). */
  casters: Mesh[];
  /** Children that should spin independently of the body (e.g. galaxy stars). */
  orbiters: Mesh[];
}

// Front of the gem faces the camera (−z). Accents sit just in front of it.
const FRONT_Z = -0.3;

export function createGem(
  name: string,
  scene: Scene,
  mats: MaterialCache,
  color: number,
  kind: GemKind
): GemMesh {
  const root = MeshBuilder.CreateSphere(
    name,
    { diameterX: 0.84, diameterY: 0.84, diameterZ: 0.62, segments: 22 },
    scene
  );
  root.material = kind === GemKind.Color || color === RAINBOW_COLOR ? mats.rainbow : mats.gem(color);
  const casters: Mesh[] = [root];
  const orbiters: Mesh[] = [];

  // Atmospheric halo: a slightly larger, back-faced, additive Fresnel shell.
  // Not a shadow caster (transparent), so it is kept out of `casters`.
  if (color !== RAINBOW_COLOR && kind !== GemKind.Bomb && kind !== GemKind.Color) {
    const halo = MeshBuilder.CreateSphere(`${name}_halo`, { diameter: 1.0, segments: 18 }, scene);
    halo.parent = root;
    halo.scaling.setAll(1.08);
    halo.material = mats.halo(color);
    halo.isPickable = false;
    halo.renderingGroupId = 0;
  }

  const addChild = (m: Mesh, caster = true) => {
    m.parent = root;
    m.isPickable = false;
    if (caster) casters.push(m);
    return m;
  };

  switch (kind) {
    case GemKind.LineH: {
      buildComet(name, scene, mats, color, 'h', addChild, orbiters);
      break;
    }
    case GemKind.LineV: {
      buildComet(name, scene, mats, color, 'v', addChild, orbiters);
      break;
    }
    case GemKind.Bomb: {
      // Collapsing star: near-black body, two crossed accretion rings, a
      // blinding pinpoint core.
      root.material = mats.bombBase(color);

      for (const tilt of [0.5, -0.7]) {
        const ring = MeshBuilder.CreateTorus(
          `${name}_acc`,
          { diameter: 0.78, thickness: 0.05, tessellation: 36 },
          scene
        );
        ring.material = mats.accent(color, 2.0);
        ring.position.z = FRONT_Z + 0.04;
        ring.rotation.x = Math.PI / 2;
        ring.rotation.y = tilt;
        addChild(ring);
        orbiters.push(ring);
      }

      const core = MeshBuilder.CreateSphere(`${name}_core`, { diameter: 0.24, segments: 12 }, scene);
      core.material = mats.whiteAccent(2.6);
      core.position.z = FRONT_Z;
      addChild(core, false);
      break;
    }
    case GemKind.Color: {
      // Galaxy: a luminous nucleus ringed by orbiting stars.
      const core = MeshBuilder.CreateSphere(`${name}_core`, { diameter: 0.34, segments: 14 }, scene);
      core.material = mats.whiteAccent(1.8);
      core.position.z = FRONT_Z;
      addChild(core, false);
      for (let i = 0; i < 7; i++) {
        const star = MeshBuilder.CreatePolyhedron(`${name}_s${i}`, { type: 1, size: 0.07 }, scene);
        const a = (i / 7) * Math.PI * 2;
        const rad = 0.3 + (i % 2) * 0.06;
        star.position = new Vector3(Math.cos(a) * rad, Math.sin(a) * rad, FRONT_Z);
        star.material = mats.whiteAccent(1.3);
        addChild(star, false);
        orbiters.push(star);
      }
      break;
    }
    default:
      break;
  }

  return { root, casters, orbiters };
}

/** A comet: a bright plasma streak across the body along its firing axis, with
 *  chevrons marking the direction it will blast. */
function buildComet(
  name: string,
  scene: Scene,
  mats: MaterialCache,
  color: number,
  dir: 'h' | 'v',
  addChild: (m: Mesh, caster?: boolean) => Mesh,
  orbiters: Mesh[]
): void {
  const streak =
    dir === 'h'
      ? MeshBuilder.CreateBox(`${name}_streakH`, { width: 0.96, height: 0.1, depth: 0.16 }, scene)
      : MeshBuilder.CreateBox(`${name}_streakV`, { width: 0.1, height: 0.96, depth: 0.16 }, scene);
  streak.material = mats.accent(color, 1.8);
  streak.position.z = FRONT_Z;
  addChild(streak);

  // A faint orbital ring around the body for a comet-like flourish.
  const ring = MeshBuilder.CreateTorus(`${name}_orbit`, { diameter: 0.7, thickness: 0.03, tessellation: 32 }, scene);
  ring.material = mats.accent(color, 1.2);
  ring.position.z = FRONT_Z + 0.03;
  ring.rotation.x = Math.PI / 2.4;
  ring.rotation.z = dir === 'v' ? Math.PI / 2 : 0;
  addChild(ring);
  orbiters.push(ring);

  for (const sign of [-1, 1]) {
    const chev = MeshBuilder.CreateBox(`${name}_chev`, { width: 0.1, height: 0.1, depth: 0.16 }, scene);
    chev.material = mats.whiteAccent(1.4);
    if (dir === 'h') chev.position = new Vector3(sign * 0.36, 0, FRONT_Z);
    else chev.position = new Vector3(0, sign * 0.36, FRONT_Z);
    chev.rotation.z = Math.PI / 4;
    addChild(chev);
  }
}
