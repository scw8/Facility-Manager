// 오버레이 HUD: 직급, 얼굴, 피로도, 경험치, 처리 건수, 시계, 알림, 멀티미터.
// 그림은 저해상도 화면(view)에, 글자는 고해상도 층(hud-text)에 그린다.
// 두 층 모두 좌표는 320×200 기준이다.

import { RANKS, expPercent, isTopRank, promotionStatus } from '../systems/progress.js';
import { transitionAlpha } from '../core/transition.js';
import { formatTime, formatDate, isBetween, isSkipping } from '../core/clock.js';
import { LIMITS } from '../systems/stats.js';
import { workProgress } from '../systems/work.js';
import { capacity, heldItem, itemName } from '../systems/inventory.js';
import { drawIcon } from './icons.js';
import { SCREEN_W, SCREEN_H } from './renderer.js';
import { drawMinimap, minimapRect } from './minimap.js';

export const HUD_FONT = 'Galmuri11';
const HUD_FONT_GRID = 5.5; // Galmuri11(11px 격자)이 깔끔하게 보이는 크기 단위
const HUD_FONT_SIZE = 8; // 320×200 기준 글자 크기
const HUD_FONT_SIZE_SMALL = 6; // 좌측 하단 캐릭터 상태 묶음용
const HUD_MARGIN = 4;
export const PROMOTION_SECONDS = 2.5;

export const COLOR = { GOOD: '#8dff9d', ALERT: '#ff8a6a', INFO: '#f2f2e6' };

// 캐릭터 상태 묶음. 하단 중앙의 아이템칸 자리를 비워 두려고 x=62 안쪽에 맞춘다.
const FACE_SIZE = 20;
const FACE_X = HUD_MARGIN;
const FACE_Y = 167;
const RANK_Y = 155;
const GAUGE_LABEL_X = FACE_X + FACE_SIZE + 3;
const GAUGE_BAR = { x: GAUGE_LABEL_X + 22, w: 22, h: 3 };
const GAUGE_TOP = 164;
const GAUGE_STEP = 7;
const EXP_BAR = { x: HUD_MARGIN, y: 194, w: 30, h: 3 };
const WORK_BAR = { x: SCREEN_W / 2 - 40, y: 130, w: 80, h: 5 };

// 상태 게이지 4종. danger(값)가 참이면 위험 표시(빨간 글씨)
const GAUGES = [
  { key: 'fatigue', label: '피로도', color: '#ff9a5c', danger: (v) => v >= LIMITS.tired },
  { key: 'satiety', label: '포만감', color: '#f2c94c', danger: (v) => v <= LIMITS.hungry },
  { key: 'hygiene', label: '위생', color: '#6fd3ff', danger: (v) => v <= LIMITS.dirty },
  { key: 'stress', label: '스트레스', color: '#c78bff', danger: (v) => v >= LIMITS.stressed },
];

const OUTLINE_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

// ----- 글자 층 -----

