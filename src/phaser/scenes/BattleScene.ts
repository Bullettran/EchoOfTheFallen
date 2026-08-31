/**
 * BattleScene — только фон арены (арт + затемнение).
 * Все бойцы — HTML-карточки (Hearthstone-раскладка): враги сверху, игрок снизу.
 * Числа урона/эффекты — тоже в HTML (BattleScreen), Phaser не рисует бойцов.
 */
import Phaser from 'phaser';
import { useBattleStore } from '@/stores/battle';
import { sceneUrl } from '@/core/assets';

const BG_TEX = 'battle_bg';

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('BattleScene');
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0b0a0f');

    const store = useBattleStore();
    const bgUrl = sceneUrl((store.currentEnemyDefs[0]?.scene ?? 'battle_crypt') as never);

    // Фолбэк-градиент до загрузки арта
    this.add.graphics()
      .fillGradientStyle(0x14121c, 0x14121c, 0x060509, 0x060509, 1)
      .fillRect(0, 0, width, height)
      .setDepth(-11);

    if (bgUrl) {
      this.load.image(BG_TEX, bgUrl);
      this.load.once('complete', () => {
        this.add
          .image(0, 0, BG_TEX)
          .setOrigin(0)
          .setDisplaySize(width, height)
          .setDepth(-10);
        // лёгкое затемнение для читаемости карточек
        this.add.rectangle(width / 2, height / 2, width, height, 0x060509, 0.38).setDepth(-9);
        this.game.canvas.dataset.bgLoaded = '1'; // e2e-маркер
      });
      this.load.start();
    }
  }
}
