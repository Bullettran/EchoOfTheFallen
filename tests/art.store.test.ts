/**
 * Тесты файлового реестра артов (src/core/assets.ts + stores/art.ts).
 * Реестр построен на import.meta.glob — в тестах реально резолвит файлы
 * из src/assets/images, поэтому проверяем и наличие ассетов на диске.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useArtStore } from '@/stores/art';
import { cardArtUrl, enemyPortraitUrl, conditionIconUrl, sceneUrl, uiUrl, type SceneId } from '@/core/assets';

describe('assets: реестр изображений', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('арты карт резолвятся для всей стартовой колоды', () => {
    for (const defId of ['strike', 'guard', 'heavy_blow', 'fireball', 'poison_blade', 'flask', 'rend']) {
      expect(cardArtUrl(defId), `нет арта: ${defId}`).toBeTruthy();
    }
  });

  it('портреты всех врагов на месте', () => {
    for (const defId of ['lost_passerby', 'rusty_dog', 'cleaner_drone', 'vending_machine', 'security_camera', 'collector']) {
      expect(enemyPortraitUrl(defId), `нет портрета: ${defId}`).toBeTruthy();
    }
  });

  it('иконки всех состояний и фоны всех сцен', () => {
    for (const type of ['burn', 'poison', 'bleed', 'blessing', 'fury', 'vulnerable', 'heal_ban']) {
      expect(conditionIconUrl(type), `нет иконки: ${type}`).toBeTruthy();
    }
    const scenes: SceneId[] = ['station', 'ash_wastes_path', 'ash_tract', 'ruined_cathedral', 'catacombs', 'shattered_rampart', 'burned_village', 'throne_room'];
    for (const scene of scenes) {
      expect(sceneUrl(scene), `нет сцены: ${scene}`).toBeTruthy();
    }
  });

  it('UI-элементы и курсоры', () => {
    expect(uiUrl('orb_full')).toBeTruthy();
    expect(uiUrl('orb_empty')).toBeTruthy();
    expect(uiUrl('soul_icon')).toBeTruthy();
    expect(uiUrl('essence_icon')).toBeTruthy();
    expect(uiUrl('card_frame')).toBeTruthy();
    expect(uiUrl('cursor')).toBeTruthy();
    expect(uiUrl('cursor-hover')).toBeTruthy();
  });

  it('неизвестные id дают null (fallback на заглушки)', () => {
    expect(cardArtUrl('nonexistent_card')).toBeNull();
    expect(enemyPortraitUrl('nope')).toBeNull();
    expect(conditionIconUrl('slow')).toBeNull(); // состояние ещё не реализовано
  });

  it('art-store делегирует реестру', () => {
    const art = useArtStore();
    expect(art.artUrl('card', 'strike')).toBeTruthy();
    expect(art.artUrl('enemy', 'collector')).toBeTruthy();
    expect(art.artUrl('card', 'missing')).toBeNull();
  });
});
