// 상호작용 오브젝트(분전반, 문 …)의 종류별 동작.
// 새 오브젝트 종류를 추가할 때는 HANDLERS에 prompt와 interact만 더하면 된다.

import { PANEL_STATE } from '../world/world.js';
import { TILE } from '../world/tiles.js';
import { completeRepair } from './progress.js';
import { COLOR, PROMOTION_SECONDS } from '../render/hud.js';

const INTERACT_RANGE = 1.8; // 칸
const OK_SECONDS = 1.2;
const SMILE_SECONDS = 1.5;

// 터치 기기에는 E키가 없으므로 안내 문구에서 뺀다
const KEY_HINT = window.matchMedia('(pointer: coarse)').matches ? '' : '[E] ';

const HANDLERS = {
  panel: {
    prompt: (panel) => (panel.state === PANEL_STATE.FAULT ? `${KEY_HINT}누전 수리` : null),

    interact(panel, game) {
      if (panel.state !== PANEL_STATE.FAULT) {
        game.showMessage('이상 없음');
        return;
      }
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

      game.onRepaired(faultType, promotions);
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
