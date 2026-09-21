/**
 * FSRS-5 구현 검증.
 * 여기가 틀리면 게임이 아무리 재밌어도 단어는 안 외워진다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FSRS, FSRS5_DEFAULT_W, Rating, State, createCardState,
  retrievability, intervalForRetention, fuzzRange, formatInterval, DAY_MS,
} from '../src/core/fsrs.js';

test('망각곡선: t=0이면 R=1, t=S이면 정확히 0.9', () => {
  assert.equal(retrievability(0, 10), 1);
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.ok(Math.abs(retrievability(100, 100) - 0.9) < 1e-9);
});

test('망각곡선은 단조 감소한다', () => {
  let prev = 1;
  for (let t = 0; t <= 200; t += 5) {
    const r = retrievability(t, 20);
    assert.ok(r <= prev + 1e-12, `t=${t}에서 증가함`);
    prev = r;
  }
});

test('목표 유지율 0.9의 간격은 안정성과 같다', () => {
  for (const s of [1, 5, 37, 365]) {
    assert.ok(Math.abs(intervalForRetention(s, 0.9) - s) < 1e-9);
  }
});

test('목표 유지율을 높이면 간격이 짧아진다', () => {
  const s = 30;
  assert.ok(intervalForRetention(s, 0.97) < intervalForRetention(s, 0.9));
  assert.ok(intervalForRetention(s, 0.9) < intervalForRetention(s, 0.8));
});

test('신규 카드 첫 간격이 FSRS-5 기본값과 일치한다 (1/1/3/16일)', () => {
  const f = new FSRS({ enableFuzz: false });
  const c = createCardState('w');
  assert.deepEqual(f.preview(c), { 1: 1, 2: 1, 3: 3, 4: 16 });
});

test('초기 난이도는 평가가 좋을수록 낮다', () => {
  const f = new FSRS();
  const ds = [1, 2, 3, 4].map((g) => f.initDifficulty(g));
  for (let i = 1; i < ds.length; i++) assert.ok(ds[i] < ds[i - 1]);
  for (const d of ds) assert.ok(d >= 1 && d <= 10);
});

test('난이도는 항상 1~10에 머문다 (Again 연속 / Easy 연속)', () => {
  const f = new FSRS();
  let d = f.initDifficulty(3);
  for (let i = 0; i < 300; i++) d = f.nextDifficulty(d, Rating.Again);
  assert.ok(d <= 10 && d >= 1);
  for (let i = 0; i < 300; i++) d = f.nextDifficulty(d, Rating.Easy);
  assert.ok(d >= 1 && d <= 10);
});

test('성공 복습은 안정성을 키우고, 실패는 줄인다', () => {
  const f = new FSRS({ enableFuzz: false });
  const card = { ...createCardState('w'), s: 20, d: 5, last: Date.now() - 20 * DAY_MS };
  const good = f.computeDSR(card, Rating.Good);
  const again = f.computeDSR(card, Rating.Again);
  assert.ok(good.s > card.s, '성공했는데 안정성이 안 늘었다');
  assert.ok(again.s <= card.s, '실패했는데 안정성이 늘었다');
});

test('간격 효과: 더 오래 기다렸다 맞히면 안정성이 더 크게 오른다', () => {
  const f = new FSRS({ enableFuzz: false });
  const base = { ...createCardState('w'), s: 15, d: 5 };
  const soon = f.computeDSR({ ...base, last: Date.now() - 2 * DAY_MS }, Rating.Good);
  const late = f.computeDSR({ ...base, last: Date.now() - 15 * DAY_MS }, Rating.Good);
  assert.ok(late.s > soon.s, '간격 효과가 반영되지 않았다');
});

test('Hard < Good < Easy 순으로 안정성이 커진다', () => {
  const f = new FSRS({ enableFuzz: false });
  const card = { ...createCardState('w'), s: 12, d: 5, last: Date.now() - 12 * DAY_MS };
  const h = f.computeDSR(card, Rating.Hard).s;
  const g = f.computeDSR(card, Rating.Good).s;
  const e = f.computeDSR(card, Rating.Easy).s;
  assert.ok(h < g && g < e, `h=${h} g=${g} e=${e}`);
});

test('실패 후 안정성이 실패 전을 넘지 않는다', () => {
  const f = new FSRS({ enableFuzz: false });
  for (const s of [0.5, 5, 50, 500]) {
    const card = { ...createCardState('w'), s, d: 5, last: Date.now() - s * DAY_MS };
    assert.ok(f.computeDSR(card, Rating.Again).s <= s + 1e-9, `S=${s}에서 역전`);
  }
});

test('당일 재복습은 short-term 수식을 탄다: S·exp(w17·(g-3+w18))', () => {
  const f = new FSRS({ enableFuzz: false });
  const w = FSRS5_DEFAULT_W;
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const card = { ...createCardState('w'), s: 10, d: 5, last: Date.now() - 60000 };
    const expected = 10 * Math.exp(w[17] * (g - 3 + w[18]));
    assert.ok(Math.abs(f.computeDSR(card, g).s - expected) < 1e-9, `g=${g}`);
  }
  // 당일 Again은 안정성을 깎고, 당일 Good/Easy는 완만하게 올린다
  const card = { ...createCardState('w'), s: 10, d: 5, last: Date.now() - 60000 };
  assert.ok(f.computeDSR(card, Rating.Again).s < 10);
  assert.ok(f.computeDSR(card, Rating.Good).s > 10);
  assert.ok(f.computeDSR(card, Rating.Easy).s > f.computeDSR(card, Rating.Good).s);
});

test('안정성은 상·하한을 넘지 않는다', () => {
  const f = new FSRS({ enableFuzz: false });
  let card = { ...createCardState('w'), s: 1, d: 5, last: Date.now() - DAY_MS };
  for (let i = 0; i < 400; i++) {
    const r = f.computeDSR(card, Rating.Easy);
    card = { ...card, s: r.s, d: r.d, last: Date.now() - f.scheduleDays(r.s) * DAY_MS };
    assert.ok(card.s <= 36500 && card.s >= 0.01);
  }
});

test('간격은 최소 1일, 최대 maximumInterval', () => {
  const f = new FSRS({ maximumInterval: 180, enableFuzz: false });
  assert.equal(f.scheduleDays(0.01), 1);
  assert.equal(f.scheduleDays(100000), 180);
});

test('fuzz 범위는 원래 간격을 감싼다', () => {
  for (const d of [3, 10, 60, 400]) {
    const r = fuzzRange(d);
    assert.ok(r.min <= d && r.max >= d, `${d}일에서 범위 밖`);
    assert.ok(r.min >= 2);
  }
});

test('파라미터는 19개이고 기본값이 고정되어 있다', () => {
  assert.equal(FSRS5_DEFAULT_W.length, 19);
  assert.equal(new FSRS().w.length, 19);
  assert.equal(FSRS5_DEFAULT_W[0], 0.40255);
});

test('간격 표기', () => {
  assert.equal(formatInterval(1), '1일');
  assert.equal(formatInterval(45), '1.5개월');
  assert.equal(formatInterval(730), '2.0년');
});
