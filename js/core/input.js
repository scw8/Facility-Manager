// 키보드·터치 입력. 이동 키와 사용 키(use)는 눌림 상태로, 사용 키를 누른 순간은 콜백으로 전달한다.
// 위/아래(onMenu({ move }))와 숫자키(onMenu({ pick }))는 메뉴 선택이나 아이템 슬롯 선택에 쓴다.
// Esc는 onBack()으로 열린 창을 닫는다.
// 마우스 휠은 onWheel(±1), 게임 화면 터치·클릭은 onTap(x, y) (320×200 좌표)로 전달한다.

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

export function setupInput({ onInteract, onMenu, onWheel, onTap, onHelp, onBack }) {
  const input = { forward: false, back: false, left: false, right: false, use: false };

  window.addEventListener('keydown', (e) => {
    const action = KEY_BINDINGS[e.code];
    if (action) {
      input[action] = true;
      e.preventDefault();
      if (!e.repeat && action === 'forward') onMenu({ move: -1 });
      if (!e.repeat && action === 'back') onMenu({ move: 1 });
    } else if (e.code === 'Escape') {
      if (!e.repeat) onBack();
    } else if (e.code === 'KeyH') {
      if (!e.repeat) onHelp();
    } else if (/^Digit[1-9]$/.test(e.code)) {
      onMenu({ pick: Number(e.code.slice(5)) - 1 });
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
      if (action === 'forward') onMenu({ move: -1 });
      if (action === 'back') onMenu({ move: 1 });
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

  window.addEventListener(
    'wheel',
    (e) => {
      if (e.deltaY !== 0) onWheel(Math.sign(e.deltaY));
    },
    { passive: true }
  );

  const view = document.getElementById('view');
  view.addEventListener('pointerdown', (e) => {
    const rect = view.getBoundingClientRect();
    onTap(((e.clientX - rect.left) / rect.width) * view.width, ((e.clientY - rect.top) / rect.height) * view.height);
  });

  // 길게 눌렀을 때 뜨는 메뉴가 조작을 끊지 않게 한다
  document.getElementById('touch').addEventListener('contextmenu', (e) => e.preventDefault());

  return input;
}
