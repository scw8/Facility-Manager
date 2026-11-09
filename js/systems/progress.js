// 경험치·승진 규칙. 화면과 무관한 순수 게임 규칙만 둔다. (상태치는 stats.js)
//
// 승진은 매달 마지막 근무 뒤 "월말 인사발령"에서만 일어난다.
// 조건: 현 직급에서 근속 MIN_MONTHS개월 이상 + 경험치 REQUIRED_EXP 이상.
// 시설기사 → 주임은 최소 6개월(근무 18회)이 걸린다. 수치는 모두 [초기값].

export const RANKS = ['시설기사', '주임', '대리', '과장', '시설팀장', '관리소장'];

// REQUIRED_EXP[i]: RANKS[i]에서 다음 직급으로 가는 데 필요한 경험치
// (성실하게 근무하면 한 번 근무에 대략 500~600)
export const REQUIRED_EXP = [8000, 18000, 36000, 54000, 72000];

// MIN_MONTHS[i]: RANKS[i]에서 최소 근속 개월 수 (게임 달력 1달 = 근무 3회)
export const MIN_MONTHS = [6, 12, 24, 36, 48];

// 고장 종류별 경험치
export const FAULT_EXP = { short: 40, leak: 60 };

export function createProgress() {
  return { rank: 0, exp: 0, repairs: 0, monthsInRank: 0 };
}

export function isTopRank(progress) {
  return progress.rank >= REQUIRED_EXP.length;
}

// 현재 직급 안에서의 경험치 진행률 (0~100 정수). 최고 직급은 100 고정.
export function expPercent(progress) {
  if (isTopRank(progress)) return 100;
  return Math.min(100, Math.floor((progress.exp / REQUIRED_EXP[progress.rank]) * 100));
}

export function addExp(progress, amount) {
  if (!isTopRank(progress)) progress.exp += amount;
}

export function completeRepair(progress, faultType) {
  progress.repairs += 1;
  addExp(progress, FAULT_EXP[faultType]);
}

// 승진까지 남은 조건
export function promotionStatus(progress) {
  if (isTopRank(progress)) return null;
  return {
    exp: progress.exp,
    expNeed: REQUIRED_EXP[progress.rank],
    months: progress.monthsInRank,
    monthsNeed: MIN_MONTHS[progress.rank],
  };
}

// 월말 인사발령. 근속 개월을 1 늘리고, 조건을 채웠으면 승진시켜 새 직급 이름을 돌려준다.
export function monthlyReview(progress) {
  if (isTopRank(progress)) return null;
  progress.monthsInRank += 1;
  const status = promotionStatus(progress);
  if (status.months < status.monthsNeed || status.exp < status.expNeed) return null;
  progress.exp -= status.expNeed;
  progress.rank += 1;
  progress.monthsInRank = 0;
  if (isTopRank(progress)) progress.exp = 0;
  return RANKS[progress.rank];
}
