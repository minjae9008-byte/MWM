/**
 * FSRS-5 (Free Spaced Repetition Scheduler, v5)
 * ------------------------------------------------------------------
 * Anki 23.10+ 의 기본 스케줄러와 동일한 수식을 구현한 것.
 * DSR 모델: 카드 상태를 3개 변수로 기술한다.
 *
 *   S (Stability)      기억 안정성. R이 90%로 떨어지기까지 걸리는 일수.
 *   D (Difficulty)     난이도 1~10. 같은 복습에도 S가 덜 오르게 만드는 계수.
 *   R (Retrievability) 지금 이 순간 떠올릴 수 있을 확률.
 *
 * 망각곡선(FSRS-4.5 이후 power law):
 *   R(t, S) = (1 + FACTOR · t / S) ^ DECAY,  DECAY = -0.5
 *
 * power law는 지수함수보다 실제 인간 망각 데이터에 훨씬 잘 맞는다
 * (Wixted & Carpenter, 2007). FSRS가 SM-2보다 정확한 핵심 이유.
 *
 * 순수 로직 — DOM/브라우저 API 의존 없음. Dart 포팅 대상.
 */

export const DAY_MS = 86400000;

/** FSRS-5 기본 파라미터 (19개). 사용자 복습 로그로 재최적화 가능. */
export const FSRS5_DEFAULT_W = Object.freeze([
  0.40255, 1.18385, 3.173, 15.69105,   // w0..w3  : 최초 안정성 (Again/Hard/Good/Easy)
  7.1949, 0.5345,                       // w4, w5  : 최초 난이도
  1.4604,                               // w6      : 난이도 변화량
  0.0046,                               // w7      : 평균 회귀 계수
  1.54575, 0.1192, 1.01925,             // w8..w10 : 성공 시 안정성 증가
  1.9395, 0.11, 0.29605, 2.2698,        // w11..w14: 실패 후 안정성
  0.2315, 2.9898,                       // w15, w16: Hard 페널티 / Easy 보너스
  0.51655, 0.6621,                      // w17, w18: 당일 재복습(short-term)
]);

const DECAY = -0.5;
/** FACTOR = 0.9^(1/DECAY) - 1 = 19/81 */
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;

export const Rating = Object.freeze({ Again: 1, Hard: 2, Good: 3, Easy: 4 });
export const RATING_LABEL = Object.freeze({ 1: '다시', 2: '어려움', 3: '보통', 4: '쉬움' });
export const State = Object.freeze({
  New: 'new',
  Learning: 'learning',
  Review: 'review',
  Relearning: 'relearning',
});

const clampD = (d) => Math.min(Math.max(d, 1), 10);
const clampS = (s) => Math.min(Math.max(s, 0.01), 36500);

/**
 * 망각곡선: 마지막 복습 후 t일이 지났을 때 회상 확률.
 * @param {number} elapsedDays
 * @param {number} stability
 * @returns {number} 0..1
 */
