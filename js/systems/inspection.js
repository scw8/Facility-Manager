// 19:00 검침: 지하 기계실·전기실·비트를 돌며 계기 수치와 설비 상태를 보고 정상/이상을 판정한다.
//
// 근무를 시작할 때 오늘의 검침 데이터를 만든다. 몇 곳에는 이상이 숨어 있다.
// 플레이어의 판정은 퇴근할 때 업무일지에서 채점된다 (그 자리에서는 정답을 알려주지 않는다).
//
// 계기 수치는 실제 현장(열교환기 감시반 저층부·고층부, 적산열량계·유량계) 사진을 기준으로 했다.
// 발전기 항목은 전기안전관리교육 자료의 비상발전기 일상점검 항목을 따랐다.
// 이상 상황의 수치는 모두 [초기값]이다.

export const INSPECTION_START = '19:00';
export const INSPECTION_DEADLINE = '22:00';
export const PIPE_REPLACE_SECONDS = 6; // 누수 배관 교체 작업 게이지

// 오늘 이상이 생길 곳의 수 (확률)
const ANOMALY_COUNTS = [
  { count: 0, weight: 2 },
  { count: 1, weight: 5 },
  { count: 2, weight: 3 },
];

export const SCORE = {
  correct: { exp: 10 },
  caught: { reputation: 2 }, // 이상을 정확히 찾아냄
  missed: { reputation: -5 }, // 이상을 정상으로 넘김
  falseAlarm: { reputation: -1 }, // 정상을 이상으로 보고
  unfixedLeak: { reputation: -3 }, // 찾은 누수를 퇴근까지 고치지 않음
  notDone: { reputation: -5, stress: 5 }, // 마감까지 검침을 안 끝냄
};

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const fix1 = (v) => v.toFixed(1);

// ----- 열교환기 감시반 -----

// 구역별 정상 압력 (사진: 저층부 공급 7.1 / 환수 6.1, 고층부 공급 10.3 / 환수 9.4)
const ZONE_PRESSURE = {
  low: { supply: 7.1, range: [6.5, 8.0] },
  high: { supply: 10.3, range: [9.5, 11.0] },
};

function normalHmi(zone) {
  const supplyP = ZONE_PRESSURE[zone].supply + rand(-0.3, 0.3);
  const diffP = rand(0.8, 1.1);
  return {
    heatSet: 45,
    heatSupply: 45 + rand(-1, 1.2),
    heatReturn: rand(37, 43),
    supplyP,
    returnP: supplyP - diffP,
    hotSet: 50,
    hotSupply: 50 + rand(-0.8, 1),
    hotReturn: rand(48, 49.5),
    heatPump: 'Normal',
    hotPump: 'Normal',
  };
}

const HMI_ANOMALIES = [
  // 난방 공급압력 저하 (배관 누수나 보충수 부족)
  (r) => {
    r.supplyP -= 2.6;
    r.returnP = r.supplyP - 0.2;
  },
  // 급탕 공급온도 과열 (밸브 고착)
  (r) => {
    r.hotSupply = 50 + rand(9, 13);
  },
  // 난방 공급온도 미달
  (r) => {
    r.heatSupply = 45 - rand(7, 10);
  },
  // 차압 과다
  (r) => {
    r.returnP = r.supplyP - rand(2.2, 2.8);
  },
  // 펌프 경보
  (r) => {
    if (Math.random() < 0.5) r.heatPump = 'Alarm';
    else r.hotPump = 'Alarm';
  },
];

function hmiLines(r, zone) {
  const [lo, hi] = ZONE_PRESSURE[zone].range;
  return [
    `난방 셋팅 ${fix1(r.heatSet)}℃ · 공급 ${fix1(r.heatSupply)}℃ · 환수 ${fix1(r.heatReturn)}℃`,
    `난방 공급압 ${fix1(r.supplyP)} · 환수압 ${fix1(r.returnP)} · 차압 ${fix1(r.supplyP - r.returnP)} Bar`,
    `급탕 셋팅 ${fix1(r.hotSet)}℃ · 공급 ${fix1(r.hotSupply)}℃ · 환수 ${fix1(r.hotReturn)}℃`,
    `난방펌프 ${r.heatPump} · 급탕펌프 ${r.hotPump}`,
    { text: `기준: 공급온도 셋팅±3℃ · 차압 0.5~1.5 · 공급압 ${lo}~${hi} Bar`, note: true },
  ];
}

// ----- 적산열량계·유량계 -----

function normalHeatMeter(day) {
  return {
    gcal: 6360.6 + day * 6.2 + rand(0, 3),
    flow: rand(3.6, 5.4),
    total: 91400 + day * 52 + rand(0, 20),
    display: '정상',
  };
}

const HEATMETER_ANOMALIES = [
  (r) => {
    r.flow = 0;
  }, // 난방 가동 중인데 유량 0 (유량계 고장·배관 막힘)
  (r) => {
    r.display = 'E-03 온도센서 오류';
  },
];

function heatMeterLines(r) {
  return [
    `적산열량 ${r.gcal.toFixed(1).padStart(9, '0')} Gcal`,
    `순시유량 ${r.flow.toFixed(3)} m³/h · 누적 ${fix1(r.total)} m³`,
    `표시 상태: ${r.display}`,
    { text: '기준: 오류 표시 없음 · 난방 가동 중 순시유량 2~8 m³/h', note: true },
  ];
}

// ----- 비상발전기 -----

function normalGenerator() {
  return {
    fuel: Math.round(rand(70, 95)),
    battery: rand(26.0, 27.4),
    coolant: '정상(F~L 사이)',
    oil: '정상(F~L 사이)',
    belt: '정상',
    oilLeak: '없음',
    alarm: '없음',
  };
}

