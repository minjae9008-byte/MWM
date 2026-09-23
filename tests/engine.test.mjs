/**
 * 엔진 물리 · 판정 검증.
 * DOM 없이 돌리기 위해 텍스트 폭 측정만 주입한다 — 엔진이 캔버스를 직접 안 쓰는 이유.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/game/engine.js';
import { Run, RunMode, MAX_CITIES } from '../src/core/run.js';
import { SrsStore } from '../src/core/srs.js';
import { computeMods } from '../src/core/upgrades.js';
import { BUILTIN_DECKS } from '../src/data/decks.js';

const WORDS = BUILTIN_DECKS[0].words;
const measure = (t, size) => t.length * size * 0.6;

function boot(runOpts = {}) {
  const run = new Run({ words: WORDS, store: new SrsStore(), seed: 7, newPerRun: 999, ...runOpts });
  const engine = new Engine({ run, measureText: measure, events: {} });
  engine.resize(1280, 720);
  engine.beginWave();
  return { run, engine };
}

/** 첫 볼리가 뜰 때까지 진행 */
function spinToVolley(engine, maxMs = 6000) {
  let t = 0;
  while (!engine.activeVolleys().length && t < maxMs) { engine.update(16); t += 16; }
  return engine.activeVolleys()[0];
}

const missilesOf = (engine, v) => engine.missiles.filter((m) => m.volleyId === v.id && m.alive && !m.inert);

test('웨이브를 시작하면 탄약이 채워지고 저장소가 선다', () => {
  const { run, engine } = boot();
  assert.ok(engine.totalAmmo > 0);
  assert.equal(engine.cities.filter((c) => c.alive).length, MAX_CITIES);
  assert.equal(engine.turrets.length, 3);
  assert.equal(run.wave, 1);
});

test('볼리에는 정답 미사일이 정확히 하나 있다', () => {
  const { engine } = boot();
  const v = spinToVolley(engine);
  assert.ok(v, '볼리가 생성되지 않았다');
  const ms = missilesOf(engine, v);
  assert.equal(ms.filter((m) => m.correct).length, 1);
  assert.equal(ms.length, v.question.options.length);
  for (const m of ms) {
    assert.ok(m.x > 0 && m.x < 1280, `화면 밖 스폰: ${m.x}`);
    assert.ok(m.vy > 0, '아래로 안 떨어진다');
  }
});

test('정답 요격 → 점수·콤보 상승, 저장소 유지', () => {
  const { run, engine } = boot();
  const v = spinToVolley(engine);
  const target = missilesOf(engine, v).find((m) => m.correct);

  engine.fireAt(target.x, target.y);
  for (let i = 0; i < 200; i++) engine.update(16);

  assert.equal(run.stats.correct, 1);
  assert.ok(run.score > 0);
  assert.equal(run.combo, 1);
  assert.equal(run.cities, MAX_CITIES);
});

test('오답 요격 → 저장소 손실, 콤보 초기화', () => {
  const { run, engine } = boot();
  const v = spinToVolley(engine);
  const decoy = missilesOf(engine, v).find((m) => !m.correct);

  engine.fireAt(decoy.x, decoy.y);
  for (let i = 0; i < 200; i++) engine.update(16);

  assert.equal(run.stats.wrong, 1);
  assert.equal(run.cities, MAX_CITIES - 1);
  assert.equal(run.combo, 0);
});

test('폭발이 정답과 오답을 동시에 덮으면 정답으로 친다', () => {
  const { run, engine } = boot();
  const v = spinToVolley(engine);
  const ms = missilesOf(engine, v);
  const correct = ms.find((m) => m.correct);
  const decoy = ms.find((m) => !m.correct);
  // 오답을 정답 바로 옆에 붙여 둘 다 폭발 범위에 들어가게 만든다
  decoy.x = correct.x + 18;
  decoy.y = correct.y;

  engine.fireAt(correct.x, correct.y);
  for (let i = 0; i < 200; i++) engine.update(16);

  assert.equal(run.stats.correct, 1, '정답을 맞혔는데 오답 처리됐다');
  assert.equal(run.stats.wrong, 0);
  assert.equal(run.cities, MAX_CITIES);
});

test('정밀 신관은 조준한 미사일만 파괴한다', () => {
  const { run, engine } = boot();
  run.relics = ['precision'];
  run.mods = computeMods(run.relics);
  const v = spinToVolley(engine);
  const ms = missilesOf(engine, v);
  const correct = ms.find((m) => m.correct);
  const decoy = ms.find((m) => !m.correct);
  decoy.x = correct.x + 14;
  decoy.y = correct.y;

  engine.fireAt(correct.x, correct.y);
  for (let i = 0; i < 40; i++) engine.update(16);

  assert.equal(correct.alive, false);
  assert.ok(decoy.alive || decoy.inert, '정밀 신관인데 옆 미사일이 터졌다');
});

