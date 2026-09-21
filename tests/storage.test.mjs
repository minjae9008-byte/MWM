/** 저장 · 백업 · 마이그레이션 검증 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Profile, defaultProfile, dayKey, PROFILE_VERSION } from '../src/core/storage.js';

/** 테스트용 인메모리 어댑터 — 코어가 저장 매체를 모르기 때문에 가능한 일 */
class MemoryAdapter {
  constructor(seed = null) { this.data = seed; this.writes = 0; }
  read() { return this.data ? JSON.parse(JSON.stringify(this.data)) : null; }
  write(d) { this.data = JSON.parse(JSON.stringify(d)); this.writes++; return true; }
  clear() { this.data = null; }
}

test('빈 저장소에서 기본 프로필이 만들어진다', () => {
  const p = new Profile(new MemoryAdapter());
  assert.equal(p.data.version, PROFILE_VERSION);
  assert.ok(p.settings.deckIds.length > 0);
  assert.equal(p.meta.runs, 0);
});

test('알 수 없는 필드가 있어도 설정 기본값이 채워진다', () => {
  const p = new Profile(new MemoryAdapter({ settings: { sound: false }, cards: { a: { id: 'a' } } }));
  assert.equal(p.settings.sound, false);
  assert.equal(p.settings.direction, 'ko2en', '빠진 설정이 기본값으로 안 채워졌다');
  assert.ok(p.data.cards.a);
  assert.ok(Array.isArray(p.data.customDecks));
});

test('런 기록이 최고 기록과 일간 통계에 반영된다', () => {
  const p = new Profile(new MemoryAdapter());
  p.recordRun({ score: 5000, wave: 7, maxCombo: 12, answered: 40, correct: 34, newLearned: 6, durationMs: 300000 });
  assert.equal(p.meta.runs, 1);
  assert.equal(p.meta.bestScore, 5000);
  assert.equal(p.meta.bestWave, 7);
  assert.equal(p.meta.streak, 1);

  const today = p.meta.daily[dayKey(Date.now())];
  assert.equal(today.reviews, 40);
  assert.equal(today.correct, 34);

  p.recordRun({ score: 1000, wave: 3, maxCombo: 4, answered: 10, correct: 8, newLearned: 1, durationMs: 60000 });
  assert.equal(p.meta.bestScore, 5000, '최고 기록이 낮은 점수로 덮였다');
  assert.equal(p.meta.daily[dayKey(Date.now())].reviews, 50);
});

test('연속 학습일: 어제 플레이했으면 이어지고, 건너뛰면 초기화된다', () => {
  const DAY = 86400000;
  const p = new Profile(new MemoryAdapter());
  const run = { score: 1, wave: 1, maxCombo: 1, answered: 1, correct: 1, newLearned: 0, durationMs: 1 };

  p.meta.lastPlayed = Date.now() - DAY;
  p.meta.streak = 4;
  p.recordRun(run);
  assert.equal(p.meta.streak, 5);

  p.meta.lastPlayed = Date.now() - 3 * DAY;
  p.recordRun(run);
  assert.equal(p.meta.streak, 1, '3일 쉬었는데 연속일이 안 끊겼다');
});

test('내보내기 → 가져오기 왕복', () => {
  const a = new Profile(new MemoryAdapter());
  a.data.cards.apple = { id: 'apple', s: 12, d: 5, reps: 4, state: 'review', due: Date.now(), lapses: 1 };
  a.updateSettings({ newPerRun: 30 });
  a.save();

  const b = new Profile(new MemoryAdapter());
  b.importJSON(a.exportJSON(), 'replace');
  assert.equal(b.data.cards.apple.s, 12);
  assert.equal(b.settings.newPerRun, 30);
});

test('병합 가져오기는 더 많이 복습한 카드를 남긴다', () => {
  const mine = new Profile(new MemoryAdapter());
  mine.data.cards.apple = { id: 'apple', s: 5, reps: 2 };
  mine.data.cards.bread = { id: 'bread', s: 9, reps: 7 };

  const theirs = new Profile(new MemoryAdapter());
  theirs.data.cards.apple = { id: 'apple', s: 40, reps: 9 };   // 더 진행된 쪽
  theirs.data.cards.bread = { id: 'bread', s: 1, reps: 1 };    // 덜 진행된 쪽
  theirs.data.cards.water = { id: 'water', s: 3, reps: 1 };    // 새로 들어오는 것

  mine.importJSON(theirs.exportJSON(), 'merge');
  assert.equal(mine.data.cards.apple.s, 40, '더 진행된 기록이 밀렸다');
  assert.equal(mine.data.cards.bread.s, 9, '덜 진행된 기록이 덮어썼다');
  assert.ok(mine.data.cards.water, '새 카드가 안 들어왔다');
});

test('잘못된 JSON은 예외를 던진다', () => {
  const p = new Profile(new MemoryAdapter());
  assert.throws(() => p.importJSON('{ 망가진 json'));
});

test('초기화하면 기본 프로필로 돌아간다', () => {
  const p = new Profile(new MemoryAdapter());
  p.data.cards.x = { id: 'x', s: 10 };
  p.meta.runs = 42;
  p.reset();
  assert.deepEqual(p.data.cards, {});
  assert.equal(p.meta.runs, 0);
});

test('일간 기록은 무한정 쌓이지 않는다', () => {
  const p = new Profile(new MemoryAdapter());
  for (let i = 0; i < 500; i++) {
    p.meta.daily[dayKey(Date.now() - i * 86400000)] = { reviews: 1, correct: 1, newLearned: 0, ms: 1, runs: 1 };
  }
  p.recordRun({ score: 1, wave: 1, maxCombo: 1, answered: 1, correct: 1, newLearned: 0, durationMs: 1 });
  assert.ok(Object.keys(p.meta.daily).length <= 400);
});

test('저장 실패해도 게임이 죽지 않는다', () => {
  const broken = { read: () => null, write: () => { throw new Error('quota'); }, clear: () => {} };
  const p = new Profile(broken);
  assert.throws(() => p.save());   // 어댑터가 던지면 그대로 드러나되
  assert.ok(p.data.settings);      // 프로필 자체는 멀쩡하다
});
