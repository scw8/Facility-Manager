// 구내식당 (임시 배치). 북쪽 벽의 배식대에서 식사한다.
//
// 범례: . 바닥  # 콘크리트  % 배관벽  E 분전반  D 문  C 배식대  R 침상  S 샤워부스  T 식탁

export default {
  id: 'cafeteria',
  name: '구내식당',
  tiles: [
    '#CCCC#####',
    '#........#',
    '#........#',
    '#........D',
    '#........#',
    '#........#',
    '##########',
  ],
  spawn: { x: 8.5, y: 3.5, angle: Math.PI },
  lamps: { spacing: 3, offsetX: 1, offsetY: 1 },
  doors: [{ x: 9, y: 3, to: 'office', spawn: { x: 1.5, y: 5.5, angle: 0 } }],
};
