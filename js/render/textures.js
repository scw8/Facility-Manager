import { TILE } from '../world/tiles.js';

// 이미지 파일 없이 코드로 만드는 32×32 텍스처.
// 각 텍스처는 Uint32Array(픽셀 하나 = 0xAABBGGRR, ImageData와 같은 배치).

export const TEX_SIZE = 32;

// 새로고침해도 무늬가 같도록 고정 시드 난수를 쓴다.
function makeRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createTexture(paint, wear) {
  const pixels = new Uint32Array(TEX_SIZE * TEX_SIZE);
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= TEX_SIZE || y >= TEX_SIZE) return;
    pixels[y * TEX_SIZE + x] =
      (0xff000000 | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r)) >>> 0;
  };
  const rect = (x, y, w, h, r, g, b) => {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) put(i, j, r, g, b);
    }
  };
  paint(put, rect);
  if (wear) applyWear(pixels, wear);
  return pixels;
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

// ----- 풍화: 때, 녹·벗겨짐 얼룩, 흘러내린 자국, 금, 페인트 조각 -----

function mixPixel(pixels, x, y, color, amount) {
  const i = y * TEX_SIZE + x;
  const c = pixels[i];
  const mix = (v, target) => clamp255(v + (target - v) * amount);
  const r = mix(c & 0xff, color[0]);
  const g = mix((c >> 8) & 0xff, color[1]);
  const b = mix((c >> 16) & 0xff, color[2]);
  pixels[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

// 부드러운 얼룩 노이즈 (0~1). 가장자리를 0.5로 고정해서
// 서로 다른 변형 텍스처가 맞닿아도 경계가 튀지 않는다.
function createBlotchNoise(rnd) {
  const cells = 4;
  const size = TEX_SIZE / cells;
  const grid = [];
  for (let j = 0; j <= cells; j++) {
    for (let i = 0; i <= cells; i++) {
      const isEdge = i === 0 || j === 0 || i === cells || j === cells;
      grid.push(isEdge ? 0.5 : rnd());
    }
  }
  const at = (i, j) => grid[j * (cells + 1) + i];
  return (x, y) => {
    const i = Math.floor(x / size);
    const j = Math.floor(y / size);
    const fx = x / size - i;
    const fy = y / size - j;
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return top + (bottom - top) * fy;
  };
}

function applyWear(pixels, wear) {
  const rnd = makeRandom(wear.seed);
  const grimeNoise = createBlotchNoise(rnd);
  const patchNoise = createBlotchNoise(rnd);
  const randomCoord = () => Math.floor(rnd() * TEX_SIZE);

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      if (wear.patch) {
        // 픽셀마다 흔들어서 얼룩 가장자리가 까슬까슬해 보이게 한다
        const edge = patchNoise(x, y) + (rnd() - 0.5) * 0.1 - wear.patch.threshold;
        if (edge > 0) {
          const strength = Math.min(1, edge / 0.12) * wear.patch.amount;
          mixPixel(pixels, x, y, wear.patch.color, strength);
        }
      }
      mixPixel(pixels, x, y, [0, 0, 0], wear.grime * grimeNoise(x, y));
    }
  }

  // 위에서 아래로 흘러내린 물때·녹물
  if (wear.streaks) {
    for (let n = 0; n < wear.streaks.count; n++) {
      const x = randomCoord();
      const width = rnd() < 0.4 ? 2 : 1;
      const length = 8 + Math.floor(rnd() * 20);
      for (let y = 0; y < length; y++) {
        const strength = wear.streaks.strength * (1 - y / length);
        for (let w = 0; w < width; w++) {
          mixPixel(pixels, (x + w) % TEX_SIZE, y, wear.streaks.color, strength);
        }
      }
    }
  }

  // 금·긁힌 자국
  if (wear.lines) {
    for (let n = 0; n < wear.lines.count; n++) {
      let x = randomCoord();
      let y = randomCoord();
      const length = 7 + Math.floor(rnd() * 10);
      for (let s = 0; s < length; s++) {
        mixPixel(pixels, x, y, wear.lines.color, wear.lines.strength);
        x = (x + (rnd() < 0.6 ? 1 : 0)) % TEX_SIZE;
        y = Math.min(TEX_SIZE - 1, y + (rnd() < 0.7 ? 1 : 0));
      }
    }
  }

  // 떨어져 나간 조각
  if (wear.chips) {
    for (let n = 0; n < wear.chips.count; n++) {
      mixPixel(pixels, randomCoord(), randomCoord(), wear.chips.color, 0.75);
    }
  }
}

