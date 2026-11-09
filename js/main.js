// 게임 시작점: 상태 생성, 저장 불러오기, 플레이어 이동, 게임 루프.

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
  skipUntil,
  formatDate,
  SHIFT_START,
} from './core/clock.js';
import {
  createProgress,
  addFatigueFromWalking,
  expPercent,
  isTopRank,
  RANKS,
  FAULT_EXP,
} from './systems/progress.js';
import { findTarget, promptFor, interact } from './systems/interactions.js';
import { createRenderer } from './render/renderer.js';
import { createTextLayer, drawHudGraphics, drawHudText, HUD_FONT, COLOR } from './render/hud.js';
import { drawScreenGraphics, drawScreenText } from './render/screens.js';

const MOVE_SPEED = 2.6; // 칸/초
const TURN_SPEED = 2.2; // 라디안/초
const PLAYER_RADIUS = 0.25;
const MAX_FRAME_SECONDS = 0.05; // 탭 전환 등으로 프레임이 튀어도 벽을 뚫지 않게 제한

const INITIAL_FAULTS = 2;
const NEXT_FAULT_DELAY = 3; // 고장을 전부 처리한 뒤 새 고장까지 걸리는 시간(초)
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
  clock: createClock(),
  shift: createShiftLog(),
  screen: null, // 'report'(업무일지) | 'offday'(휴무일) | null. 화면이 떠 있으면 게임이 멈춘다
  time: 0,
  nextFaultTimer: 0,
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

const currentMap = () => world.getMap(state.mapId);

// 이번 근무 동안의 기록. 퇴근할 때 업무일지에 쓴다.
function createShiftLog() {
  return { repairs: 0, exp: 0, promotions: [] };
}

function showMessage(text, color = COLOR.INFO, seconds = 2.5) {
  const { effects } = state;
  effects.message = text;
  effects.messageColor = color;
  effects.messageTimer = seconds;
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
  onRepaired(faultType, promotions) {
    state.shift.repairs += 1;
    state.shift.exp += FAULT_EXP[faultType];
    state.shift.promotions.push(...promotions);
    if (world.countFaults() === 0) state.nextFaultTimer = NEXT_FAULT_DELAY;
  },
};

function switchMap(mapId, spawn) {
  state.mapId = mapId;
  Object.assign(state.player, spawn);
  saveGame(state, world);
}

// ----- 근무 일정 -----

function endShift() {
  state.screen = 'report';
  saveGame(state, world);
}

// 휴무일을 보내고 다음 근무일 아침 사무실에서 시작한다
function startNextShift() {
  const office = world.getMap('office');
  state.clock.day += 1;
  state.clock.minutes = SHIFT_START;
  state.clock.skipTarget = null;
  state.mapId = office.id;
  Object.assign(state.player, office.spawn);
  state.progress.fatigue = 0; // 휴무일에 쉬었다 (Phase 3에서 휴무일 활동으로 대체)
  state.shift = createShiftLog();
  state.screen = null;
  showMessage(`${formatDate(state.clock.day)} 출근. 오늘도 안전 근무!`, COLOR.INFO, 3.5);
  saveGame(state, world);
}

function advanceScreen() {
  if (state.screen === 'report') {
    state.clock.day += 1; // 퇴근 → 휴무일
    state.screen = 'offday';
    saveGame(state, world);
  } else if (state.screen === 'offday') {
    startNextShift();
  }
}

const schedule = createSchedule([
  { time: '12:00', run: () => showMessage('점심시간입니다 (12:00~13:00)', COLOR.INFO, 3.5) },
  { time: '13:00', run: () => showMessage('점심시간이 끝났습니다') },
  { time: '18:00', run: () => showMessage('저녁시간입니다 (18:00~19:00)', COLOR.INFO, 3.5) },
  { time: '19:00', run: () => showMessage('검침 시간입니다 (검침 기능은 준비 중)', COLOR.ALERT, 3.5) },
  { time: '07:30', run: () => showMessage('퇴근 30분 전입니다') },
  { time: '08:00', run: endShift },
]);

// 업무일지·휴무일 화면에 보여줄 내용
function screenContent(kind) {
  const { shift, progress, clock } = state;
  if (kind === 'report') {
    const promoted = shift.promotions.length > 0;
    const exp = isTopRank(progress) ? 'MAX' : `${expPercent(progress)}%`;
    return {
      title: '업무일지',
      subtitle: formatDate(clock.day),
      lines: [
        { text: `처리 건수: ${shift.repairs}건` },
        { text: `획득 경험치: +${shift.exp}` },
        {
          text: `승진: ${promoted ? shift.promotions.join(' → ') : '없음'}`,
          color: promoted ? '#9a6a00' : undefined,
        },
        { text: `현재 직급: ${RANKS[progress.rank]} (EXP ${exp})` },
        { text: `퇴근 시 피로도: ${Math.floor(progress.fatigue)}%` },
      ],
      action: '퇴근하기',
    };
  }
  return {
    title: '휴무일',
    subtitle: formatDate(clock.day),
    lines: [
      { text: '집에서 푹 쉬었다.' },
      { text: '피로도가 회복되었다.' },
      { text: '(휴무일 활동 선택은 준비 중)', color: '#6a6658' },
    ],
    action: '다음 근무 출근',
  };
}

const input = setupInput({
  onInteract() {
    if (state.screen) {
      advanceScreen();
      return;
    }
    if (state.transition || isSkipping(state.clock)) return;
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
  const { player, progress } = state;
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
  addFatigueFromWalking(progress, moved);
}

// ----- 게임 루프 -----

function update(dt) {
  const { effects } = state;

  state.time += dt;
  if (state.screen) return; // 업무일지·휴무일 화면이 떠 있는 동안은 멈춘다

  const prevMinutes = state.clock.minutes;
  advanceClock(state.clock, dt);
  schedule.tick(prevMinutes, state.clock.minutes);

  effects.messageTimer = Math.max(0, effects.messageTimer - dt);
  effects.okTimer = Math.max(0, effects.okTimer - dt);
  effects.smileTimer = Math.max(0, effects.smileTimer - dt);
  effects.promotionTimer = Math.max(0, effects.promotionTimer - dt);

  updateTransition(state, dt, switchMap);
  if (!state.transition && !isSkipping(state.clock)) updatePlayer(dt);

  if (state.nextFaultTimer > 0) {
    state.nextFaultTimer -= dt;
    if (state.nextFaultTimer <= 0 && world.spawnFault(state.lastRepaired)) {
      showMessage('새 고장 발생! 미니맵을 확인하세요', COLOR.ALERT);
    }
  }

  state.prompt = promptFor(findTarget(currentMap(), state.player));

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
  resetting = true;
  clearSave();
  window.location.reload();
});

// ----- 시작 -----

if (loadGame(state, world)) {
  // 고장이 하나도 없고 다음 고장 예약도 없으면 일거리가 끊기므로 다시 예약한다
  if (world.countFaults() === 0 && state.nextFaultTimer <= 0) {
    state.nextFaultTimer = NEXT_FAULT_DELAY;
  }
  if (!state.screen) showMessage('이어서 근무합니다', COLOR.INFO, 3);
} else {
  for (let i = 0; i < INITIAL_FAULTS; i++) world.spawnFault();
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