export function createTextLayer(canvas, viewCanvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;

  // CSS를 받지 못해도 글자가 게임 화면 위에 겹치도록 배치를 직접 지정한다
  canvas.parentElement.style.position = 'relative';
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';

  // 크기 기준은 게임 화면이다. 글자 층 자신을 재면 해상도를 바꿀 때마다
  // 표시 크기도 커지는 상황에서 무한히 커질 수 있다.
  function resize() {
    const rect = viewCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    scale = canvas.width / SCREEN_W;
  }

  new ResizeObserver(resize).observe(viewCanvas);
  resize();

  // 폰트 크기를 격자 배수로 맞춰 도트 글꼴이 번지지 않게 한다
  function fontPixels(size) {
    return Math.max(2, Math.round((size * scale) / HUD_FONT_GRID)) * HUD_FONT_GRID;
  }

  return {
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },

    // 배경 없이 화면 위에 직접 쓰는 검은 외곽선 글씨 (outline: false면 외곽선 없이)
    text(str, x, y, { color = '#f2f2e6', size = HUD_FONT_SIZE, align = 'left', alpha = 1, outline = true } = {}) {
      const px = fontPixels(size);
      const unit = Math.max(1, Math.round(px / 11)); // 외곽선 한 칸의 실제 픽셀 수
      const drawX = Math.round(x * scale);
      const drawY = Math.round(y * scale);

      ctx.globalAlpha = alpha;
      ctx.font = `${px}px "${HUD_FONT}", ui-monospace, Menlo, monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = 'top';
      if (outline) {
        ctx.fillStyle = '#000';
        for (const [ox, oy] of OUTLINE_OFFSETS) {
          ctx.fillText(str, drawX + ox * unit, drawY + oy * unit);
        }
      }
      ctx.fillStyle = color;
      ctx.fillText(str, drawX, drawY);
      ctx.globalAlpha = 1;
    },
  };
}

// ----- 얼굴 -----

// 노란 안전모, 보라색 다크서클, 갈색 수염의 피곤한 당직자 (18×18, 검은 배경 위)
const FACE_COLORS = {
  Y: '#e2c248', // 안전모
  S: '#d1a36f', // 피부
  W: '#ffffff', // 흰자
  K: '#111111', // 눈동자
  P: '#755c87', // 다크서클
  N: '#b88c62', // 코
  M: '#4e1714', // 입
  B: '#835c40', // 수염
};

const FACE_TOP = [
  '..YYYYYYYYYYYYYY..',
  '..YYYYYYYYYYYYYY..',
  '..YYYYYYYYYYYYYY..',
  '..YYYYYYYYYYYYYY..',
  'YYYYYYYYYYYYYYYYYY',
  '...SSSSSSSSSSSS...',
  '...SSSSSSSSSSSS...',
  '...SSSSSSSSSSSS...',
  '...SSWWWSSWWWSS...',
  '...SSWKKSSWKKSS...',
  '...SSPPPSSPPPSS...',
  '...SSSSSNNSSSSS...',
  '...SSSSSNNSSSSS...',
];
const FACE_MOUTH_TIRED = [
  '...SSSSSSSSSSSS...',
  '...SSSMMMMMMSSS...',
];
const FACE_MOUTH_SMILE = [
  '...SSSMSSSSMSSS...',
  '...SSSSMMMMSSSS...',
];
const FACE_BEARD = [
  '...BBBBBBBBBBBB...',
  '...BBBBBBBBBBBB...',
  '...BBBBBBBBBBBB...',
];

function drawFace(ctx, x, y, smiling) {
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, FACE_SIZE, FACE_SIZE);

  const mouth = smiling ? FACE_MOUTH_SMILE : FACE_MOUTH_TIRED;
  [...FACE_TOP, ...mouth, ...FACE_BEARD].forEach((row, j) => {
    [...row].forEach((cell, i) => {
      if (cell === '.') return;
      ctx.fillStyle = FACE_COLORS[cell];
      ctx.fillRect(x + 1 + i, y + 1 + j, 1, 1);
    });
  });
}

// ----- 멀티미터 -----

// LCD용 3×5 글자
const LCD_GLYPHS = {
  2: ['###', '..#', '###', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  K: ['#.#', '##.', '#..', '##.', '#.#'],
};

function drawLcdText(ctx, str, centerX, y, color) {
  const pixel = 2;
  const width = str.length * 4 * pixel - pixel;
  let cursor = Math.round(centerX - width / 2);
  ctx.fillStyle = color;
  for (const ch of str) {
    LCD_GLYPHS[ch].forEach((row, j) => {
      [...row].forEach((cell, i) => {
        if (cell === '#') ctx.fillRect(cursor + i * pixel, y + j * pixel, pixel, pixel);
      });
    });
    cursor += 4 * pixel;
  }
}

function drawMultimeter(ctx, bob, showOk, lift) {
  const w = 52;
  const x = Math.round(SCREEN_W / 2 - w / 2 + Math.sin(bob) * 3);
  const y = Math.round(132 - Math.abs(Math.cos(bob)) * 3 - lift);
  const h = SCREEN_H - y + 4;
  const rect = (color, rx, ry, rw, rh) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + rx, y + ry, rw, rh);
  };

  rect('#000', -1, -1, w + 2, h + 2);
  rect('#d9a81e', 0, 0, w, h); // 노란 본체
  rect('#f4cf4a', 0, 0, w, 2);
  rect('#8f6d0f', w - 2, 0, 2, h);
  rect('#2b2b2d', 4, 3, w - 8, h); // 검은 전면판

  rect('#7c8a6e', 7, 5, w - 14, 18); // LCD 테두리
  rect('#10201a', 9, 7, w - 18, 14);
  drawLcdText(ctx, showOk ? 'OK' : '220V', x + w / 2, y + 9, showOk ? '#6dff8e' : '#7fe0a0');

  // 다이얼
  rect('#111', 17, 27, 18, 18);
  rect('#58585c', 19, 29, 14, 14);
  rect('#8a8a90', 21, 31, 10, 10);
  rect('#e8e8e8', 25, 29, 2, 7);

  // 측정 단자
  rect('#c8261e', 7, 38, 5, 5);
  rect('#111', 40, 38, 5, 5);

  // 양손으로 옆을 쥔다
  drawFist(ctx, x - 14, y + 22, true);
  drawFist(ctx, x + w - 6, y + 22, false);
}

// ----- 손에 든 아이템 -----

// 오른손 주먹 (손등이 보이고, 위쪽은 너클, 왼쪽에서 엄지가 손잡이를 감싼다). 20×16 + 소매
const FIST = [
  '....KKKKKKKKKKKK....',
  '...KHHSKHHSKHHSKK...',
  '..KHSSMKSSMKSSMKSK..',
  '..KSSSMKSSMKSSMKSMK.',
  '.KSSSSSSSSSSSSSSSMK.',
  '.KHSSSSSSSSSSSSSSMMK',
  'KNHSSSSSSSSSSSSSSMMK',
  'KSSSSSSSSSSSSSSSMMMK',
  'KSSMSSSSSSSSSSSSMMDK',
  '.KSMMSSSSSSSSSSMMMDK',
  '.KKMMSSSSSSSSSSMMDK.',
  '..KSSMSSSSSSSSMMDDK.',
  '..KSSSSSSSSSSSMMDK..',
  '...KSSSSSSSSSMMDDK..',
  '...KSSSSSSSSSMMDK...',
  '...KMSSSSSSSSMMDK...',
];
const FIST_COLORS = {
  K: '#2a1a12', // 윤곽
  H: '#e2b08a', // 밝은 살
  S: '#c99468', // 살
  M: '#a8764e', // 그늘
  D: '#7e5436', // 짙은 그늘
  N: '#efd2bc', // 손톱
};

// 주먹과 그 아래 작업복 소매를 그린다. mirror면 왼손
function drawFist(ctx, x, y, mirror = false) {
  const width = FIST[0].length;
  FIST.forEach((row, j) => {
    [...row].forEach((cell, i) => {
      if (cell === '.') return;
      ctx.fillStyle = FIST_COLORS[cell];
      ctx.fillRect(x + (mirror ? width - 1 - i : i), y + j, 1, 1);
    });
  });
  // 소매: 남색 작업복 + 반사띠
  const top = y + FIST.length;
  const sx = x + 1;
  const sw = width - 2;
  ctx.fillStyle = '#121826';
  ctx.fillRect(sx - 1, top, sw + 2, SCREEN_H - top);
  ctx.fillStyle = '#2c3a58';
  ctx.fillRect(sx, top, sw, SCREEN_H - top);
  ctx.fillStyle = '#1e2840';
  ctx.fillRect(mirror ? sx : sx + sw - 4, top, 4, SCREEN_H - top);
  ctx.fillStyle = '#5a6a88';
  ctx.fillRect(sx, top, sw, 2); // 소맷부리
  ctx.fillStyle = '#c8ccd0';
  ctx.fillRect(sx, top + 4, sw, 2); // 반사띠
}

// 한 손으로 든 아이템: 아이콘을 3배로 그리고 아래쪽 손잡이를 주먹이 감싼다
function drawHeldItem(ctx, id, bob, lift) {
  const x = Math.round(SCREEN_W / 2 + 6 + Math.sin(bob) * 3);
  const y = Math.round(112 - Math.abs(Math.cos(bob)) * 3 - lift);
  drawIcon(ctx, id, x, y, 3);
  drawFist(ctx, x + 4, y + 26);
}

// 손과 든 물건을 따로 그린 뒤, 화면 속 조명처럼 어둡게 하고 거친 질감을 입혀
// 배경 텍스처와 화질이 따로 놀지 않게 한다.
const VIEW_MODEL = { x: 80, y: 100, w: 160, h: SCREEN_H - 100 };
const viewModelCanvas = document.createElement('canvas');
viewModelCanvas.width = VIEW_MODEL.w;
viewModelCanvas.height = VIEW_MODEL.h;
const viewModelCtx = viewModelCanvas.getContext('2d');

function grainAt(x, y) {
  const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  return ((n % 1000) / 1000 - 0.5) * 0.22; // ±11%
}

function drawViewModel(ctx, held, bob, showOk, lift) {
  const vm = viewModelCtx;
  vm.setTransform(1, 0, 0, 1, 0, 0);
  vm.clearRect(0, 0, VIEW_MODEL.w, VIEW_MODEL.h);
  vm.setTransform(1, 0, 0, 1, -VIEW_MODEL.x, -VIEW_MODEL.y);
  if (held === 'tester') drawMultimeter(vm, bob, showOk, lift);
  else drawHeldItem(vm, held, bob, lift);

  const image = vm.getImageData(0, 0, VIEW_MODEL.w, VIEW_MODEL.h);
  const px = image.data;
  for (let j = 0; j < VIEW_MODEL.h; j++) {
    // 아래로 갈수록 화면 밖이라 더 어둡다
    const light = 0.84 - (j / VIEW_MODEL.h) * 0.22;
    for (let i = 0; i < VIEW_MODEL.w; i++) {
      const k = (j * VIEW_MODEL.w + i) * 4;
      if (px[k + 3] === 0) continue;
      const f = light * (1 + grainAt(i, j));
      px[k] *= f;
      px[k + 1] *= f;
      px[k + 2] *= f;
    }
  }
  vm.putImageData(image, 0, 0);
  ctx.drawImage(viewModelCanvas, VIEW_MODEL.x, VIEW_MODEL.y);
}

// ----- 아이템 슬롯 -----

const SLOT = 13;
const SLOT_GAP = 1;
const SLOT_Y = SCREEN_H - SLOT - 2;

// 슬롯 n개의 화면 위치 (터치 입력에서도 쓴다)
export function slotRects(n) {
  const total = n * SLOT + (n - 1) * SLOT_GAP;
  const left = Math.round(SCREEN_W / 2 - total / 2);
  return Array.from({ length: n }, (_, i) => ({ x: left + i * (SLOT + SLOT_GAP), y: SLOT_Y, w: SLOT, h: SLOT }));
}

function drawSlots(ctx, state) {
  const rects = slotRects(capacity(state));
  rects.forEach((r, i) => {
    const selected = i === state.bag.selected;
    ctx.fillStyle = selected ? '#ffe046' : '#000';
    ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    ctx.fillStyle = 'rgba(30, 32, 30, 0.85)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const id = state.bag.items[i];
    if (id) drawIcon(ctx, id, r.x, r.y);
  });
}

// ----- 전체 HUD -----

// 지금이 식사 시간이면 시계 옆에 표시할 이름
function mealLabel(clock) {
  if (isBetween(clock, '12:00', '13:00')) return '점심시간';
  if (isBetween(clock, '18:00', '19:00')) return '저녁시간';
  return null;
}

export function drawHudGraphics(ctx, state, map) {
  const { progress, effects, player, time } = state;

  const held = heldItem(state);
  const lift = effects.okTimer > 0 ? 5 : 0;
  if (held) drawViewModel(ctx, held, player.walked * 3.2, effects.okTimer > 0, lift);
  drawSlots(ctx, state);

  drawFace(ctx, FACE_X, FACE_Y, effects.smileTimer > 0);

  GAUGES.forEach((g, i) => {
    const y = GAUGE_TOP + i * GAUGE_STEP + 2;
    const { x, w, h } = GAUGE_BAR;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = g.color;
    ctx.fillRect(x, y, Math.round((w * state.stats[g.key]) / 100), h);
  });

  // 작업 게이지
  if (state.work) {
    const { x, y, w, h } = WORK_BAR;
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#3a3420';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffe046';
    ctx.fillRect(x, y, Math.round(w * workProgress(state.work)), h);
  }

  const bar = EXP_BAR;
  ctx.fillStyle = '#000';
  ctx.fillRect(bar.x - 1, bar.y - 1, bar.w + 2, bar.h + 2);
  ctx.fillStyle = '#26332b';
  ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  ctx.fillStyle = '#6dd66d';
  ctx.fillRect(bar.x, bar.y, Math.round((bar.w * expPercent(progress)) / 100), bar.h);

  drawMinimap(ctx, map, player, time);

  // 승진 연출: 화면 전체가 금색으로 번쩍였다 사라진다
  if (effects.promotionTimer > 0) {
    const strength = Math.min(1, effects.promotionTimer / PROMOTION_SECONDS);
    ctx.fillStyle = `rgba(255, 214, 70, ${0.34 * strength * strength})`;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }

  // 시간 건너뛰기(휴식) 중에는 화면을 어둡게
  if (isSkipping(state.clock)) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }

  // 맵 전환 중 검은 덮개
  const fade = transitionAlpha(state.transition);
  if (fade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }
}

let lastHeld = null;
let heldNameUntil = 0;

export function drawHudText(layer, state, map) {
  const { progress, effects, clock, prompt, transition } = state;

  layer.clear();

  // 화면이 완전히 어두운 동안에는 이동할 맵 이름만 보여준다
  const fade = transitionAlpha(transition);
  if (fade >= 1) {
    layer.text(transition.label, SCREEN_W / 2, SCREEN_H / 2 - 6, { align: 'center' });
    return;
  }

  const mini = minimapRect(map);
  layer.text(formatTime(clock.minutes), HUD_MARGIN, HUD_MARGIN);
  const meal = mealLabel(clock);
  if (meal) layer.text(meal, HUD_MARGIN + 48, HUD_MARGIN, { color: '#ffd27a' });
  layer.text(formatDate(clock.day), HUD_MARGIN, HUD_MARGIN + 11, { size: HUD_FONT_SIZE_SMALL, color: '#c8d0c8' });
  layer.text(map.name, HUD_MARGIN, HUD_MARGIN + 19, { size: HUD_FONT_SIZE_SMALL, color: '#c8d0c8' });
  if (state.objective) {
    layer.text(`할 일: ${state.objective}`, HUD_MARGIN, HUD_MARGIN + 28, {
      size: HUD_FONT_SIZE_SMALL,
      color: '#ffd27a',
    });
  }

  if (isSkipping(clock)) {
    layer.text(clock.skip.label, SCREEN_W / 2, SCREEN_H / 2 - 6, { align: 'center' });
    return;
  }
  layer.text(`처리 ${progress.repairs}`, mini.x + mini.w, mini.y + mini.h + 2, { align: 'right' });
  if (state.inspection && !state.inspection.done && isBetween(clock, '19:00', '08:00')) {
    const points = Object.values(state.inspection.points);
    const judged = points.filter((p) => p.judged).length;
    layer.text(`검침 ${judged}/${points.length}`, mini.x + mini.w, mini.y + mini.h + 12, {
      align: 'right',
      color: '#ffd27a',
    });
  }

  if (effects.messageTimer > 0) {
    layer.text(effects.message, SCREEN_W / 2, 24, {
      align: 'center',
      color: effects.messageColor,
      alpha: Math.min(1, effects.messageTimer * 2),
    });
  }

  if (effects.promotionTimer > 0) {
    layer.text('승진!', SCREEN_W / 2, 58, { align: 'center', color: '#ffe046', size: 16 });
    layer.text(effects.promotionRank, SCREEN_W / 2, 78, { align: 'center', color: '#ffe046' });
  } else if (state.work) {
    layer.text(`${state.work.label}…`, SCREEN_W / 2, 118, { align: 'center', color: '#ffe046' });
    if (state.work.slowed) {
      layer.text('컨디션이 나빠 작업이 느립니다', SCREEN_W / 2, 138, {
        align: 'center',
        color: '#ff9a5c',
        size: HUD_FONT_SIZE_SMALL,
      });
    }
  } else if (prompt && !transition) {
    layer.text(prompt, SCREEN_W / 2, 118, { align: 'center', color: '#ffe046' });
  }

  // 아이템을 바꾼 직후에만 이름을 잠깐 보여준다
  const held = heldItem(state);
  if (held !== lastHeld) {
    lastHeld = held;
    heldNameUntil = state.time + 1.5;
  }
  if (held && state.time < heldNameUntil) {
    layer.text(itemName(held), SCREEN_W / 2, SCREEN_H - 26, { align: 'center', size: HUD_FONT_SIZE_SMALL });
  }

  // 좌측 하단 캐릭터 상태 묶음
  const small = HUD_FONT_SIZE_SMALL;
  const { stats } = state;
  layer.text(RANKS[progress.rank], HUD_MARGIN, RANK_Y, { color: '#ffe046', size: small });
  layer.text(`평판 ${Math.round(stats.reputation)}`, GAUGE_LABEL_X + 10, RANK_Y, {
    color: stats.reputation <= 20 ? '#ff7a5c' : '#f2f2e6',
    size: small,
  });
  GAUGES.forEach((g, i) => {
    layer.text(g.label, GAUGE_LABEL_X, GAUGE_TOP + i * GAUGE_STEP - 1, {
      color: g.danger(stats[g.key]) ? '#ff5a4a' : '#d8ddd8',
      size: 5,
    });
  });
  const status = promotionStatus(progress);
  let expLabel = 'EXP MAX';
  if (status) {
    expLabel = status.exp >= status.expNeed
      ? `승진 대기 ${status.months}/${status.monthsNeed}개월`
      : `EXP ${expPercent(progress)}%`;
  }
  layer.text(expLabel, EXP_BAR.x + EXP_BAR.w + 3, EXP_BAR.y - 1, { color: '#a8f0a8', size: small });
}
