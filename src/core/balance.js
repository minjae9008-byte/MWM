/**
 * 난이도 곡선.
 *
 * 목표는 "점점 빨라진다"를 체감시키되, 인지 부하가 물리 난이도를 앞서게 두는 것.
 * 손이 아니라 기억이 먼저 한계에 닿아야 단어 게임이다.
 * 그래서 낙하 속도는 완만하게(로그에 가깝게) 올리고,
 * 동시 볼리 수와 오답 개수를 더 공격적으로 올린다.
 */

export const GROUND_RATIO = 0.86;   // 캔버스 높이 대비 지면 위치

export function waveConfig(wave, mods, difficulty = 1) {
  const w = Math.max(1, wave);

  // 낙하 시간(초): 처음엔 넉넉히 9초, 후반에도 3.1초 밑으로는 내려가지 않는다
  const baseFall = Math.max(3.1, 9.0 - 2.05 * Math.log2(w + 1));
  const fallTime = (baseFall / difficulty) / Math.max(0.35, mods.fallSpeed);

  // 오답 개수
  const decoys = clamp(Math.round(2 + (w - 1) * 0.34) + mods.decoyDelta, 1, 6);

  // 한 웨이브의 볼리 수
  const volleys = Math.round(6 + Math.min(w * 1.1, 12));

  // 다음 볼리까지의 간격(초) — 줄어들수록 동시에 여러 문제가 떠 있게 된다
  const gap = Math.max(1.15, fallTime * (w < 3 ? 1.05 : 0.62));

  // 동시에 존재 가능한 볼리 수
  const maxConcurrent = w < 3 ? 1 : w < 7 ? 2 : 3;

  return {
    wave: w,
    fallTime,
    decoys,
    volleys,
    gap,
    maxConcurrent,
    mirvChance: clamp((w >= 6 ? 0.1 + (w - 6) * 0.03 : 0) + mods.mirvChanceDelta, 0, 0.6),
    armoredChance: w >= 9 ? clamp((w - 9) * 0.035, 0, 0.3) : 0,
    isBoss: w % 5 === 0,
    ammo: Math.max(6, 26 + mods.ammoBonus),
  };
}

export const DIFFICULTY_PRESETS = [
  { id: 'relaxed', name: '느긋하게', mul: 0.75, desc: '속도 25% 완화. 단어에만 집중하고 싶을 때.' },
  { id: 'normal', name: '표준', mul: 1.0, desc: '설계된 그대로의 곡선.' },
  { id: 'intense', name: '맹렬하게', mul: 1.3, desc: '속도 30% 가속. 반사신경까지 시험한다.' },
];

/** 점수 계산 */
export function scoreFor(ctx) {
  const { mods, combo, isNew, retrievability, reactionMs, waveOpen, overcharged, difficulty } = ctx;
  let base = 100;

  if (isNew) base *= mods.firstSeenScoreMul;
  if (reactionMs < 3000) base *= 1 + mods.fastAnswerBonus;
  if (mods.weakRecallBonus > 0) base *= 1 + mods.weakRecallBonus * (1 - clamp(retrievability, 0, 1));
  if (waveOpen && mods.waveOpenBonus) base *= 1 + mods.waveOpenBonus;
  if (overcharged) base *= 2;

  base *= mods.scoreMul;
  base *= comboMultiplier(combo, mods);
  base *= difficulty;
  return Math.round(base);
}

/** 콤보 배수 — 10콤보 근처에서 체감이 확 온다 */
export function comboMultiplier(combo, mods) {
  if (combo <= 1) return 1;
  return 1 + Math.log2(combo) * 0.42 * mods.comboStep;
}

export function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}