const WEAR = {
  concrete: {
    seed: 101,
    grime: 0.26,
    patch: { color: [66, 72, 54], amount: 0.34, threshold: 0.6 },
    streaks: { count: 3, color: [36, 34, 30], strength: 0.42 },
    lines: { count: 1, color: [30, 30, 28], strength: 0.5 },
    chips: { count: 5, color: [168, 164, 150] },
  },
  pipes: {
    seed: 211,
    grime: 0.22,
    patch: { color: [122, 68, 32], amount: 0.55, threshold: 0.6 },
    streaks: { count: 2, color: [98, 56, 28], strength: 0.32 },
    chips: { count: 6, color: [42, 38, 34] },
  },
  panel: {
    seed: 307,
    grime: 0.16,
    patch: { color: [120, 76, 44], amount: 0.5, threshold: 0.66 },
    streaks: { count: 1, color: [84, 62, 44], strength: 0.36 },
    chips: { count: 5, color: [58, 58, 58] },
  },
  door: {
    seed: 409,
    grime: 0.2,
    patch: { color: [78, 46, 28], amount: 0.6, threshold: 0.6 },
    lines: { count: 1, color: [154, 136, 110], strength: 0.25 },
    chips: { count: 5, color: [46, 34, 26] },
  },
  floor: {
    seed: 503,
    grime: 0.2,
    patch: { color: [94, 100, 86], amount: 0.46, threshold: 0.6 }, // 에폭시가 닳은 자리
    lines: { count: 2, color: [122, 134, 116], strength: 0.3 },
    chips: { count: 6, color: [26, 34, 28] },
  },
  ceiling: {
    seed: 601,
    grime: 0.26,
    patch: { color: [82, 64, 40], amount: 0.5, threshold: 0.6 }, // 누수 얼룩
    chips: { count: 4, color: [22, 22, 22] },
  },
  lamp: { seed: 701, grime: 0.12 },
  wallpaper: {
    seed: 1201,
    grime: 0.1,
    patch: { color: [180, 160, 120], amount: 0.25, threshold: 0.66 }, // 누렇게 바랜 자리
  },
  wood: {
    seed: 1301,
    grime: 0.12,
    lines: { count: 1, color: [70, 44, 24], strength: 0.25 },
  },
  counter: {
    seed: 809,
    grime: 0.12,
    streaks: { count: 1, color: [70, 70, 66], strength: 0.25 },
  },
  bed: {
    seed: 907,
    grime: 0.18,
    patch: { color: [90, 84, 70], amount: 0.3, threshold: 0.66 },
  },
  table: {
    seed: 1103,
    grime: 0.12,
    patch: { color: [120, 100, 70], amount: 0.3, threshold: 0.66 },
  },
  shower: {
    seed: 1009,
    grime: 0.16,
    patch: { color: [150, 140, 96], amount: 0.35, threshold: 0.62 }, // 물때
    streaks: { count: 2, color: [120, 110, 80], strength: 0.25 },
  },
};

// 회색 블록 + 줄눈
function paintConcrete(put) {
  const rnd = makeRandom(11);
  for (let y = 0; y < TEX_SIZE; y++) {
    const row = Math.floor(y / 8);
    const offset = row % 2 === 0 ? 0 : 8;
    for (let x = 0; x < TEX_SIZE; x++) {
      const isJoint = y % 8 === 7 || (x + offset) % 16 === 15;
      const v = isJoint ? 62 : 118 + rnd() * 18;
      put(x, y, v, v, v - 4);
    }
  }
}

