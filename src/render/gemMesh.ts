// Builds the 3D mesh for a gem: a smooth, slightly flattened jewel (reads as a
// soft "gummy" so the squash physics looks organic) plus emissive accents that
// communicate each special kind at a glance.

import { Mesh, MeshBuilder, Vector3 } from '@babylonjs/core';
import { GemKind } from '../types';
import { MaterialCache } from './materials';
import { RAINBOW_COLOR } from '../config';

export interface GemMesh {
  root: Mesh;
  casters: Mesh[];
}

// Front of the gem faces the camera (−z). Accents sit just in front of it.
const FRONT_Z = -0.26;

export function createGem(
  name: string,
  scene: import('@babylonjs/core').Scene,
  mats: MaterialCache,
  color: number,
  kind: GemKind
): GemMesh {
  const root = MeshBuilder.CreateSphere(
    name,
    { diameterX: 0.86, diameterY: 0.86, diameterZ: 0.5, segments: 20 },
    scene
  );
  root.material = kind === GemKind.Color || color === RAINBOW_COLOR ? mats.rainbow : mats.gem(color);
  const casters: Mesh[] = [root];

  const addChild = (m: Mesh) => {
    m.parent = root;
    m.isPickable = false;
    casters.push(m);
    return m;
  };

  switch (kind) {
    case GemKind.LineH: {
      const bar = MeshBuilder.CreateBox(`${name}_barH`, { width: 0.92, height: 0.14, depth: 0.18 }, scene);
      bar.material = mats.accent(color, 1.5);
      bar.position.z = FRONT_Z;
      addChild(bar);
      addArrowChevrons(name, scene, mats, color, 'h', addChild);
      break;
    }
    case GemKind.LineV: {
      const bar = MeshBuilder.CreateBox(`${name}_barV`, { width: 0.14, height: 0.92, depth: 0.18 }, scene);
      bar.material = mats.accent(color, 1.5);
      bar.position.z = FRONT_Z;
      addChild(bar);
      addArrowChevrons(name, scene, mats, color, 'v', addChild);
      break;
    }
    case GemKind.Bomb: {
      // Darken the base, add a glowing core and ring so it reads as volatile.
      root.material = mats.bombBase(color);

      const ring = MeshBuilder.CreateTorus(`${name}_ring`, { diameter: 0.62, thickness: 0.08, tessellation: 24 }, scene);
      ring.material = mats.accent(color, 1.8);
      ring.position.z = FRONT_Z + 0.02;
      ring.rotation.x = Math.PI / 2;
      addChild(ring);

      const core = MeshBuilder.CreateSphere(`${name}_core`, { diameter: 0.26, segments: 12 }, scene);
      core.material = mats.whiteAccent(2.0);
      core.position.z = FRONT_Z;
      addChild(core);
      break;
    }
    case GemKind.Color: {
      // Rainbow gem: bright facets orbiting a luminous core.
      const core = MeshBuilder.CreateSphere(`${name}_core`, { diameter: 0.3, segments: 12 }, scene);
      core.material = mats.whiteAccent(1.6);
      core.position.z = FRONT_Z;
      addChild(core);
      for (let i = 0; i < 6; i++) {
        const facet = MeshBuilder.CreatePolyhedron(`${name}_f${i}`, { type: 1, size: 0.08 }, scene);
        const a = (i / 6) * Math.PI * 2;
        facet.position = new Vector3(Math.cos(a) * 0.3, Math.sin(a) * 0.3, FRONT_Z);
        facet.material = mats.whiteAccent(1.2);
        addChild(facet);
      }
      break;
    }
    default:
      break;
  }

  return { root, casters };
}

/** Little chevrons that hint at the direction a line gem fires. */
function addArrowChevrons(
  name: string,
  scene: import('@babylonjs/core').Scene,
  mats: MaterialCache,
  color: number,
  dir: 'h' | 'v',
  addChild: (m: Mesh) => Mesh
): void {
  for (const sign of [-1, 1]) {
    const chev = MeshBuilder.CreateBox(`${name}_chev`, { width: 0.1, height: 0.1, depth: 0.16 }, scene);
    chev.material = mats.whiteAccent(1.2);
    if (dir === 'h') chev.position = new Vector3(sign * 0.34, 0, FRONT_Z);
    else chev.position = new Vector3(0, sign * 0.34, FRONT_Z);
    chev.rotation.z = Math.PI / 4;
    addChild(chev);
  }
}
