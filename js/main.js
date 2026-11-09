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
  SHIFT_START,
} from './core/clock.js';
import { createProgress, expPercent, isTopRank, RANKS, FAULT_EXP } from './systems/progress.js';
import {
  createStats,
  tickStats,
  addWalkFatigue,
  applyEffect,
  breakdown,
  restOffDay,
  EFFECTS,
  LIMITS,
} from './systems/stats.js';
import { startWork, updateWork } from './systems/work.js';
import { findTarget, promptFor, interact } from './systems/interactions.js';
import { createRenderer } from './render/renderer.js';
import { createTextLayer, drawHudGraphics, drawHudText, HUD_FONT, COLOR } from './render/hud.js';
import { drawScreenGraphics, drawScreenText } from './render/screens.js';

const MOVE_SPEED = 2.6; // 칸/초
const TURN_SPEED = 2.2; // 라디안/초
const PLAYER_RADIUS = 0.25;
const MAX_FRAME_SECONDS = 0.05; // 탭 전환 등으로 프레임이 튀어도 벽을 뚫지 않게 제한

const INITIAL_FAULTS = 2;
// 고장을 전부 처리한 뒤 새 고장까지 걸리는 게임 시간(분) [초기값]
const NEXT_FAULT_MINUTES = 40;
const NEXT_FAULT_MINUTES_NIGHT = 120; // 22:00~06:00
const FAST_REPAIR_MINUTES = 60; // 이 안에 고치면 평판 가산
const NEGLECT_MINUTES = 120; // 고장을 이만큼 방치할 때마다 평판 감점
const AUTOSAVE_SECONDS = 5;

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
  clock: createClock(),
  shift: null, // createShiftLog()로 채운다
  // 게임을 멈추고 띄우는 화면: 'report' 업무일지 | 'offday' 휴무일 | 'collapse' 쓰러짐 | 'fired' 해고
  screen: null,
  work: null, // 진행 중인 작업 게이지
  time: 0,
  nextFaultTimer: 0, // 게임 분
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
    promotions: [],
    meals: [], // 'lunch' | 'dinner'
    showered: false,
    neglected: 0, // 고장 방치로 감점된 횟수
    reputationStart: state.stats.reputation,
    notes: [], // 업무일지에 덧붙일 특이사항
    ending: null, // 쓰러졌다면 'fatigue' | 'hunger' | 'burnout'
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
    startWork(state, job);
  },
  onRepaired(panel, faultType, promotions) {
    const { shift, stats } = state;
    shift.repairs += 1;
    shift.exp += FAULT_EXP[faultType];
    shift.promotions.push(...promotions);
    applyEffect(stats, EFFECTS.repair);
    const waited = absoluteMinutes(state.clock) - panel.faultSince;
    applyEffect(stats, waited <= FAST_REPAIR_MINUTES ? EFFECTS.repairFast : EFFECTS.repairSlow);
    if (world.countFaults() === 0) state.nextFaultTimer = nextFaultDelay();
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

function endShift() {
  stopActivities();
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

// 휴무일을 보내고 다음 근무일 아침 사무실에서 시작한다
function startNextShift() {
  const office = world.getMap('office');
  state.clock.day += 1;
  state.clock.minutes = SHIFT_START;
  state.mapId = office.id;
  Object.assign(state.player, office.spawn);
  state.shift = createShiftLog();
  state.screen = null;
  // 남은 고장은 오늘 새로 접수된 것으로 본다 (쉬는 동안의 방치 감점이 한꺼번에 쏟아지지 않게)
  const now = absoluteMinutes(state.clock);
  for (const panel of world.faults()) {
    panel.faultSince = now;
    panel.lastPenalty = now;
  }
  showMessage(`${formatDate(state.clock.day)} 출근. 오늘도 안전 근무!`, COLOR.INFO, 3.5);
  saveGame(state, world);
}

function restartGame() {
  resetting = true;
  clearSave();
  window.location.reload();
}

function advanceScreen() {
  switch (state.screen) {
    case 'collapse':
      state.screen = state.stats.reputation <= 0 ? 'fired' : 'report';
      break;
    case 'report':
      state.clock.day += 1; // 퇴근 → 휴무일
      restOffDay(state.stats);
      state.screen = 'offday';
      break;
    case 'offday':
      startNextShift();
      return;
    case 'fired':
      restartGame();
      return;
    default:
      return;
  }
  saveGame(state, world);
}

const schedule = createSchedule([
  { time: '12:00', run: () => showMessage('점심시간입니다. 구내식당으로!', COLOR.INFO, 3.5) },
  { time: '13:00', run: () => showMessage('점심시간이 끝났습니다') },
  { time: '18:00', run: () => showMessage('저녁시간입니다. 구내식당으로!', COLOR.INFO, 3.5) },
  { time: '19:00', run: () => showMessage('검침 시간입니다 (검침 기능은 준비 중)', COLOR.ALERT, 3.5) },
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
    const promoted = shift.promotions.length > 0;
    const exp = isTopRank(progress) ? 'MAX' : `${expPercent(progress)}%`;
    const repStart = Math.round(shift.reputationStart);
    const repNow = Math.round(stats.reputation);
    const lines = [
      { text: `처리 ${shift.repairs}건 · 경험치 +${shift.exp}` },
      {
        text: `승진: ${promoted ? shift.promotions.join(' → ') : '없음'}`,
        color: promoted ? '#9a6a00' : undefined,
      },
      { text: `현재 직급: ${RANKS[progress.rank]} (EXP ${exp})` },
      {
        text: `평판: ${repStart} → ${repNow} (${signed(repNow - repStart)})`,
        color: repNow < repStart ? '#a83020' : undefined,
      },
      {
        text: `피로 ${Math.round(stats.fatigue)} · 포만 ${Math.round(stats.satiety)} · 위생 ${Math.round(stats.hygiene)} · 스트레스 ${Math.round(stats.stress)}`,
      },
    ];
    if (shift.neglected > 0) {
      lines.push({ text: `고장 방치 ${shift.neglected}회 (평판 감점)`, color: '#a83020' });
    }
    for (const note of shift.notes) lines.push({ text: note, color: '#a83020' });
    return { title: '업무일지', subtitle, lines: lines.slice(0, 7), action: '퇴근하기' };
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
        { text: '평판이 바닥나 관리사무소에서 해고되었다.' },
        { text: `최종 직급: ${RANKS[progress.rank]}` },
        { text: `총 처리 건수: ${progress.repairs}건` },
      ],
      action: '처음부터 다시',
    };
  }

  return {
    title: '휴무일',
    subtitle,
    lines: [
      { text: '집에서 푹 쉬었다.' },
      { text: '피로·포만감·위생이 회복되고' },
      { text: '스트레스가 조금 줄었다.' },
      { text: '(휴무일 활동 선택은 준비 중)', color: '#6a6658' },
    ],
    action: '다음 근무 출근',
  };
}

