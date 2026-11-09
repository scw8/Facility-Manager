// 레이캐스팅 렌더러: 바닥·천장·벽을 320×200 픽셀 버퍼에 그린다.

import { TILE } from '../world/tiles.js';
import { PANEL_STATE } from '../world/world.js';
import { TEX_SIZE, TEXTURE_VARIANTS, TEXTURES } from './textures.js';

export const SCREEN_W = 320;
export const SCREEN_H = 200;
export const FOV_PLANE = 0.9; // 시야 평면 길이 (약 84도). 클수록 넓게 보이고 벽이 작아진다
const PROJECTION = SCREEN_W / 2 / FOV_PLANE; // 벽 칸이 정사각형으로 보이는 투영 배율

const TEX_MASK = TEX_SIZE - 1;
const SHADE_ONE = 256; // 밝기 1.0을 뜻하는 고정소수점 값
const SIDE_SHADE = 176; // 벽 측면은 한 단계 어둡게
const EMISSIVE_MIN_SHADE = 190; // 고장 분전반은 멀리서도 빨갛게 보이게

const LAMP_MIN_SHADE = 150; // 켜진 형광등은 멀리서도 빛나 보이게

// 손전등: 화면 중앙은 밝고 가장자리는 어둡다. 미리 계산해 둔다.
const flashlightMask = new Uint16Array(SCREEN_W * SCREEN_H);
for (let y = 0; y < SCREEN_H; y++) {
  for (let x = 0; x < SCREEN_W; x++) {
    const dx = (x - SCREEN_W / 2) / (SCREEN_W / 2);
    const dy = (y - SCREEN_H / 2) / (SCREEN_H / 2);
    const r2 = dx * dx * 0.9 + dy * dy * 0.75;
    const light = Math.max(0.42, Math.min(1, 1.15 - r2 * 0.75));
    flashlightMask[y * SCREEN_W + x] = Math.round(light * SHADE_ONE);
  }
}

// 거리에 따른 밝기 (0~256)
function distanceShade(dist) {
  return Math.max(26, Math.round(SHADE_ONE / (1 + dist * dist * 0.05)));
}

// 칸마다 고정된 값을 주는 해시. 어느 형광등이 고장 났는지 고를 때 쓴다.
function cellHash(x, y) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function isLampLit(cellX, cellY, time) {
  const hash = cellHash(cellX, cellY);
  if (hash % 4 !== 0) return true; // 대부분은 정상 형광등
  // 불량 형광등: 몇 초에 한 번 짧게 지직거린다
  const t = time * (0.7 + (hash % 7) * 0.1) + (hash % 13);
  const cycle = t % 5;
  if (cycle > 0.5) return true;
  return Math.sin(t * 40) > 0;
}

