// 작업 게이지: 대상을 바라본 채 E(사용 버튼)를 누르고 있으면 게이지가 차고, 다 차면 작업이 끝난다.
// 피곤하거나 배고프면 게이지가 느리게 차고, 탈진·스트레스 상태면 끝에 실패할 수 있다.

import { workSpeed, failChance } from './stats.js';

// job = { target, seconds, label, onComplete }
// toolBonus: 장비로 빨라지는 배율 (전동드릴 등). 컨디션 저하 표시와는 따로 계산한다
export function startWork(state, job, toolBonus = 1) {
  const speed = workSpeed(state.stats) * toolBonus;
  state.work = { ...job, elapsed: 0, duration: job.seconds / speed, slowed: workSpeed(state.stats) < 1 };
}

export function workProgress(work) {
  return work ? Math.min(1, work.elapsed / work.duration) : 0;
}

// 결과: 'done' | 'failed' | 'cancelled' | null(진행 중)
export function updateWork(state, dt, { holding, target }) {
  const { work } = state;
  if (!work) return null;

  // 손을 떼거나 고개를 돌리면 처음부터 다시
  if (!holding || target !== work.target) {
    state.work = null;
    return 'cancelled';
  }

  work.elapsed += dt;
  if (work.elapsed < work.duration) return null;

  state.work = null;
  if (Math.random() < failChance(state.stats)) return 'failed';
  work.onComplete();
  return 'done';
}
