// 게임을 멈추고 띄우는 안내 화면 (업무일지, 휴무일, 기상 등).
// screen = { title, subtitle, lines: [{ text, color }], options?, selected?, action }
// options가 있으면 선택지 화면이 된다: [{ label, desc }]

import { SCREEN_W, SCREEN_H } from './renderer.js';

const PANEL = { x: 34, y: 18, w: SCREEN_W - 68, h: SCREEN_H - 36 };
const LINE_HEIGHT = 13;
const OPTION_HEIGHT = 12;
const TOUCH = window.matchMedia('(pointer: coarse)').matches;
const KEY_HINT = TOUCH ? '[사용]' : '[E]';
const MENU_HINT = TOUCH ? '▲▼ 고르기 · [사용] 결정' : 'W/S·숫자 고르기 · [E] 결정';
const INK = '#2a2a2a';

export function drawScreenGraphics(ctx, screen) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  const { x, y, w, h } = PANEL;
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#d8d2b8'; // 누런 종이
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#b9b298';
  ctx.fillRect(x, y + 30, w, 1); // 제목 아래 줄

  if (screen.options) {
    // 고른 선택지 띠
    const top = optionsTop(screen) + screen.selected * OPTION_HEIGHT - 2;
    ctx.fillStyle = '#efe6b8';
    ctx.fillRect(x + 6, top, w - 12, OPTION_HEIGHT);
    return;
  }
  for (let ly = y + 30 + LINE_HEIGHT; ly < y + h - 24; ly += LINE_HEIGHT) {
    ctx.fillStyle = '#cbc4a8';
    ctx.fillRect(x + 8, ly + 1, w - 16, 1); // 공책 줄
  }
}

function optionsTop(screen) {
  return PANEL.y + 37 + screen.lines.length * LINE_HEIGHT;
}

export function drawScreenText(layer, screen) {
  const { x, y, w, h } = PANEL;
  const plain = { color: INK, outline: false };

  layer.text(screen.title, x + w / 2, y + 6, { ...plain, align: 'center' });
  if (screen.subtitle) {
    layer.text(screen.subtitle, x + w / 2, y + 18, { ...plain, align: 'center', size: 6, color: '#5a5648' });
  }

  screen.lines.forEach((line, i) => {
    layer.text(line.text, x + 12, y + 35 + i * LINE_HEIGHT, { ...plain, color: line.color || INK });
  });

  if (screen.options) {
    const top = optionsTop(screen);
    screen.options.forEach((option, i) => {
      const selected = i === screen.selected;
      const color = selected ? '#8a3a12' : INK;
      layer.text(`${selected ? '▶' : ' '} ${i + 1}. ${option.label}`, x + 12, top + i * OPTION_HEIGHT, {
        ...plain,
        color,
        size: 7,
      });
      if (option.desc) {
        layer.text(option.desc, x + w - 12, top + i * OPTION_HEIGHT + 1, {
          ...plain,
          align: 'right',
          color: '#5a5648',
          size: 6,
        });
      }
    });
  }

  const hint = screen.options ? MENU_HINT : `${KEY_HINT} ${screen.action}`;
  layer.text(hint, x + w / 2, y + h - 16, { ...plain, align: 'center', color: '#8a3a12', size: screen.options ? 6 : 8 });
}
