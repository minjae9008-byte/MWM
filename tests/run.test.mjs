/** 런 상태 기계 · 로그라이크 시스템 · 실제 한 판 시뮬레이션 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Run, RunPhase, MAX_CITIES, MAX_FOCUS } from '../src/core/run.js';
import { SrsStore } from '../src/core/srs.js';
import { State, Rating } from '../src/core/fsrs.js';
import { computeMods, rollOffers, RELICS, SKILLS, RELIC_BY_ID } from '../src/core/upgrades.js';
import { waveConfig, scoreFor, comboMultiplier, DIFFICULTY_PRESETS } from '../src/core/balance.js';
import { RNG } from '../src/core/rng.js';
import { BUILTIN_DECKS } from '../src/data/decks.js';

const WORDS = BUILTIN_DECKS[0].words;
const newRun = (opts = {}) => new Run({ words: WORDS, store: new SrsStore(), seed: 99, newPerRun: 999, ...opts });

/** 정답률 p로 답하는 봇 한 판 */
function simulate(run, { accuracy = 0.8, maxWaves = 30, rng = new RNG(5), keepAlive = false } = {}) {
  const resolved = [];
  let waves = 0;
  while (run.alive && waves < maxWaves) {
    run.startWave();
    waves++;
    const cfg = run.config;
    let q;
    while ((q = run.nextQuestion())) {
      const correct = rng.bool(accuracy);
      const windowMs = cfg.fallTime * 1000;
      const entry = run.resolveVolley({
        question: q,
        correct,
        landed: !correct && rng.bool(0.5),
        reactionMs: rng.range(600, windowMs),
        windowMs,
      });
      resolved.push(entry);
      // keepAlive: 생존과 무관하게 출제 로직만 길게 관찰하고 싶을 때
      if (keepAlive) { run.cities = MAX_CITIES; run.phase = RunPhase.WAVE; }
      if (!run.alive) break;
    }
    if (!run.alive) break;
    const offers = run.completeWave();
    if (offers.length) run.takeOffer(offers[0].id);
  }
  return { resolved, waves };
}

test('런 초기 상태', () => {
  const run = newRun();
  assert.equal(run.cities, MAX_CITIES);
  assert.equal(run.wave, 0);
  assert.equal(run.phase, RunPhase.READY);
  assert.ok(run.skills.length >= 1);
});

test('웨이브를 시작하면 볼리 수만큼 문제를 낸다', () => {
  const run = newRun();
  const cfg = run.startWave();
  let n = 0;
  while (run.nextQuestion()) n++;
  assert.equal(n, cfg.volleys);
  assert.equal(run.nextQuestion(), null, '볼리를 다 쓴 뒤에도 문제가 나온다');
});

test('정답은 점수와 콤보를 올리고, 오답은 저장소를 깎는다', () => {
  const run = newRun();
  run.startWave();
  const q = run.nextQuestion();

  const ok = run.resolveVolley({ question: q, correct: true, landed: false, reactionMs: 1200, windowMs: 8000 });
  assert.ok(ok.gained > 0);
  assert.equal(run.combo, 1);
  assert.equal(run.cities, MAX_CITIES);
  assert.ok(run.focus > 0);

  const q2 = run.nextQuestion();
  run.resolveVolley({ question: q2, correct: false, landed: true, reactionMs: 8000, windowMs: 8000 });
  assert.equal(run.combo, 0);
  assert.equal(run.cities, MAX_CITIES - 1);
});

test('저장소가 0이 되면 런이 끝난다', () => {
  const run = newRun();
  run.startWave();
  for (let i = 0; i < MAX_CITIES; i++) {
    const q = run.nextQuestion();
    run.resolveVolley({ question: q, correct: false, landed: true, reactionMs: 8000, windowMs: 8000 });
  }
  assert.equal(run.cities, 0);
  assert.equal(run.alive, false);
  assert.equal(run.phase, RunPhase.OVER);
});

test('기억의 방패는 실수를 한 번 막아 주지만 단어 평가는 그대로 기록된다', () => {
  const run = newRun();
  run.relics = ['memshield'];
  run.mods = computeMods(run.relics);
  run.startWave();
  assert.equal(run.shields, 1);

  const q = run.nextQuestion();
  const e = run.resolveVolley({ question: q, correct: false, landed: true, reactionMs: 8000, windowMs: 8000 });
  assert.equal(run.cities, MAX_CITIES, '방패가 있는데 저장소가 깎였다');
  assert.ok(e.shielded);
  assert.equal(e.rating, Rating.Again, '방패가 기억 평가까지 봐주면 안 된다');
  assert.equal(run.store.cards[q.word.id].state, State.Learning);
});

