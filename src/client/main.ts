import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./constants";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#05000f",
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: "high-performance",
  },
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

// Installable PWA: production builds generate a revisioned manifest containing
// every emitted asset, and the worker atomically precaches it for cold-offline
// play. Skipped in dev so Vite always serves fresh modules.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js");
  });
}
