/**
 * Реестр врагов Угольных пустошей: обычные, элитные, миньоны и босс.
 * Все данные декларативные — скейлинг по глубине применяет EnemyFactory,
 * здесь только базовые значения. Числа перенесены со старого ростера 1:1.
 */
import type { EnemyDefinition } from '@/types';

export const ENEMIES: Record<string, EnemyDefinition> = {
  // ---------- Обычные ----------
  lost_passerby: {
    id: 'lost_passerby',
    name: 'Пустотелый',
    scene: 'ash_wastes_path',
    maxHp: 44,
    level: 1,
    aiStyle: 'aggressive',
    deck: ['enemy_slash', 'enemy_slash', 'enemy_crush', 'enemy_guard', 'enemy_hex'],
    soulsDrop: 60,
    essenceChance: 0.3,
    artPrompt: 'hunched hollow wretch with cracked ashen skin and faint empty eyes, wrapped in tattered burial cloth, shuffling lost pose, one claw reaching forward',
  },
  rusty_dog: {
    id: 'rusty_dog',
    name: 'Гниющий пёс',
    scene: 'ash_wastes_path',
    maxHp: 36,
    level: 1,
    aiStyle: 'aggressive',
    deck: ['enemy_bleed_bite', 'enemy_bleed_bite', 'enemy_slash', 'enemy_crush'],
    soulsDrop: 55,
    essenceChance: 0.25,
    artPrompt: 'feral rotting hound with mangy hide and exposed ribs, jaw split open mid-snarl, embers drifting in fog behind, crouched low ready to pounce',
  },
  cleaner_drone: {
    id: 'cleaner_drone',
    name: 'Могильщик',
    scene: 'ash_tract',
    maxHp: 38,
    level: 2,
    aiStyle: 'defensive',
    deck: ['enemy_poison_arrow', 'enemy_poison_arrow', 'enemy_guard', 'enemy_guard', 'enemy_slash'],
    soulsDrop: 65,
    essenceChance: 0.3,
    artPrompt: 'hunched gravedigger wretch in a bone plague mask, rusted shovel raised defensively, hanging lantern glowing sickly green',
  },
  vending_machine: {
    id: 'vending_machine',
    name: 'Одержимый жрец',
    scene: 'ruined_cathedral',
    maxHp: 53,
    level: 2,
    aiStyle: 'tactical',
    deck: ['enemy_smite', 'enemy_smite', 'enemy_mend', 'enemy_hex', 'enemy_guard'],
    soulsDrop: 80,
    essenceChance: 0.35,
    resistances: { poison: 0.5 },
    artPrompt: 'fanatic ash-cult priest with robes fused into charcoal skin, clutching a smoldering censer on a chain, wild burning eyes, hurling curse fire',
  },
  security_camera: {
    id: 'security_camera',
    name: 'Пепельный ворон',
    scene: 'shattered_rampart',
    maxHp: 48,
    level: 3,
    aiStyle: 'balanced',
    deck: ['enemy_slash', 'enemy_smite', 'enemy_warcry', 'enemy_guard', 'enemy_guard'],
    soulsDrop: 70,
    essenceChance: 0.3,
    artPrompt: 'giant ash-feathered crow with embers for eyes, wings half-spread on a broken rampart, tilted hostile gaze, grey ash falling',
  },

  // ---------- Элитные ----------
  laundry_unit: {
    id: 'laundry_unit',
    name: 'Рыцарь-отступник',
    maxHp: 60,
    level: 3,
    aiStyle: 'defensive',
    scene: 'burned_village',
    deck: ['mirror_slash', 'enemy_guard', 'mirror_slash', 'enemy_hex'],
    soulsDrop: 70,
    essenceChance: 0.4,
    artPrompt: 'renegade knight in mismatched scorched armor pieces rising from a knee, twin notched blades, defiant guarded stance, burning village behind',
  },
  lost_courier: {
    id: 'lost_courier',
    name: 'Павший странник',
    maxHp: 46,
    level: 2,
    aiStyle: 'balanced',
    scene: 'catacombs',
    deck: ['echo_strike', 'echo_memory', 'echo_strike', 'echo_memory', 'enemy_slash'],
    soulsDrop: 55,
    essenceChance: 0.3,
    mercy: { hpPct: 20 },
    artPrompt: 'dying hooded wanderer dragging a torn travel cloak, worn sword used as a crutch, faint soul-light flickering in the chest, limping desperate pose',
  },
  welder_bot: {
    id: 'welder_bot',
    name: 'Обугленный латник',
    maxHp: 52,
    level: 2,
    aiStyle: 'defensive',
    scene: 'ash_tract',
    deck: ['enemy_guard', 'golem_smash', 'enemy_smite', 'golem_smash'],
    soulsDrop: 60,
    essenceChance: 0.35,
    resistances: { fire: 0.25 },
    artPrompt: 'charred heavy knight with smoldering embers glowing inside cracked armor, raising a burning mace behind a tall shield, guarded stance',
  },

  // ---------- Миньоны ----------
  scavenger_drone: {
    id: 'scavenger_drone',
    name: 'Пепельный прислужник',
    maxHp: 15,
    level: 3,
    aiStyle: 'aggressive',
    deck: ['shadow_hit'],
    soulsDrop: 0,
    essenceChance: 0,
    artPrompt: 'small crawling ash imp made of cinders and bone splinters, claws clutching a stolen trinket, darting low pose',
  },

  // ---------- Босс ----------
  collector: {
    id: 'collector',
    name: 'Король-Пепел',
    scene: 'throne_room',
    maxHp: 85,
    level: 5,
    aiStyle: 'aggressive',
    deck: ['boss_bone_smash', 'boss_bone_smash', 'enemy_smite', 'boss_ossuary', 'boss_decree'],
    soulsDrop: 250,
    essenceChance: 1.0,
    boss: {
      phases: [
        { name: 'Трон из пепла', hpThresholdPct: 100 },
        {
          name: 'Зов углей',
          hpThresholdPct: 50,
          summon: { defId: 'scavenger_drone', name: 'Пепельный прислужник', hp: 15, count: 2, deck: ['shadow_hit'] },
        },
      ],
      ritual: {
        everyTurns: 3,
        label: 'Поглощение душ',
        action: { heal: 8 },
      },
    },
    artPrompt: 'colossal Ash King towering from a throne of cinders: crown of melted swords fused to his skull, robes of grey ash flowing like smoke, one hand radiating pale soul-flame, dead burning world behind, boss arena',
  },
};

/** Пул обычных врагов для генерации узлов похода. */
export const NORMAL_ENEMY_POOL: string[] = [
  'lost_passerby',
  'rusty_dog',
  'cleaner_drone',
  'vending_machine',
  'security_camera',
];

/** Элитные враги (узлы «Лютый враг»). */
export const ELITE_ENEMY_POOL: string[] = ['laundry_unit', 'lost_courier', 'welder_bot'];

/** Боссы (глубина, кратная BALANCE.progression.bossEveryDepth). */
export const BOSS_POOL: string[] = ['collector'];
