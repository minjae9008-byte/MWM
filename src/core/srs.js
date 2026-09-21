/**
 * SRS 저장소 + 게임↔알고리즘 변환 계층.
 *
 * 게임에서 일어나는 일(요격 성공/오답/낙하)을 FSRS 평가(1~4)로 번역하고,
 * 학습 단계(learning steps)를 세션 내부에서 관리한다.
 *
 * 왜 두 층인가:
 *  - FSRS는 "며칠 뒤에 다시 볼까"를 푼다 (장기 기억 공고화)
 *  - 학습 단계는 "이번 판 안에서 몇 볼리 뒤에 다시 물을까"를 푼다 (단기 인코딩)
 * Anki도 같은 구조이며, 둘을 섞으면 한 판 안에서도 틀린 단어가 반드시 다시 나온다.
 *
 * 순수 로직 — DOM 의존 없음.
 */

import { FSRS, Rating, State, createCardState, DAY_MS, retrievability } from './fsrs.js';

/** 세션 내 재출제 간격 (단위: 볼리 수). Anki의 learning steps에 대응. */
export const LEARNING_STEPS = [2, 6];    // 신규 카드: 2볼리 뒤, 6볼리 뒤
export const RELEARNING_STEPS = [3];     // 복습 중 실패: 3볼리 뒤

export class SrsStore {
  /**
   * @param {{cards?:Object, fsrs?:FSRS, params?:Object}} init
   */
  constructor(init = {}) {
    /** @type {Record<string, any>} */
    this.cards = init.cards || {};
    this.fsrs = init.fsrs || new FSRS(init.params || {});
    this.log = init.log || [];   // 최근 복습 로그 (재최적화/통계용)
    this.maxLog = 5000;
  }

  get(id, now = Date.now()) {
    let c = this.cards[id];
    if (!c) {
      c = createCardState(id, now);
      this.cards[id] = c;
    }
    return c;
  }

  has(id) {
    return !!this.cards[id];
  }

  /** 지금 복습 예정인 카드 id 목록 */
  dueIds(now = Date.now(), ids = null) {
    const source = ids || Object.keys(this.cards);
    return source.filter((id) => {
      const c = this.cards[id];
      return c && c.state !== State.New && c.due <= now;
    });
  }

  /** 얼마나 밀렸는가 (일). 클수록 급하다. */
  overdueDays(card, now = Date.now()) {
    return (now - card.due) / DAY_MS;
  }

  retrievabilityOf(id, now = Date.now()) {
    const c = this.cards[id];
    if (!c) return 0;
    return this.fsrs.retrievabilityOf(c, now);
  }

  /**
   * 평가 1회 적용.
   * @param {string} id
   * @param {number} rating 1..4
   * @param {{now?:number, volley?:number, reactionMs?:number, assisted?:boolean, rng?:any}} ctx
   * @returns {{card:object, rating:number, intervalDays:number, nextVolley:number|null, graduated:boolean}}
   */
  review(id, rating, ctx = {}) {
    const now = ctx.now ?? Date.now();
    const card = this.get(id, now);
    const prevState = card.state;
    const g = Math.min(Math.max(Math.round(rating), 1), 4);

    const { s, d } = this.fsrs.computeDSR(card, g, now);
    card.s = s;
    card.d = d;
    card.reps += 1;
    card.seen += 1;
    if (g > Rating.Again) card.correct += 1;
    if (ctx.reactionMs != null) {
      card.elapsedAvgMs = card.elapsedAvgMs
        ? card.elapsedAvgMs * 0.7 + ctx.reactionMs * 0.3
        : ctx.reactionMs;
    }

    // --- 상태 기계: new → learning → review ⇄ relearning ---
    let nextVolley = null;
    let graduated = false;
    const volley = ctx.volley ?? 0;

    if (prevState === State.New) {
      card.state = State.Learning;
      card.step = g === Rating.Easy ? LEARNING_STEPS.length : 0;
    } else if (prevState === State.Learning) {
      if (g === Rating.Again) card.step = 0;
      else if (g === Rating.Easy) card.step = LEARNING_STEPS.length;
      else if (g === Rating.Good) card.step += 1;
      // Hard: 같은 단계 반복
    } else if (prevState === State.Review) {
      if (g === Rating.Again) {
        card.lapses += 1;
        card.state = State.Relearning;
        card.step = 0;
      }
    } else if (prevState === State.Relearning) {
      if (g === Rating.Again) card.step = 0;
      else card.step += 1;
    }

    const steps = card.state === State.Relearning ? RELEARNING_STEPS : LEARNING_STEPS;
    if (card.state === State.Learning || card.state === State.Relearning) {
      if (card.step >= steps.length) {
        card.state = State.Review;
        card.step = 0;
        graduated = true;
      } else {
        nextVolley = volley + steps[card.step];
      }
    }

    // --- 장기 일정 확정 ---
    let intervalDays = 0;
    if (card.state === State.Review) {
      intervalDays = this.fsrs.scheduleDays(card.s, ctx.rng);
      card.due = now + intervalDays * DAY_MS;
    } else {
      // 아직 세션 내 학습 중 — 오늘 안에 다시 본다
      card.due = now;
    }
    card.last = now;

    this.log.push({ id, t: now, g, r: Math.round(this.fsrs.retrievabilityOf(card, now) * 1000) / 1000, s: Math.round(s * 1000) / 1000, d: Math.round(d * 100) / 100, ms: ctx.reactionMs || 0 });
    if (this.log.length > this.maxLog) this.log.splice(0, this.log.length - this.maxLog);

    return { card, rating: g, intervalDays, nextVolley, graduated };
  }

