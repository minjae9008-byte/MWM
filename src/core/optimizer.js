/**
 * FSRS 파라미터 개인 최적화.
 *
 * 기본 파라미터 19개는 수많은 Anki 사용자의 평균이다.
 * 나는 평균이 아니다 — 어떤 사람은 남들보다 빨리 잊고, 어떤 사람은 오래 간다.
 * 내 복습 기록으로 파라미터를 다시 맞추면 복습 일정이 내 망각곡선에 붙는다.
 * Anki의 "FSRS 최적화"와 같은 발상이고, 방법도 같다:
 *   기록을 재생하면서 "이때 맞힐 확률"을 예측하고,
 *   실제 결과와의 로그 손실(log loss)을 최소화하는 파라미터를 찾는다.
 *
 * 최적화는 좌표 하강법(coordinate descent)으로 한다.
 * 기울기 기반보다 느리지만 의존성이 없고, 수식을 건드리지 않아도 되며,
 * 파라미터마다 경계가 뚜렷한 이 문제에서는 충분히 잘 수렴한다.
 *
 * 순수 로직 — DOM 의존 없음.
 */

import { FSRS, FSRS5_DEFAULT_W, Rating, retrievability, DAY_MS } from './fsrs.js';

/** 최적화 결과가 믿을 만해지는 최소 표본. 이보다 적으면 과적합이 된다. */
export const MIN_REVIEWS = 300;
export const RECOMMENDED_REVIEWS = 1000;

/**
 * FSRS-5 파라미터 경계.
 * 수식이 발산하거나 의미를 잃는 영역을 막는다.
 */
const BOUNDS = [
  [0.01, 100], [0.01, 100], [0.01, 100], [0.01, 100],   // w0..w3 최초 안정성
  [1, 10], [0.01, 4],                                    // w4, w5 최초 난이도
  [0.01, 4],                                             // w6 난이도 변화량
  [0, 0.75],                                             // w7 평균 회귀
  [0, 4.5], [0, 0.8], [0.01, 3.5],                       // w8..w10 성공 시 안정성
  [0.01, 5], [0.01, 0.25], [0.01, 0.9], [0, 4],          // w11..w14 실패 후 안정성
  [0, 1], [1, 6],                                        // w15, w16
  [0, 2], [0, 2],                                        // w17, w18 당일 복습
];

const clamp = (v, [lo, hi]) => Math.min(Math.max(v, lo), hi);

/**
 * 복습 로그를 카드별 시퀀스로 묶는다.
 * @param {Array<{id:string,t:number,g:number}>} log
 * @returns {Array<Array<{t:number,g:number}>>}
 */
export function buildSequences(log) {
  const byCard = new Map();
  for (const e of log) {
    if (!e || !e.id || !e.t || !e.g) continue;
    if (!byCard.has(e.id)) byCard.set(e.id, []);
    byCard.get(e.id).push({ t: e.t, g: Math.min(Math.max(Math.round(e.g), 1), 4) });
  }
  const out = [];
  for (const seq of byCard.values()) {
    seq.sort((a, b) => a.t - b.t);
    // 첫 복습은 이전 상태가 없어 예측 대상이 아니다.
    // 예측할 지점이 하나도 없는 카드는 학습에 기여하지 못한다.
    if (seq.length >= 2) out.push(seq);
  }
  return out;
}

/** 시퀀스들에서 실제로 예측하게 되는 복습 횟수 */
export function predictableCount(sequences) {
  return sequences.reduce((n, s) => n + s.length - 1, 0);
}

/**
 * 파라미터 w로 기록을 재생하며 로그 손실과 캘리브레이션을 계산한다.
 *
 * @returns {{logLoss:number, n:number, rmse:number, bins:Array}}
 */
export function evaluate(w, sequences, { bins = 10 } = {}) {
  const f = new FSRS({ w, enableFuzz: false });
  let loss = 0;
  let n = 0;
  let sqErr = 0;
  const hist = Array.from({ length: bins }, () => ({ sum: 0, pass: 0, n: 0 }));

  for (const seq of sequences) {
    // 첫 복습으로 상태를 연다
    let s = f.initStability(seq[0].g);
    let d = f.initDifficulty(seq[0].g);
    let last = seq[0].t;

    for (let i = 1; i < seq.length; i++) {
      const { t, g } = seq[i];
      const elapsedDays = Math.max(0, (t - last) / DAY_MS);
      const r = retrievability(elapsedDays, s);
      const p = Math.min(Math.max(r, 1e-6), 1 - 1e-6);
      const actual = g > Rating.Again ? 1 : 0;

      loss -= actual ? Math.log(p) : Math.log(1 - p);
      sqErr += (p - actual) ** 2;
      n += 1;

      const b = Math.min(bins - 1, Math.floor(p * bins));
      hist[b].sum += p;
      hist[b].pass += actual;
      hist[b].n += 1;

      // 상태 갱신 — 게임의 실제 동작과 같은 경로를 탄다
      const nd = f.nextDifficulty(d, g);
      let ns;
      if (elapsedDays < 1) ns = f.shortTermStability(s, g);
      else if (g === Rating.Again) ns = f.nextForgetStability(d, s, r);
      else ns = f.nextRecallStability(d, s, r, g);
      s = ns;
      d = nd;
      last = t;
    }
  }

  return {
    logLoss: n ? loss / n : Infinity,
    rmse: n ? Math.sqrt(sqErr / n) : 1,
    n,
    bins: hist.map((b, i) => ({
      lo: i / bins,
      hi: (i + 1) / bins,
      predicted: b.n ? b.sum / b.n : null,
      actual: b.n ? b.pass / b.n : null,
      n: b.n,
    })),
  };
}