// 노란 가스배관, 파란 급수배관, 플랜지
function paintPipes(put, rect) {
  const rnd = makeRandom(23);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const v = 52 + rnd() * 10;
      put(x, y, v, v, v + 4);
    }
  }
  const pipe = (top, height, r, g, b) => {
    for (let j = 0; j < height; j++) {
      // 위쪽은 밝고 아래쪽은 어둡게 해서 둥근 관처럼 보이게 한다
      const shade = 1.25 - (j / (height - 1)) * 0.75;
      rect(0, top + j, TEX_SIZE, 1, r * shade, g * shade, b * shade);
    }
    rect(0, top + height, TEX_SIZE, 1, 26, 26, 28); // 벽에 지는 그림자
  };
  const flange = (x, top, height) => {
    for (let j = -1; j < height + 1; j++) {
      const shade = 1.25 - ((j + 1) / (height + 1)) * 0.75;
      rect(x, top + j, 3, 1, 150 * shade, 150 * shade, 155 * shade);
    }
  };
  pipe(6, 7, 214, 172, 36);
  pipe(20, 6, 52, 108, 196);
  flange(9, 6, 7);
  flange(24, 20, 6);
}

// 회색 함체 + 경고 삼각 스티커 + 손잡이 + 상태 표시등
function paintPanel(put, rect, lamp, tint) {
  const rnd = makeRandom(37);
  rect(0, 0, TEX_SIZE, TEX_SIZE, 72, 74, 76);
  for (let y = 2; y < 30; y++) {
    for (let x = 3; x < 29; x++) {
      const v = 138 + rnd() * 8;
      put(x, y, v + tint[0], v + tint[1], v + tint[2]);
    }
  }
  rect(3, 2, 26, 1, 176 + tint[0], 176 + tint[1], 178 + tint[2]);
  rect(3, 29, 26, 1, 88, 88, 90);
  rect(15, 2, 1, 28, 96, 96, 98); // 양문 가운데 틈

  // 경고 삼각형
  for (let j = 0; j < 9; j++) {
    const half = Math.floor(j * 0.75);
    rect(8 - half, 7 + j, half * 2 + 1, 1, 236, 190, 30);
  }
  rect(8, 10, 1, 3, 20, 20, 20);
  rect(8, 14, 1, 1, 20, 20, 20);

  // 손잡이
  rect(21, 14, 2, 7, 40, 40, 42);

  // 표시등
  rect(22, 5, 4, 4, 30, 30, 30);
  rect(23, 6, 2, 2, lamp[0], lamp[1], lamp[2]);
}

// 갈색 철문 + 유리창 + 녹색 비상구등
function paintDoor(put, rect) {
  const rnd = makeRandom(41);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const v = rnd() * 8;
      put(x, y, 112 + v, 74 + v, 44 + v);
    }
  }
  rect(0, 0, 3, TEX_SIZE, 58, 40, 26);
  rect(29, 0, 3, TEX_SIZE, 58, 40, 26);
  rect(11, 9, 10, 8, 30, 44, 50); // 유리창
  rect(12, 10, 3, 2, 120, 160, 170); // 유리 반사광
  rect(10, 8, 12, 1, 58, 40, 26);
  rect(10, 17, 12, 1, 58, 40, 26);
  rect(24, 18, 3, 3, 196, 186, 120); // 손잡이
  rect(8, 1, 16, 5, 28, 190, 88); // 비상구등
  rect(10, 3, 12, 1, 214, 255, 226);
}

// 초록 에폭시 체크무늬
function paintFloor(put) {
  const rnd = makeRandom(53);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const checker = (x < 16) === (y < 16);
      const v = rnd() * 6;
      if (checker) put(x, y, 44 + v, 104 + v, 70 + v);
      else put(x, y, 34 + v, 84 + v, 56 + v);
    }
  }
}

// 어두운 천장
function paintCeiling(put) {
  const rnd = makeRandom(61);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const v = x % 16 === 0 || y % 16 === 0 ? 34 : 50 + rnd() * 6;
      put(x, y, v, v, v + 2);
    }
  }
}

