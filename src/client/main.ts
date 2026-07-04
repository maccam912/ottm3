import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./constants";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#2a1a22",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, GameScene],
});

// Rotating the device can leave the canvas stuck at the old size: the browser
// fires resize/orientationchange while layout is still settling, so FIT mode
// reads stale parent bounds and never re-checks. Keep refreshing for a moment
// after any such event until the reported size stabilizes.
let rafId = 0;
function refreshUntilSettled(): void {
  cancelAnimationFrame(rafId);
  const started = performance.now();
  const tick = (): void => {
    game.scale.refresh();
    if (performance.now() - started < 700) rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}
window.addEventListener("resize", refreshUntilSettled);
window.addEventListener("orientationchange", refreshUntilSettled);
window.visualViewport?.addEventListener("resize", refreshUntilSettled);
screen.orientation?.addEventListener("change", refreshUntilSettled);

// Installable PWA: the service worker caches everything after first load so
// the game runs fully offline. Skipped in dev — Vite serves fresh modules.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline support is a bonus; the game works fine without it.
    });
  });
}
