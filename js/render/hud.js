// 오버레이 HUD: 직급, 얼굴, 피로도, 경험치, 처리 건수, 시계, 알림, 멀티미터.
// 그림은 저해상도 화면(view)에, 글자는 고해상도 층(hud-text)에 그린다.
// 두 층 모두 좌표는 320×200 기준이다.

import { RANKS, expPercent, isTopRank } from '../systems/progress.js';
import { transitionAlpha } from '../core/transition.js';
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
const FACE_Y = 169;
const RANK_Y = 162;
const FATIGUE_X = FACE_X + FACE_SIZE + 3;
const EXP_BAR = { x: HUD_MARGIN, y: 192, w: 30, h: 4 };

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

    // 배경 없이 화면 위에 직접 쓰는 검은 외곽선 글씨
    text(str, x, y, { color = '#f2f2e6', size = HUD_FONT_SIZE, align = 'left', alpha = 1 } = {}) {
      const px = fontPixels(size);
      const unit = Math.max(1, Math.round(px / 11)); // 외곽선 한 칸의 실제 픽셀 수
      const drawX = Math.round(x * scale);
      const drawY = Math.round(y * scale);

      ctx.globalAlpha = alpha;
      ctx.font = `${px}px "${HUD_FONT}", ui-monospace, Menlo, monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#000';
      for (const [ox, oy] of OUTLINE_OFFSETS) {
        ctx.fillText(str, drawX + ox * unit, drawY + oy * unit);
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
  const y = Math.round(150 - Math.abs(Math.cos(bob)) * 3 - lift);
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

  // 쥔 손
  rect('#000', -9, 26, 11, h);
  rect('#c99468', -8, 27, 9, h);
  rect('#000', w - 2, 26, 11, h);
  rect('#c99468', w - 1, 27, 9, h);
}

// ----- 전체 HUD -----

function formatClock(minutes) {
  const total = Math.floor(minutes) % 720;
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `AM ${h}:${m}`;
}

export function drawHudGraphics(ctx, state, map) {
  const { progress, effects, player, time } = state;

  drawMultimeter(ctx, player.walked * 3.2, effects.okTimer > 0, effects.okTimer > 0 ? 5 : 0);

  drawFace(ctx, FACE_X, FACE_Y, effects.smileTimer > 0);

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

  // 맵 전환 중 검은 덮개
  const fade = transitionAlpha(state.transition);
  if (fade > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  }
}

export function drawHudText(layer, state, map) {
  const { progress, effects, clockMinutes, prompt, transition } = state;

  layer.clear();

  // 화면이 완전히 어두운 동안에는 이동할 맵 이름만 보여준다
  const fade = transitionAlpha(transition);
  if (fade >= 1) {
    layer.text(transition.label, SCREEN_W / 2, SCREEN_H / 2 - 6, { align: 'center' });
    return;
  }

  const mini = minimapRect(map);
  layer.text(formatClock(clockMinutes), HUD_MARGIN, HUD_MARGIN);
  layer.text(map.name, HUD_MARGIN, HUD_MARGIN + 10, { size: HUD_FONT_SIZE_SMALL, color: '#c8d0c8' });
  layer.text(`처리 ${progress.repairs}`, mini.x + mini.w, mini.y + mini.h + 2, { align: 'right' });

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
  } else if (prompt && !transition) {
    layer.text(prompt, SCREEN_W / 2, 118, { align: 'center', color: '#ffe046' });
  }

  // 좌측 하단 캐릭터 상태 묶음
  const small = HUD_FONT_SIZE_SMALL;
  layer.text(RANKS[progress.rank], HUD_MARGIN, RANK_Y, { color: '#ffe046', size: small });
  layer.text('피로도', FATIGUE_X, FACE_Y + 2, { size: small });
  layer.text(`${Math.floor(progress.fatigue)}%`, FATIGUE_X, FACE_Y + 10, {
    color: progress.fatigue >= 70 ? '#ff7a5c' : '#f2f2e6',
    size: small,
  });
  const expLabel = isTopRank(progress) ? 'EXP MAX' : `EXP ${expPercent(progress)}%`;
  layer.text(expLabel, EXP_BAR.x + EXP_BAR.w + 3, EXP_BAR.y - 1, { color: '#a8f0a8', size: small });
}