function paintLamp(put, rect, tube) {
  paintCeiling(put);
  rect(4, 12, 24, 8, 88, 88, 90);
  rect(5, 14, 22, 4, tube[0], tube[1], tube[2]);
}

// 스테인리스 배식대 + 유리 가림막 + 반찬통 + 위쪽 메뉴판
function paintCounter(put, rect) {
  const rnd = makeRandom(71);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const v = 96 + rnd() * 6;
      put(x, y, v + 10, v + 6, v - 4); // 연한 노란 벽
    }
  }
  rect(3, 2, 26, 7, 30, 44, 34); // 메뉴판
  rect(5, 4, 9, 1, 214, 220, 200);
  rect(5, 6, 14, 1, 170, 180, 160);
  rect(0, 14, TEX_SIZE, 2, 150, 176, 180); // 유리 가림막
  rect(0, 16, TEX_SIZE, 2, 196, 198, 196); // 배식대 상판
  const trays = [[214, 92, 40], [236, 220, 120], [80, 150, 60], [240, 240, 230]];
  trays.forEach(([r, g, b], i) => {
    rect(2 + i * 8, 18, 6, 3, 120, 122, 124);
    rect(3 + i * 8, 18, 4, 2, r, g, b); // 반찬
  });
  for (let y = 21; y < TEX_SIZE; y++) {
    const v = 150 - (y - 21) * 3;
    rect(0, y, TEX_SIZE, 1, v, v + 2, v + 6); // 스테인리스 하부장
  }
  rect(15, 22, 1, 10, 96, 98, 102);
}

// 2층 침상: 파란 매트리스, 흰 베개, 회색 담요
function paintBed(put, rect) {
  const rnd = makeRandom(83);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const v = 70 + rnd() * 6;
      put(x, y, v + 6, v + 4, v); // 어두운 벽지
    }
  }
  const bunk = (top) => {
    rect(1, top, 30, 2, 60, 62, 70); // 철제 프레임
    rect(2, top - 4, 28, 4, 46, 74, 140); // 매트리스
    rect(3, top - 6, 7, 3, 222, 222, 214); // 베개
    rect(12, top - 5, 17, 2, 120, 118, 112); // 담요
  };
  bunk(13);
  bunk(28);
  rect(1, 0, 2, TEX_SIZE, 60, 62, 70); // 기둥
  rect(29, 0, 2, TEX_SIZE, 60, 62, 70);
}

// 흰 타일 벽 + 샤워기 + 반쯤 친 커튼
function paintShower(put, rect) {
  const rnd = makeRandom(97);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const joint = x % 8 === 7 || y % 8 === 7;
      const v = joint ? 150 : 206 + rnd() * 8;
      put(x, y, v - 6, v, v + 4);
    }
  }
  rect(18, 3, 2, 12, 160, 164, 170); // 샤워 봉
  rect(15, 3, 8, 3, 190, 194, 200); // 샤워 헤드
  for (let j = 7; j < 14; j += 2) rect(16 + (j % 3), j, 1, 1, 120, 180, 230); // 물줄기
  rect(19, 20, 4, 2, 200, 60, 50); // 수전 손잡이
  for (let y = 1; y < TEX_SIZE; y++) {
    const fold = Math.floor(y / 2) % 2 === 0 ? 0 : 10;
    rect(0, y, 9, 1, 70 + fold, 140 + fold, 170 + fold); // 커튼
  }
  rect(0, 0, TEX_SIZE, 1, 120, 124, 130); // 커튼 레일
}

