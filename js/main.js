// 게임 시작점: 상태 생성, 저장 불러오기, 플레이어 이동, 게임 루프.

import { START_MAP_ID } from '../data/maps/index.js';
import { createWorld } from './world/world.js';
import { setupInput } from './core/input.js';
import { beginTransition, updateTransition } from './core/transition.js';
import { saveGame, loadGame, clearSave } from './core/save.js';
import { createProgress, addFatigueFromWalking } from './systems/progress.js';
import { findTarget, promptFor, interact } from './systems/interactions.js';
import { createRenderer } from './render/renderer.js';
import { createTextLayer, drawHudGraphics, drawHudText, HUD_FONT, COLOR } from './render/hud.js';

const MOVE_SPEED = 2.6; // 칸/초
const TURN_SPEED = 2.2; // 라디안/초
const PLAYER_RADIUS = 0.25;
const MAX_FRAME_SECONDS = 0.05; // 탭 전환 등으로 프레임이 튀어도 벽을 뚫지 않게 제한

const CLOCK_START_MINUTES = 2 * 60; // AM 02:00 시작
const CLOCK_MINUTES_PER_SECOND = 1;

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
  clockMinutes: CLOCK_START_MINUTES,
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
  onRepaired() {
    if (world.countFaults() === 0) state.nextFaultTimer = NEXT_FAULT_DELAY;
  },
};

function switchMap(mapId, spawn) {
  state.mapId = mapId;
  Object.assign(state.player, spawn);
  saveGame(state, world);
}

const input = setupInput({
  onInteract() {
    if (state.transition) return;
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
  state.clockMinutes += dt * CLOCK_MINUTES_PER_SECOND;

  effects.messageTimer = Math.max(0, effects.messageTimer - dt);
  effects.okTimer = Math.max(0, effects.okTimer - dt);
  effects.smileTimer = Math.max(0, effects.smileTimer - dt);
  effects.promotionTimer = Math.max(0, effects.promotionTimer - dt);

  updateTransition(state, dt, switchMap);
  if (!state.transition) updatePlayer(dt);

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
  drawHudText(textLayer, state, map);
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
  showMessage('이어서 근무합니다', COLOR.INFO, 3);
} else {
  for (let i = 0; i < INITIAL_FAULTS; i++) world.spawnFault();
  showMessage('당직 시작. 고장난 분전반을 수리하세요', COLOR.ALERT, 4);
}

// 개발용: 주소에 ?debug를 붙이면 콘솔에서 상태를 보고 프레임을 직접 돌릴 수 있다
if (new URLSearchParams(window.location.search).has('debug')) {
  window.__game = {
    state,
    world,
    input,
    interact: () => interact(findTarget(currentMap(), state.player), game),
    step(seconds, dt = 1 / 60) {
      for (let t = 0; t < seconds; t += dt) update(dt);
      draw();
    },
  };
}

document.fonts.load(`11px "${HUD_FONT}"`, '처리');
requestAnimationFrame(frame);