test('콤보 배수는 단조 증가하고 1에서 시작한다', () => {
  const mods = computeMods([]);
  assert.equal(comboMultiplier(0, mods), 1);
  assert.equal(comboMultiplier(1, mods), 1);
  let prev = 1;
  for (let c = 2; c < 60; c++) {
    const m = comboMultiplier(c, mods);
    assert.ok(m > prev, `콤보 ${c}에서 배수가 안 늘었다`);
    prev = m;
  }
});

test('스킬은 집중을 소모하고, 부족하면 발동하지 않는다', () => {
  const run = newRun();
  run.skills = ['slowfield'];
  run.focus = 10;
  assert.equal(run.useSkill('slowfield'), null);
  run.focus = MAX_FOCUS;
  const used = run.useSkill('slowfield');
  assert.ok(used);
  assert.ok(run.focus < MAX_FOCUS);
  assert.ok(run.effects.slow > Date.now());
});

test('긴급 복구는 저장소가 가득 차 있으면 집중을 돌려준다', () => {
  const run = newRun();
  run.skills = ['repair'];
  run.focus = MAX_FOCUS;
  assert.equal(run.useSkill('repair'), null);
  assert.equal(run.focus, MAX_FOCUS, '실패했는데 집중이 소모됐다');

  run.cities = 3;
  assert.ok(run.useSkill('repair'));
  assert.equal(run.cities, 4);
});

test('시간 왜곡은 낙하 속도를 늦춘다', () => {
  const run = newRun();
  assert.equal(run.fallSpeedFactor(), 1);
  run.skills = ['slowfield'];
  run.focus = MAX_FOCUS;
  run.useSkill('slowfield');
  assert.ok(run.fallSpeedFactor() < 1);
});

test('모든 유물은 수정치를 유한한 값으로 유지한다', () => {
  for (const r of RELICS) {
    const m = computeMods([r.id]);
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v) && v > -1000, `${r.id}의 ${k}가 이상하다: ${v}`);
    }
  }
  const all = computeMods(RELICS.map((r) => r.id));
  assert.ok(all.fallSpeed > 0, '모든 유물을 다 먹으면 낙하 속도가 0 이하가 된다');
  assert.ok(all.skillSlots <= 4);
});

test('보상은 3개까지, 이미 가진 유물은 다시 제시하지 않는다', () => {
  const rng = new RNG(3);
  const owned = new Set(['warhead', 'precision']);
  for (let i = 1; i <= 20; i++) {
    const offers = rollOffers({ rng, owned, ownedSkills: new Set(), wave: i, mods: computeMods([...owned]) });
    assert.ok(offers.length > 0 && offers.length <= 3);
    for (const o of offers) {
      if (o.kind === 'relic') assert.ok(!owned.has(o.id), `이미 가진 유물이 또 나왔다: ${o.id}`);
    }
  }
});

test('저주는 일반 보상 풀에 섞이지 않는다 (거래로만 등장)', () => {
  const rng = new RNG(11);
  for (let i = 1; i <= 40; i++) {
    for (const o of rollOffers({ rng, owned: new Set(), ownedSkills: new Set(), wave: i, mods: computeMods([]) })) {
      if (o.kind === 'relic') assert.ok(!o.curse, `저주가 유물로 직접 나왔다: ${o.id}`);
    }
  }
});

test('웨이브가 올라가면 낙하가 빨라지고 오답이 늘어난다', () => {
  const mods = computeMods([]);
  const a = waveConfig(1, mods);
  const b = waveConfig(10, mods);
  assert.ok(b.fallTime < a.fallTime);
  assert.ok(b.decoys > a.decoys);
  assert.ok(b.volleys > a.volleys);
  // 인지 부하가 먼저 한계에 닿아야 한다 — 물리 난이도에 하한을 둔 이유
  for (let w = 1; w <= 100; w++) {
    const c = waveConfig(w, mods);
    assert.ok(c.fallTime >= 3.0, `웨이브 ${w}의 낙하 시간이 비인간적이다: ${c.fallTime}`);
    assert.ok(c.decoys >= 1 && c.decoys <= 6);
  }
});

test('어떤 유물 조합에서도 낙하 시간이 0 이하가 되지 않는다', () => {
  const all = computeMods(RELICS.map((r) => r.id));
  for (const d of DIFFICULTY_PRESETS) {
    for (let w = 1; w <= 60; w++) {
      const c = waveConfig(w, all, d.mul);
      assert.ok(c.fallTime > 0.5 && Number.isFinite(c.fallTime), `w${w}/${d.id}: ${c.fallTime}`);
    }
  }
});

