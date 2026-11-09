// 아이템 아이콘 (12×12 도트). 아이템 슬롯과 손에 든 모습에 함께 쓴다.

const ICONS = {
  tester: (r) => {
    r('#d9a81e', 3, 0, 6, 12);
    r('#10201a', 4, 1, 4, 3);
    r('#7fe0a0', 5, 2, 2, 1);
    r('#58585c', 5, 6, 2, 2);
    r('#c8261e', 4, 10, 1, 1);
  },
  driver: (r) => {
    r('#f0c020', 1, 5, 4, 2);
    r('#2050c0', 1, 5, 2, 2);
    r('#c8ccd4', 5, 5, 6, 1);
    r('#c8ccd4', 10, 5, 1, 2);
  },
  gloves: (r) => {
    r('#f08020', 3, 4, 6, 7);
    r('#f08020', 3, 1, 1, 4);
    r('#f08020', 5, 0, 1, 4);
    r('#f08020', 7, 1, 1, 4);
    r('#f08020', 9, 5, 2, 2);
  },
  monkey: (r) => {
    r('#a8acb4', 5, 3, 2, 9);
    r('#a8acb4', 3, 0, 6, 3);
    r('#40444a', 5, 0, 2, 2);
  },
  pipewrench: (r) => {
    r('#c02820', 5, 4, 2, 8);
    r('#80848c', 3, 0, 6, 4);
    r('#40444a', 4, 2, 4, 1);
  },
  flashlight: (r) => {
    r('#e0c030', 4, 3, 4, 9);
    r('#c0c4cc', 3, 1, 6, 3);
    r('#fffbd0', 4, 0, 4, 1);
  },
  ladder: (r) => {
    r('#c8ccd4', 2, 0, 1, 12);
    r('#c8ccd4', 9, 0, 1, 12);
    for (let y = 1; y < 12; y += 3) r('#c8ccd4', 2, y, 8, 1);
  },
  teflon: (r) => {
    r('#f4f4f0', 2, 2, 8, 8);
    r('#606060', 4, 4, 4, 4);
  },
  insultape: (r) => {
    r('#9aa0a8', 2, 2, 8, 8);
    r('#303438', 4, 4, 4, 4);
    r('#c8ccd4', 2, 2, 8, 1);
  },
  nails: (r) => {
    for (const x of [2, 5, 8]) {
      r('#a8acb4', x, 3, 1, 7);
      r('#a8acb4', x - 1, 3, 3, 1);
    }
  },
  pipe: (r) => {
    r('#9aa0a8', 0, 4, 12, 4);
    r('#c8ccd4', 0, 4, 12, 1);
    r('#70747c', 0, 7, 12, 1);
  },
  prv: (r) => {
    r('#c8a040', 0, 5, 12, 3);
    r('#d8b050', 4, 2, 4, 8);
    r('#a03020', 5, 0, 2, 2);
  },
  lamp: (r) => {
    r('#f4f4ec', 0, 5, 12, 2);
    r('#90949c', 0, 4, 1, 4);
    r('#90949c', 11, 4, 1, 4);
  },
  ballast: (r) => {
    r('#383c40', 1, 4, 10, 4);
    r('#c8ccd4', 2, 5, 3, 1);
    r('#e04030', 9, 3, 1, 1);
  },
  actuator: (r) => {
    r('#e8e8e4', 3, 2, 6, 8);
    r('#3060c0', 3, 2, 6, 2);
    r('#40444a', 5, 10, 2, 2);
  },
  detHeat: (r) => detector(r, '#d03020'),
  detRate: (r) => detector(r, '#f09020'),
  detSmoke: (r) => detector(r, '#3070d0'),
};

// 화재감지기: 흰 원반 + 종류별 색 표시
function detector(r, mark) {
  r('#f0f0ec', 2, 3, 8, 6);
  r('#f0f0ec', 3, 2, 6, 8);
  r('#b0b4b8', 2, 8, 8, 1);
  r(mark, 5, 5, 2, 2);
}

// (x, y)에 scale배로 아이콘을 그린다
export function drawIcon(ctx, id, x, y, scale = 1) {
  const paint = ICONS[id];
  if (!paint) return;
  paint((color, px, py, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + px * scale, y + py * scale, w * scale, h * scale);
  });
}
