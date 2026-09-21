/**
 * 학습 통계 대시보드 — 인라인 SVG.
 *
 * 이 화면의 목적은 "알고리즘을 믿게 만드는 것"이다.
 * 며칠 뒤에 몇 개가 돌아오는지, 내 정답률이 목표치(90%) 근처인지 보이면
 * 사용자는 스케줄을 신뢰하고 매일 돌아온다.
 *
 * 차트 규칙:
 *  - 단일 계열 막대 = 한 가지 색 (길이로 이미 크기를 말하고 있으니 색은 낭비)
 *  - 순차 스케일 = 한 색상의 명도 변화만 (무지개 금지)
 *  - 범주형 4색은 어두운 표면 #141a2b 기준으로 CVD 검증을 통과한 조합
 *  - 격자/축은 실선 헤어라인, 값 라벨은 선택적으로만
 *  - 모든 차트에 표(table) 대체 보기 제공
 */

import { el, clear, num, pct, duration } from './dom.js';
import { State, DAY_MS } from '../core/fsrs.js';
import { dayKey } from '../core/storage.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 어두운 표면에서 검증된 범주형 슬롯 (dataviz 검증기 전 항목 통과) */
const CAT = {
  new: '#3987e5',        // 파랑   — 아직 안 배운 것
  learning: '#d95926',   // 주황   — 배우는 중
  review: '#199e70',     // 청록   — 복습 궤도
  relearning: '#c98500', // 노랑   — 잊어서 재학습
};

/** 순차 램프 (파랑 한 색). 어두운 표면에서는 어두울수록 0에 가깝다. */
const SEQ_DARK = ['#16233c', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];

const INK = { primary: '#eaf1ff', secondary: '#9fb0cc', muted: '#68789a', grid: '#22304d' };

function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  }
  return n;
}

/** 위쪽 두 모서리만 둥근 막대 (바닥선에 붙는다) */
function barPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} `
       + `L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// ---------------------------------------------------------------------
// 툴팁 — 차트 하나가 아니라 대시보드 전체가 공유한다
// ---------------------------------------------------------------------

function makeTooltip(host) {
  const tip = el('div', { class: 'viz-tip', role: 'tooltip', 'aria-hidden': 'true' });
  host.appendChild(tip);
  let raf = 0;
  return {
    show(target, html) {
      tip.innerHTML = html;
      tip.setAttribute('aria-hidden', 'false');
      tip.classList.add('is-on');
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const hr = host.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        const tw = tip.offsetWidth;
        let left = tr.left - hr.left + tr.width / 2 - tw / 2;
        left = Math.max(6, Math.min(left, hr.width - tw - 6));
        tip.style.left = `${left}px`;
        tip.style.top = `${tr.top - hr.top - tip.offsetHeight - 10}px`;
      });
    },
    hide() {
      tip.classList.remove('is-on');
      tip.setAttribute('aria-hidden', 'true');
    },
  };
}

/** 마크에 호버/포커스 툴팁을 붙인다 — 키보드로도 읽을 수 있어야 한다 */
function attachTip(node, tip, html, label) {
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', label);
  const show = () => tip.show(node, html);
  const hide = () => tip.hide();
  node.addEventListener('mouseenter', show);
  node.addEventListener('mouseleave', hide);
  node.addEventListener('focus', show);
  node.addEventListener('blur', hide);
}

// ---------------------------------------------------------------------
// 차트들
// ---------------------------------------------------------------------

/**
 * 복습 예정량 — 단일 계열이므로 색은 하나. 범례 없음(제목이 계열을 말한다).
 */
