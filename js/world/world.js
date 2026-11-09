// 게임 전체의 맵 묶음. 현재 맵이 아닌 곳의 상태(고장 등)도 여기서 유지된다.

import { MAP_DATA } from '../../data/maps/index.js';
import { createMap } from './map.js';

export const PANEL_STATE = { NORMAL: 'normal', FAULT: 'fault', FIXED: 'fixed' };

export function createWorld() {
  const maps = new Map(MAP_DATA.map((data) => [data.id, createMap(data)]));

  function allPanels() {
    const panels = [];
    for (const map of maps.values()) {
      for (const obj of map.objects.values()) {
        if (obj.type === 'panel') panels.push(obj);
      }
    }
    return panels;
  }

  return {
    maps,

    getMap(id) {
      const map = maps.get(id);
      if (!map) throw new Error(`없는 맵입니다: ${id}`);
      return map;
    },

    countFaults() {
      return allPanels().filter((p) => p.state === PANEL_STATE.FAULT).length;
    },

    // 랜덤 분전반에 누전 고장을 낸다. except(방금 고친 분전반)는 후보에서 뺀다.
    spawnFault(except = null) {
      const candidates = allPanels().filter(
        (p) => p.state !== PANEL_STATE.FAULT && p !== except
      );
      if (candidates.length === 0) return null;
      const panel = candidates[Math.floor(Math.random() * candidates.length)];
      panel.state = PANEL_STATE.FAULT;
      panel.faultType = 'short';
      return panel;
    },
  };
}
