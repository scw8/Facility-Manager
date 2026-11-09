// 타일 종류와 맵 문자열 범례.

export const TILE = { FLOOR: 0, CONCRETE: 1, PIPES: 2, PANEL: 3, DOOR: 4 };

// 맵 데이터는 사람이 읽기 쉽게 문자열로 적고, 불러올 때 숫자로 바꾼다.
export const TILE_CHARS = {
  '.': TILE.FLOOR,
  '#': TILE.CONCRETE,
  '%': TILE.PIPES,
  E: TILE.PANEL, // 분전반 (Electric)
  D: TILE.DOOR,
};
