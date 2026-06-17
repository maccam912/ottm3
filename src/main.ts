// Bootstrap: build the scene, wire up the systems, and start the render loop.

import { audio } from './audio';
import { Game } from './game';
import { Effects } from './render/effects';
import { MaterialCache } from './render/materials';
import { SceneManager } from './render/scene';
import { UI } from './ui';
import './style.css';

function boot(): void {
  const app = document.getElementById('app')!;
  const boot = app.querySelector('.boot');

  const canvas = document.createElement('canvas');
  canvas.id = 'renderCanvas';
  app.appendChild(canvas);

  const sm = new SceneManager(canvas);
  const mats = new MaterialCache(sm.scene);
  const fx = new Effects(sm.scene);
  const ui = new UI(app, (muted) => audio.setMuted(muted));

  const game = new Game(sm, mats, fx, ui);
  game.start();

  sm.start((dt) => game.update(dt));

  // Remove the loading shimmer once the first frame is up.
  sm.scene.executeWhenReady(() => boot?.remove());

  // Initialise audio on the very first interaction (autoplay policy).
  const kick = () => {
    audio.init();
    audio.resume();
    window.removeEventListener('pointerdown', kick);
    window.removeEventListener('keydown', kick);
  };
  window.addEventListener('pointerdown', kick);
  window.addEventListener('keydown', kick);
}

boot();
