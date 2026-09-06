/**
 * BattleEngine — ядро боя с поддержкой НЕСКОЛЬКИХ врагов (мульти-враг).
 * Чистый TypeScript: не знает про Phaser/Vue/DOM, ввод-вывод через EventBus.
 *
 * Устройство: враги живут в «слотах» (EnemySlot) — у каждого свой Combatant,
 * своя колода/рука, свой ИИ-план и намерение. Призыв (summon) добавляет слот
 * прямо в бою (фаза 2 боссов). Победа — когда мертвы ВСЕ враги.
 *
 * Протокол хода (пошаговый, управляется стором для анимаций):
 *   beginPlayerTurn() → [playCard(uid, targetId)...] → endPlayerTurn()
 *   → beginEnemyTurn() → executeEnemyStep() (N раз) → finishEnemyTurn()
 *   → beginPlayerTurn() ...
 */
import { BALANCE } from '@/core/config';
import { eventBus } from '@/core/EventBus';
import { createCard, cardCost, resolveCardAction, getCardDefinition } from '@/game/CardFactory';
import { buildPlanIntent, decide } from '@/game/EnemyAI';
import { DEFAULT_COMBAT_STATS } from '@/data/skills';
import { STATES, type StateContext } from '@/data/states';
import type {
  CardAction,
  CardInstance,
  Combatant,
  CombatStats,
  EnemyDefinition,
  EnemyIntent,
  GiftConfig,
  StateInstance,
  StateType,
  Tag,
} from '@/types';

export type BattlePhase = 'player' | 'enemy' | 'victory' | 'defeat' | 'spared';

/** Один шаг плана врагов (исполняется снаружи по одному — ради анимаций). */
export type EnemyStep =
  | { kind: 'playCard'; enemyIndex: number; card: CardInstance }
  | { kind: 'pass' };

