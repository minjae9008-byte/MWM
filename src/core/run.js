/**
 * 런(run) 상태 기계 — 로그라이크 한 판의 모든 상태.
 *
 * 게임 엔진(캔버스/입력)과 완전히 분리되어 있다.
 * 엔진은 "무슨 일이 일어났는지"를 이 클래스에 보고하고,
 * 이 클래스가 점수·콤보·체력·SRS 기록을 결정한다.
 *
 * 순수 로직 — DOM 의존 없음. 테스트 가능하고, Dart로 그대로 옮길 수 있다.
 */

import { RNG } from './rng.js';
import { QuestionScheduler, Direction, AnswerMode } from './scheduler.js';
import { gradeFromEvent, Rating } from './srs.js';
import { computeMods, rollOffers, RELIC_BY_ID, SKILL_BY_ID } from './upgrades.js';
import { waveConfig, scoreFor, comboMultiplier, clamp } from './balance.js';

/**
 * 런 종류.
 *
 * CAMPAIGN  기본 로그라이크. 저장소가 무너지면 끝난다.
 * TRAINING  방어 훈련 — 저장소가 무너지지 않고 웨이브 제한도 없다.
 *           "오늘 밀린 복습을 그냥 비우고 싶은 날"을 위한 모드.
 *           간격 반복은 매일 해야 의미가 있는데, 매번 실패 위험을 감수해야 하면
 *           안 하게 된다. 습관이 알고리즘보다 먼저다.
 * FOCUS     약점 집중 — 자꾸 틀리는 단어만 모아서 짧게 돈다.
 */
export const RunMode = Object.freeze({
  CAMPAIGN: 'campaign',
  TRAINING: 'training',
  FOCUS: 'focus',
});

export const RunPhase = Object.freeze({
  READY: 'ready',
  WAVE: 'wave',
  WAVE_CLEAR: 'waveClear',
  OFFER: 'offer',
  OVER: 'over',
});

export const MAX_CITIES = 6;
export const MAX_FOCUS = 100;

export class Run {
  /**
   * @param {{words:object[], store:any, seed?:number|string, difficulty?:number,
   *          direction?:string, newPerRun?:number, startingSkills?:string[]}} opts
   */
  constructor(opts) {
    this.rng = new RNG(opts.seed ?? Date.now());
    this.seed = this.rng.seed;
    this.store = opts.store;
    this.difficulty = opts.difficulty ?? 1;
    this.mode = opts.mode ?? RunMode.CAMPAIGN;
    this.invulnerable = this.mode === RunMode.TRAINING;

    this.relics = [];
    this.skills = (opts.startingSkills || ['slowfield']).slice();
    this.mods = computeMods(this.relics);

    this.scheduler = new QuestionScheduler({
      words: opts.words,
      store: opts.store,
      rng: this.rng,
      newPerRun: (opts.newPerRun ?? 14) + this.mods.newCardBonus,
      direction: opts.direction ?? Direction.KO_TO_EN,
      answerMode: opts.answerMode ?? AnswerMode.AUTO,
      typingThreshold: opts.typingThreshold ?? 10,
    });

    this.phase = RunPhase.READY;
    this.wave = 0;
    this.cities = MAX_CITIES;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.focus = 0;
    this.shields = 0;
    this.volleysLeftInWave = 0;
    this.volleysThisWave = 0;
    this.offers = [];

    this.effects = { slow: 0, overcharge: 0, reveal: 0, autolock: 0 };
    this.stats = {
      shots: 0, hits: 0, misses: 0, landed: 0, typed: 0,
      correct: 0, wrong: 0, byRating: { 1: 0, 2: 0, 3: 0, 4: 0 },
      newLearned: 0, wordsSeen: new Set(), startedAt: Date.now(),
    };
    this.eventLog = [];
  }

  get config() {
    return waveConfig(this.wave, this.mods, this.difficulty);
  }

  get alive() {
    return this.cities > 0;
  }

  // --- 웨이브 진행 ----------------------------------------------------

