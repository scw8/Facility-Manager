// 게임 시작점: 상태 생성, 저장 불러오기, 근무 흐름, 플레이어 이동, 게임 루프.

import { START_MAP_ID } from '../data/maps/index.js';
import { createWorld } from './world/world.js';
import { setupInput } from './core/input.js';
import { beginTransition, updateTransition } from './core/transition.js';
import { saveGame, loadGame, clearSave } from './core/save.js';
import {
  createClock,
  advanceClock,
  createSchedule,
  isSkipping,
  isBetween,
  skipUntil,
  cancelSkip,
  absoluteMinutes,
  formatDate,
  formatTime,
  shiftMinute,
  SHIFT_START,
} from './core/clock.js';
import {
  createProgress,
  addExp,
  monthlyReview,
  promotionStatus,
  RANKS,
  FAULT_EXP,
} from './systems/progress.js';
import {
  createInspection,
  applyInspectionToWorld,
  inspectionLines,
  progressCount,
  scoreInspection,
  SCORE,
  INSPECTION_DEADLINE,
} from './systems/inspection.js';
import {
  createStats,
  tickStats,
  addWalkFatigue,
  applyEffect,
  breakdown,
  EFFECTS,
  LIMITS,
} from './systems/stats.js';
import { startWork, updateWork } from './systems/work.js';
import {
  createLife,
  createMorning,
  fatigueMultiplier,
  beginOffDay,
  doActivity,
  wakeUp,
  OFFDAY_SLOTS,
  OFFDAY_ACTIVITIES,
  WAKE_OPTIONS,
  COMMUTE_MINUTES,
  FORCE_COMMUTE_AT,
  MORNING_EFFECTS,
} from './systems/life.js';
import { findTarget, promptFor, interact } from './systems/interactions.js';
import { createBag, capacity, selectSlot, cycleSlot, toggleItem, hasItem } from './systems/inventory.js';
import { SALARY, START_MONEY, SHOP_ITEMS, owns, buy, formatWon, isPayday } from './systems/economy.js';
import { ITEMS, STORAGES } from '../data/items.js';
import { INTRO_PAGES, TIPS, currentObjective } from './systems/guide.js';
import { withDirection } from './core/korean.js';
import { createRenderer } from './render/renderer.js';
import {
  createTextLayer,
  drawHudGraphics,
  drawHudText,
  slotRects,
  HUD_FONT,
  COLOR,
} from './render/hud.js';
import { drawScreenGraphics, drawScreenText } from './render/screens.js';

const MOVE_SPEED = 2.6; // 칸/초
const TURN_SPEED = 2.2; // 라디안/초
const PLAYER_RADIUS = 0.25;
const MAX_FRAME_SECONDS = 0.05; // 탭 전환 등으로 프레임이 튀어도 벽을 뚫지 않게 제한

const INITIAL_FAULTS = 2;
// 고장을 전부 처리한 뒤 새 고장까지 걸리는 게임 시간(분) [초기값]
const NEXT_FAULT_MINUTES = 40;
const NEXT_FAULT_MINUTES_NIGHT = 120; // 22:00~06:00
// 배관 누수는 분전반 고장과 따로, 근무 중 틈틈이 터진다 [초기값]
const LEAK_MINUTES = [60, 150]; // 다음 누수까지 (낮) 최소~최대
const LEAK_MINUTES_NIGHT = [180, 300];
const MAX_LEAKS = 2; // 동시에 있을 수 있는 누수 수
const FAST_REPAIR_MINUTES = 60; // 이 안에 고치면 평판 가산
const NEGLECT_MINUTES = 120; // 고장을 이만큼 방치할 때마다 평판 감점
const AUTOSAVE_SECONDS = 5;
const DRILL_BONUS = 1.3;

const viewCanvas = document.getElementById('view');
const viewCtx = viewCanvas.getContext('2d');
viewCtx.imageSmoothingEnabled = false;

const renderer = createRenderer(viewCtx);
const textLayer = createTextLayer(document.getElementById('hud-text'), viewCanvas);
const world = createWorld();

