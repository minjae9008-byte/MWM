/**
 * 출제 스케줄러 — "지금 어떤 단어를, 어떤 오답과 함께 떨어뜨릴 것인가".
 *
 * 우선순위 (높은 것부터):
 *   1) 세션 내 재출제 예약 (틀린 단어 — 학습 단계)
 *   2) 기한이 지난 복습 카드 (밀린 정도 순)
 *   3) 신규 카드 (런당 상한 있음)
 *   4) 회상 확률(R)이 가장 낮은 카드 — 재료가 떨어졌을 때의 추가 연습
 *
 * 오답(디코이) 선택이 학습의 절반이다:
 *   무작위 오답은 너무 쉬워서 "대충 훑고 찍기"를 유발한다.
 *   같은 품사·같은 주제·비슷한 철자를 섞으면 변별 학습(discrimination learning)이
 *   강제되고, 실제로 헷갈리는 단어쌍이 분리된다.
 *
 * 순수 로직 — DOM 의존 없음.
 */

import { State, DAY_MS } from './fsrs.js';

/** 즐겨찾기 가산점 — 하루치만큼 더 밀린 것으로 친다 */
const DAY_BOOST = DAY_MS;

export const Direction = Object.freeze({
  KO_TO_EN: 'ko2en',   // 뜻 보고 영단어 맞히기 (인출 강도 ↑)
  EN_TO_KO: 'en2ko',   // 영단어 보고 뜻 맞히기 (인식 — 더 쉬움)
  MIXED: 'mixed',
});

/**
 * 출제 형식.
 *
 * CHOICE  4지선다 재인 — 빠르고 부담이 적다
 * TYPING  철자 입력 자유 회상 — 훨씬 강하게 남지만 느리고 어렵다
 * AUTO    기억이 자리 잡은 단어부터 타이핑으로 승급시킨다
 *
 * AUTO가 기본인 이유: 처음 보는 단어에 철자를 요구하면 좌절만 남는다.
 * 재인으로 시작해서, 안정성이 임계치를 넘으면 회상으로 올린다.
 * 난이도를 기억 상태에 맞추는 것 자체가 학습 원리다 (desirable difficulty).
 */
export const AnswerMode = Object.freeze({
  CHOICE: 'choice',
  TYPING: 'typing',
  AUTO: 'auto',
});

export class QuestionScheduler {
  /**
   * @param {{words:object[], store:import('./srs.js').SrsStore, rng:import('./rng.js').RNG,
   *          newPerRun?:number, direction?:string, minGap?:number}} opts
   */
  constructor(opts) {
    this.words = opts.words;
    this.byId = new Map(this.words.map((w) => [w.id, w]));
    // 뜻이 같은 단어 묶음.
    // "눈" 처럼 한 뜻에 여러 영단어가 걸리면, 철자 입력에서 어느 쪽을 써도 맞아야 한다.
    // 내장 덱은 뜻을 갈라 두었지만 사용자 단어장은 그럴 수 없으니 구조로 받아 준다.
    this.byMeaning = new Map();
    for (const w of this.words) {
      const k = w.ko.trim();
      if (!this.byMeaning.has(k)) this.byMeaning.set(k, []);
      this.byMeaning.get(k).push(w);
    }
    this.store = opts.store;
    this.rng = opts.rng;
    this.newPerRun = opts.newPerRun ?? 12;
    this.direction = opts.direction ?? Direction.KO_TO_EN;
    this.answerMode = opts.answerMode ?? AnswerMode.AUTO;
    this.typingThreshold = opts.typingThreshold ?? 10;   // 안정성(일) 임계치
    this.minGap = opts.minGap ?? 4;        // 같은 단어 재등장 최소 간격(볼리)
    // 학습 단계(틀린 단어 재출제)는 minGap보다 짧을 수 있다.
    // 그 예약까지 minGap으로 막으면 "이번 판 안에 반드시 다시 나온다"는 약속이 깨진다.
    // 대신 바로 직전 문제로는 나오지 않도록 최소한의 가드만 둔다 — 작업기억에 남아 있으면
    // 인출이 아니라 따라 읽기가 되어 버리므로.
    this.relearnGap = opts.relearnGap ?? 2;

    this.volley = 0;
    this.newIntroduced = 0;
    this.pending = [];                     // {id, dueVolley} 세션 내 재출제 예약
    this.recent = [];                      // 최근 출제 id (중복 방지)
    this.asked = new Map();                // id -> 출제 횟수
  }

