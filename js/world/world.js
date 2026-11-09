// 게임 전체의 맵 묶음. 현재 맵이 아닌 곳의 상태(고장 등)도 여기서 유지된다.

import { MAP_DATA } from '../../data/maps/index.js';
import { createMap, cellKey } from './map.js';
import { TILE } from './tiles.js';

export const PANEL_STATE = { NORMAL: 'normal', FAULT: 'fault', FIXED: 'fixed' };

export function createWorld() {
  const maps = new Map(MAP_DATA.map((data) => [data.id, createMap(data)]));

  // 문에 목적지 이름을 달아 둔다 ("지하 1층으로 이동" 안내용)
  for (const map of maps.values()) {
    for (const obj of map.objects.values()) {
      if (obj.type === 'door' && obj.to) obj.toName = maps.get(obj.to).name;
    }
  }

  // 누수가 날 수 있는 배관벽: 사람이 다가갈 수 있는 쪽이 있는 배관(%) 칸
  function leakCandidates() {
    const cells = [];
    for (const map of maps.values()) {
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (map.tileAt(x, y) !== TILE.PIPES || map.objectAt(x, y)) continue;
          const reachable = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map.isWalkable(x + dx, y + dy));
          if (reachable) cells.push({ map, x, y });
        }
      }
    }
    return cells;
  }

  function allLeaks() {
    const leaks = [];
    for (const map of maps.values()) {
      for (const obj of map.objects.values()) if (obj.type === 'leak') leaks.push(obj);
    }
    return leaks;
  }

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

    // 처리를 기다리는 고장: 누전된 분전반 + 배관 누수
    faults() {
      return [...allPanels().filter((p) => p.state === PANEL_STATE.FAULT), ...allLeaks()];
    },

    countFaults() {
      return this.faults().length;
    },

    // 배관벽 한 곳에 누수를 낸다
    spawnLeak(now = 0) {
      const cells = leakCandidates();
      if (cells.length === 0) return null;
      const { map, x, y } = cells[Math.floor(Math.random() * cells.length)];
      const leak = { type: 'leak', name: '배관 누수', x, y, faultSince: now, lastPenalty: now };
      map.objects.set(cellKey(x, y), leak);
      return leak;
    },

    // 고친 누수를 없앤다
    removeLeak(leak) {
      for (const map of maps.values()) {
        if (map.objects.get(cellKey(leak.x, leak.y)) === leak) map.objects.delete(cellKey(leak.x, leak.y));
      }
    },

    // 저장용: [[mapId, x, y, faultSince, lastPenalty], ...]
    saveLeaks() {
      const out = [];
      for (const map of maps.values()) {
        for (const obj of map.objects.values()) {
          if (obj.type === 'leak') out.push([map.id, obj.x, obj.y, obj.faultSince, obj.lastPenalty]);
        }
      }
      return out;
    },

    loadLeaks(list) {
      for (const [mapId, x, y, faultSince, lastPenalty] of list || []) {
        const map = maps.get(mapId);
        if (map && map.tileAt(x, y) === TILE.PIPES) {
          map.objects.set(cellKey(x, y), { type: 'leak', name: '배관 누수', x, y, faultSince, lastPenalty });
        }
      }
    },

    // 랜덤 분전반에 누전 고장을 낸다. except(방금 고친 분전반)는 후보에서 뺀다.
    // now: 고장이 난 절대 시각(분). 방치 시간을 잴 때 쓴다.
    spawnFault(except = null, now = 0) {
      const candidates = allPanels().filter(
        (p) => p.state !== PANEL_STATE.FAULT && p !== except
      );
      if (candidates.length === 0) return null;
      const panel = candidates[Math.floor(Math.random() * candidates.length)];
      panel.state = PANEL_STATE.FAULT;
      panel.faultType = 'short';
      panel.faultSince = now;
      panel.lastPenalty = now;
      return panel;
    },
  };
}