test('오답은 착탄해도 피해가 없고, 정답 착탄은 저장소를 부순다', () => {
  const { run, engine } = boot();
  const v = spinToVolley(engine);
  const ms = missilesOf(engine, v);
  const decoy = ms.find((m) => !m.correct);

  // 오답만 지면 직전으로 내린다
  decoy.y = engine.groundY - decoy.h / 2 - 1;
  engine.update(32);
  assert.equal(run.cities, MAX_CITIES, '오답이 착탄했는데 피해를 입었다');
  assert.equal(run.stats.landed, 0);

  // 이제 정답을 떨어뜨린다
  const correct = engine.missiles.find((m) => m.volleyId === v.id && m.correct && m.alive);
  correct.y = engine.groundY - correct.h / 2 - 1;
  engine.update(32);
  assert.equal(run.stats.landed, 1);
  assert.equal(run.cities, MAX_CITIES - 1);
});

test('탄약이 없으면 발사되지 않는다', () => {
  const { run, engine } = boot();
  spinToVolley(engine);
  for (const t of engine.turrets) t.ammo = 0;
  const before = run.stats.shots;
  assert.equal(engine.fireAt(640, 300), false);
  assert.equal(run.stats.shots, before);
});

test('가장 가까운 포탑이 발사하고 탄약을 소모한다', () => {
  const { engine } = boot();
  spinToVolley(engine);
  const before = engine.turrets.map((t) => t.ammo);
  engine.fireAt(60, 300);       // 왼쪽 끝
  assert.equal(engine.turrets[0].ammo, before[0] - 1);
  assert.equal(engine.turrets[1].ammo, before[1]);
});

test('EMP는 오답만 무력화하고 볼리를 해결하지 않는다', () => {
  const { run, engine } = boot();
  const v = spinToVolley(engine);
  run.focus = 100;
  run.skills = ['emp'];
  run.useSkill('emp');
  engine.applySkill('emp');

  const left = missilesOf(engine, v);
  assert.equal(left.length, 1);
  assert.ok(left[0].correct, '정답까지 지워졌다');
  assert.equal(v.resolved, false);
  assert.equal(run.stats.correct, 0);
});

test('연쇄 반응 유물은 정답 요격 시 남은 오답을 무해하게 치운다', () => {
  const { run, engine } = boot();
  run.relics = ['chain'];
  run.mods = computeMods(run.relics);
  const v = spinToVolley(engine);
  const correct = missilesOf(engine, v).find((m) => m.correct);

  engine.fireAt(correct.x, correct.y);
  for (let i = 0; i < 60; i++) engine.update(16);

  assert.equal(run.stats.correct, 1);
  assert.equal(run.stats.wrong, 0);
  assert.equal(run.cities, MAX_CITIES);
});

test('화면 크기가 바뀌어도 미사일이 화면 밖으로 나가지 않는다', () => {
  const { engine } = boot();
  spinToVolley(engine);
  engine.resize(640, 480);
  engine.update(16);
  for (const m of engine.missiles) {
    assert.ok(m.x >= 0 && m.x <= 640, `리사이즈 후 화면 밖: ${m.x}`);
  }
  assert.equal(engine.turrets[2].x, 640 * 0.93);
});

test('웨이브의 모든 볼리를 처리하면 웨이브가 끝난다', () => {
  let cleared = false;
  const run = new Run({ words: WORDS, store: new SrsStore(), seed: 3, newPerRun: 999 });
  const engine = new Engine({ run, measureText: measure, events: { onWaveClear: () => { cleared = true; } } });
  engine.resize(1280, 720);
  engine.beginWave();

  // 정답만 계속 요격한다
  for (let i = 0; i < 40000 && !cleared; i++) {
    engine.update(16);
    const v = engine.activeVolleys()[0];
    if (v) {
      const m = engine.missiles.find((x) => x.volleyId === v.id && x.correct && x.alive);
      if (m && m.y > 60) { for (const t of engine.turrets) t.ammo = 99; engine.fireAt(m.x, m.y); }
    }
  }
  assert.ok(cleared, '웨이브가 끝나지 않았다');
  assert.equal(engine.waveActive, false);
});

test('시뮬레이션을 오래 돌려도 엔티티가 무한정 쌓이지 않는다', () => {
  const { engine } = boot();
  for (let i = 0; i < 6000; i++) {
    engine.update(16);
    if (i % 40 === 0) { for (const t of engine.turrets) t.ammo = 99; engine.fireAt(400 + (i % 400), 200); }
  }
  assert.ok(engine.particles.length <= 600, `파티클 누수: ${engine.particles.length}`);
  assert.ok(engine.popups.length <= 30, `팝업 누수: ${engine.popups.length}`);
  assert.ok(engine.explosions.length < 60, `폭발 누수: ${engine.explosions.length}`);
  assert.ok(engine.volleys.length <= 6, `볼리 누수: ${engine.volleys.length}`);
});

// --- 철자 입력 볼리 -----------------------------------------------------