const state = {
  mapId: START_MAP_ID,
  player: { ...world.getMap(START_MAP_ID).spawn, walked: 0 },
  progress: createProgress(),
  stats: createStats(),
  life: createLife(),
  clock: createClock(),
  phase: 'home', // 'home' 출근 전 집 | 'work' 근무 중
  morning: createMorning(), // 아침 루틴 (씻었는지, 먹었는지)
  offday: { slots: [] }, // 휴무일에 고른 활동 id들
  inspection: null, // 오늘의 검침 데이터 (근무 시작 때 만든다)
  inspecting: null, // 검침 화면에서 보고 있는 지점 key
  bag: createBag(), // 아이템 슬롯
  money: START_MONEY,
  owned: [], // 상점에서 산 장비 id
  storage: null, // 열어 둔 공구실 보관함 id
  screenNote: '', // 공구실·상점 화면에 띄울 짧은 결과 문구
  shift: null, // createShiftLog()로 채운다
  // 게임을 멈추고 띄우는 화면:
  // 'intro' 시작 설명·도움말 | 'tip' 처음 안내 | 'wake' 기상 시각 | 'inspect' 검침 | 'storage' 공구실 | 'shop' 상점
  // 'report' 업무일지 | 'offday' 휴무일 | 'collapse' 쓰러짐 | 'fired' 해고
  screen: 'intro',
  screenReturn: 'wake', // 설명·안내 화면을 닫으면 돌아갈 화면 (null이면 게임으로)
  introPage: 0,
  tip: null, // 지금 보여주는 안내 id
  tipsSeen: [], // 이미 본 안내
  tipQueue: [], // 게임 중 띄울 차례를 기다리는 안내
  objective: '', // 화면 왼쪽 위 "할 일"
  menuIndex: 0, // 선택지 화면에서 고른 줄
  work: null, // 진행 중인 작업 게이지
  time: 0,
  nextFaultTimer: 0, // 게임 분
  nextLeakTimer: 0, // 게임 분
  lastRepaired: null,
  prompt: null,
  transition: null,
  autosaveTimer: AUTOSAVE_SECONDS,
  effects: {
    message: '',
    messageColor: COLOR.INFO,
    messageTimer: 0,
    okTimer: 0,
    smileTimer: 0,
    promotionTimer: 0,
    promotionRank: '',
  },
};

// 이번 근무 동안의 기록. 퇴근할 때 업무일지에 쓴다.
function createShiftLog() {
  return {
    repairs: 0,
    exp: 0,
    promotion: null, // 월말 인사발령으로 오른 직급 이름
    meals: [], // 'lunch' | 'dinner'
    showered: false,
    neglected: 0, // 고장 방치로 감점된 횟수
    reputationStart: state.stats.reputation,
    notes: [], // 업무일지에 덧붙일 특이사항
    ending: null, // 쓰러졌다면 'fatigue' | 'hunger' | 'burnout'
    inspection: null, // 퇴근 때 매긴 검침 결과
    pay: 0, // 이번 근무에 받은 월급 (월급날만)
  };
}
state.shift = createShiftLog();

const currentMap = () => world.getMap(state.mapId);

function showMessage(text, color = COLOR.INFO, seconds = 2.5) {
  const { effects } = state;
  effects.message = text;
  effects.messageColor = color;
  effects.messageTimer = seconds;
}

const panelFaultCount = () => world.faults().filter((f) => f.type === 'panel').length;

function nextLeakDelay() {
  const [min, max] = isBetween(state.clock, '22:00', '06:00') ? LEAK_MINUTES_NIGHT : LEAK_MINUTES;
  return min + Math.random() * (max - min);
}

function nextFaultDelay() {
  return isBetween(state.clock, '22:00', '06:00') ? NEXT_FAULT_MINUTES_NIGHT : NEXT_FAULT_MINUTES;
}

// 상호작용 오브젝트가 게임에 영향을 줄 때 쓰는 창구
const game = {
  state,
  world,
  showMessage,
  goTo(mapId, spawn) {
    const map = world.getMap(mapId);
    beginTransition(state, mapId, spawn || map.spawn, map.name);
  },
  startWork(job) {
    startWork(state, job, owns(state, 'drill') ? DRILL_BONUS : 1);
  },
  openStorage(id) {
    state.storage = id;
    state.screenNote = '';
    openScreen('storage');
  },
  commute: () => commute(),
  openInspection(key) {
    state.inspecting = key;
    openScreen('inspect');
  },
  onRepaired(panel, faultType) {
    const { shift, stats } = state;
    shift.repairs += 1;
    shift.exp += FAULT_EXP[faultType];
    applyEffect(stats, EFFECTS.repair);
    const waited = absoluteMinutes(state.clock) - panel.faultSince;
    applyEffect(stats, waited <= FAST_REPAIR_MINUTES ? EFFECTS.repairFast : EFFECTS.repairSlow);
    // 분전반이 하나도 고장 나 있지 않으면 다음 누전을 예약한다
    if (panelFaultCount() === 0 && state.nextFaultTimer <= 0) state.nextFaultTimer = nextFaultDelay();
  },
};

function switchMap(mapId, spawn) {
  state.mapId = mapId;
  Object.assign(state.player, spawn);
  saveGame(state, world);
}

