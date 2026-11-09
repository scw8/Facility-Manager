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
  HMI: 9, // 열교환기 감시반
  HEATMETER: 10, // 적산열량계·유량계
  GENERATOR: 11, // 비상발전기
  PIT: 12, // 비트 내 배관
  TOOLWALL: 13, // 벽걸이 공구판
  TOOLBOX: 14, // 공구함
  SHELF: 15, // 자재 선반
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
  H: TILE.HMI,
  M: TILE.HEATMETER, // Meter
  G: TILE.GENERATOR,
  V: TILE.PIT, // 비트(Vault)
  K: TILE.TOOLWALL,
  X: TILE.TOOLBOX,
  Z: TILE.SHELF,
};

// 타일 자체가 상호작용 오브젝트인 경우, 맵을 불러올 때 이 모양으로 오브젝트를 만든다
export const TILE_OBJECTS = {
  [TILE.PANEL]: () => ({ type: 'panel', state: 'normal', faultType: null, faultSince: 0, lastPenalty: 0 }),
  [TILE.COUNTER]: () => ({ type: 'counter' }),
  [TILE.BED]: () => ({ type: 'bed' }),
  [TILE.SHOWER]: () => ({ type: 'shower' }),
  [TILE.TABLE]: () => ({ type: 'table' }),
  [TILE.HMI]: () => ({ type: 'hmi', name: '열교환기 감시반' }),
  [TILE.HEATMETER]: () => ({ type: 'heatmeter', name: '적산열량계·유량계' }),
  [TILE.GENERATOR]: () => ({ type: 'generator', name: '비상발전기' }),
  [TILE.PIT]: () => ({ type: 'pit', name: '비트 내 배관', leaking: false }),
  [TILE.TOOLWALL]: () => ({ type: 'storage', storage: 'toolwall' }),
  [TILE.TOOLBOX]: () => ({ type: 'storage', storage: 'toolbox' }),
  [TILE.SHELF]: () => ({ type: 'storage', storage: 'shelf' }),
};