const GENERATOR_ANOMALIES = [
  (r) => {
    r.fuel = Math.round(rand(12, 25));
  },
  (r) => {
    r.battery = rand(22.0, 23.4);
  },
  (r) => {
    r.coolant = 'L 이하 (부족)';
  },
  (r) => {
    r.oil = 'L 이하 (부족)';
  },
  (r) => {
    r.belt = '늘어짐 (장력 부족)';
  },
  (r) => {
    r.oilLeak = '하부 오일 자국';
  },
];

function generatorLines(r) {
  return [
    `연료량 ${r.fuel}% · 축전지 ${fix1(r.battery)}V`,
    `냉각수 ${r.coolant} · 엔진오일 ${r.oil}`,
    `팬벨트 ${r.belt} · 누유·누수 ${r.oilLeak}`,
    `제어반 경보 ${r.alarm}`,
    { text: '기준: 연료 50%↑ · 축전지 24V↑(충전 중 26~28V) · 수위 F~L', note: true },
  ];
}

// ----- 비트 내 배관 -----

function normalPit() {
  return { joint: '물기 없음', floor: '건조', insulation: '정상', leak: false };
}

const PIT_ANOMALIES = [
  (r) => {
    Object.assign(r, { joint: '물방울이 맺혀 떨어짐', floor: '물 고임', insulation: '젖음', leak: true });
  },
];

function pitLines(r) {
  return [
    `배관 이음부: ${r.joint}`,
    `바닥: ${r.floor}`,
    `보온재: ${r.insulation}`,
    { text: '기준: 이음부·바닥·보온재에 물기가 없을 것', note: true },
  ];
}

// ----- 점검 지점 종류 -----

const KINDS = {
  hmi: {
    make: (obj) => normalHmi(obj.zone),
    anomalies: HMI_ANOMALIES,
    lines: (r, obj) => hmiLines(r, obj.zone),
  },
  heatmeter: {
    make: (_obj, day) => normalHeatMeter(day),
    anomalies: HEATMETER_ANOMALIES,
    lines: heatMeterLines,
  },
  generator: { make: normalGenerator, anomalies: GENERATOR_ANOMALIES, lines: generatorLines },
  pit: { make: normalPit, anomalies: PIT_ANOMALIES, lines: pitLines },
};

export const isInspectionPoint = (obj) => obj && obj.type in KINDS;

// 월드 안의 모든 점검 지점: [{ key, obj }]
export function inspectionPoints(world) {
  const points = [];
  for (const map of world.maps.values()) {
    for (const [cell, obj] of map.objects) {
      if (isInspectionPoint(obj)) points.push({ key: `${map.id}:${cell}`, obj });
    }
  }
  return points;
}

function weightedCount() {
  const total = ANOMALY_COUNTS.reduce((sum, c) => sum + c.weight, 0);
  let roll = Math.random() * total;
  for (const c of ANOMALY_COUNTS) {
    roll -= c.weight;
    if (roll < 0) return c.count;
  }
  return 0;
}

// 오늘의 검침 데이터. 저장되므로 순수 JSON만 담는다.
// points[key] = { readings, anomaly, judged: null|'normal'|'abnormal', fixed }
export function createInspection(world, day) {
  const points = inspectionPoints(world);
  const anomalous = new Set();
  const count = Math.min(weightedCount(), points.length);
  while (anomalous.size < count) anomalous.add(pick(points).key);

  const data = { done: false, scored: false, points: {} };
  for (const { key, obj } of points) {
    const kind = KINDS[obj.type];
    const readings = kind.make(obj, day);
    const anomaly = anomalous.has(key);
    if (anomaly) pick(kind.anomalies)(readings);
    data.points[key] = { readings, anomaly, judged: null, fixed: false };
  }
  return data;
}

// 렌더러가 누수 배관을 젖은 모습으로 그리도록 월드 오브젝트에 표시한다
export function applyInspectionToWorld(inspection, world) {
  for (const { key, obj } of inspectionPoints(world)) {
    const point = inspection?.points[key];
    obj.leaking = obj.type === 'pit' && !!point?.readings.leak && !point.fixed;
  }
}

export function inspectionLines(obj, point) {
  return KINDS[obj.type].lines(point.readings, obj);
}

export function progressCount(inspection) {
  const all = Object.values(inspection.points);
  return { judged: all.filter((p) => p.judged).length, total: all.length };
}

// 퇴근(또는 마감) 때 채점한다. 상태치에 줄 변화량과 업무일지에 쓸 줄들을 돌려준다.
export function scoreInspection(inspection) {
  const result = { exp: 0, reputation: 0, stress: 0, correct: 0, missed: 0, falseAlarms: 0, unfixed: 0 };
  const { judged, total } = progressCount(inspection);
  for (const point of Object.values(inspection.points)) {
    const saidAbnormal = point.judged === 'abnormal';
    if (point.judged && saidAbnormal === point.anomaly) {
      result.correct += 1;
      result.exp += SCORE.correct.exp;
      if (point.anomaly) result.reputation += SCORE.caught.reputation;
    } else if (point.anomaly && !saidAbnormal) {
      result.missed += 1;
      result.reputation += SCORE.missed.reputation;
    } else if (!point.anomaly && saidAbnormal) {
      result.falseAlarms += 1;
      result.reputation += SCORE.falseAlarm.reputation;
    }
    if (point.readings.leak === true && saidAbnormal && !point.fixed) {
      result.unfixed += 1;
      result.reputation += SCORE.unfixedLeak.reputation;
    }
  }
  result.notDone = judged < total;
  if (result.notDone) {
    result.reputation += SCORE.notDone.reputation;
    result.stress += SCORE.notDone.stress;
  }
  result.judged = judged;
  result.total = total;
  return result;
}