// ----- 근무 흐름 -----
// 08:00 퇴근 → 업무일지 → 휴무일 → 다음 근무
// 쓰러짐 → 쓰러짐 화면 → 업무일지 → …     평판 0 → 해고 화면 → 처음부터

function stopActivities() {
  state.work = null;
  cancelSkip(state.clock);
}

// 검침을 채점해 경험치·평판에 반영하고 업무일지에 남긴다.
// countUnfinished: 마감 전에 쓰러졌다면 미완료 감점을 하지 않는다
function finishInspection(countUnfinished) {
  const { shift, stats } = state;
  if (!state.inspection || shift.inspection) return;
  const result = scoreInspection(state.inspection);
  if (result.notDone && !countUnfinished) {
    result.reputation -= SCORE.notDone.reputation;
    result.stress -= SCORE.notDone.stress;
    result.notDone = false;
  }
  shift.inspection = result;
  shift.exp += result.exp;
  addExp(state.progress, result.exp);
  applyEffect(stats, { reputation: result.reputation, stress: result.stress });

  if (result.missed) shift.notes.push(`검침: 놓친 이상 ${result.missed}곳 (평판 ${result.missed * SCORE.missed.reputation})`);
  if (result.falseAlarms) shift.notes.push(`검침: 잘못된 이상 보고 ${result.falseAlarms}곳`);
  if (result.unfixed) shift.notes.push(`검침: 누수 배관 미교체 (평판 ${result.unfixed * SCORE.unfixedLeak.reputation})`);
  if (result.notDone) shift.notes.push(`검침 미완료 (평판 ${SCORE.notDone.reputation})`);
}

// 그 달의 마지막 근무면 월급을 받고 인사발령을 받는다
function payday() {
  const { shift } = state;
  if (shift.pay || !isPayday(state.clock.day)) return;
  shift.pay = SALARY[state.progress.rank];
  state.money += shift.pay;
  shift.promotion = monthlyReview(state.progress);
}

function endShift() {
  stopActivities();
  finishInspection(true);
  payday();
  const { stats, shift } = state;
  if (stats.hygiene <= LIMITS.dirty) {
    applyEffect(stats, EFFECTS.dirtyAtShiftEnd);
    shift.notes.push(`위생 불량으로 동료들의 눈총 (평판 ${EFFECTS.dirtyAtShiftEnd.reputation})`);
  }
  state.screen = stats.reputation <= 0 ? 'fired' : 'report';
  saveGame(state, world);
}

function collapse(reason) {
  stopActivities();
  finishInspection(state.clock.minutes >= shiftMinute(INSPECTION_DEADLINE));
  payday();
  state.shift.ending = reason;
  applyEffect(state.stats, reason === 'burnout' ? EFFECTS.burnout : EFFECTS.collapse);
  state.screen = 'collapse';
  saveGame(state, world);
}

function fire() {
  stopActivities();
  state.screen = 'fired';
  saveGame(state, world);
}

// 고른 시각에 집에서 일어난다
function wakeAtHome(option) {
  const home = world.getMap('home');
  wakeUp(state.stats, option);
  state.clock.minutes = option.minutes;
  cancelSkip(state.clock);
  state.phase = 'home';
  state.mapId = home.id;
  Object.assign(state.player, home.spawn);
  state.morning = createMorning();
  state.screen = null;
  showMessage('씻고, 먹고, 08:00까지 출근!', COLOR.INFO, 4);
  queueTip('home');
  saveGame(state, world);
}

// 현관문을 나서면 30분 뒤 사무실에 도착한다. 08:00을 넘기면 지각.
function commute() {
  if (state.transition || state.phase !== 'home') return;
  const office = world.getMap('office');
  const arrival = state.clock.minutes + COMMUTE_MINUTES;
  const late = Math.round(arrival - SHIFT_START);

  stopActivities();
  state.clock.minutes = Math.max(arrival, SHIFT_START);
  state.phase = 'work';
  state.shift = createShiftLog();
  if (late > 0) {
    applyEffect(state.stats, MORNING_EFFECTS.late);
    let penalty = MORNING_EFFECTS.late.reputation;
    if (late > 30) {
      applyEffect(state.stats, MORNING_EFFECTS.veryLate);
      penalty += MORNING_EFFECTS.veryLate.reputation;
    }
    state.shift.notes.push(`지각 ${late}분 (평판 ${penalty})`);
    showMessage(`${late}분 지각했다…`, COLOR.ALERT, 4);
  } else {
    showMessage(`${formatDate(state.clock.day)} 출근. 오늘도 안전 근무!`, COLOR.INFO, 3.5);
  }

  // 남은 고장은 오늘 새로 접수된 것으로 본다 (쉬는 동안의 방치 감점이 한꺼번에 쏟아지지 않게)
  const now = absoluteMinutes(state.clock);
  for (const panel of world.faults()) {
    panel.faultSince = now;
    panel.lastPenalty = now;
  }
  if (panelFaultCount() === 0) state.nextFaultTimer = NEXT_FAULT_MINUTES;
  state.nextLeakTimer = nextLeakDelay();

  state.inspection = createInspection(world, state.clock.day);
  applyInspectionToWorld(state.inspection, world);

  beginTransition(state, office.id, office.spawn, '출근 중…');
  queueTip('office');
}

