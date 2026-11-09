// 게임에 쓰이는 맵 목록. 새 맵을 만들면 여기에 등록한다.

import b1 from './b1.js';
import office from './office.js';
import cafeteria from './cafeteria.js';

export const MAP_DATA = [b1, office, cafeteria];

// 근무는 관리사무소에서 시작한다
export const START_MAP_ID = 'office';