// ----- 입력 -----

const input = setupInput({
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
  addWalkFatigue(state.stats, moved);
}

// ----- 고장 -----

function updateFaults(minutes) {
  const now = absoluteMinutes(state.clock);

  if (state.nextFaultTimer > 0) {
    state.nextFaultTimer -= minutes;
    if (state.nextFaultTimer <= 0 && world.spawnFault(state.lastRepaired, now)) {
      if (state.clock.skip?.resting) {
        cancelSkip(state.clock);
        showMessage('고장 발생! 휴식을 중단합니다', COLOR.ALERT, 3);
      } else {
        showMessage('새 고장 발생! 미니맵을 확인하세요', COLOR.ALERT);
      }
    }
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
  tickStats(state.stats, elapsed, { resting });
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
  updateFaults(elapsed);

  const broken = breakdown(state.stats);
  if (broken) {
    collapse(broken);
    return;
  }
  if (state.stats.reputation <= 0) {
    fire();
    return;
  }

  state.prompt = promptFor(target);

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
    drawScreenGraphics(viewCtx);
    textLayer.clear();
    drawScreenText(textLayer, screenContent(state.screen));
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
  // 고장이 하나도 없고 다음 고장 예약도 없으면 일거리가 끊기므로 다시 예약한다
  if (world.countFaults() === 0 && state.nextFaultTimer <= 0) {
    state.nextFaultTimer = nextFaultDelay();
  }
  if (!state.screen) showMessage('이어서 근무합니다', COLOR.INFO, 3);
} else {
  const now = absoluteMinutes(state.clock);
  for (let i = 0; i < INITIAL_FAULTS; i++) world.spawnFault(null, now);
  showMessage(`${formatDate(state.clock.day)} 출근. 고장난 분전반을 수리하세요`, COLOR.ALERT, 4);
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