function restartGame() {
  resetting = true;
  clearSave();
  window.location.reload();
}

function openScreen(kind) {
  state.screen = kind;
  state.menuIndex = 0;
}

// ----- 안내 -----

// 게임 중 처음 겪는 상황: 화면이 비면 띄운다
function queueTip(id) {
  if (!state.tipsSeen.includes(id) && !state.tipQueue.includes(id)) state.tipQueue.push(id);
}

// 지금 떠 있는 화면 위에 바로 띄운다 (닫으면 원래 화면으로)
function showTip(id) {
  if (state.tipsSeen.includes(id)) return;
  state.tipsSeen.push(id);
  state.screenReturn = state.screen;
  state.tip = id;
  state.screen = 'tip';
}

function openHelp() {
  if (state.screen === 'intro' || state.screen === 'tip') return;
  state.screenReturn = state.screen;
  state.introPage = 0;
  state.screen = 'intro';
}

function closeGuide() {
  state.screen = state.screenReturn;
  state.screenReturn = null;
  state.tip = null;
}

// 지금 화면의 선택지 (없으면 null)
const CLOSE = 'close';
const SHOP_OPTION = { id: 'shop', label: '인터넷 쇼핑', desc: '시간을 쓰지 않음' };

const INSPECT_OPTIONS = [
  { label: '정상', desc: '이상 없음' },
  { label: '이상', desc: '이상 보고' },
];

function screenOptions() {
  if (state.screen === 'wake') return WAKE_OPTIONS;
  if (state.screen === 'inspect') return INSPECT_OPTIONS;
  if (state.screen === 'offday' && state.offday.slots.length < OFFDAY_SLOTS.length) {
    return [...OFFDAY_ACTIVITIES, SHOP_OPTION];
  }
  if (state.screen === 'storage') return [...STORAGES[state.storage].items, CLOSE];
  if (state.screen === 'shop') return [...SHOP_ITEMS, CLOSE];
  return null;
}

// E(사용)를 눌렀을 때: 선택지가 있으면 고른 것을 실행하고, 없으면 다음 화면으로
function advanceScreen() {
  const options = screenOptions();
  switch (state.screen) {
    case 'intro':
      if (state.introPage < INTRO_PAGES.length - 1) {
        state.introPage += 1;
        return;
      }
      closeGuide();
      break;
    case 'tip':
      closeGuide();
      break;
    case 'wake':
      wakeAtHome(options[state.menuIndex]);
      return;
    case 'inspect':
      judgeInspection(state.menuIndex === 0 ? 'normal' : 'abnormal');
      break;
    case 'collapse':
      openScreen(state.stats.reputation <= 0 ? 'fired' : 'report');
      break;
    case 'report':
      state.clock.day += 1; // 퇴근 → 휴무일
      beginOffDay(state.stats);
      state.offday = { slots: [] };
      openScreen('offday');
      showTip('offday');
      break;
    case 'storage': {
      const id = options[state.menuIndex];
      if (id === CLOSE) {
        state.screen = null;
        return;
      }
      state.screenNote = toggleItem(state, id);
      return;
    }
    case 'shop': {
      const item = options[state.menuIndex];
      if (item === CLOSE) {
        openScreen('offday');
        break;
      }
      state.screenNote = buy(state, item.id) ?? `${item.name} 구매 완료`;
      break;
    }
    case 'offday':
      if (options) {
        const activity = options[state.menuIndex];
        if (activity.id === 'shop') {
          state.screenNote = '';
          openScreen('shop');
          return;
        }
        const problem = doActivity(activity.id, state);
        if (problem) {
          state.screenNote = problem;
          return;
        }
        state.screenNote = '';
        state.offday.slots.push(activity.id);
      } else {
        state.clock.day += 1; // 잠자리에 든다 → 다음 근무일 아침
        openScreen('wake');
      }
      break;
    case 'fired':
      restartGame();
      return;
    default:
      return;
  }
  saveGame(state, world);
}