/**
 * 좌표 하강법으로 파라미터를 맞춘다.
 *
 * 한 번에 한 파라미터만 위아래로 흔들어 보고, 손실이 줄면 채택한다.
 * 전체를 한 바퀴 돌 때마다 보폭을 줄인다.
 *
 * 제너레이터로 만든 이유: 브라우저에서 돌릴 때 한 패스마다 양보해
 * 화면이 멈추지 않게 하기 위해서다.
 *
 * @param {Array} sequences
 * @param {{w0?:number[], passes?:number}} opts
 * @yields {{pass:number, passes:number, logLoss:number, w:number[]}}
 * @returns {{w:number[], logLoss:number, baseline:number, improvement:number, n:number}}
 */
export function* optimizeIterative(sequences, opts = {}) {
  const passes = opts.passes ?? 12;
  let w = (opts.w0 || FSRS5_DEFAULT_W).slice();

  // 학습/검증 분리.
  // 최적화는 항상 학습 데이터의 손실을 줄인다 — 그건 개선의 증거가 아니라 당연한 결과다.
  // 한 번도 안 본 카드에서도 예측이 나아져야 진짜 개선이다.
  // 카드 단위로 나눈다(복습 단위가 아니라): 같은 카드의 앞뒤 복습이
  // 양쪽에 나뉘면 검증 세트가 오염된다.
  const holdout = opts.holdout ?? 0.25;
  const shuffled = sequences.slice();
  let seed = 20260923;
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const cut = Math.floor(shuffled.length * (1 - holdout));
  const canSplit = holdout > 0 && cut >= 10 && shuffled.length - cut >= 5;
  const train = canSplit ? shuffled.slice(0, cut) : shuffled;
  const valid = canSplit ? shuffled.slice(cut) : shuffled;

  const baseline = evaluate(FSRS5_DEFAULT_W, train).logLoss;
  const baselineValid = evaluate(FSRS5_DEFAULT_W, valid).logLoss;
  let best = evaluate(w, train).logLoss;

  // 파라미터마다 크기가 천차만별이라 보폭을 경계 폭에 비례시킨다
  let scale = 0.35;

  for (let pass = 0; pass < passes; pass++) {
    let improved = false;

    for (let i = 0; i < w.length; i++) {
      const [lo, hi] = BOUNDS[i];
      const step = (hi - lo) * scale;
      if (step <= 0) continue;

      for (const delta of [step, -step]) {
        const cand = w.slice();
        cand[i] = clamp(cand[i] + delta, BOUNDS[i]);
        if (cand[i] === w[i]) continue;
        const score = evaluate(cand, train).logLoss;
        if (score < best - 1e-9) {
          w = cand;
          best = score;
          improved = true;
          break;
        }
      }
    }

    yield { pass: pass + 1, passes, logLoss: best, w: w.slice() };
    scale *= improved ? 0.72 : 0.45;
    if (scale < 1e-4) break;
  }

  const validLoss = evaluate(w, valid).logLoss;
  return {
    w,
    logLoss: best,
    baseline,
    validLoss,
    baselineValid,
    // 보고하는 개선률은 검증 세트 기준이다. 학습 세트 수치는 언제나 좋아 보인다.
    improvement: baselineValid > 0 ? (baselineValid - validLoss) / baselineValid : 0,
    trainImprovement: baseline > 0 ? (baseline - best) / baseline : 0,
    split: canSplit,
    trainCards: train.length,
    validCards: valid.length,
    n: predictableCount(sequences),
  };
}

/** 동기 실행 편의 래퍼 (테스트용) */
export function optimize(sequences, opts = {}) {
  const it = optimizeIterative(sequences, opts);
  let step = it.next();
  while (!step.done) step = it.next();
  return step.value;
}

/**
 * 지금 설정이 내 실제 성적과 얼마나 맞는지.
 * 예측 확률과 실제 정답률이 어긋나면 목표 유지율을 조정할 근거가 된다.
 */
export function calibration(w, sequences) {
  const r = evaluate(w, sequences);
  const valid = r.bins.filter((b) => b.n >= 5);
  const bias = valid.length
    ? valid.reduce((s, b) => s + (b.actual - b.predicted) * b.n, 0) / valid.reduce((s, b) => s + b.n, 0)
    : 0;
  return { ...r, bias };
}

/**
 * 표본이 최적화에 쓸 만한가.
 */
export function readiness(sequences) {
  const n = predictableCount(sequences);
  return {
    n,
    cards: sequences.length,
    ready: n >= MIN_REVIEWS,
    strong: n >= RECOMMENDED_REVIEWS,
    need: Math.max(0, MIN_REVIEWS - n),
  };
}

export { FSRS5_DEFAULT_W, BOUNDS as PARAM_BOUNDS };
