# Over The Top: Gravity Wells

A 2.5D match-3 set adrift in deep space — built on **Babylon.js** with a bespoke
**rigid-body physics** engine and fully **procedural audio**. No image or sound
assets: every body, spark, supernova and chime is generated at runtime, so the
whole game ships as one small static site.

Every gem is a little **celestial body**. They spin, they get flung by blast
waves, and they collapse into supernovae when they clear. The whole thing is
tuned to feel physical and a touch dangerous — never tidy.

🎮 **Play:** https://maccam912.github.io/ottm3/

## Feel

- **Real physics.** A bespoke engine integrates genuine Newtonian motion every
  frame: each body is spring-anchored to its grid cell but free to be knocked
  off it by **impulses**, spun up with **torque**, and dragged around by
  **gravity wells**. Detonations throw out debris chunks that are fully
  simulated free bodies — velocity, drag, gravity and tumbling spin and all.
- **Six distinct worlds.** The palette is six clearly separated hues — ember,
  solar, verdant, plasma, violet and nebula — each a glossy sphere lit from a
  hot core and wrapped in a Fresnel atmosphere that rims with its own colour.
- **Supernovae.** Specials detonate in a blinding core flash, a storm of
  sparks, expanding shockwaves and a spray of physical debris — and the blast
  wave shoves and spins every surviving body nearby. The camera answers with a
  trauma-based shake.
- **Deep-space stage.** A nebula backdrop with a parallax starfield, drifting
  coloured dust, the odd shooting star, and punchy bloom + chromatic-aberration
  + vignette + grain post-processing.
- **Procedural sound.** A major-pentatonic bell synth (so cascades are always
  consonant), filtered-noise whooshes, deep gravitational-collapse detonations
  and a spacious ambient drone — all synthesised with the Web Audio API.

## Special gems

| Made by | Gem | Effect |
| --- | --- | --- |
| 4 in a row (horizontal) | **Line →** | clears its whole row |
| 4 in a row (vertical) | **Line ↑** | clears its whole column |
| 2×2 square, or an L / T of 5 | **Bomb** | clears a 3×3 area |
| 5 in a row | **Rainbow** | clears every gem of one colour |

Specials **combo** when swapped together:

- Line + Line → full row **and** column
- Line + Bomb → a 3-wide cross band
- Bomb + Bomb → a 5×5 blast
- Rainbow + gem → clears that colour (and detonates any specials it hits)
- Rainbow + Rainbow → clears the **entire board**

Cascades chain automatically, scoring climbs with combo depth, and the board
reshuffles itself if it ever runs out of moves.

## Controls

Tap two adjacent gems, or drag one toward its neighbour, to swap. Idle for a
moment and the board pulses a hint.

## Architecture

Rendering, audio and physics are kept strictly separate from the **pure** board
logic so the rules can be unit-tested in plain Node.

```
src/
  board.ts          pure match-3 rules (matches, squares, specials, gravity)
  specials → board  special-gem classification + activation expansion
  physics.ts        bespoke rigid-body engine: springs, GemBody (forces /
                    impulses / torque / gravity wells), SoftBody, Debris
  audio.ts          procedural Web Audio synth
  config.ts         all tuning knobs + celestial palette
  game.ts           controller: input + swap→match→clear→collapse→cascade flow
  ui.ts             crisp HTML/CSS HUD overlay
  render/
    scene.ts        Babylon engine, camera, lights, nebula + starfield, shake
    materials.ts    cached PBR body + Fresnel-atmosphere + emissive materials
    gemMesh.ts      gem mesh + cosmic special decorations (comet/star/galaxy)
    gemView.ts      per-gem rigid body + soft-body deformation view
    effects.ts      supernovae, spark storms, debris, shockwaves, flashes
```

## Develop

```bash
npm install
npm run dev      # vite dev server
npm test         # jest — pure board-logic tests
npm run build    # type-check + production build to dist/
```