test('점수는 콤보·신규·희귀도에 따라 커진다', () => {
  const mods = computeMods([]);
  const base = { mods, combo: 1, isNew: false, retrievability: 0.9, reactionMs: 5000, waveOpen: false, overcharged: false, difficulty: 1 };
  assert.ok(scoreFor({ ...base, combo: 10 }) > scoreFor(base));
  assert.ok(scoreFor({ ...base, overcharged: true }) > scoreFor(base));
  assert.ok(scoreFor({ ...base, mods: computeMods(['deepcode']), isNew: true }) > scoreFor({ ...base, isNew: true }));
});

// ---- 통합: 실제 한 판 -------------------------------------------------

test('한 판을 끝까지 돌려도 불변식이 깨지지 않는다', () => {
  const run = newRun();
  const { resolved, waves } = simulate(run, { accuracy: 0.75 });

  assert.ok(waves >= 1);
  assert.ok(resolved.length > 20, `너무 적게 진행됐다: ${resolved.length}`);
  assert.ok(run.score >= 0);
  assert.ok(run.cities >= 0 && run.cities <= MAX_CITIES);
  assert.ok(run.focus >= 0 && run.focus <= MAX_FOCUS);

  const sum = run.summary();
  assert.equal(sum.answered, sum.correct + sum.wrong + sum.landed);
  assert.ok(sum.accuracy >= 0 && sum.accuracy <= 1);
  assert.ok(sum.maxCombo >= 0);

  // 모든 카드 상태가 유효해야 한다
  for (const c of Object.values(run.store.cards)) {
    assert.ok([State.New, State.Learning, State.Review, State.Relearning].includes(c.state));
    assert.ok(c.s >= 0 && c.s <= 36500 && Number.isFinite(c.s));
    assert.ok(c.d === 0 || (c.d >= 1 && c.d <= 10), `난이도 범위 위반: ${c.d}`);
    assert.ok(c.due >= 0 && Number.isFinite(c.due));
  }
});

test('틀린 단어는 같은 판 안에서 실제로 다시 출제된다', () => {
  const run = newRun();
  const { resolved } = simulate(run, { accuracy: 0.6, maxWaves: 12, keepAlive: true });

  const missedFirst = new Map();
  resolved.forEach((e, i) => {
    if (!e.correct && !missedFirst.has(e.word.id)) missedFirst.set(e.word.id, i);
  });
  // 판이 끝나기 한참 전에 틀린 단어만 대상으로 본다
  const cutoff = resolved.length - 12;
  const candidates = [...missedFirst].filter(([, i]) => i < cutoff);
  assert.ok(candidates.length > 3, '표본이 부족하다');

  let returned = 0;
  for (const [id, i] of candidates) {
    if (resolved.slice(i + 1).some((e) => e.word.id === id)) returned++;
  }
  const rate = returned / candidates.length;
  assert.ok(rate > 0.9, `틀린 단어 재출제율이 낮다: ${(rate * 100).toFixed(1)}%`);
});

test('정답률이 높으면 점수도 웨이브도 더 멀리 간다', () => {
  const good = newRun();
  simulate(good, { accuracy: 0.95, maxWaves: 20, rng: new RNG(1) });
  const bad = newRun();
  simulate(bad, { accuracy: 0.45, maxWaves: 20, rng: new RNG(1) });
  assert.ok(good.score > bad.score, `${good.score} vs ${bad.score}`);
  assert.ok(good.wave >= bad.wave);
});

test('잘 맞힌 단어는 실제로 장기 복습 일정을 받는다', () => {
  const run = newRun();
  simulate(run, { accuracy: 0.95, maxWaves: 14 });
  const cards = Object.values(run.store.cards);
  const graduated = cards.filter((c) => c.state === State.Review);
  assert.ok(graduated.length > 5, `졸업한 카드가 너무 적다: ${graduated.length}`);
  const future = graduated.filter((c) => c.due > Date.now() + 12 * 3600 * 1000);
  assert.ok(future.length > 0, '내일 이후로 잡힌 카드가 하나도 없다');
});

test('같은 시드는 같은 판을 재현한다', () => {
  const play = () => {
    const r = new Run({ words: WORDS, store: new SrsStore(), seed: 2024, newPerRun: 999 });
    simulate(r, { accuracy: 0.8, maxWaves: 8, rng: new RNG(77) });
    return `${r.score}|${r.wave}|${r.maxCombo}|${r.relics.join(',')}`;
  };
  assert.equal(play(), play());
});