function judgeInspection(verdict) {
  const key = state.inspecting;
  const point = state.inspection.points[key];
  const [mapId, cell] = key.split(':');
  const obj = world.getMap(mapId).objects.get(cell);
  point.judged = verdict;
  state.screen = null;
  state.inspecting = null;

  if (verdict === 'abnormal' && obj.leaking) {
    showMessage('누수 확인! 누르고 있으면 배관을 교체합니다', COLOR.ALERT, 3.5);
  } else {
    showMessage(`${obj.name}: ${verdict === 'normal' ? '정상' : '이상'}으로 기록`);
  }

  const { judged, total } = progressCount(state.inspection);
  if (judged === total) {
    state.inspection.done = true;
    showMessage('검침 완료! 이제 샤워실에서 씻을 수 있습니다', COLOR.GOOD, 3.5);
  }
}

function moveMenu({ move, pick }) {
  const options = screenOptions();
  if (!options) return;
  if (pick !== undefined) {
    if (pick >= options.length) return;
    state.menuIndex = pick;
    advanceScreen();
    return;
  }
  state.menuIndex = (state.menuIndex + move + options.length) % options.length;
}

const schedule = createSchedule([
  { time: '12:00', run: () => showMessage('점심시간입니다. 구내식당으로!', COLOR.INFO, 3.5) },
  { time: '13:00', run: () => showMessage('점심시간이 끝났습니다') },
  { time: '18:00', run: () => showMessage('저녁시간입니다. 구내식당으로!', COLOR.INFO, 3.5) },
  {
    time: '19:00',
    run: () => {
      showMessage('검침 시간! 지하 1층 기계실·전기실·비트를 점검하세요', COLOR.ALERT, 4);
      queueTip('inspection');
    },
  },
  {
    time: INSPECTION_DEADLINE,
    run: () => {
      if (!state.inspection?.done) showMessage('검침 마감 시간이 지났습니다', COLOR.ALERT, 3.5);
    },
  },
  { time: '22:00', run: () => showMessage('야간 휴게 시간입니다. 휴게실에서 쉴 수 있습니다') },
  { time: '07:30', run: () => showMessage('퇴근 30분 전입니다') },
  { time: '08:00', run: endShift },
]);

// ----- 안내 화면 내용 -----

const COLLAPSE_TEXT = {
  fatigue: { title: '과로로 쓰러짐', cause: '피로가 한계에 달해 쓰러졌다.' },
  hunger: { title: '허기로 쓰러짐', cause: '끼니를 거르다 결국 쓰러졌다.' },
  burnout: { title: '번아웃', cause: '스트레스를 견디지 못하고 근무지를 이탈했다.' },
};

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

