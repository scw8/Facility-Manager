// 키보드·터치 입력. 이동 키와 사용 키(use)는 눌림 상태로, 사용 키를 누른 순간은 콜백으로 전달한다.

const KEY_BINDINGS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

const INTERACT_KEYS = new Set(['KeyE', 'Space']);

export function setupInput({ onInteract }) {
  const input = { forward: false, back: false, left: false, right: false, use: false };

  window.addEventListener('keydown', (e) => {
    const action = KEY_BINDINGS[e.code];
    if (action) {
      input[action] = true;
      e.preventDefault();
    } else if (INTERACT_KEYS.has(e.code)) {
      if (!e.repeat) {
        input.use = true;
        onInteract();
      }
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    const action = KEY_BINDINGS[e.code];
    if (action) input[action] = false;
    if (INTERACT_KEYS.has(e.code)) input.use = false;
  });

  // 창이 포커스를 잃으면 keyup을 받지 못해 키가 눌린 채로 남는 것을 막는다
  window.addEventListener('blur', () => {
    for (const key of Object.keys(input)) input[key] = false;
  });

  for (const button of document.querySelectorAll('#touch [data-key]')) {
    const action = button.dataset.key;
    const release = () => {
      input[action] = false;
      button.classList.remove('active');
    };
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      input[action] = true;
      button.classList.add('active');
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
  }

  const useButton = document.getElementById('use-btn');
  useButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    useButton.classList.add('active');
    input.use = true;
    onInteract();
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    useButton.addEventListener(type, () => {
      useButton.classList.remove('active');
      input.use = false;
    });
  }

  // 길게 눌렀을 때 뜨는 메뉴가 조작을 끊지 않게 한다
  document.getElementById('touch').addEventListener('contextmenu', (e) => e.preventDefault());

  return input;
}