function forecastChart(buckets, tip) {
  const W = 620, H = 200;
  const pad = { t: 22, r: 12, b: 34, l: 40 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const max = Math.max(1, ...buckets);
  const gap = 2;
  const slot = pw / buckets.length;
  const bw = Math.max(6, slot - gap);
  const maxIdx = buckets.indexOf(max);

  const s = svg('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', preserveAspectRatio: 'xMidYMid meet',
    role: 'group', 'aria-label': '향후 14일 복습 예정량',
  });

  // 격자 — 실선 헤어라인, 표면보다 한 단계만 밝게
  const ticks = niceTicks(max, 4);
  for (const t of ticks) {
    const y = pad.t + ph - (t / ticks[ticks.length - 1]) * ph;
    s.appendChild(svg('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: INK.grid, 'stroke-width': 1 }));
    const lab = svg('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', fill: INK.muted, 'font-size': 11 });
    lab.textContent = String(t);
    s.appendChild(lab);
  }

  buckets.forEach((v, i) => {
    const h = (v / ticks[ticks.length - 1]) * ph;
    const x = pad.l + i * slot + gap / 2;
    const y = pad.t + ph - h;
    if (v > 0) {
      const p = svg('path', { d: barPath(x, y, bw, h, 4), fill: CAT.new, class: 'viz-bar' });
      attachTip(p, tip,
        `<b>${i === 0 ? '오늘 (밀린 것 포함)' : `${i}일 뒤`}</b><br>${num(v)}개 복습 예정`,
        `${i === 0 ? '오늘' : `${i}일 뒤`} ${v}개`);
      s.appendChild(p);
    }
    if (i % 2 === 0 || i === buckets.length - 1) {
      const lab = svg('text', { x: x + bw / 2, y: H - 12, 'text-anchor': 'middle', fill: INK.muted, 'font-size': 11 });
      lab.textContent = i === 0 ? '오늘' : `+${i}`;
      s.appendChild(lab);
    }
  });

  // 직접 라벨은 최댓값 하나만 — 모든 막대에 숫자를 붙이면 읽히지 않는다
  if (max > 0) {
    const x = pad.l + maxIdx * slot + gap / 2 + bw / 2;
    const y = pad.t + ph - (max / ticks[ticks.length - 1]) * ph;
    const lab = svg('text', { x, y: y - 7, 'text-anchor': 'middle', fill: INK.primary, 'font-size': 12, 'font-weight': 700 });
    lab.textContent = String(max);
    s.appendChild(lab);
  }

  // 바닥 축
  s.appendChild(svg('line', { x1: pad.l, y1: pad.t + ph, x2: W - pad.r, y2: pad.t + ph, stroke: INK.grid, 'stroke-width': 1 }));
  return s;
}

/**
 * 기억 상태 분포 — 가로 누적 막대 1개. 계열이 4개이므로 범례는 항상, 직접 라벨도 함께.
 */
function stateBar(summary, tip) {
  const rows = [
    ['new', '미학습', summary.new],
    ['learning', '학습 중', summary.learning],
    ['review', '복습 궤도', summary.review],
    ['relearning', '재학습', summary.relearning],
  ].filter((r) => r[2] > 0);

  const total = rows.reduce((s, r) => s + r[2], 0) || 1;
  const W = 620, H = 46, gap = 2;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'group', 'aria-label': '기억 상태 분포' });

  let x = 0;
  for (const [key, label, v] of rows) {
    const w = Math.max(3, (v / total) * W - gap);
    const rect = svg('rect', { x, y: 6, width: w, height: 26, rx: 4, fill: CAT[key], class: 'viz-bar' });
    attachTip(rect, tip, `<b>${label}</b><br>${num(v)}개 · ${pct(v / total, 1)}`, `${label} ${v}개`);
    s.appendChild(rect);
    // 칸이 충분히 넓을 때만 안에 라벨 — 잘린 글자는 안 넣느니만 못하다
    if (w > 54) {
      const t = svg('text', { x: x + w / 2, y: 24, 'text-anchor': 'middle', fill: '#08101f', 'font-size': 12, 'font-weight': 700 });
      t.textContent = String(v);
      s.appendChild(t);
    }
    x += w + gap;
  }

  const legend = el('div', { class: 'viz-legend' },
    [['new', '미학습'], ['learning', '학습 중'], ['review', '복습 궤도'], ['relearning', '재학습']]
      .map(([k, label]) => el('span', { class: 'lg' }, [
        el('i', { style: { background: CAT[k] } }),
        `${label} ${num(summary[k] || 0)}`,
      ])));

  return el('div', {}, [s, legend]);
}

