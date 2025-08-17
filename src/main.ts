import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { W, H, CONFIG } from './config';

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  width: W,
  height: H,
  parent: 'game',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  backgroundColor: 'transparent',
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: CONFIG.GRAVITY_Y },
      enableSleeping: true,
    }
  },
  scene: [GameScene]
});
