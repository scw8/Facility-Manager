// 경험치·승진 규칙. 화면과 무관한 순수 게임 규칙만 둔다. (상태치는 stats.js)

export const RANKS = ['시설기사', '주임', '대리', '과장', '시설팀장', '관리소장'];

// REQUIRED_EXP[i]: RANKS[i]에서 다음 직급으로 가는 데 필요한 경험치
export const REQUIRED_EXP = [100, 200, 350, 550, 800];

// 고장 종류별 경험치는 직급과 무관하게 고정. 직급별 필요 경험치만 늘어난다.
export const FAULT_EXP = { short: 40 };

export function createProgress() {
  return { rank: 0, exp: 0, repairs: 0 };
}

export function isTopRank(progress) {
  return progress.rank >= REQUIRED_EXP.length;
}

// 현재 직급 안에서의 경험치 진행률 (0~100 정수). 최고 직급은 100 고정.
export function expPercent(progress) {
  if (isTopRank(progress)) return 100;
  return Math.floor((progress.exp / REQUIRED_EXP[progress.rank]) * 100);
}

// 경험치를 더하고, 이번에 승진해서 얻은 직급 이름들을 돌려준다.
// 남은 경험치는 다음 직급으로 이월한다.
export function addExp(progress, amount) {
  const promotions = [];
  if (isTopRank(progress)) return promotions;

  progress.exp += amount;
  while (!isTopRank(progress) && progress.exp >= REQUIRED_EXP[progress.rank]) {
    progress.exp -= REQUIRED_EXP[progress.rank];
    progress.rank += 1;
    promotions.push(RANKS[progress.rank]);
  }
  if (isTopRank(progress)) progress.exp = 0;
  return promotions;
}

export function completeRepair(progress, faultType) {
  progress.repairs += 1;
  return addExp(progress, FAULT_EXP[faultType]);
}