export function retrievability(elapsedDays, stability) {
  if (!(stability > 0)) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

/**
 * 목표 기억유지율을 달성하는 복습 간격(일).
 * requestRetention=0.9 이면 정확히 S일이 나온다.
 */
export function intervalForRetention(stability, requestRetention = 0.9) {
  const r = Math.min(Math.max(requestRetention, 0.7), 0.99);
  return (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1);
}

/** 새 카드 상태 객체 */
export function createCardState(id, now = Date.now()) {
  return {
    id,
    s: 0,             // stability (days)
    d: 0,             // difficulty 1..10
    due: now,         // 다음 복습 예정 시각 (ms)
    last: 0,          // 마지막 복습 시각 (ms), 0 = 미복습
    reps: 0,
    lapses: 0,
    state: State.New,
    step: 0,          // learning/relearning 단계 인덱스
    elapsedAvgMs: 0,  // 평균 반응 시간 (게임 고유 지표)
    seen: 0,          // 총 노출 횟수
    correct: 0,       // 정답 횟수
  };
}

export class FSRS {
  /**
   * @param {{w?:number[], requestRetention?:number, maximumInterval?:number, enableFuzz?:boolean}} opts
   */
  constructor(opts = {}) {
    this.w = (opts.w && opts.w.length === 19) ? opts.w.slice() : FSRS5_DEFAULT_W.slice();
    this.requestRetention = opts.requestRetention ?? 0.9;
    this.maximumInterval = opts.maximumInterval ?? 3650;
    this.enableFuzz = opts.enableFuzz ?? true;
  }

  // ---- 초기값 -------------------------------------------------------

  initStability(g) {
    return clampS(this.w[g - 1]);
  }

  initDifficulty(g) {
    return clampD(this.w[4] - Math.exp(this.w[5] * (g - 1)) + 1);
  }

  // ---- 갱신 수식 ----------------------------------------------------

  /**
   * 난이도 갱신: 선형 감쇠 + Easy 초기값으로의 평균 회귀.
   * 감쇠가 있어 D가 10에 붙어버리는 "ease hell"을 방지한다.
   */
  nextDifficulty(d, g) {
    const delta = -this.w[6] * (g - 3);
    const damped = d + delta * ((10 - d) / 9);
    const reverted = this.w[7] * this.initDifficulty(Rating.Easy) + (1 - this.w[7]) * damped;
    return clampD(reverted);
  }

  /** 성공(Hard/Good/Easy) 시 안정성 증가. R이 낮을수록 증가폭이 크다 = 간격 효과. */
  nextRecallStability(d, s, r, g) {
    const hardPenalty = g === Rating.Hard ? this.w[15] : 1;
    const easyBonus = g === Rating.Easy ? this.w[16] : 1;
    return clampS(
      s * (1 + Math.exp(this.w[8])
        * (11 - d)
        * Math.pow(s, -this.w[9])
        * (Math.exp((1 - r) * this.w[10]) - 1)
        * hardPenalty
        * easyBonus)
    );
  }

  /** 실패(Again) 후 안정성. 기존 S를 넘지 않도록 clamp. */
  nextForgetStability(d, s, r) {
    const post = this.w[11]
      * Math.pow(d, -this.w[12])
      * (Math.pow(s + 1, this.w[13]) - 1)
      * Math.exp((1 - r) * this.w[14]);
    return clampS(Math.min(post, s));
  }

  /** 같은 날 재복습(FSRS-5 신규). 게임 내 즉시 재출제가 여기에 해당한다. */
  shortTermStability(s, g) {
    return clampS(s * Math.exp(this.w[17] * (g - 3 + this.w[18])));
  }

  // ---- 공개 API -----------------------------------------------------

  /**
   * 카드의 현재 회상 확률.
   */
  retrievabilityOf(card, now = Date.now()) {
    if (!card.last || card.s <= 0) return 0;
    return retrievability((now - card.last) / DAY_MS, card.s);
  }

  /**
   * 평가를 적용해 S/D를 갱신한 새 {s, d}를 반환. (순수 함수)
   */
  computeDSR(card, rating, now = Date.now()) {
    const g = Math.min(Math.max(Math.round(rating), 1), 4);

    if (!card.last || card.s <= 0) {
      return { s: this.initStability(g), d: this.initDifficulty(g), r: 0 };
    }

    const elapsedDays = Math.max(0, (now - card.last) / DAY_MS);
    const r = retrievability(elapsedDays, card.s);
    const d = this.nextDifficulty(card.d, g);

    let s;
    if (elapsedDays < 1) {
      // 같은 날(=게임 세션 내) 재복습
      s = this.shortTermStability(card.s, g);
    } else if (g === Rating.Again) {
      s = this.nextForgetStability(card.d, card.s, r);
    } else {
      s = this.nextRecallStability(card.d, card.s, r, g);
    }
    return { s, d, r };
  }

  /** 안정성 → 다음 복습까지의 일수 (정수, fuzz 적용) */
  scheduleDays(stability, rng = null) {
    let days = intervalForRetention(stability, this.requestRetention);
    days = Math.min(Math.max(Math.round(days), 1), this.maximumInterval);
    if (this.enableFuzz && days >= 3) {
      const f = fuzzRange(days);
      const u = rng ? rng.next() : Math.random();
      days = Math.round(f.min + u * (f.max - f.min));
      days = Math.min(Math.max(days, 1), this.maximumInterval);
    }
    return days;
  }

  /**
   * 네 가지 평가 각각에 대한 예상 간격 — UI 미리보기용.
   */
  preview(card, now = Date.now()) {
    const out = {};
    for (const g of [1, 2, 3, 4]) {
      const { s } = this.computeDSR(card, g, now);
      out[g] = this.scheduleDays(s);
    }
    return out;
  }
}

/**
 * Anki와 동일한 fuzz 규칙 — 같은 날 복습이 무더기로 몰리는 것을 방지.
 */
export function fuzzRange(days) {
  if (days < 2.5) return { min: days, max: days };
  let delta = 1;
  for (const [start, end, factor] of [[2.5, 7, 0.15], [7, 20, 0.1], [20, Infinity, 0.05]]) {
    delta += factor * Math.max(0, Math.min(days, end) - start);
  }
  return { min: Math.max(2, Math.round(days - delta)), max: Math.round(days + delta) };
}

/** 일수 → 사람이 읽는 문자열 */
export function formatInterval(days) {
  if (days < 1) return '오늘';
  if (days < 30) return `${Math.round(days)}일`;
  if (days < 365) return `${(days / 30).toFixed(1)}개월`;
  return `${(days / 365).toFixed(1)}년`;
}