function screenContent(kind) {
  const { shift, progress, clock, stats } = state;
  const subtitle = formatDate(clock.day);

  if (kind === 'report') {
    const status = promotionStatus(progress);
    let rankLine = `직급: ${RANKS[progress.rank]}`;
    if (shift.promotion) rankLine = `인사발령: ${withDirection(shift.promotion)} 승진!`;
    else if (status) {
      rankLine += ` · 승진 조건 경험치 ${status.exp}/${status.expNeed}, 근속 ${status.months}/${status.monthsNeed}개월`;
    }
    const repStart = Math.round(shift.reputationStart);
    const repNow = Math.round(stats.reputation);
    const insp = shift.inspection;
    const lines = [
      { text: `처리 ${shift.repairs}건 · 경험치 +${shift.exp}` },
      { text: rankLine, color: shift.promotion ? '#9a6a00' : undefined, size: shift.promotion ? 8 : 6 },
      {
        text: insp ? `검침: ${insp.total}곳 중 ${insp.correct}곳 정확 판정` : '검침: 기록 없음',
        color: insp && insp.correct < insp.total ? '#a83020' : undefined,
      },
      {
        text: `평판: ${repStart} → ${repNow} (${signed(repNow - repStart)})`,
        color: repNow < repStart ? '#a83020' : undefined,
      },
      {
        text: `피로 ${Math.round(stats.fatigue)} · 포만 ${Math.round(stats.satiety)} · 위생 ${Math.round(stats.hygiene)} · 스트레스 ${Math.round(stats.stress)}`,
      },
      {
        text: shift.pay
          ? `월급날! +${formatWon(shift.pay)} · 잔고 ${formatWon(state.money)}`
          : `잔고 ${formatWon(state.money)} (월급은 매달 3번째 근무 후)`,
        color: shift.pay ? '#2a7a2a' : '#5a5648',
      },
    ];
    if (shift.neglected > 0) {
      lines.push({ text: `고장 방치 ${shift.neglected}회 (평판 감점)`, color: '#a83020' });
    }
    for (const note of shift.notes) lines.push({ text: note, color: '#a83020' });
    return { title: '업무일지', subtitle, lines: lines.slice(0, 8), action: '퇴근하기' };
  }

  if (kind === 'collapse') {
    const text = COLLAPSE_TEXT[shift.ending];
    const penalty = shift.ending === 'burnout' ? EFFECTS.burnout : EFFECTS.collapse;
    return {
      title: text.title,
      subtitle,
      lines: [
        { text: text.cause },
        { text: '오늘 근무는 여기까지다.' },
        { text: `평판 ${penalty.reputation}`, color: '#a83020' },
      ],
      action: '업무일지 보기',
    };
  }

  if (kind === 'fired') {
    return {
      title: '해고',
      subtitle,
      lines: [
        { text: '평판이 바닥나 해고되었다.' },
        { text: `최종 직급: ${RANKS[progress.rank]}` },
        { text: `총 처리 건수: ${progress.repairs}건` },
      ],
      action: '처음부터 다시',
    };
  }

  const statLine = {
    text: `피로 ${Math.round(stats.fatigue)} · 포만 ${Math.round(stats.satiety)} · 위생 ${Math.round(stats.hygiene)} · 스트레스 ${Math.round(stats.stress)}`,
    color: '#5a5648',
  };

  if (kind === 'intro') {
    const page = INTRO_PAGES[state.introPage];
    const last = state.introPage === INTRO_PAGES.length - 1;
    return {
      title: page.title,
      subtitle: `도움말 ${state.introPage + 1}/${INTRO_PAGES.length}`,
      lines: page.lines.map((text) => ({ text, size: 7 })),
      action: last ? (state.screenReturn === 'wake' ? '시작하기' : '닫기') : '다음',
    };
  }

  if (kind === 'tip') {
    const tip = TIPS[state.tip];
    return {
      title: tip.title,
      subtitle: '처음 안내 · H키로 도움말을 다시 볼 수 있다',
      lines: tip.lines.map((text) => ({ text, size: 7 })),
      action: '확인',
    };
  }

  if (kind === 'storage') {
    const storage = STORAGES[state.storage];
    return {
      title: storage.name,
      subtitle: `아이템 슬롯 ${state.bag.items.length}/${capacity(state)}${state.screenNote ? ` · ${state.screenNote}` : ''}`,
      lines: [],
      options: [
        ...storage.items.map((id) => ({
          label: ITEMS[id].name,
          desc: hasItem(state, id) ? '챙김 ✓ (다시 누르면 돌려놓기)' : ITEMS[id].kind === 'part' ? '부품' : '',
        })),
        { label: '닫기' },
      ],
      selected: state.menuIndex,
    };
  }

  if (kind === 'shop') {
    return {
      title: '인터넷 쇼핑',
      subtitle: `잔고 ${formatWon(state.money)}${state.screenNote ? ` · ${state.screenNote}` : ''}`,
      lines: [],
      options: [
        ...SHOP_ITEMS.map((item) => ({
          label: `${item.name} ${formatWon(item.price)}`,
          desc: owns(state, item.id) ? '보유 ✓' : item.desc,
        })),
        { label: '돌아가기' },
      ],
      selected: state.menuIndex,
    };
  }

  if (kind === 'inspect') {
    const [mapId, cell] = state.inspecting.split(':');
    const obj = world.getMap(mapId).objects.get(cell);
    const point = state.inspection.points[state.inspecting];
    return {
      title: obj.name,
      subtitle: `검침 · ${formatTime(clock.minutes)}`,
      lines: inspectionLines(obj, point).map((line) =>
        typeof line === 'string' ? { text: line, size: 7 } : { text: line.text, size: 6, color: '#6a5a30' }
      ),
      options: INSPECT_OPTIONS,
      selected: state.menuIndex,
    };
  }

  if (kind === 'wake') {
    return {
      title: '기상',
      subtitle,
      lines: [
        { text: '몇 시에 일어날까? (08:00까지 출근)' },
        { text: '씻기 15분 · 아침 20분 · 출근 30분', color: '#5a5648' },
      ],
      options: WAKE_OPTIONS.map((o) => ({ label: `${o.time} 기상`, desc: `피로 +${o.fatigue} · ${o.desc}` })),
      selected: state.menuIndex,
    };
  }

  // 휴무일
  const { slots } = state.offday;
  const labelOf = (id) => OFFDAY_ACTIVITIES.find((a) => a.id === id).label;
  const plan = OFFDAY_SLOTS.map((name, i) => `${name} ${slots[i] ? labelOf(slots[i]) : '…'}`).join(' · ');
  const lifeLine = {
    text: `공부 ${Math.round(state.life.study)}% · 체력 ${state.life.fitness} · 잔고 ${formatWon(state.money)}`,
    color: '#5a5648',
  };
  if (slots.length < OFFDAY_SLOTS.length) {
    return {
      title: '휴무일',
      subtitle: `${subtitle} · ${state.screenNote || `${OFFDAY_SLOTS[slots.length]}에는 뭘 할까?`}`,
      lines: [{ text: plan }, statLine, lifeLine],
      options: [...OFFDAY_ACTIVITIES, SHOP_OPTION].map((a) => ({ label: a.label, desc: a.desc })),
      selected: state.menuIndex,
    };
  }
  return {
    title: '휴무일',
    subtitle,
    lines: [{ text: plan }, statLine, lifeLine, { text: '내일은 근무일이다.' }],
    action: '잠자리에 들기',
  };
}

