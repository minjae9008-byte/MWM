/**
 * 결정론적 난수 생성기 (seeded RNG).
 * 런(run) 단위로 시드를 고정하면 같은 시드 = 같은 웨이브 구성이 되어
 * 로그라이크의 "시드 공유" 플레이가 가능하다.
 *
 * 순수 로직 — DOM/브라우저 API 의존 없음.
 */

/** 문자열 → 32bit 시드 */
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = Date.now()) {
    this.seed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    this.state = this.seed || 1;
  }

  /** mulberry32 — 빠르고 분포가 준수하다 */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) 실수 */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** [min, max] 정수 */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  bool(p = 0.5) {
    return this.next() < p;
  }

  pick(arr) {
    if (!arr.length) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** 제자리 셔플 (Fisher–Yates) */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * 가중 샘플링 (비복원). weights[i] >= 0.
   * @returns {number[]} 뽑힌 인덱스 배열
   */
  weightedSample(weights, k) {
    const pool = weights.map((w, i) => [i, Math.max(0, w)]);
    const out = [];
    let total = pool.reduce((s, [, w]) => s + w, 0);
    while (out.length < k && pool.length) {
      if (total <= 0) {
        // 모든 가중치가 0이면 균등 추출로 폴백
        const idx = Math.floor(this.next() * pool.length);
        out.push(pool[idx][0]);
        pool.splice(idx, 1);
        continue;
      }
      let r = this.next() * total;
      let chosen = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i][1];
        if (r <= 0) { chosen = i; break; }
      }
      out.push(pool[chosen][0]);
      total -= pool[chosen][1];
      pool.splice(chosen, 1);
    }
    return out;
  }
}

/** 전역 비결정 RNG (연출용 — 게임플레이 판정에는 쓰지 않는다) */
export const fxRandom = {
  next: () => Math.random(),
  range: (a, b) => a + Math.random() * (b - a),
  int: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  bool: (p = 0.5) => Math.random() < p,
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
};
