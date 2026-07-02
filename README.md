# GLAZE 🍩

An ultra-satisfying donut-shop match-3. No gacha, no lives, no timers, no
teasing — just an endless board, chunky cascades, and dopamine.

Drag (or tap-tap) to swap donuts. Match 3 to pop them. Match 4 to bake a
**striped** donut (clears a line), match in an L/T or a 2x2 square for a
**wrapped** donut (explodes), match 5 for a **color bomb** (clears a whole
flavor). Specials fire the moment you swap them — no follow-up match required —
and swapping two specials together gives the big payoffs, including bomb+bomb,
which clears the entire board.

## Why it feels good

- **Cascade pops climb a pentatonic scale** — every chain reaction plays a
  rising melody.
- Squash-and-stretch landings, staggered pops, crumb + glow particle bursts,
  screen shake scaled to the combo, and a brief hitstop on the big blasts.
- Combo banners (TASTY! → SUGAR RUSH!), floating scores, a rolling score
  counter, and confetti at every 10,000-point milestone.
- If you idle, a valid move wobbles gently. If the board deadlocks, it
  reshuffles itself ("FRESH DONUTS!"). The game never blocks you.

## Architecture

```
src/engine/   pure deterministic match-3 engine (no Phaser, fully unit-tested)
src/client/   Phaser 3 renderer: scenes, piece views, sfx, juice
assets/       baked art + audio (see below)
scripts/      bake-assets.ts (asset pipeline), smoke.ts (e2e in headless Chrome)
tests/        Vitest suite — whole games are played headlessly
```

The engine resolves each move into an ordered list of `Step`s (swap → clear →
fall → refill → …) that the client replays with animation. Same seed, same
game: `?seed=123` in the URL pins the board.

## Develop

```bash
npm install
npm run dev        # Vite dev server on :5173
npm test           # engine test suite (plays full games headlessly)
npm run typecheck
npm run smoke      # boots headless Chrome, plays 5 moves, screenshots
npm run bake       # regenerate assets from the Kenney packs (see below)
```

`npm run smoke` also runs a fuzzy visual QA against a local oMLX vision server
(`localhost:8000`) when one is running; it is skipped otherwise.

## Credits

Art and audio are CC0 from [Kenney](https://kenney.nl) — the Donuts pack,
Impact/Interface/Digital Audio sound packs, and the "Farm Frolics" music loop.
Donut sprites are composited (base + glazing + sprinkles, plus a baked drop
shadow) by `scripts/bake-assets.ts` from the "Kenney Game Assets All-in-1"
bundle, expected in `~/Downloads` when re-baking. Thanks Kenney!
