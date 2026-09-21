/**
 * 앱 컨트롤러 — 코어 로직 / 게임 엔진 / UI를 연결한다.
 *
 * 레이어 구분을 지키는 게 이 파일의 일이다:
 *   core/*   순수 로직 (브라우저 API 없음 → 그대로 Dart로 옮길 수 있다)
 *   game/*   캔버스·입력·오디오
 *   ui/*     DOM 화면
 *   main.js  그 셋을 아는 유일한 곳
 */

import { Profile } from './core/storage.js';
import { WebStorageAdapter } from './platform/webStorage.js';
import { SrsStore } from './core/srs.js';
import { FSRS, State, DAY_MS } from './core/fsrs.js';
import { Run, RunPhase } from './core/run.js';
import { BUILTIN_DECKS, parseWordList } from './data/decks.js';
import { DIFFICULTY_PRESETS } from './core/balance.js';
import { Engine } from './game/engine.js';
import { Renderer } from './game/renderer.js';
import { InputController } from './game/input.js';
import { AudioEngine, Speaker } from './game/audio.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { $, toast } from './ui/dom.js';

const FIXED_STEP = 1000 / 120;

class App {
  constructor() {
    this.profile = new Profile(new WebStorageAdapter());
    this.store = new SrsStore({
      cards: this.profile.data.cards,
      log: this.profile.data.log,
      params: { requestRetention: this.profile.settings.requestRetention },
    });
    // 저장 객체와 동일 참조를 유지해야 카드 갱신이 곧 저장 대상이 된다
    this.profile.data.cards = this.store.cards;
    this.profile.data.log = this.store.log;

    this.audio = new AudioEngine();
    this.audio.enabled = this.profile.settings.sound;
    this.speaker = new Speaker();
    this.speaker.enabled = this.profile.settings.tts;

    this.canvas = $('#game');
    this.hud = new Hud($('#hud'));
    this.screens = new Screens($('#overlay'), this);

    this.run = null;
    this.idleRun = this.makeDormantRun();
    this.engine = new Engine({ run: this.idleRun, events: this.engineEvents() });
    this.renderer = new Renderer(this.canvas, this.engine);
    this.renderer.reduceMotion = this.profile.settings.reduceMotion;
    this.engine.measureText = (t, s) => this.renderer.measure(t, s);

    this.input = new InputController(this.canvas, this.renderer, {
      onFire: (x, y) => this.fire(x, y),
      onSkill: (slot) => this.useSkillSlot(slot),
      onPause: () => this.togglePause(),
    });

    this.accum = 0;
    this.last = performance.now();
    this.bindGlobals();
    this.screens.title();
    requestAnimationFrame((t) => this.loop(t));
  }

  // --- 덱 / 단어 ------------------------------------------------------

  allDecks() {
    return [...BUILTIN_DECKS, ...this.profile.data.customDecks];
  }

  activeWords() {
    const ids = new Set(this.profile.settings.deckIds);
    const out = [];
    for (const d of this.allDecks()) if (ids.has(d.id)) out.push(...d.words);
    return out.length ? out : BUILTIN_DECKS[0].words;
  }

  deckProgress(deckId) {
    const deck = this.allDecks().find((d) => d.id === deckId);
    if (!deck) return { studied: 0, due: 0, matured: 0 };
    const now = Date.now();
    let studied = 0, due = 0, matured = 0;
    for (const w of deck.words) {
      const c = this.store.cards[w.id];
      if (!c || c.state === State.New) continue;
      studied++;
      if (c.due <= now) due++;
      if (c.s >= 21) matured++;
    }
    return { studied, due, matured };
  }

  sessionOutlook() {
    const words = this.activeWords();
    const now = Date.now();
    let due = 0;
    for (const w of words) {
      const c = this.store.cards[w.id];
      if (c && c.state !== State.New && c.due <= now) due++;
    }
    return { pool: words.length, due, newLimit: this.profile.settings.newPerRun };
  }

