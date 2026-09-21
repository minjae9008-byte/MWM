/**
 * 로그라이크 업그레이드 — 유물(패시브) / 스킬(액티브) / 저주(리스크).
 *
 * 설계 원칙: 업그레이드는 "게임"만 바꾸고 "기억 추정치"는 바꾸지 않는다.
 *   점수·속도·탄약·연출은 마음껏 건드리되,
 *   FSRS의 S/D 계산에는 어떤 유물도 손대지 않는다.
 *   보상으로 안정성을 부풀리면 복습 일정이 거짓말을 하게 되고,
 *   그건 이 게임의 존재 이유를 스스로 무너뜨리는 일이다.
 *   학습에 영향을 주는 유물은 "무엇을 더 자주 보여줄까"(출제 구성)까지만 관여한다.
 *
 * 순수 로직 — DOM 의존 없음.
 */

import { josa } from './korean.js';

/** 유물이 조립하는 최종 수정치 */
export function baseMods() {
  return {
    blastRadius: 1,
    precision: false,          // 조준한 미사일만 파괴 (오폭 없음)
    interceptorSpeed: 1,
    fallSpeed: 1,
    ammoBonus: 0,
    ammoRegenSec: 0,
    scoreMul: 1,
    comboStep: 1,
    focusGain: 1,
    shieldPerWave: 0,          // 웨이브당 무효화되는 실수 횟수
    repairPerWave: 0,
    decoyDelta: 0,
    chainClear: false,         // 정답 요격 시 같은 볼리 오답 무해 제거
    newCardBonus: 0,
    skillSlots: 2,
    firstSeenScoreMul: 1,      // 처음 보는 단어 점수 배수
    fastAnswerBonus: 0,        // 3초 내 요격 추가 점수 비율
    weakRecallBonus: 0,        // R이 낮은 카드 추가 점수 비율
    lastStandSlow: 0,
    tracer: false,             // 정답 미사일 미세 발광
    waveOpenBonus: 0,
    blurText: false,
    mirvChanceDelta: 0,
  };
}

