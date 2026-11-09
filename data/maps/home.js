// 우리 집 (작은 원룸형 아파트). 근무일 아침에 여기서 일어난다.
// 왼쪽 위: 침실 / 가운데 위: 화장실 / 오른쪽 위: 부엌 / 동쪽 현관문: 출근
//
// 범례: . 바닥  # 콘크리트  % 배관벽  E 분전반  D 문  C 배식대  R 침상  S 샤워부스  T 식탁

export default {
  id: 'home',
  name: '우리 집',
  tiles: [
    '##########',
    '#R.#S.#..#',
    '#..#..#.T#',
    '#........#',
    '#........D',
    '##########',
  ],
  spawn: { x: 2.5, y: 1.5, angle: Math.PI / 2 }, // 침대 옆에서 일어난다
  lamps: { spacing: 3, offsetX: 1, offsetY: 0 },
  theme: { wall: 'wallpaper', floor: 'wood' },
  // commute: 출근 문. 지나가면 30분 뒤 관리사무소에 도착한다
  doors: [{ x: 9, y: 4, commute: true }],
};
