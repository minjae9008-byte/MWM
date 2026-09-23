/** 단어 데이터 무결성 — 여기가 깨지면 게임이 거짓말을 가르친다 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_DECKS, parseWordList } from '../src/data/decks.js';

const ALL = BUILTIN_DECKS.flatMap((d) => d.words);

test('모든 단어에 영어·뜻·품사가 있다', () => {
  for (const w of ALL) {
    assert.ok(w.en && w.en.trim(), `영어가 빈 항목: ${w.id}`);
    assert.ok(w.ko && w.ko.trim(), `뜻이 빈 항목: ${w.en}`);
    assert.ok(/^[a-zA-Z][a-zA-Z' -]*$/.test(w.en), `영어가 이상하다: ${w.en}`);
    assert.ok(/[가-힣]/.test(w.ko), `뜻에 한글이 없다: ${w.en} = ${w.ko}`);
    assert.ok(['n', 'v', 'a', 'ad', 'prep', 'phr', ''].includes(w.pos), `품사 코드가 이상하다: ${w.en}=${w.pos}`);
  }
});

test('덱 안에서 id가 겹치지 않는다', () => {
  for (const d of BUILTIN_DECKS) {
    const ids = d.words.map((w) => w.id);
    assert.equal(new Set(ids).size, ids.length, `${d.id} 덱에 중복 id가 있다`);
  }
});

test('덱마다 오답을 고를 만큼 충분한 단어가 있다', () => {
  for (const d of BUILTIN_DECKS) {
    assert.ok(d.words.length >= 40, `${d.id}: ${d.words.length}단어로는 오답 구성이 빈약하다`);
    assert.ok(d.name && d.desc);
  }
  assert.ok(ALL.length >= 800, `전체 ${ALL.length}단어`);
});

test('뜻이 겹치는 단어가 없다 — 겹치면 뜻만 보고는 답을 정할 수 없다', () => {
  // "눈" 이 snow이기도 하고 eye이기도 하면, 뜻을 보고 영단어를 쓰는 방향에서
  // 맞는 답도 오답 처리된다. 내장 덱은 뉘앙스를 적어 갈라 둔다.
  const byKo = new Map();
  for (const w of BUILTIN_DECKS.flatMap((d) => d.words)) {
    const k = w.ko.trim();
    if (!byKo.has(k)) byKo.set(k, []);
    byKo.get(k).push(w.en);
  }
  const dupes = [...byKo].filter(([, v]) => v.length > 1);
  assert.equal(dupes.length, 0,
    `뜻이 겹친다: ${dupes.map(([k, v]) => `${k}=${v.join('/')}`).join(', ')}`);
});

test('예문이 있는 단어는 예문 안에 그 단어가 실제로 들어 있다', () => {
  const withEx = ALL.filter((w) => w.ex);
  assert.ok(withEx.length >= 100, `예문이 ${withEx.length}개뿐이다`);
  for (const w of withEx) {
    const stem = w.en.replace(/(e|y)$/i, '').toLowerCase();
    assert.ok(w.ex.toLowerCase().includes(stem),
      `예문에 단어가 없다: ${w.en} → "${w.ex}"`);
    assert.ok(w.ex.length > 12 && w.ex.length < 120, `예문 길이가 이상하다: ${w.en}`);
    assert.ok(/[.!?]$/.test(w.ex), `예문이 문장으로 끝나지 않는다: ${w.en}`);
    if (w.exKo) assert.ok(/[가-힣]/.test(w.exKo), `예문 번역에 한글이 없다: ${w.en}`);
  }
});

test('사용자 단어장: 쉼표·탭·세로줄을 모두 받는다', () => {
  const rows = parseWordList('apple|사과|n|food\nbread|빵', 'mine');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'mine:apple');
  assert.equal(rows[0].tags[0], 'food');
  assert.equal(rows[1].ko, '빵');
});

test('사용자 단어장도 5·6번째 칸으로 예문을 넣을 수 있다', () => {
  const [w] = parseWordList('ubiquitous|어디에나 있는|a|core|Screens are ubiquitous now.|화면은 이제 어디에나 있다.', 'mine');
  assert.equal(w.ex, 'Screens are ubiquitous now.');
  assert.equal(w.exKo, '화면은 이제 어디에나 있다.');
});

test('내장 예문은 사용자 덱에도 자동으로 붙는다', () => {
  const [w] = parseWordList('subtle|미묘한|a|quality', 'mine');
  assert.ok(w.ex, '내장 예문이 안 붙었다');
  assert.ok(w.ex.toLowerCase().includes('subtle'));
});

test('빈 줄·주석·깨진 줄은 조용히 무시된다', () => {
  const rows = parseWordList('\n# 주석\napple|사과\n\n|뜻만 있음\n영어만 없음|\nbread|빵\n', 'mine');
  assert.equal(rows.length, 2);
});

test('철자가 겹치는 다의어는 뜻이 합쳐진다', () => {
  const rows = parseWordList('light|가벼운|a\nlight|빛|n', 'mine');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].ko.includes('가벼운') && rows[0].ko.includes('빛'));
});
