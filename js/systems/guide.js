// 처음 하는 사람을 위한 안내: 시작 설명, 상황별 첫 안내, 화면 왼쪽 위 "지금 할 일".

import { isBetween } from '../core/clock.js';
import { checkTask, hasItem } from './inventory.js';
import { progressCount } from './inspection.js';

const TOUCH = window.matchMedia('(pointer: coarse)').matches;

// 새 게임 시작과 H(도움말)에서 보여주는 설명
export const INTRO_PAGES = [
  {
    title: '시설관리 기사의 하루',
    lines: [
      '당신은 아파트 단지의 시설관리 기사다.',
      '근무는 24시간 맞교대: 08:00 출근 → 다음 날 08:00 퇴근,',
      '그다음 날은 휴무일이다.',
      '고장 수리와 19시 검침으로 경험치를 쌓아 승진하자.',
      '화면 왼쪽 위의 "할 일"을 따라가면 된다.',
    ],
  },
  {
    title: '조작',
    lines: TOUCH
      ? [
          '▲▼ 전진·후진  ◀▶ 회전',
          '[사용] 상호작용 — 수리는 누르고 있기',
          '화면 아래 아이템 칸 터치: 손에 들 아이템 고르기',
          '메뉴: ▲▼로 고르고 [사용]으로 결정',
        ]
      : [
          'W/S 전진·후진   A/D 회전',
          'E 또는 Space 상호작용 — 수리는 누르고 있기',
          '숫자키 1~8 / 마우스 휠: 손에 들 아이템 고르기',
          '메뉴: W/S·숫자키로 고르고 E로 결정',
          'H: 이 도움말 다시 보기',
        ],
  },
  {
    title: '컨디션 관리',
    lines: [
      '피로도·스트레스가 높거나 배가 고프면 작업이 느려지고 실수한다.',
      '피로도·스트레스 100, 포만감 0이면 쓰러진다.',
      '위생이 나쁘면 평판이 떨어진다.',
      '평판이 0이 되면 해고! 고장을 빨리 고치면 평판이 오른다.',
      '식사는 12시·18시 구내식당, 휴식은 22시부터 휴게실.',
    ],
  },
];

// 처음 그 상황을 만났을 때 한 번만 보여주는 안내
export const TIPS = {
  home: {
    title: '출근 준비',
    lines: [
      '08:00까지 사무실에 도착해야 한다. 출근길은 30분.',
      '화장실(샤워) 씻기 15분 · 부엌 식탁 아침 20분',
      '침대에서 15분 더 잘 수도 있다.',
      '준비가 끝나면 동쪽 현관문으로 출근!',
    ],
  },
  office: {
    title: '사무실',
    lines: [
      '남서쪽 방: 공구실 — 벽 공구판·공구함·자재 선반',
      '동쪽 문: 지하 1층(분전반·기계실·전기실·비트)',
      '서쪽 문: 구내식당 / 위쪽 방: 휴게실·샤워실',
      '먼저 공구실에서 테스터기·드라이버·절연장갑을 챙기자.',
      '고장 난 분전반은 미니맵에서 빨갛게 깜빡인다.',
    ],
  },
  inspection: {
    title: '19시 검침',
    lines: [
      '지하 1층 6곳을 돌며 계기와 설비를 점검한다.',
      '기계실: 감시반 2곳·열량계 / 전기실: 발전기 / 비트: 배관 2곳',
      '수치를 기준과 비교해 정상·이상을 고른다. (비트는 손전등 필요)',
      '누수를 찾으면 배관 교체 공구를 챙겨 와서 교체한다.',
      '결과는 퇴근 때 업무일지에서 채점된다. 마감 22:00.',
    ],
  },
  offday: {
    title: '휴무일',
    lines: [
      '오전·오후·저녁에 할 일을 하나씩 고른다.',
      '잠자기: 피로 회복 / 자격증 공부: 공부 진행도↑ 스트레스↑',
      '운동: 체력↑(근무 중 덜 피곤) / 친구 만나기: 스트레스↓ (돈)',
      '인터넷 쇼핑은 시간을 쓰지 않는다. 월급은 매달 3번째 근무 후.',
    ],
  },
};

// 화면 왼쪽 위에 띄울 "지금 할 일"
export function currentObjective(state, world) {
  const { clock } = state;

  if (state.phase === 'home') {
    const todo = [!state.morning.washed && '씻기', !state.morning.ate && '아침'].filter(Boolean);
    return todo.length
      ? `${todo.join('·')} 후 현관으로 출근 (08:00까지)`
      : '현관으로 출근 (08:00까지)';
  }

  const inspection = state.inspection;
  if (inspection && !inspection.done && isBetween(clock, '19:00', '22:00')) {
    const { judged, total } = progressCount(inspection);
    if (!hasItem(state, 'flashlight')) return `검침 ${judged}/${total} — 공구실에서 손전등부터`;
    return `검침 ${judged}/${total} — 지하 1층 기계실·전기실·비트`;
  }
  const leakFound = inspection && Object.values(inspection.points).some(
    (p) => p.readings.leak === true && p.judged === 'abnormal' && !p.fixed
  );
  if (leakFound) return '비트 누수 배관 교체 (파이프렌치·배관 등 필요)';

  const meal = isBetween(clock, '12:00', '13:00') ? 'lunch' : isBetween(clock, '18:00', '19:00') ? 'dinner' : null;
  if (meal && !state.shift.meals.includes(meal)) return '식사 시간 — 서쪽 문 구내식당';

  const faults = world.faults();
  if (faults.some((f) => f.type === 'leak')) {
    const problem = checkTask(state, 'pipeReplace');
    if (problem && problem.startsWith('필요')) return '배관 누수! 공구실에서 파이프렌치·몽키·테이프·교체용 배관 챙기기';
    return '지하 1층 배관 누수 교체 (미니맵 파란 점)';
  }
  if (faults.length > 0) {
    const problem = checkTask(state, 'short');
    if (problem && problem.startsWith('필요')) return '공구실(남서쪽 방)에서 수리 공구 챙기기';
    return '지하 1층 고장 분전반 수리 (미니맵 빨간 점)';
  }
  if (inspection?.done && !state.shift.showered) return '샤워실에서 씻을 수 있다';
  if (isBetween(clock, '22:00', '06:00')) return '휴게실 침상에서 쉴 수 있다';
  if (isBetween(clock, '07:30', '08:00')) return '곧 퇴근 (08:00)';
  return '순찰하며 다음 고장 대기';
}
