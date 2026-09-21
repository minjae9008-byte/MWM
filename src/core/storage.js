/**
 * 영속 저장소.
 *
 * 코어는 저장 매체를 모른다 — 인터페이스만 안다.
 * 웹에서는 localStorage, Flutter로 옮기면 shared_preferences / sqflite가
 * 같은 자리에 꽂히면 된다.
 */

export const PROFILE_VERSION = 1;

export function defaultSettings() {
  return {
    deckIds: ['basic'],
    direction: 'ko2en',
    difficulty: 'normal',
    newPerRun: 14,
    requestRetention: 0.9,
    sound: true,
    tts: true,
    reduceMotion: false,
    showRomaja: false,
    fontScale: 1,
    gradeOnPractice: true,
  };
}

export function defaultProfile() {
  return {
    version: PROFILE_VERSION,
    createdAt: Date.now(),
    settings: defaultSettings(),
    cards: {},
    log: [],
    customDecks: [],
    meta: {
      runs: 0,
      bestScore: 0,
      bestWave: 0,
      bestCombo: 0,
      totalReviews: 0,
      totalPlayMs: 0,
      daily: {},          // 'YYYY-MM-DD' -> {reviews, correct, newLearned, ms}
      lastPlayed: 0,
      streak: 0,
    },
  };
}

/**
 * 메모리 어댑터 — 저장 매체가 없을 때의 기본값.
 * 브라우저 저장은 src/platform/webStorage.js 가 담당한다.
 */
export class MemoryAdapter {
  constructor() { this.data = null; }
  read() { return this.data; }
  write(d) { this.data = d; return true; }
  clear() { this.data = null; }
}

export class Profile {
  constructor(adapter) {
    this.adapter = adapter || new MemoryAdapter();
    this.data = migrate(this.adapter.read()) || defaultProfile();
    this._dirty = false;
    this._timer = null;
  }

  get settings() { return this.data.settings; }
  get meta() { return this.data.meta; }

  /** 잦은 쓰기를 모아서 처리 — 볼리마다 직렬화하면 프레임이 튄다 */
  markDirty() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._dirty) this.save();
    }, 1200);
  }

  save() {
    this._dirty = false;
    return this.adapter.write(this.data);
  }

  flush() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._dirty) this.save();
  }

  updateSettings(patch) {
    Object.assign(this.data.settings, patch);
    this.markDirty();
  }

  /** 런 종료 결과를 누적 통계에 반영 */
  recordRun(summary) {
    const m = this.data.meta;
    m.runs += 1;
    m.bestScore = Math.max(m.bestScore, summary.score);
    m.bestWave = Math.max(m.bestWave, summary.wave);
    m.bestCombo = Math.max(m.bestCombo, summary.maxCombo);
    m.totalReviews += summary.answered;
    m.totalPlayMs += summary.durationMs;

    const key = dayKey(Date.now());
    const d = m.daily[key] || { reviews: 0, correct: 0, newLearned: 0, ms: 0, runs: 0 };
    d.reviews += summary.answered;
    d.correct += summary.correct;
    d.newLearned += summary.newLearned;
    d.ms += summary.durationMs;
    d.runs += 1;
    m.daily[key] = d;

    // 연속 학습일 계산
    const yesterday = dayKey(Date.now() - 86400000);
    if (m.lastPlayed) {
      const last = dayKey(m.lastPlayed);
      if (last === key) { /* 같은 날 — 유지 */ }
      else if (last === yesterday) m.streak += 1;
      else m.streak = 1;
    } else {
      m.streak = 1;
    }
    m.lastPlayed = Date.now();

    // 일간 기록은 1년치만 유지
    const keys = Object.keys(m.daily).sort();
    if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete m.daily[k];

    this.save();
  }

  exportJSON() {
    return JSON.stringify({ ...this.data, exportedAt: Date.now() }, null, 2);
  }

  /**
   * 백업 가져오기.
   * @param {string} json
   * @param {'replace'|'merge'} mode  merge는 더 많이 복습한 카드를 남긴다
   */
  importJSON(json, mode = 'merge') {
    const incoming = migrate(JSON.parse(json));
    if (!incoming || typeof incoming !== 'object') throw new Error('형식이 올바르지 않습니다.');

    if (mode === 'replace') {
      this.data = incoming;
    } else {
      for (const [id, card] of Object.entries(incoming.cards || {})) {
        const mine = this.data.cards[id];
        if (!mine || (card.reps || 0) > (mine.reps || 0)) this.data.cards[id] = card;
      }
      this.data.log = [...(this.data.log || []), ...(incoming.log || [])]
        .sort((a, b) => a.t - b.t).slice(-5000);
      for (const d of incoming.customDecks || []) {
        if (!this.data.customDecks.some((x) => x.id === d.id)) this.data.customDecks.push(d);
      }
      const m = incoming.meta || {};
      this.data.meta.bestScore = Math.max(this.data.meta.bestScore, m.bestScore || 0);
      this.data.meta.bestWave = Math.max(this.data.meta.bestWave, m.bestWave || 0);
      this.data.meta.bestCombo = Math.max(this.data.meta.bestCombo, m.bestCombo || 0);
      this.data.meta.runs += m.runs || 0;
      for (const [k, v] of Object.entries(m.daily || {})) {
        const cur = this.data.meta.daily[k];
        if (!cur) this.data.meta.daily[k] = v;
        else { cur.reviews += v.reviews || 0; cur.correct += v.correct || 0; cur.newLearned += v.newLearned || 0; }
      }
    }
    this.save();
    return this.data;
  }

  reset() {
    this.data = defaultProfile();
    this.adapter.clear();
    this.save();
  }
}

export function dayKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 구버전 세이브 업그레이드 지점 */
function migrate(data) {
  if (!data) return null;
  if (!data.version) data.version = PROFILE_VERSION;
  const base = defaultProfile();
  data.settings = { ...base.settings, ...(data.settings || {}) };
  data.meta = { ...base.meta, ...(data.meta || {}) };
  data.meta.daily = data.meta.daily || {};
  data.cards = data.cards || {};
  data.log = data.log || [];
  data.customDecks = data.customDecks || [];
  return data;
}