export function createRenderer(ctx) {
  const image = ctx.createImageData(SCREEN_W, SCREEN_H);
  const buffer = new Uint32Array(image.data.buffer);

  function plot(index, color, shade) {
    const s = (shade * flashlightMask[index]) >> 8;
    const r = ((color & 0xff) * s) >> 8;
    const g = (((color >> 8) & 0xff) * s) >> 8;
    const b = (((color >> 16) & 0xff) * s) >> 8;
    buffer[index] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
  }

  function drawFloorAndCeiling(map, player, brightness, time) {
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const planeX = -dirY * FOV_PLANE;
    const planeY = dirX * FOV_PLANE;
    const leftX = dirX - planeX;
    const leftY = dirY - planeY;
    const halfH = SCREEN_H / 2;
    const { spacing, offsetX, offsetY } = map.lamps;
    const floorTexture = TEXTURES[map.theme.floor];

    for (let y = halfH; y < SCREEN_H; y++) {
      const rowDist = (0.5 * PROJECTION) / (y - halfH + 0.5);
      const stepX = (rowDist * 2 * planeX) / SCREEN_W;
      const stepY = (rowDist * 2 * planeY) / SCREEN_W;
      let worldX = player.x + rowDist * leftX;
      let worldY = player.y + rowDist * leftY;
      const shade = (distanceShade(rowDist) * brightness) >> 8;
      const floorRow = y * SCREEN_W;
      const ceilingRow = (SCREEN_H - 1 - y) * SCREEN_W;

      for (let x = 0; x < SCREEN_W; x++) {
        const cellX = Math.floor(worldX);
        const cellY = Math.floor(worldY);
        const texX = Math.floor((worldX - cellX) * TEX_SIZE) & TEX_MASK;
        const texY = Math.floor((worldY - cellY) * TEX_SIZE) & TEX_MASK;
        const texel = texY * TEX_SIZE + texX;

        const variant = cellHash(cellX, cellY) % TEXTURE_VARIANTS;
        plot(floorRow + x, floorTexture[variant][texel], shade);

        let ceiling = TEXTURES.ceiling[variant];
        let ceilingShade = shade;
        if (
          ((cellX % spacing) + spacing) % spacing === offsetX &&
          ((cellY % spacing) + spacing) % spacing === offsetY
        ) {
          if (isLampLit(cellX, cellY, time)) {
            ceiling = TEXTURES.lampOn;
            ceilingShade = Math.max(shade, LAMP_MIN_SHADE);
          } else {
            ceiling = TEXTURES.lampOff;
          }
        }
        plot(ceilingRow + x, ceiling[texel], ceilingShade);

        worldX += stepX;
        worldY += stepY;
      }
    }
  }

  function wallTexture(map, hit, blinkOn) {
    if (hit.tile === TILE.PIT && map.objectAt(hit.cellX, hit.cellY).leaking) {
      return TEXTURES.pitLeak;
    }
    if (hit.tile !== TILE.PANEL) {
      const themed = hit.tile === TILE.CONCRETE && map.theme.wall;
      const variants = themed ? TEXTURES[map.theme.wall] : TEXTURES[hit.tile];
      return variants[cellHash(hit.cellX, hit.cellY) % variants.length];
    }
    const panel = map.objectAt(hit.cellX, hit.cellY);
    if (panel.state === PANEL_STATE.FAULT) {
      return blinkOn ? TEXTURES.panelFaultOn : TEXTURES.panelFaultOff;
    }
    if (panel.state === PANEL_STATE.FIXED) return TEXTURES.panelFixed;
    return TEXTURES.panelNormal;
  }

  function drawWalls(map, player, brightness, blinkOn) {
    const dirX = Math.cos(player.angle);
    const dirY = Math.sin(player.angle);
    const planeX = -dirY * FOV_PLANE;
    const planeY = dirX * FOV_PLANE;

    for (let x = 0; x < SCREEN_W; x++) {
      const camera = (2 * x) / SCREEN_W - 1;
      const rayX = dirX + planeX * camera;
      const rayY = dirY + planeY * camera;
      const hit = map.castRay(player.x, player.y, rayX, rayY);
      const dist = Math.max(hit.dist, 0.001);

      // 벽면 어디에 맞았는지 → 텍스처 x좌표 (좌우가 뒤집히지 않게 면 방향별로 보정)
      const hitPos = hit.side === 0 ? player.y + dist * rayY : player.x + dist * rayX;
      let texX = Math.floor((hitPos - Math.floor(hitPos)) * TEX_SIZE) & TEX_MASK;
      if ((hit.side === 0 && rayX < 0) || (hit.side === 1 && rayY > 0)) {
        texX = TEX_MASK - texX;
      }

      const texture = wallTexture(map, hit, blinkOn);
      let shade = (distanceShade(dist) * brightness) >> 8;
      if (hit.side === 1) shade = (shade * SIDE_SHADE) >> 8;
      if (texture === TEXTURES.panelFaultOn) shade = Math.max(shade, EMISSIVE_MIN_SHADE);

      const lineHeight = PROJECTION / dist;
      const top = SCREEN_H / 2 - lineHeight / 2;
      const startY = Math.max(0, Math.ceil(top));
      const endY = Math.min(SCREEN_H, Math.ceil(top + lineHeight));
      const texStep = TEX_SIZE / lineHeight;
      let texPos = (startY - top) * texStep;

      for (let y = startY; y < endY; y++) {
        const texY = Math.floor(texPos) & TEX_MASK;
        plot(y * SCREEN_W + x, texture[texY * TEX_SIZE + texX], shade);
        texPos += texStep;
      }
    }
  }

  return {
    drawWorld(map, player, time) {
      // 형광등이 지직거릴 때 건물 전체가 잠깐 어두워지는 B급 연출
      const flickerCycle = time % 11;
      const brightness = flickerCycle < 0.35 && Math.sin(time * 55) > 0 ? 200 : SHADE_ONE;
      const blinkOn = Math.floor(time * 3) % 2 === 0;

      drawFloorAndCeiling(map, player, brightness, time);
      drawWalls(map, player, brightness, blinkOn);
      ctx.putImageData(image, 0, 0);
    },
  };
}
