// 근무 밖의 생활: 휴무일 활동, 기상 시각, 아침 루틴, 지각.
// 수치는 모두 [초기값]이며 플레이 테스트로 조정한다.

import { applyEffect } from './stats.js';

export function createLife() {
  return {
    study: 0, // 자격증 공부 진행도 (0~100). Phase 7에서 시험에 쓴다
    fitness: 0, // 운동 누적 (0~FITNESS_MAX). 근무 중 피로가 덜 쌓인다
  };
}

const FITNESS_MAX = 10;
const FITNESS_FATIGUE_RELIEF = 0.02; // 운동 1회당 근무 중 피로 증가 −2%
const STUDY_PER_SESSION = 8;
const STUDY_STRESSED = 70; // 스트레스가 이 이상이면 공부 효율 절반

// 근무 중 피로가 쌓이는 배율 (운동을 많이 할수록 작아진다)
export function fatigueMultiplier(life) {
  return 1 - Math.min(life.fitness, FITNESS_MAX) * FITNESS_FATIGUE_RELIEF;
}

export function studyEfficiency(stats) {
  return stats.stress >= STUDY_STRESSED ? 0.5 : 1;
}

// ----- 휴무일 -----

export const OFFDAY_SLOTS = ['오전', '오후', '저녁'];

export const OFFDAY_ACTIVITIES = [
  {
    id: 'sleep',
    label: '잠자기',
    desc: '피로 −25',
    apply: (stats) => applyEffect(stats, { fatigue: -25 }),
  },
  {
    id: 'study',
    label: '자격증 공부',
    desc: '공부 +8 · 스트레스 +8',
    apply(stats, life) {
      life.study = Math.min(100, life.study + STUDY_PER_SESSION * studyEfficiency(stats));
      applyEffect(stats, { stress: 8, fatigue: 3 });
    },
  },
  {
    id: 'exercise',
    label: '운동',
    desc: '피로 +8 · 스트레스 −12 · 체력↑',
    apply(stats, life) {
      life.fitness = Math.min(FITNESS_MAX, life.fitness + 1);
      applyEffect(stats, { fatigue: 8, stress: -12 });
    },
  },
  {
    id: 'friends',
    label: '친구 만나기',
    desc: '스트레스 −20 · 피로 +5',
    apply: (stats) => applyEffect(stats, { stress: -20, fatigue: 5 }),
  },
];

// 퇴근해서 집에 와 씻고 한숨 잔 상태로 휴무일을 시작한다
export function beginOffDay(stats) {
  applyEffect(stats, { fatigue: -40, stress: -5 });
  stats.satiety = 80;
  stats.hygiene = 100;
}

export function doActivity(id, stats, life) {
  OFFDAY_ACTIVITIES.find((a) => a.id === id).apply(stats, life);
}

// ----- 근무일 아침 -----

// 늦게 일어날수록 덜 피곤하지만 준비할 시간이 줄어든다
// (씻기 15분 + 아침 20분 + 출근 30분 = 65분)
export const WAKE_OPTIONS = [
  { time: '06:30', minutes: 6 * 60 + 30, fatigue: 10, desc: '여유 있게 준비' },
  { time: '07:00', minutes: 7 * 60, fatigue: 5, desc: '하나는 포기해야 빠듯' },
  { time: '07:30', minutes: 7 * 60 + 30, fatigue: 0, desc: '바로 나가야 지각 면함' },
];

// 밤사이 배가 꺼지고 땀을 흘린 상태에서, 고른 시각에 일어난다
export function wakeUp(stats, option) {
  stats.satiety = 50;
  stats.hygiene = 70;
  applyEffect(stats, { fatigue: option.fatigue });
}

export const COMMUTE_MINUTES = 30;
export const WASH_MINUTES = 15;
export const BREAKFAST_MINUTES = 20;
export const SNOOZE_MINUTES = 15;
export const FORCE_COMMUTE_AT = 9 * 60 + 30; // 이때까지 집에 있으면 허겁지겁 출근한다

export const MORNING_EFFECTS = {
  wash: { hygiene: 100 },
  breakfast: { satiety: 50 },
  snooze: { fatigue: -4 },
  late: { reputation: -5, stress: 5 }, // 지각
  veryLate: { reputation: -5 }, // 30분 넘게 지각하면 추가
};

export function createMorning() {
  return { washed: false, ate: false };
}
