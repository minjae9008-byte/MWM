/**
 * FSRS 개인 최적화 검증.
 *
 * 여기서 지켜야 할 것은 "손실이 줄었다"가 아니다 — 그건 최적화가 하는 일이라 당연하다.
 * 지켜야 할 것은 **한 번도 보지 않은 카드에서도** 예측이 나아지는가,
 * 그리고 나아지지 않았을 때 정직하게 그렇다고 말하는가다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSequences, predictableCount, evaluate, optimize, optimizeIterative,
  calibration, readiness, MIN_REVIEWS, PARAM_BOUNDS,
} from '../src/core/optimizer.js';
import { FSRS, FSRS5_DEFAULT_W, intervalForRetention, retrievability, DAY_MS } from '../src/core/fsrs.js';

/** 지정한 '진짜' 파라미터를 가진 가상 학습자의 복습 기록을 만든다 */
function syntheticLog(overrides = {}, cards = 240, seed = 4242) {
  const truth = FSRS5_DEFAULT_W.slice();
  for (const [k, v] of Object.entries(overrides)) truth[Number(k)] = v;
  const f = new FSRS({ w: truth, enableFuzz: false });
  let st = seed;
  const rnd = () => { st = (st * 1103515245 + 12345) & 0x7fffffff; return st / 0x7fffffff; };
  const log = [];
  const now = Date.now();
  for (let c = 0; c < cards; c++) {
    let t = now - 420 * DAY_MS + Math.floor(rnd() * 60) * DAY_MS;
    const g0 = 1 + Math.floor(rnd() * 4);
    let s = f.initStability(g0);
    let d = f.initDifficulty(g0);
    log.push({ id: `c${c}`, t, g: g0 });
    for (let i = 0; i < 10; i++) {
      const iv = Math.max(1, Math.round(intervalForRetention(s, 0.9)));
      t += iv * DAY_MS;
      if (t > now) break;
      const r = retrievability(iv, s);
      const g = rnd() < r ? (rnd() < 0.25 ? 4 : rnd() < 0.2 ? 2 : 3) : 1;
      log.push({ id: `c${c}`, t, g });
      const nd = f.nextDifficulty(d, g);
      s = g === 1 ? f.nextForgetStability(d, s, r) : f.nextRecallStability(d, s, r, g);
      d = nd;
    }
  }
  return log;
}

test('복습 로그를 카드별 시퀀스로 묶는다', () => {
  const log = [
    { id: 'a', t: 300, g: 3 }, { id: 'b', t: 100, g: 1 },
    { id: 'a', t: 100, g: 3 }, { id: 'a', t: 200, g: 2 },
    { id: 'c', t: 50, g: 3 },   // 복습 1회뿐 — 예측할 지점이 없다
  ];
  const seqs = buildSequences(log);
  assert.equal(seqs.length, 1, '복습 2회 이상인 카드만 남아야 한다');
  assert.deepEqual(seqs[0].map((x) => x.t), [100, 200, 300], '시간순 정렬이 안 됐다');
  assert.equal(predictableCount(seqs), 2);
});

test('망가진 로그 항목은 조용히 걸러진다', () => {
  const seqs = buildSequences([null, {}, { id: 'a' }, { id: 'a', t: 1, g: 3 }, { id: 'a', t: 2, g: 3 }]);
  assert.equal(seqs.length, 1);
  assert.equal(seqs[0].length, 2);
});

test('평가는 로그손실·RMSE·캘리브레이션 구간을 낸다', () => {
  const seqs = buildSequences(syntheticLog({}, 60));
  const r = evaluate(FSRS5_DEFAULT_W, seqs);
  assert.ok(r.n > 0);
  assert.ok(r.logLoss > 0 && r.logLoss < 2, `로그손실이 이상하다: ${r.logLoss}`);
  assert.ok(r.rmse > 0 && r.rmse < 1);
  assert.equal(r.bins.length, 10);
  assert.equal(r.bins.reduce((s, b) => s + b.n, 0), r.n, '구간 합이 전체와 다르다');
});

