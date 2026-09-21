/**
 * 한국어 조사 처리.
 *
 * 유물 이름처럼 런타임에 조합되는 문장에서 "방패 를" 같은 어색한 표기가 나오지 않게 한다.
 * 한글 음절은 유니코드에서 (초성·중성·종성)으로 분해되고,
 * (코드 - 0xAC00) % 28 이 0이면 받침이 없다.
 */

const PAIRS = {
  '을': ['를', '을'],
  '를': ['를', '을'],
  '은': ['는', '은'],
  '는': ['는', '은'],
  '이': ['가', '이'],
  '가': ['가', '이'],
  '와': ['와', '과'],
  '과': ['와', '과'],
  '로': ['로', '으로'],
  '으로': ['로', '으로'],
};

/** 마지막 글자에 받침이 있는가 */
export function hasFinalConsonant(word) {
  if (!word) return false;
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);

  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    // '로/으로'는 ㄹ 받침(8)을 받침 없음처럼 다룬다: "슬롯으로", "서울로"
    return jong !== 0;
  }
  // 숫자·영문으로 끝나면 읽었을 때의 종성으로 판단한다
  if (/[0-9]$/.test(ch)) return [true, true, false, true, false, false, false, true, true, false][Number(ch)];
  if (/[a-zA-Z]$/.test(ch)) return /[bcdklmnprt]$/i.test(ch);
  return false;
}

/**
 * 단어에 알맞은 조사를 붙인다.
 * @example josa('방패', '을') // '방패를'
 * @example josa('신관', '을') // '신관을'
 */
export function josa(word, particle) {
  const pair = PAIRS[particle];
  if (!pair) return `${word}${particle}`;
  const final = hasFinalConsonant(word);
  if (particle === '로' || particle === '으로') {
    const ch = word.trim().slice(-1);
    const code = ch.charCodeAt(0);
    const rieul = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
    return `${word}${final && !rieul ? '으로' : '로'}`;
  }
  return `${word}${final ? pair[1] : pair[0]}`;
}
