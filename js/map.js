// 맵 데이터와 분전반(고장 위치) 상태.

const TILE = { FLOOR: 0, CONCRETE: 1, PIPES: 2, PANEL: 3, DOOR: 4 };

const PANEL_STATE = { NORMAL: 0, FAULT: 1, FIXED: 2 };

// 소형 오피스텔 지하층 (가상 구조)
// 좌상단: 기계실 / 우상단: 전기실 / 가운데: 공용복도 / 하단: 창고·계단실
// 철문(4)은 지금은 장식이라 맵 외곽에만 둔다. 층 이동을 넣을 때 맵 전환 칸으로 쓴다.
const MAP = [
  [2, 2, 2, 2, 2, 2, 3, 2, 2, 2, 1, 1, 1, 1, 3, 1, 1, 1, 3, 1, 1, 1],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [2, 0, 0, 2, 2, 0, 0, 2, 0, 2, 1, 0, 0, 3, 1, 1, 3, 1, 0, 0, 0, 3],
  [2, 0, 0, 2, 2, 0, 0, 2, 0, 2, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1],
  [3, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [2, 2, 2, 2, 0, 0, 2, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4],
  [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 1],
  [3, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 3, 0, 3, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1, 1, 4, 1, 1],
];

const MAP_H = MAP.length;
const MAP_W = MAP[0].length;

const PLAYER_START = { x: 2.5, y: 8.5, angle: 0 }; // angle 0 = 동쪽(맵 오른쪽)

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return TILE.CONCRETE;
  return MAP[y][x];
}

function isWalkable(x, y) {
  return tileAt(x, y) === TILE.FLOOR;
}

// 분전반 목록. 렌더러가 매 프레임 조회하므로 칸 번호로도 찾을 수 있게 둔다.
const panels = [];
const panelByCell = new Map();

for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    if (MAP[y][x] === TILE.PANEL) {
      const panel = { x, y, state: PANEL_STATE.NORMAL, faultType: null };
      panels.push(panel);
      panelByCell.set(y * MAP_W + x, panel);
    }
  }
}

function panelAt(x, y) {
  return panelByCell.get(y * MAP_W + x) || null;
}

function countFaults() {
  return panels.filter((p) => p.state === PANEL_STATE.FAULT).length;
}

// 랜덤 분전반에 누전 고장을 낸다. except(방금 고친 분전반)는 후보에서 뺀다.
function spawnFault(except = null) {
  const candidates = panels.filter(
    (p) => p.state !== PANEL_STATE.FAULT && p !== except
  );
  const panel = candidates[Math.floor(Math.random() * candidates.length)];
  panel.state = PANEL_STATE.FAULT;
  panel.faultType = 'short';
  return panel;
}

// 벽에 닿을 때까지 격자를 따라 광선을 진행한다 (DDA).
// 렌더러가 프레임마다 320번 호출하므로 결과 객체를 재사용한다.
const rayHit = { tile: 0, cellX: 0, cellY: 0, side: 0, dist: 0 };

function castRay(px, py, dirX, dirY) {
  let cellX = Math.floor(px);
  let cellY = Math.floor(py);
  const deltaX = dirX === 0 ? Infinity : Math.abs(1 / dirX);
  const deltaY = dirY === 0 ? Infinity : Math.abs(1 / dirY);
  const stepX = dirX < 0 ? -1 : 1;
  const stepY = dirY < 0 ? -1 : 1;
  let sideX = (dirX < 0 ? px - cellX : cellX + 1 - px) * deltaX;
  let sideY = (dirY < 0 ? py - cellY : cellY + 1 - py) * deltaY;
  let side = 0;
  let tile = TILE.FLOOR;

  while (tile === TILE.FLOOR) {
    if (sideX < sideY) {
      sideX += deltaX;
      cellX += stepX;
      side = 0;
    } else {
      sideY += deltaY;
      cellY += stepY;
      side = 1;
    }
    tile = tileAt(cellX, cellY);
  }

  rayHit.tile = tile;
  rayHit.cellX = cellX;
  rayHit.cellY = cellY;
  rayHit.side = side;
  rayHit.dist = side === 0 ? sideX - deltaX : sideY - deltaY;
  return rayHit;
}