/** @type {Array<{id:string,name:string,desc:string,icon:string,rarity:string,tier:number,apply:(m:object)=>void,curse?:boolean}>} */
export const RELICS = [
  { id: 'warhead', name: '확장 탄두', icon: '💥', rarity: 'common', tier: 1,
    desc: '폭발 반경 +30%. 넓게 터져 맞히기 쉬워진다.',
    apply: (m) => { m.blastRadius *= 1.3; } },

  { id: 'precision', name: '정밀 신관', icon: '🎯', rarity: 'rare', tier: 2,
    desc: '폭발이 조준한 미사일만 파괴한다. 오폭으로 인한 오답이 사라진다.',
    apply: (m) => { m.precision = true; } },

  { id: 'twinbarrel', name: '쌍열 포신', icon: '⚡', rarity: 'common', tier: 1,
    desc: '요격 미사일 속도 +45%.',
    apply: (m) => { m.interceptorSpeed *= 1.45; } },

  { id: 'chain', name: '연쇄 반응', icon: '🔗', rarity: 'rare', tier: 2,
    desc: '정답을 맞히면 같은 볼리의 오답들이 무해하게 소멸한다.',
    apply: (m) => { m.chainClear = true; } },

  { id: 'memshield', name: '기억의 방패', icon: '🛡️', rarity: 'rare', tier: 2,
    desc: '웨이브마다 첫 실수 1회를 무효화한다. (단어 평가에는 그대로 기록)',
    apply: (m) => { m.shieldPerWave += 1; } },

  { id: 'compound', name: '복리 이자', icon: '📈', rarity: 'rare', tier: 2,
    desc: '콤보 배수 상승 속도 +60%.',
    apply: (m) => { m.comboStep *= 1.6; } },

  { id: 'supply', name: '보급선', icon: '📦', rarity: 'common', tier: 1,
    desc: '웨이브마다 탄약 +8.',
    apply: (m) => { m.ammoBonus += 8; } },

  { id: 'autoload', name: '자동 장전', icon: '🔄', rarity: 'common', tier: 1,
    desc: '4초마다 탄약 1발이 회복된다.',
    apply: (m) => { m.ammoRegenSec = m.ammoRegenSec ? Math.min(m.ammoRegenSec, 4) : 4; } },

  { id: 'damper', name: '관성 감쇠장치', icon: '🪂', rarity: 'common', tier: 1,
    desc: '적 미사일 낙하 속도 -14%.',
    apply: (m) => { m.fallSpeed *= 0.86; } },

  { id: 'deepcode', name: '심층 부호화', icon: '🧠', rarity: 'rare', tier: 2,
    desc: '처음 보는 단어를 맞히면 점수 2배.',
    apply: (m) => { m.firstSeenScoreMul *= 2; } },

  { id: 'fluency', name: '인출 유창성', icon: '⏱️', rarity: 'common', tier: 1,
    desc: '3초 안에 요격하면 점수 +60%.',
    apply: (m) => { m.fastAnswerBonus += 0.6; } },

  { id: 'rebuild', name: '재건 프로토콜', icon: '🏗️', rarity: 'rare', tier: 2,
    desc: '웨이브를 넘길 때마다 파괴된 기억 저장소 1개를 복구한다.',
    apply: (m) => { m.repairPerWave += 1; } },

  { id: 'spacing', name: '과학적 간격', icon: '📚', rarity: 'common', tier: 1,
    desc: '이번 런에서 배울 신규 단어 +8.',
    apply: (m) => { m.newCardBonus += 8; } },

  { id: 'forgetting', name: '망각곡선 역이용', icon: '📉', rarity: 'rare', tier: 2,
    desc: '거의 잊어버린 단어(R이 낮을수록)를 맞히면 점수가 크게 오른다.',
    apply: (m) => { m.weakRecallBonus += 1.0; } },

  { id: 'scatter', name: '분산 표적', icon: '➖', rarity: 'common', tier: 1,
    desc: '동시에 떨어지는 오답이 1개 줄어든다.',
    apply: (m) => { m.decoyDelta -= 1; } },

  { id: 'slot', name: '확장 슬롯', icon: '🔌', rarity: 'rare', tier: 2,
    desc: '스킬 슬롯 +1.',
    apply: (m) => { m.skillSlots += 1; } },

  { id: 'recover', name: '에너지 회수', icon: '🔋', rarity: 'common', tier: 1,
    desc: '집중 게이지 획득량 +40%.',
    apply: (m) => { m.focusGain *= 1.4; } },

  { id: 'laststand', name: '마지막 보루', icon: '🕯️', rarity: 'rare', tier: 2,
    desc: '저장소가 1개만 남으면 적 미사일이 30% 느려진다.',
    apply: (m) => { m.lastStandSlow = Math.max(m.lastStandSlow, 0.3); } },

  { id: 'tracer', name: '예광탄', icon: '✨', rarity: 'common', tier: 1,
    desc: '정답 미사일이 아주 희미하게 빛난다. 대신 총점 -12%.',
    apply: (m) => { m.tracer = true; m.scoreMul *= 0.88; } },

  { id: 'blitz', name: '폭풍 전야', icon: '🌪️', rarity: 'common', tier: 1,
    desc: '각 웨이브의 처음 3볼리 동안 점수 2배.',
    apply: (m) => { m.waveOpenBonus += 1; } },

  // --- 저주: 큰 대가를 치르고 강한 보상을 받는다 ---
  { id: 'curse_gravity', name: '[저주] 중력 이상', icon: '🌑', rarity: 'curse', tier: 0, curse: true,
    desc: '적 미사일 낙하 속도 +22%.',
    apply: (m) => { m.fallSpeed *= 1.22; } },

  { id: 'curse_fog', name: '[저주] 기억의 안개', icon: '🌫️', rarity: 'curse', tier: 0, curse: true,
    desc: '단어가 흐릿하게 보인다.',
    apply: (m) => { m.blurText = true; } },

  { id: 'curse_scarcity', name: '[저주] 탄약 부족', icon: '🚫', rarity: 'curse', tier: 0, curse: true,
    desc: '웨이브당 탄약 -7. 헛발질이 곧 죽음이다.',
    apply: (m) => { m.ammoBonus -= 7; } },

  { id: 'curse_swarm', name: '[저주] 다탄두 확산', icon: '🧨', rarity: 'curse', tier: 0, curse: true,
    desc: '오답 +1, 다탄두 분열 확률 +25%.',
    apply: (m) => { m.decoyDelta += 1; m.mirvChanceDelta += 0.25; } },
];