  /** 다음 볼리로 넘어간다 */
  advance() {
    this.volley += 1;
  }

  /** 세션 내 재출제 예약 */
  schedule(id, dueVolley) {
    this.pending = this.pending.filter((p) => p.id !== id);
    this.pending.push({ id, dueVolley });
  }

  /** 보류(suspend)한 단어는 어떤 경로로도 출제되지 않는다 */
  _suspended(id) {
    const c = this.store.cards[id];
    return !!(c && c.suspended);
  }

  _isRecent(id, span = this.minGap) {
    if (span >= this.recent.length) return this.recent.includes(id);
    return this.recent.slice(-span).includes(id);
  }

  _markAsked(id) {
    this.recent.push(id);
    if (this.recent.length > this.minGap) this.recent.shift();
    this.asked.set(id, (this.asked.get(id) || 0) + 1);
  }

  /** 다음에 물을 단어 하나를 고른다 */
  pickTarget(now = Date.now()) {
    // 1) 재출제 예약분
    const ready = this.pending
      .filter((p) => p.dueVolley <= this.volley && !this._suspended(p.id)
        && !this._isRecent(p.id, this.relearnGap))
      .sort((a, b) => a.dueVolley - b.dueVolley);
    if (ready.length) {
      const p = ready[0];
      this.pending = this.pending.filter((x) => x !== p);
      const w = this.byId.get(p.id);
      if (w) { this._markAsked(w.id); return { word: w, source: 'relearn' }; }
    }

    // 2) 기한 지난 복습 카드
    const due = [];
    for (const w of this.words) {
      if (this._isRecent(w.id)) continue;
      const c = this.store.cards[w.id];
      if (!c || c.state === State.New || c.suspended) continue;
      // 즐겨찾기한 단어는 하루치 앞당겨 온 것처럼 취급해 먼저 나오게 한다
      if (c.due <= now) due.push({ w, over: (now - c.due) + (c.starred ? DAY_BOOST : 0) });
    }
    if (due.length) {
      due.sort((a, b) => b.over - a.over);
      // 즐겨찾기는 "이걸 먼저 보여 달라"는 명시적 지시다.
      // 상위권 무작위 추출에 섞어 버리면 지시가 확률로 희석된다.
      const starredDue = due.filter(({ w }) => this.store.cards[w.id]?.starred);
      const ranked = starredDue.length ? starredDue : due;
      // 그 안에서는 약간 섞는다 — 매번 같은 순서로 나오면 순서 자체를 외워버린다
      const pool = ranked.slice(0, Math.max(1, Math.min(8, ranked.length)));
      const pick = this.rng.pick(pool);
      this._markAsked(pick.w.id);
      return { word: pick.w, source: 'due' };
    }

    // 3) 신규 카드
    if (this.newIntroduced < this.newPerRun) {
      const fresh = this.words.filter((w) => !this.store.has(w.id) && !this._isRecent(w.id));
      if (fresh.length) {
        const w = this.rng.pick(fresh);
        this.newIntroduced += 1;
        this._markAsked(w.id);
        return { word: w, source: 'new' };
      }
    }

    // 4) 추가 연습 — R이 가장 낮은 카드부터
    const scored = this.words
      .filter((w) => !this._isRecent(w.id) && !this._suspended(w.id))
      .map((w) => ({ w, r: this.store.has(w.id) ? this.store.retrievabilityOf(w.id, now) : 0.5 }))
      .sort((a, b) => a.r - b.r);
    const pool = scored.slice(0, Math.max(1, Math.min(10, scored.length)));
    const pick = this.rng.pick(pool) || { w: this.rng.pick(this.words) };
    this._markAsked(pick.w.id);
    return { word: pick.w, source: 'practice' };
  }

  /**
   * 오답 후보 점수 — 높을수록 "헷갈릴 만한" 단어.
   */
  _confusability(target, cand, now) {
    if (cand.id === target.id) return -1;
    let score = 1;
    if (cand.pos && cand.pos === target.pos) score += 2.2;
    const shared = cand.tags.filter((t) => target.tags.includes(t)).length;
    score += shared * 2.0;

    // 철자 유사도 — 앞 글자 일치 / 길이 근접
    if (cand.en[0].toLowerCase() === target.en[0].toLowerCase()) score += 1.4;
    if (cand.en.length >= 3 && target.en.length >= 3
        && cand.en.slice(0, 3).toLowerCase() === target.en.slice(0, 3).toLowerCase()) score += 1.6;
    const lenDiff = Math.abs(cand.en.length - target.en.length);
    score += Math.max(0, 1.2 - lenDiff * 0.25);

    // 자주 틀리는 단어를 오답으로 섞으면 간접 노출 효과가 생긴다
    const c = this.store.cards[cand.id];
    if (c) {
      if (c.lapses > 0) score += Math.min(c.lapses * 0.6, 2.0);
      const r = this.store.retrievabilityOf(cand.id, now);
      if (r < 0.7) score += 0.8;
    }
    return score;
  }