  startWave() {
    this.wave += 1;
    const cfg = this.config;
    this.volleysLeftInWave = cfg.volleys;
    this.volleysThisWave = 0;
    this.shields = this.mods.shieldPerWave;
    this.phase = RunPhase.WAVE;
    return cfg;
  }

  /** 이번 웨이브에서 더 내보낼 볼리가 남았는가 */
  hasVolleysLeft() {
    return this.volleysLeftInWave > 0;
  }

  /** 다음 문제를 꺼낸다 */
  nextQuestion(now = Date.now(), opts = {}) {
    if (this.volleysLeftInWave <= 0) return null;
    this.volleysLeftInWave -= 1;
    this.volleysThisWave += 1;
    const cfg = this.config;
    const q = this.scheduler.nextQuestion({ decoys: cfg.decoys, now, allowTyping: opts.allowTyping });
    this.scheduler.advance();
    this.stats.wordsSeen.add(q.word.id);
    if (q.isNew) this.stats.newLearned += 1;
    return { ...q, volleyIndex: this.volleysThisWave, isWaveOpen: this.volleysThisWave <= 3 };
  }

  completeWave() {
    this.phase = RunPhase.WAVE_CLEAR;
    if (this.mods.repairPerWave && this.cities < MAX_CITIES) {
      this.cities = Math.min(MAX_CITIES, this.cities + this.mods.repairPerWave);
    }
    this.offers = rollOffers({
      rng: this.rng,
      owned: new Set(this.relics),
      ownedSkills: new Set(this.skills),
      wave: this.wave,
      mods: this.mods,
    });
    this.phase = RunPhase.OFFER;
    return this.offers;
  }

  /** 웨이브 보상 선택 */
  takeOffer(offerId) {
    const offer = this.offers.find((o) => o.id === offerId);
    if (!offer) return null;
    if (offer.kind === 'skill') {
      if (!this.skills.includes(offer.id)) this.skills.push(offer.id);
    } else if (offer.kind === 'pact') {
      for (const g of offer.grants) if (!this.relics.includes(g)) this.relics.push(g);
      if (!this.relics.includes(offer.curse)) this.relics.push(offer.curse);
    } else {
      if (!this.relics.includes(offer.id)) this.relics.push(offer.id);
    }
    this.mods = computeMods(this.relics);
    this.scheduler.newPerRun = Math.max(this.scheduler.newPerRun, 14 + this.mods.newCardBonus);
    this.offers = [];
    this.phase = RunPhase.WAVE_CLEAR;
    return offer;
  }

  // --- 판정 -----------------------------------------------------------

  /**
   * 볼리 하나가 끝났다. 점수·콤보·SRS를 전부 여기서 정산한다.
   *
   * @param {{question:object, correct:boolean, landed:boolean, reactionMs:number,
   *          windowMs:number, assisted?:boolean, revealed?:boolean, now?:number}} ev
   */
  resolveVolley(ev) {
    const now = ev.now ?? Date.now();
    const q = ev.question;
    const rating = gradeFromEvent({
      ...ev,
      mode: q.mode,
      options: q.options ? q.options.length : 4,
      firstExposure: q.isNew,
    });

    const result = this.store.review(q.word.id, rating, {
      now,
      volley: this.scheduler.volley,
      reactionMs: ev.reactionMs,
      rng: this.rng,
    });
    if (result.nextVolley != null) this.scheduler.schedule(q.word.id, result.nextVolley);

    this.stats.byRating[rating] += 1;

    let gained = 0;
    let damaged = false;
    let shielded = false;

    if (ev.correct && !ev.landed) {
      this.stats.correct += 1;
      if (q.mode === AnswerMode.TYPING) {
        this.stats.typed += 1;
        result.card.typed = (result.card.typed || 0) + 1;
      }
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      gained = scoreFor({
        mods: this.mods,
        combo: this.combo,
        isNew: q.isNew,
        retrievability: q.retrievability,
        reactionMs: ev.reactionMs,
        waveOpen: q.isWaveOpen,
        overcharged: this.effects.overcharge > 0,
        difficulty: this.difficulty,
      });
      this.score += gained;
      this.focus = clamp(this.focus + (6 + Math.min(this.combo, 12) * 0.6) * this.mods.focusGain, 0, MAX_FOCUS);
    } else {
      this.stats[ev.landed ? 'landed' : 'wrong'] += 1;
      this.combo = 0;
      if (this.invulnerable) {
        shielded = true;
      } else if (this.shields > 0) {
        this.shields -= 1;
        shielded = true;
      } else {
        this.cities = Math.max(0, this.cities - 1);
        damaged = true;
        if (this.cities === 0) this.phase = RunPhase.OVER;
      }
    }

    const entry = {
      t: now, word: q.word, rating, correct: ev.correct && !ev.landed,
      landed: !!ev.landed, gained, intervalDays: result.intervalDays,
      chosen: ev.chosen || null, typing: q.mode === AnswerMode.TYPING,
      state: result.card.state, reactionMs: ev.reactionMs, combo: this.combo,
      shielded, damaged, source: q.source,
    };
    this.eventLog.push(entry);
    if (this.eventLog.length > 400) this.eventLog.shift();
    return entry;
  }

