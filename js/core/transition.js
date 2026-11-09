// 맵 전환 연출: 화면이 어두워짐 → 맵 이름 표시(로딩) → 새 맵에서 밝아짐.
// 화면이 완전히 검을 때 실제로 맵을 바꾼다.

const FADE_OUT = 0.35;
const HOLD = 0.6;
const FADE_IN = 0.35;
const TOTAL = FADE_OUT + HOLD + FADE_IN;

export function beginTransition(state, to, spawn, label) {
  if (state.transition) return;
  state.transition = { t: 0, to, spawn, label, switched: false };
}

// onSwitch(to, spawn)는 화면이 완전히 검게 된 순간 한 번 불린다.
export function updateTransition(state, dt, onSwitch) {
  const tr = state.transition;
  if (!tr) return;
  tr.t += dt;
  if (!tr.switched && tr.t >= FADE_OUT) {
    tr.switched = true;
    onSwitch(tr.to, tr.spawn);
  }
  if (tr.t >= TOTAL) state.transition = null;
}

// 검은 덮개의 불투명도 (0~1)
export function transitionAlpha(tr) {
  if (!tr) return 0;
  if (tr.t < FADE_OUT) return tr.t / FADE_OUT;
  if (tr.t < FADE_OUT + HOLD) return 1;
  return Math.max(0, 1 - (tr.t - FADE_OUT - HOLD) / FADE_IN);
}