  addCustomDeck(name, text) {
    const normalized = text
      .split('\n')
      .map((line) => line.replace(/\t/g, '|').replace(/\s*,\s*/g, '|').trim())
      .join('\n');
    const id = `custom_${Date.now().toString(36)}`;
    const words = parseWordList(normalized, id);
    if (!words.length) return 0;
    this.profile.data.customDecks.push({
      id, name, desc: `직접 추가한 ${words.length}단어`, words, builtin: false,
    });
    const set = new Set(this.profile.settings.deckIds);
    set.add(id);
    this.profile.updateSettings({ deckIds: [...set] });
    this.profile.save();
    return words.length;
  }

  deleteDeck(id) {
    this.profile.data.customDecks = this.profile.data.customDecks.filter((d) => d.id !== id);
    const left = this.profile.settings.deckIds.filter((x) => x !== id);
    this.profile.updateSettings({ deckIds: left.length ? left : ['basic'] });
    this.profile.save();
  }

  rebuild() {
    this.store = new SrsStore({
      cards: this.profile.data.cards,
      log: this.profile.data.log,
      params: { requestRetention: this.profile.settings.requestRetention },
    });
    this.profile.data.cards = this.store.cards;
    this.profile.data.log = this.store.log;
  }

  // --- 런 진행 --------------------------------------------------------

  makeDormantRun() {
    return new Run({ words: BUILTIN_DECKS[0].words, store: this.store, seed: 1, newPerRun: 0 });
  }

  startRun() {
    const s = this.profile.settings;
    const diff = DIFFICULTY_PRESETS.find((d) => d.id === s.difficulty) || DIFFICULTY_PRESETS[1];
    this.store.fsrs.requestRetention = s.requestRetention;

    this.run = new Run({
      words: this.activeWords(),
      store: this.store,
      seed: Date.now(),
      difficulty: diff.mul,
      direction: s.direction,
      newPerRun: s.newPerRun,
    });

    this.engine = new Engine({
      run: this.run,
      measureText: (t, sz) => this.renderer.measure(t, sz),
      events: this.engineEvents(),
    });
    this.renderer.engine = this.engine;
    this.input.engine = this.engine;
    this.renderer.resize();

    this.hud.clearFeed();
    this.hud.buildSkills(this.run, (id) => this.useSkill(id));
    this.hud.buildRelics(this.run);
    document.body.classList.add('is-playing');

    this.screens.close();
    this.engine.beginWave();
    this.audio.unlock();
    this.audio.setEnabled(this.profile.settings.sound);
  }

  engineEvents() {
    return {
      onResolve: (entry) => this.onResolve(entry),
      onWaveClear: () => this.onWaveClear(),
      onGameOver: () => this.onGameOver(),
      onFire: () => this.audio.fire(),
      onOutOfAmmo: () => this.audio.empty(),
    };
  }

  onResolve(entry) {
    this.hud.pushFeed(entry);
    this.profile.markDirty();
    if (entry.correct) {
      this.audio.correct(this.run.combo);
      if (this.profile.settings.tts) this.speaker.say(entry.word.en);
    } else {
      this.audio.wrong();
      if (entry.damaged) this.audio.cityLost();
    }
  }

  onWaveClear() {
    if (!this.run || !this.run.alive) return;
    this.audio.waveClear();
    this.engine.paused = true;
    const offers = this.run.completeWave();
    this.engine.syncCities();
    if (!offers.length) { this.chooseOffer(null); return; }
    setTimeout(() => this.screens.offer(offers, this.run), 450);
  }

  chooseOffer(id) {
    if (id) this.run.takeOffer(id);
    else { this.run.offers = []; this.run.phase = RunPhase.WAVE_CLEAR; }
    this.hud.buildSkills(this.run, (s) => this.useSkill(s));
    this.hud.buildRelics(this.run);
    this.screens.close();
    this.engine.paused = false;
    this.engine.beginWave();
  }