  /** 잘못 쏜 탄 (어떤 미사일도 못 맞힘) */
  registerStrayShot() {
    this.stats.shots += 1;
    this.stats.misses += 1;
  }

  registerShot() {
    this.stats.shots += 1;
  }

  registerHit() {
    this.stats.hits += 1;
  }

  // --- 스킬 -----------------------------------------------------------

  canUseSkill(id) {
    const s = SKILL_BY_ID.get(id);
    return !!s && this.skills.includes(id) && this.focus >= s.cost;
  }

  /**
   * 스킬 발동. 실제 효과 적용은 엔진이 반환값을 보고 처리한다.
   * @returns {{id:string, duration:number}|null}
   */
  useSkill(id, now = Date.now()) {
    if (!this.canUseSkill(id)) return null;
    const s = SKILL_BY_ID.get(id);
    this.focus -= s.cost;

    switch (id) {
      case 'slowfield': this.effects.slow = now + s.duration; break;
      case 'overcharge': this.effects.overcharge = now + s.duration; break;
      case 'recall': this.effects.reveal = now + s.duration; break;
      case 'autolock': this.effects.autolock = (s.charges || 2); break;
      case 'repair':
        if (this.cities >= MAX_CITIES) { this.focus += s.cost; return null; }
        this.cities = Math.min(MAX_CITIES, this.cities + 1);
        break;
      default: break;
    }
    return { id, duration: s.duration };
  }

  /** 시간 경과에 따른 효과 만료 처리 */
  tickEffects(now = Date.now()) {
    if (this.effects.slow && this.effects.slow <= now) this.effects.slow = 0;
    if (this.effects.overcharge && this.effects.overcharge <= now) this.effects.overcharge = 0;
    if (this.effects.reveal && this.effects.reveal <= now) this.effects.reveal = 0;
  }

  /** 현재 적용되는 낙하 속도 배수 */
  fallSpeedFactor(now = Date.now()) {
    let f = 1;
    if (this.effects.slow > now) f *= 0.5;
    if (this.cities === 1 && this.mods.lastStandSlow) f *= 1 - this.mods.lastStandSlow;
    return f;
  }

  comboMul() {
    return comboMultiplier(this.combo, this.mods);
  }

  /** 런 종료 요약 */
  summary() {
    const s = this.stats;
    const answered = s.correct + s.wrong + s.landed;
    return {
      score: this.score,
      wave: this.wave,
      maxCombo: this.maxCombo,
      accuracy: answered ? s.correct / answered : 0,
      answered,
      correct: s.correct,
      wrong: s.wrong,
      landed: s.landed,
      newLearned: s.newLearned,
      typed: s.typed,
      mode: this.mode,
      uniqueWords: s.wordsSeen.size,
      byRating: { ...s.byRating },
      relics: this.relics.map((id) => RELIC_BY_ID.get(id)).filter(Boolean),
      skills: this.skills.map((id) => SKILL_BY_ID.get(id)).filter(Boolean),
      durationMs: Date.now() - s.startedAt,
      seed: this.seed,
      log: this.eventLog.slice(-60),
    };
  }
}

export { Direction, AnswerMode, Rating };
