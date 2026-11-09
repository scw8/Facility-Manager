// 상호작용 오브젝트(분전반, 문, 배식대 …)의 종류별 동작.
// 새 오브젝트 종류를 추가할 때는 HANDLERS에 prompt와 interact만 더하면 된다.
//
// game은 main.js가 넘겨주는 창구다:
//   state, world, showMessage(), goTo(), startWork(), onRepaired()

import { PANEL_STATE } from '../world/world.js';
import { TILE } from '../world/tiles.js';
import { completeRepair } from './progress.js';
import { applyEffect, EFFECTS } from './stats.js';
import { isBetween, skipFor, skipUntil } from '../core/clock.js';
import { COLOR, PROMOTION_SECONDS } from '../render/hud.js';

const INTERACT_RANGE = 1.8; // 칸
const OK_SECONDS = 1.2;
const SMILE_SECONDS = 1.5;

const REPAIR_SECONDS = 2.5; // 누전 수리에 E를 누르고 있어야 하는 시간 (정상 컨디션 기준)
const MEAL_MINUTES = 20;
const SHOWER_MINUTES = 15;
const SHOWER_FROM = '19:00'; // 검침(19:00)을 마친 뒤부터 씻을 수 있다
const REST_FROM = '22:00'; // 야간 휴게 시간
const REST_UNTIL = '06:00';

// 터치 기기에는 E키가 없으므로 안내 문구에서 뺀다
const KEY_HINT = window.matchMedia('(pointer: coarse)').matches ? '' : '[E] ';

function currentMeal(clock) {
  if (isBetween(clock, '12:00', '13:00')) return 'lunch';
  if (isBetween(clock, '18:00', '19:00')) return 'dinner';
  return null;
}

function finishRepair(panel, game) {
  const { state } = game;
  const { effects } = state;
  const faultType = panel.faultType;
  const promotions = completeRepair(state.progress, faultType);
  panel.state = PANEL_STATE.FIXED;
  panel.faultType = null;
  state.lastRepaired = panel;

  effects.okTimer = OK_SECONDS;
  effects.smileTimer = SMILE_SECONDS;
  game.showMessage('누전 수리 완료', COLOR.GOOD);

  if (promotions.length > 0) {
    effects.promotionRank = promotions[promotions.length - 1];
    effects.promotionTimer = PROMOTION_SECONDS;
    effects.smileTimer = PROMOTION_SECONDS;
  }

  game.onRepaired(panel, faultType, promotions);
}

const HANDLERS = {
  panel: {
    prompt: (panel) =>
      panel.state === PANEL_STATE.FAULT ? `${KEY_HINT}누르고 있으면 누전 수리` : null,

    interact(panel, game) {
      if (panel.state !== PANEL_STATE.FAULT) {
        game.showMessage('이상 없음');
        return;
      }
      game.startWork({
        target: panel,
        seconds: REPAIR_SECONDS,
        label: '누전 수리 중',
        onComplete: () => finishRepair(panel, game),
      });
    },
  },

  door: {
    prompt: (door) => (door.to ? `${KEY_HINT}문 열기` : null),

    interact(door, game) {
      if (!door.to) {
        game.showMessage(door.locked || '잠겨 있습니다');
        return;
      }
      game.goTo(door.to, door.spawn);
    },
  },

  counter: {
    prompt: () => `${KEY_HINT}식사하기`,

    interact(_counter, game) {
      const { state } = game;
      const meal = currentMeal(state.clock);
      if (!meal) {
        game.showMessage('배식 시간이 아닙니다 (12:00~13:00, 18:00~19:00)');
        return;
      }
      if (state.shift.meals.includes(meal)) {
        game.showMessage('이번 끼니는 이미 먹었습니다');
        return;
      }
      state.shift.meals.push(meal);
      applyEffect(state.stats, EFFECTS.meal);
      skipFor(state.clock, MEAL_MINUTES, '식사 중…');
      game.showMessage('든든하게 먹었다', COLOR.GOOD);
    },
  },

  shower: {
    prompt: () => `${KEY_HINT}씻기`,

    interact(_shower, game) {
      const { state } = game;
      if (!isBetween(state.clock, SHOWER_FROM, '08:00')) {
        game.showMessage(`검침을 마친 뒤(${SHOWER_FROM} 이후)에 씻을 수 있습니다`);
        return;
      }
      if (state.shift.showered) {
        game.showMessage('오늘은 이미 씻었습니다');
        return;
      }
      state.shift.showered = true;
      applyEffect(state.stats, EFFECTS.shower);
      skipFor(state.clock, SHOWER_MINUTES, '샤워 중…');
      game.showMessage('개운하다', COLOR.GOOD);
    },
  },

  bed: {
    prompt: () => `${KEY_HINT}휴식 (${REST_FROM}~${REST_UNTIL})`,

    interact(_bed, game) {
      const { state } = game;
      if (!isBetween(state.clock, REST_FROM, REST_UNTIL)) {
        game.showMessage(`야간 휴게 시간(${REST_FROM}~${REST_UNTIL})에만 쉴 수 있습니다`);
        return;
      }
      applyEffect(state.stats, EFFECTS.rest);
      skipUntil(state.clock, REST_UNTIL, '휴식 중… (고장이 나면 깨어납니다)', true);
    },
  },
};

// 바라보는 방향, 손 닿는 거리 안의 오브젝트
export function findTarget(map, player) {
  const hit = map.castRay(player.x, player.y, Math.cos(player.angle), Math.sin(player.angle));
  if (hit.tile === TILE.FLOOR || hit.dist > INTERACT_RANGE) return null;
  return map.objectAt(hit.cellX, hit.cellY);
}

export function promptFor(obj) {
  if (!obj) return null;
  return HANDLERS[obj.type]?.prompt(obj) ?? null;
}

export function interact(obj, game) {
  if (!obj) {
    game.showMessage('상호작용할 대상이 없습니다');
    return;
  }
  HANDLERS[obj.type]?.interact(obj, game);
}