/**
 * 학습 활동 히트맵 — 한 색상의 명도만 쓴다.
 * 어두운 표면이므로 "0에 가까울수록 표면에 가깝게(어둡게)".
 */
function heatmap(daily, tip, weeks = 18) {
  const cell = 13, gap = 3;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (weeks * 7 - 1 - today.getDay()) * DAY_MS);

  const days = [];
  let maxV = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    if (d > today) break;
    const k = dayKey(d.getTime());
    const v = daily[k]?.reviews || 0;
    maxV = Math.max(maxV, v);
    days.push({ d, k, v });
  }

  const cols = Math.ceil(days.length / 7);
  const W = cols * (cell + gap) + 30;
  const H = 7 * (cell + gap) + 22;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz-svg viz-svg--heat', role: 'group', 'aria-label': '일별 학습 활동' });

  const stepFor = (v) => {
    if (v <= 0) return SEQ_DARK[0];
    const t = Math.log1p(v) / Math.log1p(Math.max(maxV, 1));
    return SEQ_DARK[Math.max(1, Math.min(SEQ_DARK.length - 1, Math.round(t * (SEQ_DARK.length - 1))))];
  };

  ['월', '수', '금'].forEach((lab, i) => {
    const t = svg('text', { x: 0, y: 20 + (i * 2 + 1) * (cell + gap), fill: INK.muted, 'font-size': 10 });
    t.textContent = lab;
    s.appendChild(t);
  });

  days.forEach((day, i) => {
    const col = Math.floor(i / 7);
    const row = i % 7;
    const rect = svg('rect', {
      x: 26 + col * (cell + gap), y: 14 + row * (cell + gap),
      width: cell, height: cell, rx: 3, fill: stepFor(day.v), class: 'viz-cell',
    });
    attachTip(rect, tip, `<b>${day.k}</b><br>${day.v ? `복습 ${num(day.v)}회` : '학습 없음'}`,
      `${day.k} ${day.v}회`);
    s.appendChild(rect);
  });

  const scale = el('div', { class: 'viz-scale' }, [
    el('span', { text: '적음' }),
    ...SEQ_DARK.map((c) => el('i', { style: { background: c } })),
    el('span', { text: '많음' }),
  ]);

  return el('div', {}, [el('div', { class: 'viz-scroll' }, [s]), scale]);
}

// ---------------------------------------------------------------------
// 조립
// ---------------------------------------------------------------------

function tile(label, value, sub, accent) {
  return el('div', { class: 'tile' }, [
    el('label', { text: label }),
    el('b', { class: 'tile-value', style: accent ? { color: accent } : {}, text: value }),
    sub ? el('span', { class: 'tile-sub', text: sub }) : null,
  ]);
}

function card(title, note, body) {
  return el('section', { class: 'viz-card' }, [
    el('header', {}, [el('h3', { text: title }), note ? el('p', { text: note }) : null]),
    body,
  ]);
}

/** 차트의 표 대체 보기 */
function tableToggle(headers, rows) {
  const table = el('table', { class: 'viz-table' }, [
    el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { text: h })))]),
    el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c) => el('td', { text: String(c) }))))),
  ]);
  const wrap = el('div', { class: 'viz-table-wrap', hidden: true }, [table]);
  const btn = el('button', {
    class: 'link-btn', type: 'button', text: '표로 보기',
    onClick: () => {
      const on = wrap.hasAttribute('hidden');
      if (on) wrap.removeAttribute('hidden'); else wrap.setAttribute('hidden', '');
      btn.textContent = on ? '차트로 보기' : '표로 보기';
    },
  });
  return el('div', { class: 'viz-alt' }, [btn, wrap]);
}

/**
 * 대시보드 전체를 그린다.
 * @param {HTMLElement} host
 * @param {{store:any, profile:any, words:object[]}} ctx
 */
