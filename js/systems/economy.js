// 급여와 상점.
//
// 급여는 실제 금액(원, 세전 월급)으로 한다. 직급별 금액은 [초기값]이다.
// 공개 자료에서 격일제 시설기사 직급표를 찾지 못해 추정했고, 관리소장은 채용공고 수준(약 430만 원)에 맞췄다.
// 현장 실제 금액으로 바꾸려면 SALARY만 고치면 된다.

import { calendar } from '../core/clock.js';

// RANKS 순서: 시설기사, 주임, 대리, 과장, 시설팀장, 관리소장
export const SALARY = [2_600_000, 2_800_000, 3_000_000, 3_300_000, 3_700_000, 4_300_000];

export const START_MONEY = 500_000;
export const FRIENDS_COST = 50_000; // 친구 만나기 1회

export const SHOP_ITEMS = [
  { id: 'drill', name: '충전 전동드릴', price: 189_000, desc: '모든 작업 속도 ×1.3' },
  { id: 'bigbag', name: '대용량 공구가방', price: 59_000, desc: '아이템 슬롯 +2' },
  { id: 'headlamp', name: '헤드랜턴', price: 35_000, desc: '손전등 없이 비트 점검' },
  { id: 'boots', name: '경량 안전화', price: 79_000, desc: '걸을 때 피로 절반' },
  { id: 'textbook', name: '자격증 교재', price: 32_000, desc: '공부 효율 ×1.5' },
];

export const owns = (state, id) => state.owned.includes(id);

export function formatWon(n) {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

// 이번 근무가 그 달의 마지막(3번째) 근무면 월급날이다
export function isPayday(day) {
  return calendar(day).round === 3;
}

export function buy(state, id) {
  const item = SHOP_ITEMS.find((i) => i.id === id);
  if (owns(state, id)) return '이미 가지고 있다';
  if (state.money < item.price) return '잔고가 부족하다';
  state.money -= item.price;
  state.owned.push(id);
  return null;
}