  /** 누적 통계 */
  summary(now = Date.now(), ids = null) {
    const keys = ids || Object.keys(this.cards);
    const out = {
      total: keys.length, new: 0, learning: 0, review: 0, relearning: 0,
      due: 0, matured: 0, young: 0, leeches: [], avgStability: 0, avgDifficulty: 0,
    };
    let sSum = 0, dSum = 0, n = 0;
    for (const id of keys) {
      const c = this.cards[id];
      // 한 번도 만나지 않은 단어는 카드 객체 자체가 없다. 그것도 '미학습'이다.
      if (!c || c.state === State.New) { out.new++; continue; }
      out[c.state] = (out[c.state] || 0) + 1;
      if (c.due <= now) out.due++;
      if (c.s >= 21) out.matured++; else out.young++;
      sSum += c.s; dSum += c.d; n++;
      if (c.lapses >= 4) out.leeches.push({ id, lapses: c.lapses, s: c.s, d: c.d });
    }
    out.avgStability = n ? sSum / n : 0;
    out.avgDifficulty = n ? dSum / n : 0;
    out.leeches.sort((a, b) => b.lapses - a.lapses);
    return out;
  }

  /** 향후 N일 복습 예정량 */
  forecast(days = 14, now = Date.now()) {
    const buckets = new Array(days).fill(0);
    for (const id in this.cards) {
      const c = this.cards[id];
      if (c.state === State.New) continue;
      const d = Math.floor((c.due - now) / DAY_MS);
      if (d < 0) buckets[0]++;
      else if (d < days) buckets[d]++;
    }
    return buckets;
  }

  /** 실제 정답률 (true retention) — 복습 카드 첫 시도 기준 */
  trueRetention(sinceMs = 0) {
    let pass = 0, total = 0;
    for (const e of this.log) {
      if (e.t < sinceMs) continue;
      total++;
      if (e.g > Rating.Again) pass++;
    }
    return { pass, total, rate: total ? pass / total : 0 };
  }

  toJSON() {
    return { cards: this.cards, log: this.log };
  }
}

// ---------------------------------------------------------------------
// 게임 이벤트 → FSRS 평가
// ---------------------------------------------------------------------

/**
 * 미사일 커맨드식 상호작용을 평가로 번역한다.
 *
 * 설계 근거:
 *  - 정답을 "얼마나 빨리" 떠올렸는가는 기억 강도의 좋은 프록시다
 *    (retrieval fluency; Benjamin & Bjork). 그래서 반응 시간으로 Good/Easy를 가른다.
 *  - 오답 요격과 낙하(시간 초과)는 둘 다 인출 실패 → Again.
 *  - 스킬(자동 조준 등) 도움을 받았으면 Easy로 올리지 않는다. 내 기억이 아니니까.
 *
 * 여기서 한 가지를 의도적으로 보수적으로 잡았다.
 * FSRS의 기본 파라미터는 Anki 사용자가 **자유 회상**(아무 단서 없이 떠올리기)을
 * 스스로 채점한 데이터로 맞춰져 있다. 그런데 이 게임은 **4지선다 재인**이다.
 * 재인은 자유 회상보다 훨씬 쉽고, 보기 중에 답이 있으면 "알 것 같은" 느낌이
 * 실제 기억보다 부풀려진다. 같은 평가를 그대로 먹이면 안정성이 과대추정되고
 * 복습 간격이 실제 망각보다 길어진다 — 정확히 피하려던 실패다.
 *
 * 그래서 두 가지 제동을 건다:
 *  1) 보기가 적으면(찍어서 맞을 확률이 높으면) Easy를 주지 않는다.
 *  2) 그 단어를 처음 만난 판에서는 Easy를 주지 않는다.
 *     한 번 재인에 성공했다고 2주 뒤로 미루는 건 과신이다.
 *     정말 아는 단어라면 며칠 뒤 한 번 더 맞히고 그때 크게 멀어지면 된다.
 *
 * @param {{correct:boolean, landed:boolean, reactionMs:number, windowMs:number,
 *          assisted?:boolean, revealed?:boolean, options?:number, firstExposure?:boolean}} ev
 * @returns {number} Rating 1..4
 */
export function gradeFromEvent(ev) {
  if (ev.landed || !ev.correct) return Rating.Again;

  const ratio = ev.windowMs > 0 ? ev.reactionMs / ev.windowMs : 1;

  let g;
  if (ratio <= 0.35) g = Rating.Easy;
  else if (ratio <= 0.72) g = Rating.Good;
  else g = Rating.Hard;

  if (g === Rating.Easy) {
    const options = ev.options ?? 4;
    if (options < 4) g = Rating.Good;            // 찍어서 맞을 확률이 너무 높다
    else if (ev.firstExposure) g = Rating.Good;  // 첫 재인만으로 2주를 건너뛰지 않는다
    else if (ev.assisted || ev.revealed) g = Rating.Good;  // 내 기억이 아니다
  }
  return g;
}

export { Rating, State };
