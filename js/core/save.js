// 진행 상황 저장/불러오기. 지금은 브라우저 localStorage에 저장한다.
// 나중에 서버 저장으로 바꿀 때는 이 파일의 readRaw/writeRaw만 바꾸면 된다.

const SAVE_KEY = 'facility-manager/save';
const SAVE_VERSION = 7; // 저장 형식이 바뀌면 올린다. 옛 형식은 버리고 새로 시작한다.

// 저장 공간이 막힌 환경(사생활 보호 모드 등)에서도 게임은 계속 돌아가야 한다
function readRaw() {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(text) {
  try {
    localStorage.setItem(SAVE_KEY, text);
  } catch {
    // 저장 실패는 무시한다
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 무시
  }
}

// 게임 상태 → 저장용 데이터. 맵 오브젝트는 바뀌는 값(분전반 상태)만 담는다.
function snapshot(state, world) {
  const panels = {};
  for (const map of world.maps.values()) {
    for (const [key, obj] of map.objects) {
      if (obj.type === 'panel') {
        panels[`${map.id}:${key}`] = [obj.state, obj.faultType, obj.faultSince, obj.lastPenalty];
      }
    }
  }
  const { x, y, angle } = state.player;
  return {
    version: SAVE_VERSION,
    mapId: state.mapId,
    player: { x, y, angle, walked: state.player.walked },
    progress: state.progress,
    stats: state.stats,
    life: state.life,
    phase: state.phase,
    morning: state.morning,
    offday: state.offday,
    inspection: state.inspection,
    bag: state.bag,
    money: state.money,
    owned: state.owned,
    storage: state.storage,
    screenReturn: state.screenReturn,
    introPage: state.introPage,
    tip: state.tip,
    tipsSeen: state.tipsSeen,
    tipQueue: state.tipQueue,
    inspecting: state.inspecting,
    menuIndex: state.menuIndex,
    clock: { day: state.clock.day, minutes: state.clock.minutes },
    shift: state.shift,
    screen: state.screen,
    nextFaultTimer: state.nextFaultTimer,
    panels,
  };
}

export function saveGame(state, world) {
  writeRaw(JSON.stringify(snapshot(state, world)));
}

// 저장 데이터를 게임 상태에 덮어쓴다. 쓸 수 없는 데이터면 false.
export function loadGame(state, world) {
  const raw = readRaw();
  if (!raw) return false;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }
  if (data?.version !== SAVE_VERSION || !world.maps.has(data.mapId)) return false;

  state.mapId = data.mapId;
  Object.assign(state.player, data.player);
  Object.assign(state.progress, data.progress);
  Object.assign(state.stats, data.stats);
  Object.assign(state.life, data.life);
  state.phase = data.phase;
  state.morning = data.morning;
  state.offday = data.offday;
  state.inspection = data.inspection ?? null;
  state.bag = data.bag;
  state.money = data.money;
  state.owned = data.owned;
  state.storage = data.storage ?? null;
  state.screenReturn = data.screenReturn ?? null;
  state.introPage = data.introPage ?? 0;
  state.tip = data.tip ?? null;
  state.tipsSeen = data.tipsSeen ?? [];
  state.tipQueue = data.tipQueue ?? [];
  state.inspecting = data.inspecting ?? null;
  state.menuIndex = data.menuIndex ?? 0;
  Object.assign(state.clock, data.clock);
  Object.assign(state.shift, data.shift);
  state.screen = data.screen ?? null;
  state.nextFaultTimer = data.nextFaultTimer;

  for (const [fullKey, [panelState, faultType, since, penalty]] of Object.entries(data.panels || {})) {
    const [mapId, key] = fullKey.split(':');
    const obj = world.maps.get(mapId)?.objects.get(key);
    if (obj?.type === 'panel') {
      obj.state = panelState;
      obj.faultType = faultType;
      obj.faultSince = since ?? 0;
      obj.lastPenalty = penalty ?? 0;
    }
  }
  return true;
}