/** Слот врага: боец + его колода/рука + ИИ-контекст. */
export interface EnemySlot {
  def: EnemyDefinition;
  unit: Combatant;
  drawPile: CardInstance[];
  hand: CardInstance[];
  intent: EnemyIntent;
  /** Индекс текущей фазы босса (-1 — не босс) */
  bossPhaseIndex: number;
  /** Плоский бонус урона (скейлинг глубины наследуется от основного врага) */
  dmgBonus: number;
  /** Враг пощадён (бой завершится исходом 'spared'). */
  spared?: boolean;
  /** Сообщение о милосердии уже выведено */
  mercyAnnounced?: boolean;
  /** Бонус смерти союзникам уже применён */
  deathHandled?: boolean;
  /** Жатва душ за эту смерть уже начислена */
  harvestDone?: boolean;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export class BattleEngine {
  readonly player: Combatant;
  /** Все слоты врагов (включая мёртвых — UI сам фильтрует по hp). */
  readonly enemySlots: EnemySlot[] = [];

  /** Зоны колоды игрока */
  drawPile: CardInstance[] = [];
  hand: CardInstance[] = [];
  discardPile: CardInstance[] = [];

  energy = 0;
  turn = 0;
  phase: BattlePhase = 'player';
  /** Модификаторы из дерева навыков */
  private stats: CombatStats;
  /** Плоский бонус урона врагов (скейлинг глубины) */
  private enemyDmgBonus: number;
  /** Расход «Несокрушимости» (раз в бой) */
  private lethalSaveUsed = false;

  /** Дар класса (уникальная пассивка): Шипы / Наконечник / Жатва душ */
  private readonly gift: GiftConfig | undefined;
  /** Наконечник: бонус первой атаки уже израсходован в этом ходу */
  private firstStrikeUsed = false;

  constructor(
    playerBaseHp: number,
    playerDeck: CardInstance[],
    enemyDefs: EnemyDefinition | EnemyDefinition[],
    stats: CombatStats = DEFAULT_COMBAT_STATS,
    enemyDmgBonus = 0,
    gift?: GiftConfig,
  ) {
    const maxHp = playerBaseHp + stats.maxHpBonus;
    this.player = {
      id: 'player',
      name: 'Пепельный',
      side: 'player',
      hp: maxHp,
      maxHp,
      block: 0,
      states: [],
    };
    this.stats = stats;
    this.enemyDmgBonus = enemyDmgBonus;
    this.gift = gift && gift.level > 0 ? gift : undefined;
    for (const def of Array.isArray(enemyDefs) ? enemyDefs : [enemyDefs]) {
      this.enemySlots.push(this.makeSlot(def, this.enemyDmgBonus));
    }
    // Копии инстансов: боевые зоны не должны мутировать коллекцию хаба
    this.drawPile = shuffle(playerDeck.map((c) => ({ ...c })));
  }

  // ==================== Доступ для UI ====================

  /** Живые враги. */
  get aliveSlots(): EnemySlot[] {
    return this.enemySlots.filter((s) => s.unit.hp > 0);
  }

  /** Слот «склонился»: mercy-враг ниже порога HP. */
  isMercyActive(slot: EnemySlot): boolean {
    if (!slot.def.mercy || slot.unit.hp <= 0) return false;
    return (slot.unit.hp / slot.unit.maxHp) * 100 < slot.def.mercy.hpPct;
  }

  /** Есть ли живой враг, которого можно пощадить (UI показывает кнопку). */
  mercyAvailable(): boolean {
    return this.aliveSlots.some((s) => this.isMercyActive(s));
  }

  /**
   * Пощадить всех «склонившихся» врагов. Убранные слоты помечаются spared;
   * если других живых врагов нет — бой завершается исходом 'spared'.
   */
  spareEnemy(): boolean {
    if (this.phase !== 'player') return false;
    const candidates = this.aliveSlots.filter((s) => this.isMercyActive(s));
    if (candidates.length === 0) return false;
    for (const slot of candidates) {
      slot.spared = true;
      slot.unit.hp = 0;
      slot.unit.block = 0;
      eventBus.emit('vfx:mercy', { targetId: slot.unit.id });
      eventBus.emit('log:message', { text: `${slot.unit.name} пощадена`, kind: 'state' });
    }
    this.checkDeath();
    return true;
  }

  /** Основной враг: первый живой (для совместимости UI/тестов). */
  get enemy(): Combatant {
    return this.aliveSlots[0]?.unit ?? this.enemySlots[0]!.unit;
  }

  /** Намерения всех живых врагов (порядок = порядок слотов). */
  get enemyIntents(): EnemyIntent[] {
    return this.aliveSlots.map((s) => s.intent);
  }

  /** Уровень основного врага. */
  get enemyLevel(): number {
    return this.aliveSlots[0]?.def.level ?? this.enemySlots[0]!.def.level;
  }

  /** Имя текущей фазы босса (null — босса нет/мёртв). */
  get bossPhaseName(): string | null {
    const boss = this.enemySlots.find((s) => s.def.boss && s.unit.hp > 0);
    if (!boss) return null;
    return boss.def.boss!.phases[boss.bossPhaseIndex]?.name ?? null;
  }

  // ==================== Публичное API ====================

  start(): void {
    this.phase = 'player';
    eventBus.emit('battle:started', { enemyName: this.enemy.name });
    if (this.stats.startBlock > 0) this.gainBlock(this.player, this.stats.startBlock);
    if (this.stats.blessingOnStart > 0) {
      this.applyState(this.player, {
        type: 'blessing',
        stacks: this.stats.blessingOnStart,
        duration: null,
      });
    }
    this.beginPlayerTurn();
  }

  /**
   * Сыграть карту из руки.
   * @param targetId цель ('enemy_N'); по умолчанию — выбранный/первый живой враг
   */
  playCard(uid: string, targetId?: string): boolean {
    if (this.phase !== 'player') return false;
    const idx = this.hand.findIndex((c) => c.uid === uid);
    if (idx === -1) return false;
    const card = this.hand[idx]!;
    const cardDef = getCardDefinition(card.defId);
    if (cardDef.curse) return false; // проклятые карты не играются
    const cost = cardCost(card);
    if (cost > this.energy) return false;

    const target = this.resolveTarget(targetId);
    if (!target) return false; // некому наносить урон

    this.energy -= cost;
    this.hand.splice(idx, 1);
    const attackTag = cardDef.tags[0]; // тег канала урона — для резистов
    let act = resolveCardAction(card);
    // Дар Странника «Наконечник»: первая атака хода бьёт сильнее
    if (
      cardDef.type === 'attack' &&
      this.gift?.id === 'first_strike' &&
      !this.firstStrikeUsed &&
      (act.damage ?? 0) > 0
    ) {
      this.firstStrikeUsed = true;
      act = { ...act, damage: (act.damage ?? 0) + this.gift.level };
      eventBus.emit('log:message', { text: `Наконечник: +${this.gift.level} урона`, kind: 'state' });
    }
    this.resolveAction(this.player, target, act, attackTag);
    eventBus.emit('vfx:cardPlayed', { cardDefId: card.defId, targetId: target.id });
    this.discardPile.push(card);
    this.checkDeath();
    return true;
  }

  endPlayerTurn(): void {
    if (this.phase !== 'player') return;
    if (this.stats.healPerTurn > 0) this.heal(this.player, this.stats.healPerTurn);
    this.tickStates(this.player);
    if (this.checkDeath()) return;
    // НЕ сбрасываем руку: несыгранные карты сохраняются для комбинаций
    // (добор до cardsPerTurn происходит в beginPlayerTurn)
    this.phase = 'enemy';
  }

  /** Ход врагов: план для каждого живого слота. Возвращает шаги для исполнения. */
  beginEnemyTurn(): EnemyStep[] {
    this.phase = 'enemy';
    this.turn += 1;
    eventBus.emit('turn:enemyStart', { turn: this.turn });

    const plan: EnemyStep[] = [];
    for (const slot of this.aliveSlots) {
      this.checkBossPhase(slot);
      this.runBossRitual(slot);

      // «Склонившийся» mercy-враг не сражается: только пассивно ждёт решения
      if (this.isMercyActive(slot)) {
        if (!slot.mercyAnnounced) {
          slot.mercyAnnounced = true;
          eventBus.emit('log:message', {
            text: `${slot.unit.name} опускает оружие. Она больше не сражается...`,
            kind: 'state',
          });
          eventBus.emit('vfx:mercy', { targetId: slot.unit.id });
        }
        slot.intent = { kind: 'unknown', cardName: 'ждёт решения...' };
        continue;
      }

      // Добор слота
      while (slot.hand.length < 3) {
        if (slot.drawPile.length === 0) {
          slot.drawPile = shuffle(slot.def.deck.map((id) => createCard(id)));
        }
        const card = slot.drawPile.pop();
        if (!card) break;
        slot.hand.push(card);
      }

      // План слота: играем, пока ИИ хочет и есть энергия (2)
      let energy = 2;
      const slotIndex = this.enemySlots.indexOf(slot);
      const picked: CardInstance[] = [];
      for (let i = 0; i < 10; i++) {
        const choice = decide(slot.def.aiStyle, {
          self: slot.unit,
          player: this.player,
          hand: slot.hand,
          energy,
        });
        if (!choice) break;
        energy -= cardCost(choice);
        slot.hand = slot.hand.filter((c) => c.uid !== choice.uid);
        picked.push(choice);
        plan.push({ kind: 'playCard', enemyIndex: slotIndex, card: choice });
      }
      // Точное намерение из реального плана (превью могло drift'уть):
      // модификаторы — текущие состояния (Ярость врага / Пробитая броня игрока)
      slot.intent = buildPlanIntent(picked, slot.dmgBonus, {
        attackerHasFury: this.hasState(slot.unit, 'fury'),
        targetHasVulnerable: this.hasState(this.player, 'vulnerable'),
      });
    }
    plan.push({ kind: 'pass' });
    return plan;
  }

  /** Исполнить один шаг врага (стор дергает по таймеру ради анимаций). */
  executeEnemyStep(step: EnemyStep): void {
    if (step.kind === 'pass') return;
    const slot = this.enemySlots[step.enemyIndex];
    if (!slot || slot.unit.hp <= 0) return; // враг погиб до своего шага
    const act = resolveCardAction(step.card);
    const attackTag = getCardDefinition(step.card.defId).tags[0];
    this.resolveAction(slot.unit, this.player, act, attackTag);
    this.checkDeath();
  }

  /** Завершение хода врагов: тики состояний каждого живого, новый ход игрока. */
  finishEnemyTurn(): void {
    if (this.phase === 'enemy') {
      for (const slot of this.aliveSlots) {
        this.tickStates(slot.unit);
      }
      if (this.checkDeath()) return;
    }
    this.beginPlayerTurn();
  }

  /** Призвать врага в бою (ритуалы боссов, сценарные события). */
  spawnEnemy(def: EnemyDefinition, hpOverride?: number): Combatant {
    const slot = this.makeSlot(def, 0);
    if (hpOverride) {
      slot.unit.maxHp = hpOverride;
      slot.unit.hp = hpOverride;
    }
    this.enemySlots.push(slot);
    eventBus.emit('vfx:enemySpawned', { targetId: slot.unit.id, defId: def.id });
    return slot.unit;
  }

  // ==================== Внутренняя механика ====================

  private makeSlot(def: EnemyDefinition, dmgBonus: number): EnemySlot {
    const index = this.enemySlots.length;
    return {
      def,
      unit: {
        id: `enemy_${index}`,
        name: def.name,
        side: 'enemy' as const,
        hp: def.maxHp,
        maxHp: def.maxHp,
        block: 0,
        states: [],
      },
      drawPile: shuffle(def.deck.map((id) => createCard(id))),
      hand: [],
      intent: { kind: 'unknown' as const, cardName: '...' },
      bossPhaseIndex: def.boss ? 0 : -1,
      dmgBonus,
    };
  }

  private resolveTarget(targetId?: string): Combatant | null {
    if (targetId) {
      const slot = this.enemySlots.find((s) => s.unit.id === targetId && s.unit.hp > 0);
      if (slot) return slot.unit;
    }
    return this.aliveSlots[0]?.unit ?? null;
  }

  private beginPlayerTurn(): void {
    this.phase = 'player';
    this.player.block = 0;
    this.energy = BALANCE.player.energyPerTurn + this.stats.energyPerTurnBonus;
    this.firstStrikeUsed = false;
    // Перк 10+ «Наконечника»: в первый ход боя сосуд горит ярче — +1 энергия
    if (this.gift?.id === 'first_strike' && this.gift.level >= 10 && this.turn === 0) {
      this.energy += 1;
      eventBus.emit('log:message', { text: 'Наконечник: +1 энергия в первый ход', kind: 'state' });
    }
    const cardsPerTurn = BALANCE.player.cardsPerTurn + this.stats.cardsPerTurnBonus;

    // Добор руки ДО cardsPerTurn (несыгранные карты сохраняются для комбинаций)
    while (this.hand.length < cardsPerTurn) {
      if (this.drawPile.length === 0) {
        if (this.discardPile.length === 0) break;
        this.drawPile = shuffle(this.discardPile);
        this.discardPile = [];
      }
      const card = this.drawPile.pop();
      if (!card) break;
      this.hand.push(card);
    }

    eventBus.emit('turn:playerStart', { turn: this.turn });

    // Проклятие «Пепельная смола»: −2 HP за каждую копию в руке
    const tarCount = this.hand.filter((c) => c.defId === 'curse_tar').length;
    if (tarCount > 0) {
      const tarDmg = 2 * tarCount;
      eventBus.emit('log:message', { text: `Пепельная смола: −${tarDmg} HP`, kind: 'damage' });
      this.dealStateDamage(this.player, tarDmg);
      if (this.checkDeath()) return;
    }

    // Намерения: полное превью плана (все карты хода) без мутации слота.
    // Пробитая броня игрока учитывается, только если доживёт до хода врага
    // (её длительность тикнет в конце ХОДА ИГРОКА — до хода врага).
    for (const slot of this.aliveSlots) {
      const vuln = this.player.states.find((s) => s.type === 'vulnerable');
      const vulnAlive = vuln ? vuln.duration === null || vuln.duration > 1 : false;
      slot.intent = buildPlanIntent(this.previewPlan(slot), slot.dmgBonus, {
        attackerHasFury: this.hasState(slot.unit, 'fury'),
        targetHasVulnerable: vulnAlive,
      });
    }
  }

  /**
   * Симуляция плана слота на его следующий ход (без мутации руки/колоды):
   * тот же добор до 3 карт и тот же цикл decide(), что в beginEnemyTurn().
   */
  private previewPlan(slot: EnemySlot): CardInstance[] {
    const simHand = [...slot.hand];
    const simDraw = [...slot.drawPile];
    while (simHand.length < 3) {
      if (simDraw.length === 0) break; // реальный ход сделает решаффл — превью обрываем
      const card = simDraw.pop();
      if (!card) break;
      simHand.push(card);
    }
    let energy = 2;
    const picked: CardInstance[] = [];
    for (let i = 0; i < 10; i++) {
      const choice = decide(slot.def.aiStyle, {
        self: slot.unit,
        player: this.player,
        hand: simHand,
        energy,
      });
      if (!choice) break;
      energy -= cardCost(choice);
      picked.push(choice);
      const idx = simHand.findIndex((c) => c.uid === choice.uid);
      if (idx >= 0) simHand.splice(idx, 1);
    }
    return picked;
  }

  /** Исполнить действие карты. @param attackTag тег канала урона (для резистов) */
  private resolveAction(source: Combatant, target: Combatant, act: CardAction, attackTag?: string): void {
    if (act.damage) {
      if (act.aoe && source.side === 'player') {
        // «Волна пепла»: удар по ВСЕМ живым врагам
        for (const slot of this.aliveSlots) {
          this.dealAttackDamage(source, slot.unit, act.damage, attackTag, act.stripBlock, act.pierceBlock);
        }
      } else {
        this.dealAttackDamage(source, target, act.damage, attackTag, act.stripBlock, act.pierceBlock);
      }
    }
    if (act.block) {
      this.gainBlock(source, act.block);
    }
    if (act.heal) {
      this.heal(source, act.heal);
    }
    if (act.cleanse) {
      const c = act.cleanse;
      const holder = c.target === 'self' ? source : target;
      this.cleanseStates(holder, c.positive ?? false, c.count);
    }
    if (act.discardHand && source.side === 'enemy') {
      // «Жрец-призрак» сжигает карты руки игрока
      for (let i = 0; i < act.discardHand && this.hand.length > 0; i++) {
        const idx = Math.floor(Math.random() * this.hand.length);
        const [burned] = this.hand.splice(idx, 1);
        if (burned) {
          this.discardPile.push(burned);
          eventBus.emit('log:message', { text: `Карта «${getCardDefinition(burned.defId).name}» сожжена`, kind: 'state' });
        }
      }
    }
    if (act.applyState) {
      const st = act.applyState;
      const holder = st.target === 'self' ? source : target;
      this.applyState(holder, { type: st.type, stacks: st.stacks, duration: st.duration }, source.side === 'player');
    }
    if (act.draw && source.side === 'player') {
      for (let i = 0; i < act.draw; i++) {
        if (this.drawPile.length === 0) {
          if (this.discardPile.length === 0) break;
          this.drawPile = shuffle(this.discardPile);
          this.discardPile = [];
        }
        const c = this.drawPile.pop();
        if (c) this.hand.push(c);
      }
    }
    // Энергия всегда начисляется ИГРОКУ: своя карта даёт себе,
    // вражеская — парадоксальный подарок («Воспоминание» отголоска)
    if (act.energy) {
      this.energy += act.energy;
    }
  }

  /** Атака: бонусы Мощи, Ярость атакующего, Пробитая броня цели, Кровотечение. */
  private dealAttackDamage(
    attacker: Combatant,
    target: Combatant,
    base: number,
    attackTag?: string,
    stripBlock = 0,
    pierceBlock = 0,
  ): void {
    let dmg = base;
    if (attacker.side === 'player') {
      dmg += this.stats.bonusDamage;
      dmg *= 1 + this.stats.damageMultBonus;
    } else {
      const slot = this.enemySlots.find((s) => s.unit === attacker);
      dmg += slot?.dmgBonus ?? this.enemyDmgBonus;
    }
    if (this.hasState(attacker, 'fury')) dmg *= BALANCE.combat.furyDamageMult;
    if (this.hasState(target, 'vulnerable')) dmg *= BALANCE.combat.vulnerableDamageMult;

    // Резисты цели по тегу урона (огненный голем почти не горит)
    if (attackTag) {
      const slot = this.enemySlots.find((s) => s.unit === target);
      const mult = slot?.def.resistances?.[attackTag as Tag];
      if (mult !== undefined) {
        dmg *= mult;
        eventBus.emit('log:message', {
          text: `${target.name}: сопротивление (${attackTag})`,
          kind: 'state',
        });
      }
    }

    // «Магический удар»: снять N блока ДО удара
    if (stripBlock > 0 && target.block > 0) {
      const stripped = Math.min(target.block, stripBlock);
      target.block -= stripped;
      if (stripped > 0) {
        eventBus.emit('log:message', { text: `${target.name}: пробит блок (−${stripped})`, kind: 'state' });
      }
    }

    const bleed = attacker.states.find((s) => s.type === 'bleed');
    if (bleed) STATES.bleed.onHolderAttack?.(attacker, bleed, this.stateCtx());

    this.applyDamage(target, Math.floor(dmg), pierceBlock);

    // Дар Рыцаря «Шипы»: удар по игроку обжигает атакующего (сквозь блок)
    if (
      target.side === 'player' &&
      attacker.side === 'enemy' &&
      this.gift?.id === 'thorns' &&
      attacker.hp > 0
    ) {
      const lvl = this.gift.level;
      const thorns = lvl >= 10 ? Math.floor(lvl * 1.5) : lvl;
      eventBus.emit('log:message', { text: `Шипы: ${attacker.name} −${thorns} HP`, kind: 'state' });
      this.dealStateDamage(attacker, thorns); // игнорирует блок по определению
      // Перк 5+: отражение разбивает броню атакующего
      if (lvl >= 5) {
        this.applyState(attacker, { type: 'vulnerable', stacks: 1, duration: 2 });
      }
    }
  }

  /** Снять у носителя N состояний заданной полярности («Свеча памяти»/«Корона»). */
  private cleanseStates(holder: Combatant, positive: boolean, count: number): void {
    const removable = holder.states.filter((s) => (STATES[s.type].positive ?? false) === positive);
    for (let i = 0; i < count && i < removable.length; i++) {
      const s = removable[i]!;
      holder.states = holder.states.filter((x) => x !== s);
      STATES[s.type].onRemove?.(holder, s);
      eventBus.emit('log:message', {
        text: `${holder.name}: снято «${STATES[s.type].name}»`,
        kind: 'state',
      });
    }
  }

  /** Босс слота: переход в следующую фазу при падении HP ниже порога. */
  private checkBossPhase(slot: EnemySlot): void {
    const boss = slot.def.boss;
    if (!boss) return;
    const next = boss.phases[slot.bossPhaseIndex + 1];
    if (!next) return;
    const hpPct = (slot.unit.hp / slot.unit.maxHp) * 100;
    if (hpPct < next.hpThresholdPct) {
      slot.bossPhaseIndex += 1;
      eventBus.emit('log:message', {
        text: `${slot.unit.name}: фаза «${next.name}»!`,
        kind: 'state',
      });
      if (next.onEnter) {
        if (next.onEnter.heal) this.heal(slot.unit, next.onEnter.heal);
        if (next.onEnter.block) this.gainBlock(slot.unit, next.onEnter.block);
        if (next.onEnter.applyState) {
          this.applyState(slot.unit, {
            type: next.onEnter.applyState.type,
            stacks: next.onEnter.applyState.stacks,
            duration: next.onEnter.applyState.duration,
          });
        }
      }
      // Фаза может призывать подкрепление («Призыв теней»)
      if (next.summon) {
        for (let i = 0; i < (next.summon.count ?? 1); i++) {
          this.spawnEnemy(
            { ...SUMMON_PLACEHOLDER, id: next.summon.defId, name: next.summon.name ?? next.summon.defId, deck: next.summon.deck ?? SUMMON_PLACEHOLDER.deck, maxHp: next.summon.hp } as EnemyDefinition,
            next.summon.hp,
          );
        }
      }
    }
  }

  /** Босс слота: периодический ритуал (каждые N ходов). */
  private runBossRitual(slot: EnemySlot): void {
    const ritual = slot.def.boss?.ritual;
    if (!ritual || this.turn % ritual.everyTurns !== 0) return;
    eventBus.emit('log:message', { text: `${slot.unit.name}: ${ritual.label}!`, kind: 'state' });
    if (ritual.summon) {
      for (let i = 0; i < (ritual.summon.count ?? 1); i++) {
        this.spawnEnemy(
          { ...SUMMON_PLACEHOLDER, id: ritual.summon.defId, name: ritual.summon.name ?? ritual.summon.defId, deck: ritual.summon.deck ?? SUMMON_PLACEHOLDER.deck },
          ritual.summon.hp,
        );
      }
    }
    if (ritual.action) this.resolveAction(slot.unit, this.player, ritual.action);
  }

  /** Прямое снижение HP; pierce — сколько блока игнорируется. */
  private applyDamage(target: Combatant, amount: number, pierce = 0): void {
    let remaining = amount;
    const effectiveBlock = Math.max(0, target.block - pierce);
    if (effectiveBlock > 0) {
      const absorbed = Math.min(effectiveBlock, remaining);
      target.block -= absorbed;
      remaining -= absorbed;
      if (absorbed > 0) eventBus.emit('vfx:block', { targetId: target.id, amount: absorbed });
    }
    if (remaining > 0) {
      this.reduceHp(target, remaining);
    }
  }

  /** Урон от состояний: игнорирует блок (внутренние раны). */
  private dealStateDamage(target: Combatant, amount: number): void {
    const dmg = Math.max(0, Math.floor(amount));
    if (dmg === 0) return;
    this.reduceHp(target, dmg);
  }

  /** Единая точка снижения HP: «Несокрушимость», фазы боссов. */
  private reduceHp(target: Combatant, amount: number): void {
    target.hp = Math.max(0, target.hp - amount);
    if (
      target.hp === 0 &&
      target.side === 'player' &&
      this.stats.surviveLethalOnce &&
      !this.lethalSaveUsed
    ) {
      this.lethalSaveUsed = true;
      target.hp = 1;
      eventBus.emit('log:message', { text: 'Несокрушимость: вы выжили с 1 HP', kind: 'state' });
    }
    eventBus.emit('vfx:damage', { targetId: target.id, amount, hpAfter: target.hp });
    if (target.side === 'enemy' && target.hp > 0) {
      const slot = this.enemySlots.find((s) => s.unit === target);
      if (slot) this.checkBossPhase(slot);
    }
  }

  private gainBlock(c: Combatant, base: number): void {
    let block = base;
    if (c.side === 'player') block += this.stats.bonusBlock;
    if (this.hasState(c, 'fury')) block *= BALANCE.combat.furyBlockMult;
    const amount = Math.floor(block);
    if (amount <= 0) return;
    c.block += amount;
    eventBus.emit('vfx:block', { targetId: c.id, amount });
  }

  private heal(c: Combatant, amount: number): void {
    // «Проклятие Короля»: печать лечения блокирует карты/HoT на ход
    if (this.hasState(c, 'heal_ban')) {
      eventBus.emit('log:message', { text: `${c.name}: лечение запечатано`, kind: 'state' });
      return;
    }
    let healed = amount;
    if (c.side === 'player') healed = Math.floor(healed * (1 + this.stats.healMultBonus));
    healed = Math.min(c.maxHp - c.hp, healed);
    if (healed <= 0) return;
    c.hp += healed;
    eventBus.emit('vfx:heal', { targetId: c.id, amount: healed, hpAfter: c.hp });
  }

  private applyState(holder: Combatant, incoming: StateInstance, fromPlayer = false): void {
    const inst = fromPlayer
      ? { ...incoming, stacks: incoming.stacks + this.stats.stateStacksBonus }
      : { ...incoming };
    const def = STATES[inst.type];
    const existing = holder.states.find((s) => s.type === inst.type);
    if (existing) {
      def.merge(existing, inst);
      eventBus.emit('vfx:state', { targetId: holder.id, state: existing, isNew: false });
    } else {
      holder.states.push(inst);
      eventBus.emit('vfx:state', { targetId: holder.id, state: inst, isNew: true });
    }
  }

  /** Тик состояний в конце хода носителя: DoT/HoT → уменьшение длительности. */
  private tickStates(holder: Combatant): void {
    const ctx = this.stateCtx();
    for (const s of [...holder.states]) {
      STATES[s.type].onTurnEnd?.(holder, s, ctx);
    }
    holder.states = holder.states.filter((s) => {
      if (s.type === 'poison' && s.stacks <= 0) return false;
      if (s.duration !== null) s.duration -= 1;
      const alive = s.duration === null || s.duration > 0;
      if (!alive) STATES[s.type].onRemove?.(holder, s);
      return alive;
    });
  }

  private hasState(c: Combatant, type: StateType): boolean {
    return c.states.some((s) => s.type === type);
  }

  private stateCtx(): StateContext {
    return {
      dealDamage: (target, amount) => this.dealStateDamage(target, amount),
      heal: (target, amount) => this.heal(target, amount),
    };
  }

  /** Возвращает true, если бой закончился. Победа — все враги мертвы;
   *  если хоть один пощадён вместо убийства — исход 'spared'. */
  private checkDeath(): boolean {
    // Дар Жреца «Жатва душ»: смерть врага затягивает раны сосуда (раз за врага)
    if (this.gift?.id === 'soul_harvest') {
      for (const slot of this.enemySlots) {
        if (slot.unit.hp <= 0 && !slot.harvestDone) {
          slot.harvestDone = true;
          const lvl = this.gift.level;
          const amount = lvl >= 10 ? Math.floor(lvl * 1.5) : lvl; // перк 10+: жатва щедрее
          this.heal(this.player, amount); // уважает Порчу (heal_ban)
          if (lvl >= 5) this.gainBlock(this.player, 2); // перк 5+: +2 блока при жатве
          eventBus.emit('log:message', { text: `Жатва душ: +${amount} HP`, kind: 'heal' });
        }
      }
    }
    // Смерть врага бафает выживших («Рой мусорщиков»: +1 урон за павшего)
    for (const slot of this.enemySlots) {
      if (slot.deathHandled) continue;
      if (slot.unit.hp <= 0 && slot.def.allyDeathBonus) {
        slot.deathHandled = true;
        for (const ally of this.aliveSlots) {
          if (ally === slot) continue;
          ally.dmgBonus += slot.def.allyDeathBonus;
        }
        eventBus.emit('log:message', {
          text: `Тени яростнее (+${slot.def.allyDeathBonus} урона)`,
          kind: 'state',
        });
      }
    }

    if (this.enemySlots.every((s) => s.unit.hp <= 0) && this.phase !== 'victory' && this.phase !== 'spared') {
      const anySpared = this.enemySlots.some((s) => s.spared);
      this.phase = anySpared ? 'spared' : 'victory';
      eventBus.emit('battle:ended', { result: this.phase });
      return true;
    }
    if (this.player.hp <= 0 && this.phase !== 'defeat') {
      this.phase = 'defeat';
      eventBus.emit('battle:ended', { result: 'defeat' });
      return true;
    }
    return false;
  }
}

/** Заготовка определения для призываемых существ (карты врага по умолчанию). */
const SUMMON_PLACEHOLDER: EnemyDefinition = {
  id: 'summon',
  name: 'Тень',
  maxHp: 10,
  level: 1,
  aiStyle: 'aggressive',
  deck: ['enemy_slash'],
  soulsDrop: 0,
  essenceChance: 0,
};