  onGameOver() {
    this.audio.gameOver();
    this.engine.paused = true;
    const sum = this.run.summary();
    const m = this.profile.meta;
    const records = {
      score: sum.score > m.bestScore,
      wave: sum.wave > m.bestWave,
      combo: sum.maxCombo > m.bestCombo,
    };
    this.profile.recordRun(sum);
    document.body.classList.remove('is-playing');
    const finished = this.run;
    this.run = null;
    setTimeout(() => this.screens.results(sum, records), 900);
    return finished;
  }

  abandonRun() {
    if (this.run) this.profile.recordRun(this.run.summary());
    this.run = null;
    this.profile.flush();
    this.resetBattlefield();
    this.screens.title();
  }

  /** 전투가 끝난 화면을 치우고 시작 화면용 배경으로 되돌린다 */
  resetBattlefield() {
    document.body.classList.remove('is-playing');
    this.idleRun = this.makeDormantRun();
    this.engine = new Engine({
      run: this.idleRun,
      measureText: (t, s) => this.renderer.measure(t, s),
      events: {},
    });
    this.renderer.engine = this.engine;
    this.input.engine = this.engine;
    this.renderer.resize();
  }

  // --- 입력 처리 ------------------------------------------------------

  fire(x, y) {
    if (!this.run || this.screens.isOpen || this.engine.paused) return;
    this.audio.unlock();
    const fired = this.engine.fireAt(x, y);
    if (!fired) return;
    // 아무것도 못 맞힌 탄은 폭발 판정 후에 집계되므로 여기서는 발사만 기록한다
  }

  useSkillSlot(slot) {
    if (!this.run) return;
    const id = this.run.skills[slot];
    if (id) this.useSkill(id);
  }

  useSkill(id) {
    if (!this.run || this.screens.isOpen) return;
    const used = this.run.useSkill(id);
    if (!used) { this.audio.empty(); return; }
    this.audio.skill();
    this.engine.applySkill(id);
  }

  togglePause() {
    if (!this.run) return;
    if (this.screens.isOpen) {
      if (this.screens.current === 'pause') this.resume();
      return;
    }
    this.engine.paused = true;
    this.screens.pause();
  }

  resume() {
    this.screens.close();
    if (this.run) this.engine.paused = false;
  }

  onScreenClosed() {
    if (this.run && this.run.phase !== RunPhase.OFFER) this.engine.paused = false;
  }

  // --- 데이터 --------------------------------------------------------

  exportData() {
    this.profile.flush();
    const blob = new Blob([this.profile.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mwm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('백업 파일을 내려받았다.', 'ok');
  }

  importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        this.profile.importJSON(text, 'merge');
        this.rebuild();
        toast('백업을 병합했다.', 'ok');
        this.screens.title();
      } catch (err) {
        toast(`가져오기 실패: ${err.message}`, 'warn', 4000);
      }
    };
    input.click();
  }

  // --- 루프 ----------------------------------------------------------

  bindGlobals() {
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => this.renderer.resize(), 120);
    });
    window.addEventListener('beforeunload', () => this.profile.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.profile.flush();
        if (this.run && !this.screens.isOpen) this.togglePause();
      }
    });
  }

  loop(ts) {
    const raw = ts - this.last;
    this.last = ts;
    // 탭 전환 등으로 프레임이 크게 밀렸을 때 시뮬레이션이 폭주하지 않도록 제한
    this.accum = Math.min(this.accum + raw, 220);

    const blocked = this.screens.isOpen || !this.run;
    while (this.accum >= FIXED_STEP) {
      this.accum -= FIXED_STEP;
      if (!blocked) this.engine.update(FIXED_STEP);
      else this.engine.updateFx(FIXED_STEP);
    }

    this.renderer.numbering = this.run && !blocked ? this.input.currentNumbering() : null;
    this.renderer.draw(ts);
    if (this.run) this.hud.update(this.run, this.engine, (id) => this.useSkill(id));

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__mwm = new App();
});

export { App };
