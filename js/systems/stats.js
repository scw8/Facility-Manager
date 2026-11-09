// 캐릭터 상태치: 피로도·포만감·위생·스트레스와 그 결과인 평판.
// 수치는 모두 [초기값]이며 플레이 테스트로 조정한다. 조정할 값은 이 파일 위쪽에 모아 둔다.

// ----- 시간당 변화 (게임 1시간 기준) -----
const FATIGUE_PER_HOUR = 2.5; // 깨어 있는 동안
const FATIGUE_REST_PER_HOUR = -6; // 휴게실에서 잘 때
const SATIETY_PER_HOUR = -5;
const SATIETY_REST_PER_HOUR = -2.5;
const HYGIENE_PER_HOUR = -3;

// ----- 행동별 변화 -----
const FATIGUE_PER_CELL = 0.02; // 한 칸 걸을 때마다
export const EFFECTS = {
  repair: { fatigue: 1, hygiene: -1 },
  repairFailed: { stress: 8 },
  meal: { satiety: 50, stress: -3 },
  shower: { hygiene: 100, stress: -2 },
  rest: { stress: -5 },
  faultNeglected: { reputation: -3, stress: 2 },
  repairFast: { reputation: 2 },
  repairSlow: { reputation: 1 },
  dirtyAtShiftEnd: { reputation: -3 },
  collapse: { reputation: -15 },
  burnout: { reputation: -20 },
};

// ----- 경계값 -----
export const LIMITS = {
  tired: 70, // 피로도 이상이면 작업 속도 감소
  exhausted: 90, // 피로도 이상이면 작업 실패 확률
  hungry: 30, // 포만감 이하면 작업 속도 감소
  dirty: 40, // 위생 이하면 평판 감점
  stressed: 70, // 스트레스 이상이면 실수 증가
  breaking: 90,
};

export function createStats() {
  return { fatigue: 0, satiety: 80, hygiene: 100, stress: 20, reputation: 50 };
}

const clamp = (v) => Math.max(0, Math.min(100, v));

// { fatigue: +1, stress: -3 } 같은 변화량을 더한다
export function applyEffect(stats, effect) {
  for (const [key, delta] of Object.entries(effect)) {
    stats[key] = clamp(stats[key] + delta);
  }
}

// 게임 시간이 minutes분 흐를 때의 자연 변화
export function tickStats(stats, minutes, { resting = false } = {}) {
  const hours = minutes / 60;
  applyEffect(stats, {
    fatigue: (resting ? FATIGUE_REST_PER_HOUR : FATIGUE_PER_HOUR) * hours,
    satiety: (resting ? SATIETY_REST_PER_HOUR : SATIETY_PER_HOUR) * hours,
    hygiene: HYGIENE_PER_HOUR * hours,
  });
}

export function addWalkFatigue(stats, cells) {
  applyEffect(stats, { fatigue: cells * FATIGUE_PER_CELL });
}

// 작업 속도 배율 (1 = 정상). 피곤하거나 배고프면 느려진다.
export function workSpeed(stats) {
  let speed = 1;
  if (stats.fatigue >= LIMITS.tired) speed *= 0.7;
  if (stats.satiety <= LIMITS.hungry) speed *= 0.8;
  return speed;
}

// 작업을 마쳤을 때 실패할 확률 (0~1). 탈진하거나 스트레스가 심하면 실수한다.
export function failChance(stats) {
  let chance = 0;
  if (stats.fatigue >= LIMITS.exhausted) chance += 0.25;
  if (stats.stress >= LIMITS.breaking) chance += 0.2;
  else if (stats.stress >= LIMITS.stressed) chance += 0.1;
  return chance;
}

// 근무를 더 이어갈 수 없는 상태인지. 'fatigue' | 'hunger' | 'burnout' | null
export function breakdown(stats) {
  if (stats.fatigue >= 100) return 'fatigue';
  if (stats.satiety <= 0) return 'hunger';
  if (stats.stress >= 100) return 'burnout';
  return null;
}

// 휴무일을 보낸 뒤의 상태 (Phase 3에서 휴무일 활동과 아침 루틴으로 대체)
export function restOffDay(stats) {
  stats.fatigue = 0;
  stats.satiety = 80;
  stats.hygiene = 100;
  stats.stress = clamp(stats.stress - 20);
}
