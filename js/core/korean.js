// 한국어 조사 붙이기.

function finalConsonant(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return null; // 한글이 아니면 받침 없음으로 본다
  return code % 28; // 0이면 받침 없음, 8이면 ㄹ
}

// 을/를
export function withObject(word) {
  const final = finalConsonant(word);
  return `${word}${final ? '을' : '를'}`;
}

// 으로/로 (받침이 없거나 ㄹ이면 '로')
export function withDirection(word) {
  const final = finalConsonant(word);
  return `${word}${final && final !== 8 ? '으로' : '로'}`;
}
