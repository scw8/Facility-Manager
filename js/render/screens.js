// 게임을 멈추고 띄우는 안내 화면 (업무일지, 휴무일 등).
// screen = { title, subtitle, lines: [{ text, color }], action }

import { SCREEN_W, SCREEN_H } from './renderer.js';

const PANEL = { x: 40, y: 22, w: SCREEN_W - 80, h: SCREEN_H - 44 };
const LINE_HEIGHT = 13;
const KEY_HINT = window.matchMedia('(pointer: coarse)').matches ? '[사용]' : '[E]';

export function drawScreenGraphics(ctx) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  const { x, y, w, h } = PANEL;
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#d8d2b8'; // 누런 업무일지 종이
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#b9b298';
  ctx.fillRect(x, y + 30, w, 1); // 제목 아래 줄
  for (let ly = y + 30 + LINE_HEIGHT; ly < y + h - 24; ly += LINE_HEIGHT) {
    ctx.fillStyle = '#cbc4a8';
    ctx.fillRect(x + 8, ly + 1, w - 16, 1); // 공책 줄
  }
}

export function drawScreenText(layer, screen) {
  const { x, y, w, h } = PANEL;
  const ink = '#2a2a2a';
  const plain = { color: ink, outline: false };

  layer.text(screen.title, x + w / 2, y + 6, { ...plain, align: 'center' });
  if (screen.subtitle) {
    layer.text(screen.subtitle, x + w / 2, y + 18, { ...plain, align: 'center', size: 6, color: '#5a5648' });
  }

  screen.lines.forEach((line, i) => {
    layer.text(line.text, x + 12, y + 35 + i * LINE_HEIGHT, { ...plain, color: line.color || ink });
  });

  layer.text(`${KEY_HINT} ${screen.action}`, x + w / 2, y + h - 16, {
    ...plain,
    align: 'center',
    color: '#8a3a12',
  });
}
