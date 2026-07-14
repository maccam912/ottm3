# OTTM3 — OVER THE TOP MATCH 3 ⚡

OTTM3 is a neon cosmic jackpot disguised as a match-3 game. Every swap is an
excuse for lasers, particles, shader distortion, hitstop, screen shake,
squash-and-stretch, rising audio, and chain reactions that get less reasonable
as the cascade counter climbs. There are no lives, ads, currencies, or timers:
each run is a sequence of 15-move jackpot stages with an immediate restart.

Drag a relic into a neighbor or use tap-tap controls. Ordinary matches clear;
larger shapes manufacture powerups, and swapping a powerup fires it immediately
without requiring another match.

## Powerups

- **4 in a line → Rocket:** fires through a full row or column.
- **2×2 square → Pulse:** detonates a compact 3×3 field.
- **L/T intersection → Nova:** vaporizes its row, column, and core field.
- **Solid 2×3 block → Meteor:** calls down a randomized orbital bombardment of
  plus-shaped strikes, each with its own screaming re-entry trail and impact
  explosion.
- **Straight 5 → Prism:** erases every relic of the swapped color.
- **Straight 6 or a 9+ relic group → Singularity:** the board has made a
  serious tactical error.

Every pair of powerups has a bespoke result. The complete matrix includes
parallel and crossed rocket barrages, rocket + pulse three-lane crosses, rocket
+ nova five-lane crosses, prism rocket rain, doubled pulse fields, pulse + nova
mega-blasts, prism blast fields, nova board wipes, prism cross-storms, double
prism annihilation, meteor lane barrages, meteor carpet bombing, meteor
extinction events, per-color chromatic hailstorms, double-meteor impacts, and
singularity pairings that wipe the board. Powerups caught inside another
effect chain too, so one combination can ignite several more.

## Overdrive, Fever, and stage modifiers

- Cascades escalate score, pitch, combo callouts, particles, shake, and shader
  intensity instead of merely incrementing a quiet counter.
- Clearing relics fills Hype; a full meter ignites three turns of audiovisual
  Overdrive. Beat the stage payout in 15 moves to advance on the same board.
- A cascade of 4+ ignites **FEVER TIME**: reality hue-cycles, a curtain of
  sparks rises from the board, and Hype charges half again as fast.
- The biggest fusions and deepest cascades trigger **bullet time** — tweens,
  timers, and the board's spring physics all dilate while the shader drains
  color and drops letterbox bars.
- Every explosion detonates a real pyrotechnic composite: core flash, fireball,
  shockwave ring, debris that ricochets off the arena, embers, rising smoke, a
  screen-space ripple in the shader, and a distance-delayed jiggle wave through
  every nearby relic.
- Each stage after the first draws a **stage modifier**: GOLD RUSH (Hype
  charges twice as fast), DISCO INFERNO (the whole screen cycles hues), METEOR
  WEATHER (ambient debris streaks across the arena), or HEAVY METAL (extra
  shake, extra shrapnel).
- Six glossy cosmic relic silhouettes remain readable under the glow, while
  rockets, pulses, novas, prisms, and singularities have distinct silhouettes
  and effects.
- Dead boards reshuffle automatically. Idle hints and an exact deterministic
  best-move button keep a run moving without hiding the decision from you.
- The deterministic engine and renderer are separate: the engine emits ordered
  swap/clear/fall/refill steps and Phaser turns those steps into spectacle.
  `?seed=123` pins a run for debugging.

## Install and play offline

OTTM3 is an Android-installable PWA. Open the GitHub Pages build in Chrome and
use **Install app** or **Add to Home screen**. The manifest launches the game in
portrait fullscreen mode with a maskable launcher icon.

The production build creates a revisioned `precache-manifest.json` containing
every emitted file. Service-worker installation atomically precaches that full
app shell; a failed asset fetch leaves the previous working revision intact.
After a successful worker installation, the game can cold-launch offline.
Navigation is network-first for prompt updates, while versioned scripts, art,
shaders, and audio are cache-first.

## Architecture

```text
src/engine/   deterministic match-3 rules, cascades, solver, special matrix
src/client/   Phaser renderer, generated relics, shaders, audio, juice
assets/       install metadata plus production art/audio copied by Vite
scripts/      asset/icon generation and headless browser smoke testing
tests/        Vitest engine coverage, including powerup creation/combinations
```

`vite.config.ts` keeps asset URLs relative for the `/ottm3/` GitHub Pages
project path. A small build plugin hashes the completed `dist` tree, stamps the
service worker, and writes the full precache manifest. Pushing `main` runs CI,
builds `dist`, uploads it as the Pages artifact, and deploys it through GitHub
Actions.

## Develop

```bash
npm ci
npm run dev          # Vite development server on :5173
npm test             # deterministic engine suite
npm run typecheck
npm run build        # typecheck + production PWA + precache manifest
npm run smoke        # boot Chrome, play moves, and capture visual QA
npm run bake:icons   # regenerate the three OTTM3 PWA icons
```

`npm run smoke` can also use a local oMLX vision server on `localhost:8000` for
optional fuzzy visual QA; it skips that check when the server is absent.

## Credits

OTTM3's relics, shader treatment, effects, UI, and cosmic-jackpot launcher icon
are original procedural/game assets. The committed icon generator uses
`@napi-rs/canvas`, including safe padding for Android adaptive masks. Sound and
small source particles are derived from CC0 [Kenney](https://kenney.nl) packs.
