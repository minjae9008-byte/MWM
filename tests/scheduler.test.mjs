/** 출제 선택 · 오답 구성 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestionScheduler, Direction, AnswerMode } from '../src/core/scheduler.js';
import { SrsStore } from '../src/core/srs.js';
import { Rating, State, DAY_MS } from '../src/core/fsrs.js';
import { RNG } from '../src/core/rng.js';
import { BUILTIN_DECKS } from '../src/data/decks.js';

const WORDS = BUILTIN_DECKS[0].words;

function make(opts = {}) {
  const store = new SrsStore();
  const sch = new QuestionScheduler({
    words: WORDS, store, rng: new RNG(42), newPerRun: 10, ...opts,
  });
  return { store, sch };
}

test('문제는 정답 1개 + 요청한 수만큼의 오답으로 구성된다', () => {
  const { sch } = make();
  for (let n = 1; n <= 5; n++) {
    const q = sch.nextQuestion({ decoys: n });
    assert.equal(q.options.length, n + 1);
    assert.equal(q.options.filter((o) => o.correct).length, 1, '정답이 정확히 하나여야 한다');
  }
});

test('오답의 뜻이 정답과 겹치지 않는다 (동의어로 인한 억울한 오답 방지)', () => {
  const { sch } = make();
  for (let i = 0; i < 300; i++) {
    const q = sch.nextQuestion({ decoys: 4 });
    const texts = q.options.map((o) => o.text);
    assert.equal(new Set(texts).size, texts.length, `보기 중복: ${texts}`);
  }
});

test('출제 방향에 따라 문제/정답이 뒤집힌다', () => {
  const ko = make({ direction: Direction.KO_TO_EN }).sch.nextQuestion({ decoys: 2 });
  assert.equal(ko.prompt, ko.word.ko);
  assert.equal(ko.answer, ko.word.en);

  const en = make({ direction: Direction.EN_TO_KO }).sch.nextQuestion({ decoys: 2 });
  assert.equal(en.prompt, en.word.en);
  assert.equal(en.answer, en.word.ko);
});

test('신규 단어 상한을 넘기지 않는다', () => {
  const { sch } = make({ newPerRun: 5 });
  let newCount = 0;
  for (let i = 0; i < 60; i++) {
    const q = sch.nextQuestion({ decoys: 3 });
    if (q.source === 'new') newCount++;
    sch.advance();
  }
  assert.equal(newCount, 5);
});

test('같은 단어가 연속으로 나오지 않는다', () => {
  const { sch } = make({ minGap: 4 });
  const seen = [];
  for (let i = 0; i < 120; i++) {
    const q = sch.nextQuestion({ decoys: 3 });
    assert.ok(!seen.slice(-4).includes(q.word.id), `간격 위반: ${q.word.id}`);
    seen.push(q.word.id);
    sch.advance();
  }
});

test('세션 내 재출제 예약이 우선 처리된다', () => {
  const { sch } = make();
  const first = sch.nextQuestion({ decoys: 3 });
  sch.advance();
  sch.schedule(first.word.id, sch.volley + 2);
  for (let i = 0; i < 2; i++) { sch.nextQuestion({ decoys: 3 }); sch.advance(); }
  const q = sch.nextQuestion({ decoys: 3 });
  assert.equal(q.word.id, first.word.id);
  assert.equal(q.source, 'relearn');
});

test('기한이 지난 복습 카드가 신규보다 먼저 나온다', () => {
  const { store, sch } = make({ newPerRun: 99 });
  const target = WORDS[10];
  store.review(target.id, Rating.Easy, { volley: 0 });
  store.cards[target.id].due = Date.now() - 30 * DAY_MS;   // 크게 밀린 상태

  const q = sch.nextQuestion({ decoys: 3 });
  assert.equal(q.source, 'due');
  assert.equal(q.word.id, target.id);
});

test('오답은 무작위보다 같은 품사/주제 쪽으로 쏠린다', () => {
  const { sch } = make();
  let sameTag = 0, total = 0;
  for (let i = 0; i < 400; i++) {
    const q = sch.nextQuestion({ decoys: 3 });
    for (const o of q.options) {
      if (o.correct) continue;
      total++;
      if (o.word.pos === q.word.pos || o.word.tags.some((t) => q.word.tags.includes(t))) sameTag++;
    }
    sch.advance();
  }
  const rate = sameTag / total;
  assert.ok(rate > 0.5, `혼동 유발 오답 비율이 너무 낮다: ${(rate * 100).toFixed(1)}%`);
});

test('다탄두 분열용 여분 단어가 함께 제공된다', () => {
  const { sch } = make();
  const q = sch.nextQuestion({ decoys: 3 });
  assert.equal(q.spares.length, 2);
  for (const s of q.spares) assert.notEqual(s.id, q.word.id);
});

test('같은 시드는 같은 출제 순서를 만든다', () => {
  const seq = (seed) => {
    const store = new SrsStore();
    const sch = new QuestionScheduler({ words: WORDS, store, rng: new RNG(seed), newPerRun: 99 });
    const out = [];
    for (let i = 0; i < 25; i++) { out.push(sch.nextQuestion({ decoys: 3 }).word.id); sch.advance(); }
    return out.join(',');
  };
  assert.equal(seq(7), seq(7));
  assert.notEqual(seq(7), seq(8));
});

// --- 보류 · 즐겨찾기 · 출제 형식 -----------------------------------------

test('보류한 단어는 어떤 경로로도 출제되지 않는다', () => {
  const { store, sch } = make({ newPerRun: 999 });
  const target = WORDS[7];
  store.review(target.id, Rating.Easy, { volley: 0 });
  store.cards[target.id].due = Date.now() - 50 * DAY_MS;   // 크게 밀려 1순위가 될 상황
  store.cards[target.id].suspended = true;
  sch.schedule(target.id, 0);                              // 재출제 예약까지 걸어 둔다

  for (let i = 0; i < 400; i++) {
    const q = sch.nextQuestion({ decoys: 3 });
    assert.notEqual(q.word.id, target.id, `${i}번째에 보류 단어가 나왔다`);
    sch.advance();
  }
});

test('즐겨찾기한 단어가 같은 조건의 다른 단어보다 먼저 나온다', () => {
  const { store, sch } = make({ newPerRun: 0 });
  const now = Date.now();
  const plain = WORDS.slice(0, 12);
  for (const w of plain) {
    store.review(w.id, Rating.Easy, { volley: 0 });
    store.cards[w.id].due = now - 2 * DAY_MS;
  }
  const star = WORDS[20];
  store.review(star.id, Rating.Easy, { volley: 0 });
  store.cards[star.id].due = now - 2 * DAY_MS;   // 밀린 정도는 같다
  store.cards[star.id].starred = true;

  const first = sch.nextQuestion({ decoys: 3 });
  assert.equal(first.word.id, star.id, '즐겨찾기가 먼저 나오지 않았다');
  assert.equal(first.starred, true);
});

test('출제 형식: 처음 보는 단어에는 절대 철자를 요구하지 않는다', () => {
  const { store, sch } = make({ answerMode: 'typing' });
  const w = WORDS[3];
  assert.equal(sch.modeFor(w, null, Direction.KO_TO_EN), 'choice');
  assert.equal(sch.modeFor(w, { reps: 0, s: 99 }, Direction.KO_TO_EN), 'choice');
  assert.equal(sch.modeFor(w, { reps: 1, s: 1 }, Direction.KO_TO_EN), 'typing');
});

test('출제 형식: 영단어→뜻 방향에서는 철자 입력을 쓰지 않는다', () => {
  const { sch } = make({ answerMode: 'typing' });
  const w = WORDS[3];
  const card = { reps: 5, s: 99 };
  assert.equal(sch.modeFor(w, card, Direction.KO_TO_EN), 'typing');
  assert.equal(sch.modeFor(w, card, Direction.EN_TO_KO), 'choice', '뜻은 정답이 여러 개라 채점할 수 없다');
});

test('자동 승급: 안정성이 임계치를 넘은 단어만 철자 입력으로 올라간다', () => {
  const { sch } = make({ answerMode: 'auto', typingThreshold: 10 });
  const w = WORDS[3];
  assert.equal(sch.modeFor(w, { reps: 3, s: 4 }, Direction.KO_TO_EN), 'choice');
  assert.equal(sch.modeFor(w, { reps: 3, s: 9.9 }, Direction.KO_TO_EN), 'choice');
  assert.equal(sch.modeFor(w, { reps: 3, s: 10 }, Direction.KO_TO_EN), 'typing');
  // 4지선다 고정이면 아무리 잘 알아도 재인이다
  const fixed = make({ answerMode: 'choice' }).sch;
  assert.equal(fixed.modeFor(w, { reps: 9, s: 999 }, Direction.KO_TO_EN), 'choice');
});

test('allowTyping=false면 문제는 항상 4지선다로 나온다', () => {
  const { store, sch } = make({ answerMode: 'typing' });
  for (const w of WORDS.slice(0, 30)) store.review(w.id, Rating.Easy, { volley: 0 });
  for (let i = 0; i < 40; i++) {
    const q = sch.nextQuestion({ decoys: 3, allowTyping: false });
    assert.equal(q.mode, 'choice');
    assert.ok(q.options.length === 4);
    sch.advance();
  }
});

test('뜻이 같은 단어가 있으면 철자 입력에서 둘 다 정답으로 받는다', async () => {
  const { checkTyped } = await import('../src/core/srs.js');
  const store = new SrsStore();
  // 사용자 단어장에는 동의어가 얼마든지 들어온다 — 데이터가 아니라 구조로 받아 줘야 한다
  const words = [
    { id: 'x:snow', en: 'snow', ko: '눈', pos: 'n', tags: [], deck: 'x' },
    { id: 'x:eye', en: 'eye', ko: '눈', pos: 'n', tags: [], deck: 'x' },
    ...WORDS.slice(0, 20),
  ];
  const sch = new QuestionScheduler({ words, store, rng: new RNG(1), newPerRun: 99 });
  let q = null;
  for (let i = 0; i < 80 && !q; i++) {
    const cand = sch.nextQuestion({ decoys: 3 });
    sch.advance();
    if (cand.word.ko === '눈') q = cand;
  }
  assert.ok(q, '테스트 대상 단어가 안 나왔다');
  assert.ok(q.accept.includes(q.word.en === 'snow' ? 'eye' : 'snow'),
    `동의어가 허용 목록에 없다: ${JSON.stringify(q.accept)}`);
  // 정답이 무엇이든 두 철자 모두 통과해야 한다
  const ok = (t) => checkTyped(t, q.answer).ok || (q.accept || []).some((a) => checkTyped(t, a).ok);
  assert.ok(ok('snow') && ok('eye'));
  assert.equal(ok('rain'), false);
});