test('표본이 부족하면 준비되지 않았다고 말한다', () => {
  const few = buildSequences(syntheticLog({}, 8));
  const r = readiness(few);
  assert.equal(r.ready, false);
  assert.ok(r.need > 0);

  const many = buildSequences(syntheticLog({}, 240));
  assert.equal(readiness(many).ready, true);
  assert.ok(readiness(many).n >= MIN_REVIEWS);
});

test('평균과 다른 학습자에게서는 검증 세트 예측이 실제로 좋아진다', () => {
  // 남들보다 빨리 잊고 난이도 변화가 큰 사람
  const seqs = buildSequences(syntheticLog({ 8: 0.8, 9: 0.35, 6: 2.4 }, 260));
  const r = optimize(seqs);
  assert.ok(r.split, '학습/검증이 분리되지 않았다');
  assert.ok(r.improvement > 0.02,
    `한 번도 안 본 카드에서 개선이 없다: ${(r.improvement * 100).toFixed(2)}%`);
  assert.ok(r.validCards >= 5 && r.trainCards > r.validCards);
});

test('평균과 같은 학습자에게는 검증 개선을 지어내지 않는다', () => {
  const seqs = buildSequences(syntheticLog({}, 260, 99));
  const r = optimize(seqs);
  // 학습 세트는 거의 항상 좋아진다 — 그게 과적합의 정의다
  assert.ok(r.trainImprovement >= 0);
  // 검증 세트에서는 의미 있는 개선이 나오면 안 된다
  assert.ok(r.improvement < 0.03,
    `기본값이 이미 맞는데 검증 개선을 주장한다: ${(r.improvement * 100).toFixed(2)}%`);
});

test('최적화 결과는 항상 경계 안에 있다', () => {
  const seqs = buildSequences(syntheticLog({ 8: 4.2, 11: 4.5, 16: 5.5 }, 200));
  const r = optimize(seqs);
  assert.equal(r.w.length, 19);
  r.w.forEach((v, i) => {
    const [lo, hi] = PARAM_BOUNDS[i];
    assert.ok(Number.isFinite(v) && v >= lo && v <= hi, `w${i}=${v}가 [${lo}, ${hi}] 밖이다`);
  });
});

test('진행 상황을 단계별로 보고한다 (화면이 멈추지 않도록)', () => {
  const seqs = buildSequences(syntheticLog({ 8: 0.9 }, 120));
  const it = optimizeIterative(seqs, { passes: 4 });
  const seen = [];
  let step = it.next();
  while (!step.done) { seen.push(step.value); step = it.next(); }
  assert.ok(seen.length >= 1 && seen.length <= 4);
  for (const s of seen) {
    assert.ok(s.pass >= 1 && s.passes === 4);
    assert.ok(Number.isFinite(s.logLoss));
    assert.equal(s.w.length, 19);
  }
  // 손실은 패스를 거치며 단조 감소해야 한다 (채택할 때만 갱신하므로)
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].logLoss <= seen[i - 1].logLoss + 1e-12);
  assert.ok(step.value.w.length === 19);
});

test('캘리브레이션은 예측과 실제의 치우침을 알려준다', () => {
  const seqs = buildSequences(syntheticLog({ 8: 0.7, 9: 0.4 }, 220));
  const c = calibration(FSRS5_DEFAULT_W, seqs);
  assert.ok(Number.isFinite(c.bias));
  // 실제보다 잘 기억한다고 예측하는 학습자 → 실제 정답률이 예측보다 낮다 → bias < 0
  assert.ok(c.bias < 0, `치우침 방향이 틀렸다: ${c.bias}`);
  const fitted = optimize(seqs);
  const c2 = calibration(fitted.w, seqs);
  assert.ok(Math.abs(c2.bias) < Math.abs(c.bias), '최적화 후 치우침이 줄지 않았다');
});

test('데이터가 거의 없어도 예외 없이 돌아간다', () => {
  for (const log of [[], syntheticLog({}, 1), syntheticLog({}, 3)]) {
    const seqs = buildSequences(log);
    const r = optimize(seqs, { passes: 2 });
    assert.equal(r.w.length, 19);
    assert.ok(r.w.every(Number.isFinite));
  }
});