export function renderStats(host, ctx) {
  const { store, profile, words } = ctx;
  const now = Date.now();
  const ids = words.map((w) => w.id);
  const summary = store.summary(now, ids);
  const forecast = store.forecast(14, now);
  const ret = store.trueRetention(now - 30 * DAY_MS);
  const meta = profile.meta;

  clear(host);
  const tip = makeTooltip(host);

  const studied = summary.total - summary.new;
  const target = profile.settings.requestRetention;

  // --- KPI 타일: 숫자 하나가 곧 차트다 ---
  host.appendChild(el('div', { class: 'tiles' }, [
    tile('학습한 단어', num(studied), `전체 ${num(summary.total)}개 중`),
    tile('지금 복습 가능', num(summary.due), summary.due ? '바로 한 판 하기 좋다' : '오늘 몫은 끝났다', summary.due ? CAT.review : INK.secondary),
    tile('30일 정답률', ret.total ? pct(ret.rate, 1) : '—',
      ret.total ? `목표 ${pct(target)} · 표본 ${num(ret.total)}` : '아직 기록 없음',
      ret.total ? (Math.abs(ret.rate - target) < 0.06 ? CAT.review : CAT.relearning) : INK.secondary),
    tile('연속 학습일', `${num(meta.streak)}일`, meta.runs ? `총 ${num(meta.runs)}판` : '첫 판을 시작해 보자'),
    tile('최고 점수', num(meta.bestScore), `웨이브 ${meta.bestWave} · ${meta.bestCombo}연속`),
    tile('누적 플레이', duration(meta.totalPlayMs), `복습 ${num(meta.totalReviews)}회`),
  ]));

  // --- 복습 예정량 ---
  host.appendChild(card(
    '앞으로 14일 복습 예정량',
    'FSRS가 각 단어의 안정성(S)으로부터 계산한 일정. 오늘 칸에는 밀린 카드가 함께 들어간다.',
    el('div', {}, [
      forecastChart(forecast, tip),
      tableToggle(['시점', '복습 예정'], forecast.map((v, i) => [i === 0 ? '오늘' : `${i}일 뒤`, v])),
    ])
  ));

  // --- 상태 분포 ---
  host.appendChild(card(
    '기억 상태 분포',
    '재학습 칸이 두꺼워지면 신규 단어를 잠시 줄이고 복습에 집중할 때다.',
    el('div', {}, [
      stateBar(summary, tip),
      el('p', { class: 'viz-note', text:
        `평균 안정성 ${summary.avgStability.toFixed(1)}일 · 평균 난이도 ${summary.avgDifficulty.toFixed(1)}/10 · `
        + `성숙(21일 이상) ${num(summary.matured)}개` }),
    ])
  ));

  // --- 활동 히트맵 ---
  host.appendChild(card(
    '학습 활동',
    '간격 반복은 몰아치기보다 매일 조금씩이 강하다. 칸이 끊기지 않게 하는 게 핵심.',
    el('div', {}, [heatmap(meta.daily || {}, tip)])
  ));

  // --- 자주 틀리는 단어 ---
  const leeches = summary.leeches.slice(0, 12).map((l) => {
    const w = words.find((x) => x.id === l.id);
    return { ...l, w };
  }).filter((x) => x.w);

  host.appendChild(card(
    '자꾸 놓치는 단어',
    leeches.length
      ? '4번 이상 실패한 단어들. 뜻을 쪼개거나 예문을 붙여서 따로 공략하는 편이 빠르다.'
      : '아직 반복해서 틀리는 단어가 없다.',
    leeches.length
      ? el('table', { class: 'viz-table' }, [
          el('thead', {}, [el('tr', {}, ['단어', '뜻', '실패', '안정성', '난이도'].map((h) => el('th', { text: h })))]),
          el('tbody', {}, leeches.map((l) => el('tr', {}, [
            el('td', {}, [el('b', { text: l.w.en })]),
            el('td', { text: l.w.ko }),
            el('td', { text: `${l.lapses}회` }),
            el('td', { text: `${l.s.toFixed(1)}일` }),
            el('td', { text: l.d.toFixed(1) }),
          ]))),
        ])
      : el('p', { class: 'viz-note', text: '계속 이 상태를 유지하자.' })
  ));
}

function niceTicks(max, count) {
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const out = [];
  for (let v = 0; v <= Math.ceil(max / step) * step; v += step) out.push(Math.round(v));
  return out.length > 1 ? out : [0, 1];
}

export { CAT as STATE_COLORS };