/** 모든 단어를 잘 아는 상태로 만들어 철자 입력 볼리가 나오게 한다 */
function bootTyping() {
  const store = new SrsStore();
  for (const w of WORDS) {
    const c = store.get(w.id);
    Object.assign(c, { s: 40, d: 5, reps: 5, state: 'review', last: Date.now() - 50 * 86400000, due: Date.now() - 86400000 });
  }
  const run = new Run({ words: WORDS, store, seed: 11, newPerRun: 0, answerMode: 'typing' });
  const engine = new Engine({ run, measureText: measure, events: {} });
  engine.resize(1280, 720);
  engine.beginWave();
  return { run, engine, store };
}

test('철자 입력 볼리는 미사일 하나만 내려보내고 철자를 가린다', () => {
  const { engine } = bootTyping();
  const v = spinToVolley(engine);
  assert.ok(v.typing, '철자 입력 볼리가 안 떴다');
  const ms = engine.missiles.filter((m) => m.volleyId === v.id && m.alive);
  assert.equal(ms.length, 1, '보기가 같이 떨어지면 타이핑이 아니다');
  assert.equal(ms[0].correct, true);
  assert.ok(ms[0].text.includes('_'), `철자가 그대로 노출됐다: ${ms[0].text}`);
  assert.equal(ms[0].answer, v.question.answer);
});

test('철자 입력 볼리가 살아 있는 동안 다른 문제가 겹쳐 뜨지 않는다', () => {
  const { engine } = bootTyping();
  spinToVolley(engine);
  for (let i = 0; i < 1200; i++) {
    engine.update(16);
    const open = engine.volleys.filter((v) => !v.resolved);
    if (open.some((v) => v.typing)) assert.equal(open.length, 1, '타이핑 중에 다른 문제가 같이 떴다');
  }
});

test('정답을 치면 탄약 없이도 요격된다', () => {
  const { run, engine } = bootTyping();
  const v = spinToVolley(engine);
  for (const t of engine.turrets) t.ammo = 0;      // 탄약을 비워 둔다

  const res = engine.submitTyped(v.question.answer);
  assert.equal(res.ok, true);
  for (let i = 0; i < 80; i++) engine.update(16);

  assert.equal(run.stats.correct, 1);
  assert.equal(engine.totalAmmo, 0, '철자로 맞혔는데 탄약을 썼다');
  assert.equal(run.cities, MAX_CITIES);
});

test('틀리게 치면 볼리가 끝나지 않고 시도 횟수만 는다', () => {
  const { run, engine } = bootTyping();
  const v = spinToVolley(engine);

  const bad = engine.submitTyped('definitelywrong');
  assert.equal(bad.ok, false);
  assert.equal(bad.attempts, 1);
  assert.equal(v.resolved, false, '한 번 틀렸다고 문제가 끝나면 안 된다');
  assert.equal(run.stats.correct, 0);
  assert.equal(run.stats.wrong, 0);

  engine.submitTyped(v.question.answer);
  for (let i = 0; i < 80; i++) engine.update(16);
  assert.equal(run.stats.correct, 1);
  // 재시도 끝에 맞혔으므로 매끄러운 인출이 아니다
  assert.equal(run.eventLog.at(-1).rating, 2);
});

test('시간이 흐르면 글자를 조금씩 보여 주고, 그만큼 평가를 제한한다', () => {
  const { run, engine } = bootTyping();
  const v = spinToVolley(engine);
  const m = engine.missiles.find((x) => x.volleyId === v.id);
  const before = m.text;

  // 창의 70% 지점까지 진행
  v.spawnedAt = Date.now() - v.windowMs * 0.7;
  engine.updateTypingHints(Date.now());
  assert.notEqual(m.text, before, '힌트가 안 나왔다');
  assert.equal(v.revealed, true);

  engine.submitTyped(v.question.answer);
  for (let i = 0; i < 80; i++) engine.update(16);
  assert.ok(run.eventLog.at(-1).rating <= 3, '힌트를 받고도 쉬움을 줬다');
});

test('철자 입력 볼리를 놓치면 다른 문제와 똑같이 저장소가 무너진다', () => {
  const { run, engine } = bootTyping();
  const v = spinToVolley(engine);
  const m = engine.missiles.find((x) => x.volleyId === v.id);
  m.y = engine.groundY - m.h / 2 - 1;
  engine.update(32);
  assert.equal(run.stats.landed, 1);
  assert.equal(run.cities, MAX_CITIES - 1);
});

test('오답을 요격하면 무엇과 헷갈렸는지 기록에 남는다', () => {
  const { run, engine } = boot();
  const v = spinToVolley(engine);
  const decoy = missilesOf(engine, v).find((m) => !m.correct);
  engine.fireAt(decoy.x, decoy.y);
  for (let i = 0; i < 200; i++) engine.update(16);

  const entry = run.eventLog.at(-1);
  assert.ok(entry.chosen, '고른 오답이 기록되지 않았다');
  assert.equal(entry.chosen.id, decoy.word.id);
  assert.notEqual(entry.chosen.id, entry.word.id);
});
