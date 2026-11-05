// 게임 루프와 입력, 플레이어 이동, 수리 처리.

const MOVE_SPEED = 2.6; // 칸/초
const TURN_SPEED = 2.2; // 라디안/초
const PLAYER_RADIUS = 0.25;
const REPAIR_RANGE = 1.8; // 칸
const MAX_FRAME_SECONDS = 0.05; // 탭 전환 등으로 프레임이 튀어도 벽을 뚫지 않게 제한

const CLOCK_START_MINUTES = 2 * 60; // AM 02:00 시작
const CLOCK_MINUTES_PER_SECOND = 1;

const INITIAL_FAULTS = 2;
const NEXT_FAULT_DELAY = 3; // 고장을 전부 처리한 뒤 새 고장까지 걸리는 시간(초)

const OK_SECONDS = 1.2;
const SMILE_SECONDS = 1.5;
const PROMOTION_SECONDS = 2.5;

const COLOR_GOOD = '#8dff9d';
const COLOR_ALERT = '#ff8a6a';
const COLOR_INFO = '#f2f2e6';

const viewCanvas = document.getElementById('view');
const viewCtx = viewCanvas.getContext('2d');
viewCtx.imageSmoothingEnabled = false;

const renderer = createRenderer(viewCtx);
const textLayer = createTextLayer(document.getElementById('hud-text'));

const state = {
  player: { ...PLAYER_START, walked: 0 },
  progress: createProgress(),
  clockMinutes: CLOCK_START_MINUTES,
  time: 0,
  nextFaultTimer: 0,
  lastRepaired: null,
  repairPrompt: false,
  effects: {
    message: '',
    messageColor: COLOR_INFO,
    messageTimer: 0,
    okTimer: 0,
    smileTimer: 0,
    promotionTimer: 0,
    promotionRank: '',
  },
};

// ----- 입력 -----

const input = { forward: false, back: false, left: false, right: false };

const KEY_BINDINGS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

window.addEventListener('keydown', (e) => {
  const action = KEY_BINDINGS[e.code];
  if (action) {
    input[action] = true;
    e.preventDefault();
  } else if (e.code === 'KeyE' || e.code === 'Space') {
    if (!e.repeat) tryRepair();
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  const action = KEY_BINDINGS[e.code];
  if (action) input[action] = false;
});

// 창이 포커스를 잃으면 keyup을 받지 못해 키가 눌린 채로 남는 것을 막는다
window.addEventListener('blur', () => {
  for (const key of Object.keys(input)) input[key] = false;
});

for (const button of document.querySelectorAll('#touch [data-key]')) {
  const action = button.dataset.key;
  const release = () => {
    input[action] = false;
    button.classList.remove('active');
  };
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input[action] = true;
    button.classList.add('active');
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
}

const repairButton = document.getElementById('repair-btn');
repairButton.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  repairButton.classList.add('active');
  tryRepair();
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  repairButton.addEventListener(type, () => repairButton.classList.remove('active'));
}

// 길게 눌렀을 때 뜨는 메뉴가 조작을 끊지 않게 한다
document.getElementById('touch').addEventListener('contextmenu', (e) => e.preventDefault());

// ----- 알림 -----

function showMessage(text, color = COLOR_INFO, seconds = 2.5) {
  const { effects } = state;
  effects.message = text;
  effects.messageColor = color;
  effects.messageTimer = seconds;
}

// ----- 수리 -----

// 바라보는 방향 수리 거리 안에 있는 분전반을 찾는다
function panelInSight() {
  const { player } = state;
  const hit = castRay(player.x, player.y, Math.cos(player.angle), Math.sin(player.angle));
  if (hit.tile !== TILE.PANEL || hit.dist > REPAIR_RANGE) return null;
  return panelAt(hit.cellX, hit.cellY);
}

function tryRepair() {
  const panel = panelInSight();
  if (!panel) {
    showMessage('수리할 대상이 없습니다');
    return;
  }
  if (panel.state !== PANEL_STATE.FAULT) {
    showMessage('이상 없음');
    return;
  }

  const { progress, effects } = state;
  const promotions = completeRepair(progress, panel.faultType);
  panel.state = PANEL_STATE.FIXED;
  panel.faultType = null;
  state.lastRepaired = panel;

  effects.okTimer = OK_SECONDS;
  effects.smileTimer = SMILE_SECONDS;
  showMessage('누전 수리 완료', COLOR_GOOD);

  if (promotions.length > 0) {
    effects.promotionRank = promotions[promotions.length - 1];
    effects.promotionTimer = PROMOTION_SECONDS;
    effects.smileTimer = PROMOTION_SECONDS;
  }

  if (countFaults() === 0) state.nextFaultTimer = NEXT_FAULT_DELAY;
}

// ----- 플레이어 이동 -----

function isBlocked(x, y) {
  const r = PLAYER_RADIUS;
  return (
    !isWalkable(Math.floor(x - r), Math.floor(y - r)) ||
    !isWalkable(Math.floor(x + r), Math.floor(y - r)) ||
    !isWalkable(Math.floor(x - r), Math.floor(y + r)) ||
    !isWalkable(Math.floor(x + r), Math.floor(y + r))
  );
}

function updatePlayer(dt) {
  const { player, progress } = state;

  const turn = Number(input.right) - Number(input.left);
  player.angle += turn * TURN_SPEED * dt;

  const move = Number(input.forward) - Number(input.back);
  if (move === 0) return;

  const stepX = Math.cos(player.angle) * move * MOVE_SPEED * dt;
  const stepY = Math.sin(player.angle) * move * MOVE_SPEED * dt;
  const startX = player.x;
  const startY = player.y;

  // 축별로 따로 검사해서 벽을 따라 미끄러지게 한다
  if (!isBlocked(player.x + stepX, player.y)) player.x += stepX;
  if (!isBlocked(player.x, player.y + stepY)) player.y += stepY;

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

  updatePlayer(dt);

  if (state.nextFaultTimer > 0) {
    state.nextFaultTimer -= dt;
    if (state.nextFaultTimer <= 0) {
      spawnFault(state.lastRepaired);
      showMessage('새 고장 발생! 미니맵을 확인하세요', COLOR_ALERT);
    }
  }

  const panel = panelInSight();
  state.repairPrompt = panel !== null && panel.state === PANEL_STATE.FAULT;
}

function draw() {
  renderer.drawWorld(state.player, state.time);
  drawHudGraphics(viewCtx, state);
  drawHudText(textLayer, state);
}

let lastFrame = performance.now();

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

for (let i = 0; i < INITIAL_FAULTS; i++) spawnFault();
showMessage('당직 시작. 고장난 분전반을 수리하세요', COLOR_ALERT, 4);

document.fonts.load(`11px "${HUD_FONT}"`, '처리');
requestAnimationFrame(frame);