  /** 오답 n개 선택 */
  pickDecoys(target, n, now = Date.now()) {
    const cands = this.words.filter((w) => w.id !== target.id && w.ko !== target.ko);
    if (cands.length <= n) return cands.slice();
    const weights = cands.map((c) => Math.pow(Math.max(0.05, this._confusability(target, c, now)), 1.8));
    const idx = this.rng.weightedSample(weights, n);
    return idx.map((i) => cands[i]);
  }

  /**
   * 완성된 문제 하나.
   * @param {{decoys?:number, now?:number}} opts
   */
  nextQuestion(opts = {}) {
    const now = opts.now ?? Date.now();
    const decoyCount = opts.decoys ?? 3;
    const { word, source } = this.pickTarget(now);

    let dir = this.direction;
    if (dir === Direction.MIXED) dir = this.rng.bool(0.6) ? Direction.KO_TO_EN : Direction.EN_TO_KO;

    const card = this.store.cards[word.id];
    const mode = this.modeFor(word, card, dir, opts.allowTyping !== false);

    const extra = this.pickDecoys(word, decoyCount + 2, now);
    const decoys = extra.slice(0, decoyCount);
    const spares = extra.slice(decoyCount);
    const promptOf = (w) => (dir === Direction.KO_TO_EN ? w.ko : w.en);
    const answerOf = (w) => (dir === Direction.KO_TO_EN ? w.en : w.ko);

    const options = [
      { word, text: answerOf(word), correct: true },
      ...decoys.map((d) => ({ word: d, text: answerOf(d), correct: false })),
    ];
    this.rng.shuffle(options);

    // 프롬프트가 같은 뜻이면 어느 영단어를 써도 정답이다
    const synonyms = dir === Direction.KO_TO_EN
      ? (this.byMeaning.get(word.ko.trim()) || []).filter((w) => w.id !== word.id).map((w) => w.en)
      : [];

    return {
      word,
      source,
      direction: dir,
      mode,
      prompt: promptOf(word),
      answer: answerOf(word),
      accept: synonyms,
      options,
      spares,
      isNew: !card || card.state === State.New,
      lapses: card ? card.lapses : 0,
      starred: !!(card && card.starred),
      retrievability: card ? this.store.retrievabilityOf(word.id, now) : 0,
    };
  }

  /**
   * 이 단어를 지금 어떤 형식으로 물을 것인가.
   *
   * 타이핑은 한국어 뜻을 보고 영단어를 쓰는 방향에서만 쓴다.
   * 반대 방향(영단어 → 뜻)은 정답이 여러 개라 철자 채점이 불가능하다.
   * 그리고 한 번도 본 적 없는 단어에는 절대 철자를 요구하지 않는다.
   */
  modeFor(word, card, dir, allowTyping = true) {
    if (!allowTyping) return AnswerMode.CHOICE;
    if (this.answerMode === AnswerMode.CHOICE) return AnswerMode.CHOICE;
    if (dir !== Direction.KO_TO_EN) return AnswerMode.CHOICE;
    if (!/[a-zA-Z]/.test(word.en)) return AnswerMode.CHOICE;
    if (!card || card.reps < 1) return AnswerMode.CHOICE;   // 처음 보는 단어는 재인부터

    if (this.answerMode === AnswerMode.TYPING) return AnswerMode.TYPING;
    // AUTO: 기억이 자리 잡은 단어만 회상으로 승급
    return card.s >= this.typingThreshold ? AnswerMode.TYPING : AnswerMode.CHOICE;
  }

  /** 이번 런의 진행 상황 */
  progress() {
    return {
      volley: this.volley,
      newIntroduced: this.newIntroduced,
      newRemaining: Math.max(0, this.newPerRun - this.newIntroduced),
      pending: this.pending.length,
      uniqueAsked: this.asked.size,
    };
  }
}