export const RELIC_BY_ID = new Map(RELICS.map((r) => [r.id, r]));

/** 액티브 스킬 — 집중(Focus) 게이지를 소모한다 */
export const SKILLS = [
  { id: 'slowfield', name: '시간 왜곡', icon: '🕰️', cost: 35, duration: 5000,
    desc: '5초간 모든 적 미사일이 절반 속도로 낙하한다.' },
  { id: 'emp', name: 'EMP 정화', icon: '📡', cost: 50, duration: 0,
    desc: '화면의 모든 오답 미사일을 즉시 제거한다. 정답만 남는다.' },
  { id: 'autolock', name: '자동 조준', icon: '🔒', cost: 45, duration: 0, charges: 2,
    desc: '다음 2번의 정답을 자동으로 요격한다. (평가는 "보통"으로 제한)' },
  { id: 'repair', name: '긴급 복구', icon: '🧰', cost: 60, duration: 0,
    desc: '파괴된 기억 저장소 1개를 즉시 재건한다.' },
  { id: 'overcharge', name: '과부하', icon: '🔥', cost: 55, duration: 9000,
    desc: '9초간 점수 2배, 폭발 반경 1.6배.' },
  { id: 'recall', name: '기억 소환', icon: '💡', cost: 30, duration: 3500,
    desc: '3.5초간 정답 미사일에 표식이 뜬다. (평가는 "어려움"으로 제한)' },
];

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

/** 보유 유물 목록 → 최종 수정치 */
export function computeMods(relicIds) {
  const m = baseMods();
  for (const id of relicIds) {
    const r = RELIC_BY_ID.get(id);
    if (r) r.apply(m);
  }
  m.skillSlots = Math.min(m.skillSlots, 4);
  return m;
}

/**
 * 웨이브 종료 후 제시할 선택지 3개를 뽑는다.
 * @param {{rng:any, owned:Set<string>, ownedSkills:Set<string>, wave:number, mods:object}} ctx
 */
export function rollOffers(ctx) {
  const { rng, owned, ownedSkills, wave, mods } = ctx;
  const offers = [];

  // 아직 배우지 않은 스킬 — 슬롯이 남아 있을 때만
  const skillPool = SKILLS.filter((s) => !ownedSkills.has(s.id));
  if (skillPool.length && ownedSkills.size < mods.skillSlots && rng.bool(0.45)) {
    offers.push({ kind: 'skill', ...rng.pick(skillPool) });
  }

  const elite = wave > 0 && wave % 5 === 0;
  const pool = RELICS.filter((r) => !r.curse && !owned.has(r.id)
    && (elite ? true : r.rarity !== 'rare' || rng.bool(0.5)));

  while (offers.length < 3 && pool.length) {
    const weights = pool.map((r) => (r.rarity === 'rare' ? (elite ? 3 : 1) : 2.5));
    const [i] = rng.weightedSample(weights, 1);
    offers.push({ kind: 'relic', ...pool[i] });
    pool.splice(i, 1);
  }

  // 엘리트 웨이브: 저주를 감수하면 희귀 유물 2개를 한 번에 받는 도박 선택지
  if (elite) {
    const cursePool = RELICS.filter((r) => r.curse && !owned.has(r.id));
    const rarePool = RELICS.filter((r) => !r.curse && r.rarity === 'rare' && !owned.has(r.id));
    if (cursePool.length && rarePool.length >= 2) {
      const curse = rng.pick(cursePool);
      const picks = rng.shuffle(rarePool.slice()).slice(0, 2);
      offers[offers.length - 1] = {
        kind: 'pact',
        id: `pact_${curse.id}`,
        name: '악마의 거래',
        icon: '☠️',
        desc: `${josa(picks.map((p) => p.name).join(' + '), '을')} 한 번에 얻는다. 대신 ${curse.name}.`,
        grants: picks.map((p) => p.id),
        curse: curse.id,
        rarity: 'pact',
      };
    }
  }

  return offers.slice(0, 3);
}
