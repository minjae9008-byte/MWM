/** 학습 단계 · 평가 변환 · 세션 재출제 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SrsStore, gradeFromEvent, LEARNING_STEPS, RELEARNING_STEPS } from '../src/core/srs.js';
import { Rating, State, DAY_MS } from '../src/core/fsrs.js';

const store = () => new SrsStore();

test('게임 이벤트 → 평가 변환', () => {
  const w = 8000;
  assert.equal(gradeFromEvent({ correct: true, landed: false, reactionMs: 1500, windowMs: w }), Rating.Easy);
  assert.equal(gradeFromEvent({ correct: true, landed: false, reactionMs: 4500, windowMs: w }), Rating.Good);
  assert.equal(gradeFromEvent({ correct: true, landed: false, reactionMs: 7500, windowMs: w }), Rating.Hard);
  assert.equal(gradeFromEvent({ correct: false, landed: false, reactionMs: 900, windowMs: w }), Rating.Again);
  assert.equal(gradeFromEvent({ correct: true, landed: true, reactionMs: 8000, windowMs: w }), Rating.Again);
});

test('보조를 받으면 Easy를 주지 않는다', () => {
  const ev = { correct: true, landed: false, reactionMs: 800, windowMs: 8000 };
  assert.equal(gradeFromEvent(ev), Rating.Easy);
  assert.equal(gradeFromEvent({ ...ev, assisted: true }), Rating.Good);
  assert.equal(gradeFromEvent({ ...ev, revealed: true }), Rating.Good);
});

test('신규 카드는 학습 단계를 거친 뒤 졸업한다', () => {
  const s = store();
  let r = s.review('a', Rating.Good, { volley: 0 });
  assert.equal(r.card.state, State.Learning);
  assert.equal(r.nextVolley, 0 + LEARNING_STEPS[0]);
  assert.equal(r.intervalDays, 0, '아직 장기 일정이 잡히면 안 된다');

  r = s.review('a', Rating.Good, { volley: 2 });
  assert.equal(r.card.state, State.Learning);
  assert.equal(r.nextVolley, 2 + LEARNING_STEPS[1]);

  r = s.review('a', Rating.Good, { volley: 8 });
  assert.equal(r.card.state, State.Review);
  assert.ok(r.graduated);
  assert.ok(r.intervalDays >= 1, '졸업했는데 복습일이 안 잡혔다');
});

test('Easy는 학습 단계를 건너뛰고 바로 졸업한다', () => {
  const s = store();
  const r = s.review('a', Rating.Easy, { volley: 0 });
  assert.equal(r.card.state, State.Review);
  assert.ok(r.intervalDays >= 1);
});

test('학습 중 Again이면 첫 단계로 되돌아간다', () => {
  const s = store();
  s.review('a', Rating.Good, { volley: 0 });
  s.review('a', Rating.Good, { volley: 2 });
  const r = s.review('a', Rating.Again, { volley: 5 });
  assert.equal(r.card.state, State.Learning);
  assert.equal(r.card.step, 0);
  assert.equal(r.nextVolley, 5 + LEARNING_STEPS[0]);
});

test('복습 카드가 실패하면 재학습으로 떨어지고 lapses가 는다', () => {
  const s = store();
  s.review('a', Rating.Easy, { volley: 0 });
  assert.equal(s.cards.a.state, State.Review);

  const r = s.review('a', Rating.Again, { volley: 10 });
  assert.equal(r.card.state, State.Relearning);
  assert.equal(r.card.lapses, 1);
  assert.equal(r.nextVolley, 10 + RELEARNING_STEPS[0]);

  const r2 = s.review('a', Rating.Good, { volley: 13 });
  assert.equal(r2.card.state, State.Review);
  assert.ok(r2.intervalDays >= 1);
});

test('틀린 단어는 반드시 같은 판 안에서 다시 예약된다', () => {
  const s = store();
  for (const g of [Rating.Again, Rating.Hard]) {
    const r = s.review(`w_${g}`, g, { volley: 3 });
    assert.notEqual(r.nextVolley, null, `평가 ${g}에서 재출제 예약이 없다`);
    assert.ok(r.nextVolley > 3);
  }
});

test('due 목록은 신규 카드를 포함하지 않는다', () => {
  const s = store();
  s.review('a', Rating.Easy, { volley: 0 });
  s.get('b');                                  // 손대지 않은 신규 카드
  const due = s.dueIds(Date.now() + 400 * DAY_MS);
  assert.ok(due.includes('a'));
  assert.ok(!due.includes('b'));
});

test('통계 요약과 예보', () => {
  const s = store();
  s.review('a', Rating.Easy, { volley: 0 });
  s.review('b', Rating.Good, { volley: 0 });
  s.get('c');
  const sum = s.summary();
  assert.equal(sum.total, 3);
  assert.equal(sum.new, 1);
  assert.equal(sum.review + sum.learning, 2);

  const fc = s.forecast(30);
  assert.equal(fc.length, 30);
  assert.ok(fc.reduce((x, y) => x + y, 0) >= 1, 'a는 예보에 들어가야 한다');
});

test('누적 정답률(true retention)', () => {
  const s = store();
  s.review('a', Rating.Good, { volley: 0 });
  s.review('b', Rating.Again, { volley: 1 });
  s.review('c', Rating.Easy, { volley: 2 });
  const r = s.trueRetention();
  assert.equal(r.total, 3);
  assert.equal(r.pass, 2);
  assert.ok(Math.abs(r.rate - 2 / 3) < 1e-9);
});

test('leech(자주 틀리는 단어) 검출', () => {
  const s = store();
  s.review('a', Rating.Easy, { volley: 0 });
  for (let i = 0; i < 5; i++) {
    s.review('a', Rating.Again, { volley: 10 + i * 10 });
    s.review('a', Rating.Good, { volley: 13 + i * 10 });
  }
  const sum = s.summary();
  assert.ok(sum.leeches.some((l) => l.id === 'a'), 'leech로 잡히지 않았다');
});

test('복습 로그는 상한을 넘지 않는다', () => {
  const s = store();
  s.maxLog = 50;
  for (let i = 0; i < 200; i++) s.review(`w${i % 7}`, Rating.Good, { volley: i });
  assert.ok(s.log.length <= 50);
});

test('4지선다 재인이라는 점을 반영해 Easy를 보수적으로 준다', () => {
  const fast = { correct: true, landed: false, reactionMs: 1200, windowMs: 8000 };

  // 처음 만난 단어는 아무리 빨라도 Easy가 아니다 (재인 1회로 2주를 건너뛰지 않는다)
  assert.equal(gradeFromEvent({ ...fast, options: 4, firstExposure: true }), Rating.Good);

  // 두 번째부터는 Easy 가능
  assert.equal(gradeFromEvent({ ...fast, options: 4, firstExposure: false }), Rating.Easy);

  // 보기가 적으면 찍어서 맞을 확률이 높으므로 Easy를 주지 않는다
  assert.equal(gradeFromEvent({ ...fast, options: 2, firstExposure: false }), Rating.Good);
  assert.equal(gradeFromEvent({ ...fast, options: 3, firstExposure: false }), Rating.Good);

  // Hard/Good 구간은 이 규칙의 영향을 받지 않는다
  const slow = { correct: true, landed: false, reactionMs: 6500, windowMs: 8000 };
  assert.equal(gradeFromEvent({ ...slow, options: 4, firstExposure: true }), Rating.Hard);
});

test('한 번도 만나지 않은 단어도 미학습으로 집계된다', () => {
  const s = store();
  s.review('seen', Rating.Good, { volley: 0 });
  // 'a'와 'b'는 카드 객체조차 만들지 않은 상태
  const sum = s.summary(Date.now(), ['seen', 'a', 'b']);
  assert.equal(sum.total, 3);
  assert.equal(sum.new, 2, '카드가 없는 단어가 미학습으로 안 세어졌다');
  assert.equal(sum.total - sum.new, 1, '학습한 단어 수가 부풀려졌다');
});

test('한국어 조사 처리', async () => {
  const { josa, hasFinalConsonant } = await import('../src/core/korean.js');
  assert.equal(josa('방패', '을'), '방패를');       // 받침 없음
  assert.equal(josa('신관', '을'), '신관을');       // 받침 있음
  assert.equal(josa('확장 탄두', '을'), '확장 탄두를');
  assert.equal(josa('연쇄 반응', '을'), '연쇄 반응을');
  assert.equal(josa('유물', '이'), '유물이');
  assert.equal(josa('미사일', '가'), '미사일이');
  assert.equal(josa('슬롯', '으로'), '슬롯으로');
  assert.equal(josa('미사일', '로'), '미사일로');   // ㄹ 받침은 '로'
  assert.equal(hasFinalConsonant('사과'), false);
  assert.equal(hasFinalConsonant('사람'), true);
});

// --- 타이핑(자유 회상) ---------------------------------------------------

test('타이핑 답안 정규화: 대소문자·공백·관사·구두점을 무시한다', async () => {
  const { normalizeAnswer, checkTyped } = await import('../src/core/srs.js');
  assert.equal(normalizeAnswer('  Apple. '), 'apple');
  assert.equal(normalizeAnswer('to run'), 'run');
  assert.equal(normalizeAnswer('The  Market'), 'market');
  for (const t of ['apple', 'APPLE', ' Apple ', 'apple.']) {
    assert.equal(checkTyped(t, 'apple').ok, true, t);
  }
});

test('쉼표로 나뉜 복수 정답은 하나만 맞아도 된다', async () => {
  const { checkTyped } = await import('../src/core/srs.js');
  assert.equal(checkTyped('rice', '쌀, 밥').ok, false, '한국어 답은 영어로 못 맞힌다');
  assert.equal(checkTyped('change', 'change, variation').ok, true);
  assert.equal(checkTyped('variation', 'change, variation').ok, true);
});

test('긴 단어의 오타는 통과시키되 오타로 표시한다', async () => {
  const { checkTyped } = await import('../src/core/srs.js');
  const typo = checkTyped('accomodate', 'accommodate');
  assert.equal(typo.ok, true);
  assert.equal(typo.fuzzy, true, '오타인데 정확한 답으로 처리됐다');

  assert.equal(checkTyped('accommodate', 'accommodate').fuzzy, false);
  // 짧은 단어는 한 글자만 달라도 다른 단어다
  assert.equal(checkTyped('cat', 'cot').ok, false);
  assert.equal(checkTyped('bag', 'big').ok, false);
  assert.equal(checkTyped('', 'apple').ok, false);
});

test('편집 거리는 상한을 넘으면 조기 종료한다', async () => {
  const { editDistance } = await import('../src/core/srs.js');
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('abc', 'abd'), 1);
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.ok(editDistance('short', 'averylongword', 2) > 2);
});

test('마스킹은 첫 글자와 글자 수를 보여 준다', async () => {
  const { maskAnswer } = await import('../src/core/srs.js');
  assert.equal(maskAnswer('apple'), 'a _ _ _ _');
  assert.equal(maskAnswer('apple', 2), 'a p p _ _');
  assert.ok(maskAnswer('give up').includes('g'));
  assert.ok(maskAnswer('apple').split('_').length - 1 === 4, '글자 수가 드러나야 한다');
});

test('타이핑은 자유 회상이므로 재인용 제동을 걸지 않는다', () => {
  const fast = { correct: true, landed: false, reactionMs: 1200, windowMs: 8000, mode: 'typing', attempts: 1 };
  // 처음 만난 단어라도, 보기가 없으면 Easy를 줄 수 있다
  assert.equal(gradeFromEvent({ ...fast, firstExposure: true, options: 2 }), Rating.Easy);
  // 재시도했거나 오타였다면 매끄러운 인출이 아니다
  assert.equal(gradeFromEvent({ ...fast, attempts: 2 }), Rating.Hard);
  assert.equal(gradeFromEvent({ ...fast, fuzzy: true }), Rating.Hard);
  // 힌트를 받았으면 Easy는 아니다
  assert.equal(gradeFromEvent({ ...fast, revealed: true }), Rating.Good);
  // 틀리거나 놓친 건 그대로 Again
  assert.equal(gradeFromEvent({ ...fast, correct: false }), Rating.Again);
  assert.equal(gradeFromEvent({ ...fast, landed: true }), Rating.Again);
});
