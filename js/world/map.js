// 맵 데이터를 불러와 타일 조회, 광선 진행, 상호작용 오브젝트 조회를 제공한다.

import { TILE, TILE_CHARS, TILE_OBJECTS } from './tiles.js';

const DEFAULT_LAMPS = { spacing: 3, offsetX: 1, offsetY: 1 };

// 상호작용 오브젝트(분전반, 문 등)는 놓인 칸 좌표로 찾는다.
export function cellKey(x, y) {
  return `${x},${y}`;
}

function parseTiles(data) {
  const width = data.tiles[0].length;
  return data.tiles.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`맵 ${data.id}: ${y}번째 줄 길이가 다릅니다`);
    }
    return [...row].map((ch, x) => {
      const tile = TILE_CHARS[ch];
      if (tile === undefined) {
        throw new Error(`맵 ${data.id}: (${x}, ${y})의 '${ch}'는 알 수 없는 타일입니다`);
      }
      return tile;
    });
  });
}

export function createMap(data) {
  const tiles = parseTiles(data);
  const width = tiles[0].length;
  const height = tiles.length;
  const objects = new Map();

  // 분전반·배식대처럼 타일 자체가 오브젝트인 것은 자동으로 만든다
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const make = TILE_OBJECTS[tiles[y][x]];
      if (make) objects.set(cellKey(x, y), { ...make(), x, y });
    }
  }

  // 타일 오브젝트에 맵 데이터의 추가 정보(이름, 구역 등)를 덧붙인다
  for (const props of data.objects || []) {
    const obj = objects.get(cellKey(props.x, props.y));
    if (!obj) throw new Error(`맵 ${data.id}: (${props.x}, ${props.y})에 오브젝트 타일이 없습니다`);
    Object.assign(obj, props);
  }

  for (const door of data.doors || []) {
    if (tiles[door.y]?.[door.x] !== TILE.DOOR) {
      throw new Error(`맵 ${data.id}: (${door.x}, ${door.y})에 문 타일이 없습니다`);
    }
    objects.set(cellKey(door.x, door.y), { type: 'door', ...door });
  }

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return TILE.CONCRETE;
    return tiles[y][x];
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

  return {
    id: data.id,
    name: data.name,
    width,
    height,
    spawn: data.spawn,
    // 맵 분위기: wall은 콘크리트(#) 칸에 쓸 텍스처, floor는 바닥 텍스처 이름
    theme: { wall: null, floor: 'floor', ...data.theme },
    lamps: { ...DEFAULT_LAMPS, ...data.lamps },
    objects,
    tileAt,
    isWalkable: (x, y) => tileAt(x, y) === TILE.FLOOR,
    objectAt: (x, y) => objects.get(cellKey(x, y)) || null,
    castRay,
  };
}
