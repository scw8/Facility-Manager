// 아이템(공구·부품), 보관 장소, 작업별 필요 아이템.
//
// kind: 'tool'은 써도 없어지지 않는 공구, 'part'는 작업을 마치면 소모되는 부품·자재.

export const ITEMS = {
  // ----- 공구 -----
  tester: { name: '테스터기', kind: 'tool' },
  driver: { name: '드라이버', kind: 'tool' },
  gloves: { name: '절연장갑', kind: 'tool' },
  monkey: { name: '몽키스패너', kind: 'tool' },
  pipewrench: { name: '파이프렌치', kind: 'tool' },
  flashlight: { name: '손전등', kind: 'tool' },
  ladder: { name: '접이식 사다리', kind: 'tool' },
  teflon: { name: '테프론 테이프', kind: 'tool' }, // 배관 나사산 감는 용도 (한 롤로 여러 번)
  insultape: { name: '배관 보온테이프', kind: 'tool' },

  // ----- 부품·자재 -----
  nails: { name: '고정용 못', kind: 'part' },
  pipe: { name: '교체용 배관', kind: 'part' },
  prv: { name: '감압밸브', kind: 'part' },
  lamp: { name: '형광등', kind: 'part' },
  ballast: { name: '안정기', kind: 'part' },
  actuator: { name: '난방 구동기', kind: 'part' },
  detHeat: { name: '정온식 감지기', kind: 'part' },
  detRate: { name: '차동식 감지기', kind: 'part' },
  detSmoke: { name: '광전식 감지기', kind: 'part' },
};

// 공구실 보관 장소별 물품. 자주 쓰는 공구는 벽과 공구함 양쪽에 있다.
export const STORAGES = {
  toolwall: {
    name: '벽걸이 공구판',
    items: ['monkey', 'pipewrench', 'driver', 'flashlight', 'ladder'],
  },
  toolbox: {
    name: '공구함',
    items: ['tester', 'driver', 'gloves', 'monkey', 'teflon', 'insultape', 'nails'],
  },
  shelf: {
    name: '자재 선반',
    items: ['pipe', 'prv', 'lamp', 'ballast', 'actuator', 'detHeat', 'detRate', 'detSmoke'],
  },
};

// 작업별 필요 아이템.
//   main: 손에 들고 있어야 하는 아이템 (숫자키로 고른다). null이면 무엇을 들어도 된다
//   needs: 가방(아이템 슬롯)에 있어야 하는 아이템
//   consumes: 작업을 마치면 없어지는 부품
// Phase 6 민원(형광등·감압밸브·난방·화재감지기)도 여기에 추가한다.
export const TASKS = {
  short: {
    label: '누전 수리',
    main: 'tester',
    needs: ['tester', 'gloves', 'driver'],
    consumes: [],
  },
  pipeReplace: {
    label: '누수 배관 교체',
    main: 'pipewrench',
    needs: ['pipewrench', 'monkey', 'teflon', 'insultape', 'pipe'],
    consumes: ['pipe'],
  },
  pitCheck: {
    label: '비트 점검',
    main: null,
    needs: ['flashlight'], // 헤드랜턴이 있으면 필요 없다
    consumes: [],
  },
};
