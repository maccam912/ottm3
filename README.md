# Over The Top Match 3

A calm, deeply satisfying 2.5D match-3 — rebuilt from scratch on **Babylon.js**
with a bespoke **soft-body spring** physics engine and fully **procedural
audio**. No image or sound assets: every gem, particle, sparkle and chime is
generated at runtime, so the whole game ships as one small static site.

🎮 **Play:** https://maccam912.github.io/ottm3/

## Feel

- **Soft-body gems.** Every gem is driven by damped harmonic springs. They
  squash on landing, pop when selected, swell before they clear, and breathe
  gently at rest — all volume-preserving so it reads like real jelly.
- **2.5D rendering.** Glossy PBR jewels under soft three-point lighting, a glow
  layer for the special gems, bloom + vignette + film grain post-processing,
  soft shadows, and a tranquil drifting-mote backdrop.
- **Procedural sound.** A major-pentatonic bell synth (so cascades are always
  consonant), filtered-noise whooshes, warm detonations and an ambient pad —
  all synthesised with the Web Audio API.

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
  physics.ts        soft-body spring engine (no external physics dependency)
  audio.ts          procedural Web Audio synth
  config.ts         all tuning knobs + palette
  game.ts           controller: input + swap→match→clear→collapse→cascade flow
  ui.ts             crisp HTML/CSS HUD overlay
  render/
    scene.ts        Babylon engine, camera, lights, glow, post-processing
    materials.ts    cached PBR jewel + emissive accent materials
    gemMesh.ts      gem mesh + special-kind decorations
    gemView.ts      per-gem mesh + soft-body view
    effects.ts      sparkle bursts, shockwaves, flashes
```

## Develop

```bash
npm install
npm run dev      # vite dev server
npm test         # jest — pure board-logic tests
npm run build    # type-check + production build to dist/
```