// ----- 입력 -----

const input = setupInput({
  onMenu(e) {
    if (state.screen) moveMenu(e);
    else if (e.pick !== undefined) selectSlot(state, e.pick);
  },
  onHelp: openHelp,
  onWheel(delta) {
    if (!state.screen) cycleSlot(state, delta);
  },
  onTap(x, y) {
    if (state.screen) return;
    const index = slotRects(capacity(state)).findIndex(
      (r) => x >= r.x - 1 && x < r.x + r.w + 1 && y >= r.y - 1 && y < r.y + r.h + 1
    );
    if (index >= 0) selectSlot(state, index);
  },
  onInteract() {
    if (state.screen) {
      advanceScreen();
      return;
    }
    if (state.transition || state.work || isSkipping(state.clock)) return;
    interact(findTarget(currentMap(), state.player), game);
  },
});

// ----- 플레이어 이동 -----

function isBlocked(map, x, y) {
  const r = PLAYER_RADIUS;
  return (
    !map.isWalkable(Math.floor(x - r), Math.floor(y - r)) ||
    !map.isWalkable(Math.floor(x + r), Math.floor(y - r)) ||
    !map.isWalkable(Math.floor(x - r), Math.floor(y + r)) ||
    !map.isWalkable(Math.floor(x + r), Math.floor(y + r))
  );
}

function updatePlayer(dt) {
  const { player } = state;
  const map = currentMap();

  const turn = Number(input.right) - Number(input.left);
  player.angle += turn * TURN_SPEED * dt;

  const move = Number(input.forward) - Number(input.back);
  if (move === 0) return;

  const stepX = Math.cos(player.angle) * move * MOVE_SPEED * dt;
  const stepY = Math.sin(player.angle) * move * MOVE_SPEED * dt;
  const startX = player.x;
  const startY = player.y;

  // 축별로 따로 검사해서 벽을 따라 미끄러지게 한다
  if (!isBlocked(map, player.x + stepX, player.y)) player.x += stepX;
  if (!isBlocked(map, player.x, player.y + stepY)) player.y += stepY;

  // 실제로 움직인 거리만 피로도에 반영한다 (벽에 비비는 동안은 오르지 않음)
  const moved = Math.hypot(player.x - startX, player.y - startY);
  player.walked += moved;
  addWalkFatigue(state.stats, moved * (owns(state, 'boots') ? 0.5 : 1));
}

// ----- 고장 -----

function updateFaults(minutes) {
  const now = absoluteMinutes(state.clock);

  const alert = (text) => {
    if (state.clock.skip?.resting) {
      cancelSkip(state.clock);
      showMessage(`${text} 휴식을 중단합니다`, COLOR.ALERT, 3);
    } else {
      showMessage(text, COLOR.ALERT, 3);
    }
  };

  if (state.nextFaultTimer > 0) {
    state.nextFaultTimer -= minutes;
    if (state.nextFaultTimer <= 0 && world.spawnFault(state.lastRepaired, now)) {
      alert('분전반 누전 발생! (미니맵 빨간 점)');
    }
  }

  state.nextLeakTimer -= minutes;
  if (state.nextLeakTimer <= 0) {
    state.nextLeakTimer = nextLeakDelay();
    const leaks = world.faults().filter((f) => f.type === 'leak').length;
    if (leaks < MAX_LEAKS && world.spawnLeak(now)) alert('지하 1층 배관 누수 발생! (미니맵 파란 점)');
  }

  // 오래 방치된 고장은 평판을 깎는다
  for (const panel of world.faults()) {
    if (now - panel.lastPenalty >= NEGLECT_MINUTES) {
      panel.lastPenalty += NEGLECT_MINUTES;
      applyEffect(state.stats, EFFECTS.faultNeglected);
      state.shift.neglected += 1;
      showMessage('방치된 고장 때문에 평판이 떨어졌습니다', COLOR.ALERT);
    }
  }
}

// ----- 작업 -----

