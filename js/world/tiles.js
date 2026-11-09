// 타일 종류와 맵 문자열 범례.

export const TILE = {
  FLOOR: 0,
  CONCRETE: 1,
  PIPES: 2,
  PANEL: 3,
  DOOR: 4,
  COUNTER: 5, // 구내식당 배식대
  BED: 6, // 휴게실 침상
  SHOWER: 7, // 샤워부스
  TABLE: 8, // 집 식탁
};

// 맵 데이터는 사람이 읽기 쉽게 문자열로 적고, 불러올 때 숫자로 바꾼다.
export const TILE_CHARS = {
  '.': TILE.FLOOR,
  '#': TILE.CONCRETE,
  '%': TILE.PIPES,
  E: TILE.PANEL, // 분전반 (Electric)
  D: TILE.DOOR,
  C: TILE.COUNTER,
  R: TILE.BED, // Rest
  S: TILE.SHOWER,
  T: TILE.TABLE,
};

// 타일 자체가 상호작용 오브젝트인 경우, 맵을 불러올 때 이 모양으로 오브젝트를 만든다
export const TILE_OBJECTS = {
  [TILE.PANEL]: () => ({ type: 'panel', state: 'normal', faultType: null, faultSince: 0, lastPenalty: 0 }),
  [TILE.COUNTER]: () => ({ type: 'counter' }),
  [TILE.BED]: () => ({ type: 'bed' }),
  [TILE.SHOWER]: () => ({ type: 'shower' }),
  [TILE.TABLE]: () => ({ type: 'table' }),
};
