// 우측 상단 미니맵. 맵이 표시 범위보다 크면 플레이어를 따라 스크롤한다.

import { TILE } from '../world/tiles.js';
import { PANEL_STATE } from '../world/world.js';
import { SCREEN_W, FOV_PLANE } from './renderer.js';

const CELL = 3;
const MAX_COLS = 22;
const MAX_ROWS = 16;
const MARGIN = 3;
const CONE_RADIUS = 4 * CELL;
const TILE_COLORS = {
  [TILE.CONCRETE]: '#77797a',
  [TILE.PIPES]: '#a88f2e',
  [TILE.PANEL]: '#c4ccd0',
  [TILE.DOOR]: '#99633a',
  [TILE.COUNTER]: '#e0c060',
  [TILE.BED]: '#5a7ac8',
  [TILE.SHOWER]: '#8fd0e8',
  [TILE.TABLE]: '#c08850',
  [TILE.HMI]: '#e8e0b0',
  [TILE.HEATMETER]: '#f0d020',
  [TILE.GENERATOR]: '#4a8a4a',
  [TILE.PIT]: '#4a6aa8',
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 미니맵이 화면에서 차지하는 영역. HUD가 그 아래에 글자를 놓을 때도 쓴다.
export function minimapRect(map) {
  const cols = Math.min(map.width, MAX_COLS);
  const rows = Math.min(map.height, MAX_ROWS);
  const w = cols * CELL;
  const h = rows * CELL;
  return { x: SCREEN_W - w - MARGIN, y: MARGIN, w, h, cols, rows };
}

export function drawMinimap(ctx, map, player, time) {
  const rect = minimapRect(map);
  const blinkOn = Math.floor(time * 3) % 2 === 0;

  // 보이는 범위의 왼쪽 위 칸. 플레이어를 가운데 두되 맵 밖으로는 나가지 않는다.
  const startX = clamp(Math.floor(player.x - rect.cols / 2), 0, map.width - rect.cols);
  const startY = clamp(Math.floor(player.y - rect.rows / 2), 0, map.height - rect.rows);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  for (let j = 0; j < rect.rows; j++) {
    for (let i = 0; i < rect.cols; i++) {
      const x = startX + i;
      const y = startY + j;
      const tile = map.tileAt(x, y);
      if (tile === TILE.FLOOR) continue;
      let color = TILE_COLORS[tile];
      if (tile === TILE.PANEL) {
        const { state } = map.objectAt(x, y);
        if (state === PANEL_STATE.FIXED) color = '#3cff6e';
        if (state === PANEL_STATE.FAULT) color = blinkOn ? '#ff2a20' : '#5a1410';
      }
      ctx.fillStyle = color;
      ctx.fillRect(rect.x + i * CELL, rect.y + j * CELL, CELL, CELL);
    }
  }

  const px = rect.x + (player.x - startX) * CELL;
  const py = rect.y + (player.y - startY) * CELL;
  const halfFov = Math.atan(FOV_PLANE);

  // 시야각 부채꼴. 미니맵 밖으로 삐져나가지 않게 자른다.
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 224, 70, 0.4)';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, CONE_RADIUS, player.angle - halfFov, player.angle + halfFov);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#ffe046';
  ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
}
