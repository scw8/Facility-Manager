// 아이템 슬롯(가방). 공구실에서 챙기고, 숫자키로 손에 들 아이템을 고른다.

import { ITEMS, TASKS } from '../../data/items.js';
import { owns } from './economy.js';
import { withObject } from '../core/korean.js';

const BASE_SLOTS = 6;
const BIG_BAG_BONUS = 2;

export function createBag() {
  return { items: [], selected: 0 };
}

export function capacity(state) {
  return BASE_SLOTS + (owns(state, 'bigbag') ? BIG_BAG_BONUS : 0);
}

export const itemName = (id) => ITEMS[id].name;

export const hasItem = (state, id) => state.bag.items.includes(id);
export const heldItem = (state) => state.bag.items[state.bag.selected] ?? null;

export function selectSlot(state, index) {
  if (index >= 0 && index < capacity(state)) state.bag.selected = index;
}

export function cycleSlot(state, delta) {
  const n = capacity(state);
  state.bag.selected = (state.bag.selected + delta + n) % n;
}

// 챙기거나(없으면) 돌려놓는다(있으면). 결과 문구를 돌려준다.
export function toggleItem(state, id) {
  const { items } = state.bag;
  const index = items.indexOf(id);
  if (index >= 0) {
    items.splice(index, 1);
    return `${withObject(itemName(id))} 돌려놓았다`;
  }
  if (items.length >= capacity(state)) return '아이템 슬롯이 가득 찼다';
  items.push(id);
  return `${withObject(itemName(id))} 챙겼다`;
}

// 작업을 시작할 수 있는지. 안 되면 이유 문구, 되면 null
export function checkTask(state, taskId) {
  const task = TASKS[taskId];
  const needs = task.needs.filter((id) => !(id === 'flashlight' && owns(state, 'headlamp')));
  const missing = needs.filter((id) => !hasItem(state, id));
  if (missing.length > 0) return `필요: ${missing.map(itemName).join(', ')} (공구실)`;
  if (task.main && heldItem(state) !== task.main) {
    const slot = state.bag.items.indexOf(task.main) + 1;
    return `${withObject(itemName(task.main))} 손에 드세요 (숫자키 ${slot})`;
  }
  return null;
}

// 작업을 마치면 부품을 소모한다
export function consumeTask(state, taskId) {
  for (const id of TASKS[taskId].consumes) {
    const index = state.bag.items.indexOf(id);
    if (index >= 0) state.bag.items.splice(index, 1);
  }
  const n = state.bag.items.length;
  if (state.bag.selected >= capacity(state)) state.bag.selected = Math.max(0, n - 1);
}