function updateCurrentWork(dt, target) {
  const result = updateWork(state, dt, { holding: input.use, target });
  if (result === 'failed') {
    applyEffect(state.stats, EFFECTS.repairFailed);
    showMessage('작업 실패! 컨디션이 좋지 않다. 다시 시도하세요', COLOR.ALERT, 3);
  } else if (result === 'cancelled') {
    showMessage('작업 중단');
  }
}

// ----- 게임 루프 -----

function update(dt) {
  const { effects, clock } = state;

  state.time += dt;
  if (state.screen) return; // 안내 화면이 떠 있는 동안은 멈춘다

  const resting = clock.skip?.resting ?? false;
  const prevMinutes = clock.minutes;
  advanceClock(clock, dt);
  const elapsed = clock.minutes - prevMinutes;
  tickStats(state.stats, elapsed, { resting, fatigueMultiplier: fatigueMultiplier(state.life) });
  schedule.tick(prevMinutes, clock.minutes);
  if (state.screen) return; // 방금 퇴근했다

  effects.messageTimer = Math.max(0, effects.messageTimer - dt);
  effects.okTimer = Math.max(0, effects.okTimer - dt);
  effects.smileTimer = Math.max(0, effects.smileTimer - dt);
  effects.promotionTimer = Math.max(0, effects.promotionTimer - dt);

  updateTransition(state, dt, switchMap);
  if (!state.transition && !isSkipping(clock)) updatePlayer(dt);

  const target = findTarget(currentMap(), state.player);
  updateCurrentWork(dt, target);
  if (state.phase === 'work') updateFaults(elapsed);

  // 집에서 너무 늑장 부리면 허겁지겁 뛰쳐나간다
  if (state.phase === 'home' && clock.minutes >= FORCE_COMMUTE_AT && !isSkipping(clock)) {
    commute();
  }

  const broken = breakdown(state.stats);
  if (broken) {
    collapse(broken);
    return;
  }
  if (state.stats.reputation <= 0) {
    fire();
    return;
  }

  state.prompt = promptFor(target, state);
  state.objective = currentObjective(state, world);

  // 기다리던 안내가 있으면 화면이 조용할 때 띄운다
  if (state.tipQueue.length > 0 && !state.transition && !state.work && !isSkipping(clock)) {
    showTip(state.tipQueue.shift());
    return;
  }

  state.autosaveTimer -= dt;
  if (state.autosaveTimer <= 0) {
    state.autosaveTimer = AUTOSAVE_SECONDS;
    saveGame(state, world);
  }
}

function draw() {
  const map = currentMap();
  renderer.drawWorld(map, state.player, state.time);
  drawHudGraphics(viewCtx, state, map);
  if (state.screen) {
    const content = screenContent(state.screen);
    drawScreenGraphics(viewCtx, content);
    textLayer.clear();
    drawScreenText(textLayer, content);
  } else {
    drawHudText(textLayer, state, map);
  }
}

let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ----- 저장 -----

let resetting = false;

// 탭을 닫거나 다른 앱으로 넘어갈 때 저장한다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !resetting) saveGame(state, world);
});
window.addEventListener('pagehide', () => {
  if (!resetting) saveGame(state, world);
});

document.getElementById('reset-btn').addEventListener('click', (e) => {
  e.currentTarget.blur(); // 포커스가 남으면 Space(상호작용)가 버튼을 다시 누른다
  if (!window.confirm('저장된 진행 상황을 지우고 처음부터 시작할까요?')) return;
  restartGame();
});

// ----- 시작 -----

if (loadGame(state, world)) {
  applyInspectionToWorld(state.inspection, world);
  // 고장이 하나도 없고 다음 고장 예약도 없으면 일거리가 끊기므로 다시 예약한다
  if (panelFaultCount() === 0 && state.nextFaultTimer <= 0) {
    state.nextFaultTimer = nextFaultDelay();
  }
  if (!state.screen) showMessage('이어서 진행합니다', COLOR.INFO, 3);
} else {
  // 새 게임: 첫 근무일 아침, 기상 시각을 고르는 화면부터 시작한다
  for (let i = 0; i < INITIAL_FAULTS; i++) world.spawnFault();
}

// 개발용: 주소에 ?debug를 붙이면 콘솔에서 상태를 보고 프레임을 직접 돌릴 수 있다
if (new URLSearchParams(window.location.search).has('debug')) {
  window.__game = {
    state,
    world,
    input,
    interact: () => interact(findTarget(currentMap(), state.player), game),
    advanceScreen,
    skipUntil: (time) => skipUntil(state.clock, time),
    step(seconds, dt = 1 / 60) {
      for (let t = 0; t < seconds; t += dt) update(dt);
      draw();
    },
  };
}

document.fonts.load(`11px "${HUD_FONT}"`, '처리');
requestAnimationFrame(frame);