// 부엌 벽 + 위쪽 찬장 + 식탁 위 밥·국·반찬
function paintTable(put, rect) {
  const rnd = makeRandom(103);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const v = 176 + rnd() * 8;
      put(x, y, v, v - 6, v - 20); // 크림색 벽지
    }
  }
  rect(1, 1, 30, 9, 150, 104, 64); // 찬장
  rect(15, 1, 1, 9, 110, 74, 44);
  rect(12, 5, 2, 2, 220, 200, 150);
  rect(17, 5, 2, 2, 220, 200, 150);
  rect(0, 19, TEX_SIZE, 3, 168, 116, 70); // 식탁 상판
  rect(0, 22, TEX_SIZE, 1, 110, 74, 44);
  rect(3, 22, 2, 10, 120, 82, 50); // 다리
  rect(27, 22, 2, 10, 120, 82, 50);
  rect(5, 15, 6, 4, 240, 240, 236); // 밥공기
  rect(6, 14, 4, 1, 250, 250, 250);
  rect(13, 15, 7, 4, 120, 60, 40); // 국그릇
  rect(14, 15, 5, 1, 200, 120, 60);
  rect(22, 17, 6, 2, 80, 150, 60); // 반찬
}

// 집 벽지: 연한 줄무늬 + 아래쪽 걸레받이
function paintWallpaper(put, rect) {
  const rnd = makeRandom(113);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const stripe = x % 8 < 4 ? 6 : 0;
      const v = 190 + stripe + rnd() * 5;
      put(x, y, v, v - 4, v - 18);
    }
  }
  rect(0, 28, TEX_SIZE, 4, 120, 86, 56);
  rect(0, 28, TEX_SIZE, 1, 150, 112, 76);
}

// 마룻바닥: 엇갈린 나무 판자
function paintWood(put) {
  const rnd = makeRandom(127);
  for (let y = 0; y < TEX_SIZE; y++) {
    const plank = Math.floor(y / 8);
    const offset = plank % 2 === 0 ? 0 : 12;
    for (let x = 0; x < TEX_SIZE; x++) {
      const joint = y % 8 === 7 || (x + offset) % 24 === 23;
      const grain = Math.sin((x + plank * 5) * 0.9) * 4;
      const v = joint ? -40 : rnd() * 8 + grain;
      put(x, y, 150 + v, 102 + v, 62 + v);
    }
  }
}

const LAMP_RED_ON = [255, 40, 30];
const LAMP_OFF = [70, 74, 70];
const LAMP_GREEN = [60, 255, 110];
const NO_TINT = [0, 0, 0];

// 같은 무늬가 반복되어 보이지 않도록 칸마다 고를 변형을 여러 장 만든다
export const TEXTURE_VARIANTS = 3;

function createVariants(paint, wear) {
  const variants = [];
  for (let i = 0; i < TEXTURE_VARIANTS; i++) {
    variants.push(createTexture(paint, { ...wear, seed: wear.seed + i * 97 }));
  }
  return variants;
}

export const TEXTURES = {
  [TILE.CONCRETE]: createVariants(paintConcrete, WEAR.concrete),
  [TILE.PIPES]: createVariants(paintPipes, WEAR.pipes),
  [TILE.DOOR]: [createTexture(paintDoor, WEAR.door)],
  [TILE.COUNTER]: [createTexture(paintCounter, WEAR.counter)],
  [TILE.BED]: [createTexture(paintBed, WEAR.bed)],
  [TILE.SHOWER]: [createTexture(paintShower, WEAR.shower)],
  [TILE.TABLE]: [createTexture(paintTable, WEAR.table)],
  panelNormal: createTexture((p, r) => paintPanel(p, r, LAMP_OFF, NO_TINT), WEAR.panel),
  panelFaultOn: createTexture((p, r) => paintPanel(p, r, LAMP_RED_ON, [110, -70, -80]), WEAR.panel),
  panelFaultOff: createTexture((p, r) => paintPanel(p, r, [120, 20, 16], [24, -30, -34]), WEAR.panel),
  panelFixed: createTexture((p, r) => paintPanel(p, r, LAMP_GREEN, NO_TINT), WEAR.panel),
  floor: createVariants(paintFloor, WEAR.floor),
  wood: createVariants(paintWood, WEAR.wood),
  wallpaper: createVariants(paintWallpaper, WEAR.wallpaper),
  ceiling: createVariants(paintCeiling, WEAR.ceiling),
  lampOn: createTexture((p, r) => paintLamp(p, r, [255, 255, 236]), WEAR.lamp),
  lampOff: createTexture((p, r) => paintLamp(p, r, [74, 76, 72]), WEAR.lamp),
};
