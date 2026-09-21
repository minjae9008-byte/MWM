/** 출제 선택 · 오답 구성 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestionScheduler, Direction } from '../src/core/scheduler.js';
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
