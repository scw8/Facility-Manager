// 게임 시계, 달력, 시간대 일정.
//
// 시각은 "근무일 0시부터 흐른 분"으로 센다. 근무는 08:00(480)에 시작해
// 다음 날 08:00(1920)에 끝나므로, 자정을 넘겨도 숫자가 계속 커진다.
//
// 달력은 압축되어 있다: 근무일·휴무일 한 쌍이 2일, 한 달 = 6일(근무 3회), 1년 = 12달.

export const DAY_MINUTES = 24 * 60;
export const SHIFT_START = 8 * 60;
export const SHIFT_END = SHIFT_START + DAY_MINUTES;

export const MINUTES_PER_SECOND = 1; // 게임 24시간 = 현실 24분 (야간 휴식으로 건너뛰면 더 짧다) [초기값]
const SKIP_MINUTES_PER_SECOND = 120; // 시간 건너뛰기 중 속도

const DAYS_PER_MONTH = 6;
const MONTHS_PER_YEAR = 12;

export function createClock() {
  // skip: 시간 건너뛰기 중이면 { target, label, resting }
  return { day: 0, minutes: SHIFT_START, skip: null };
}

// 'HH:MM' → 근무일 기준 분. 08:00 이전 시각은 다음 날(자정 이후)로 본다.
// 08:00 자체는 근무가 끝나는 시각(다음 날 08:00)이다.
export function shiftMinute(time) {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m;
  return t <= SHIFT_START ? t + DAY_MINUTES : t;
}

// 시계를 dt초만큼 진행한다. 시간 건너뛰기 중이면 빠르게 흐르고, 근무 종료 시각에서 멈춘다.
export function advanceClock(clock, dt) {
  const { skip } = clock;
  let next = clock.minutes + dt * (skip ? SKIP_MINUTES_PER_SECOND : MINUTES_PER_SECOND);
  if (skip && next >= skip.target) {
    next = skip.target;
    clock.skip = null;
  }
  clock.minutes = Math.min(next, SHIFT_END);
}

// 'HH:MM'까지 빠르게 감는다. label은 화면에 띄울 문구, resting은 잠을 자는 중인지.
export function skipUntil(clock, time, label = '휴식 중…', resting = false) {
  const target = shiftMinute(time);
  if (target > clock.minutes) clock.skip = { target, label, resting };
}

// 지금부터 minutes분을 빠르게 감는다 (식사·샤워 등)
export function skipFor(clock, minutes, label, resting = false) {
  clock.skip = { target: Math.min(clock.minutes + minutes, SHIFT_END), label, resting };
}

export function cancelSkip(clock) {
  clock.skip = null;
}

export const isSkipping = (clock) => clock.skip !== null;

// 날짜를 넘어 계속 커지는 절대 시각(분). 고장이 얼마나 방치됐는지 잴 때 쓴다.
export const absoluteMinutes = (clock) => clock.day * DAY_MINUTES + clock.minutes;

// 'HH:MM' ≤ 지금 < 'HH:MM' 인지 (자정을 넘는 구간도 된다)
export function isBetween(clock, from, to) {
  return clock.minutes >= shiftMinute(from) && clock.minutes < shiftMinute(to);
}

export function formatTime(minutes) {
  const total = Math.floor(minutes) % DAY_MINUTES;
  const h24 = Math.floor(total / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `${ampm} ${String(h12).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function calendar(day) {
  return {
    year: Math.floor(day / (DAYS_PER_MONTH * MONTHS_PER_YEAR)) + 1,
    month: (Math.floor(day / DAYS_PER_MONTH) % MONTHS_PER_YEAR) + 1,
    round: Math.floor((day % DAYS_PER_MONTH) / 2) + 1, // 이번 달 몇 번째 근무(휴무)인지
    isWorkDay: day % 2 === 0,
  };
}

export function formatDate(day) {
  const { month, round, isWorkDay } = calendar(day);
  return `${month}월 · ${round}번째 ${isWorkDay ? '근무' : '휴무'}`;
}

// 시간대 일정: 시계가 각 시각을 지나는 순간 한 번씩 실행한다.
// events: [{ time: 'HH:MM', run() }]
export function createSchedule(events) {
  const list = events.map((e) => ({ ...e, at: shiftMinute(e.time) }));
  return {
    // 시계가 prev → now로 흐르는 동안 지난 일정을 실행한다
    tick(prev, now) {
      for (const e of list) {
        if (prev < e.at && e.at <= now) e.run();
      }
    },
  };
}
