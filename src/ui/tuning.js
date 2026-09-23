/**
 * FSRS 개인 최적화 화면.
 *
 * 기본 파라미터는 수많은 사람의 평균이다. 내 복습 기록이 충분히 쌓이면
 * 내 망각 속도에 맞춰 다시 맞출 수 있다.
 *
 * 이 화면의 절반은 "믿어도 되는가"를 보여 주는 데 쓴다.
 * 최적화는 언제나 학습 데이터의 손실을 줄인다 — 그건 개선의 증거가 아니다.
 * 그래서 카드를 학습/검증으로 나눠서, 한 번도 안 본 카드에서도 예측이
 * 좋아졌을 때만 적용을 권한다.
 */

import { el, clear, num, pct } from './dom.js';
import {
  buildSequences, readiness, calibration, optimizeIterative,
  MIN_REVIEWS, RECOMMENDED_REVIEWS,
} from '../core/optimizer.js';
import { FSRS5_DEFAULT_W } from '../core/fsrs.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = { primary: '#eaf1ff', secondary: '#9fb0cc', muted: '#68789a', grid: '#22304d' };
const SERIES = '#3987e5';      // 단일 계열 — 색은 하나면 충분하다
const WARN = '#c98500';

const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  return n;
};

/**
 * 신뢰도 다이어그램 — "90%라고 예측했을 때 실제로 90% 맞혔는가".
 * 점이 대각선 위에 있으면 예측이 정확한 것이고,
 * 아래로 처지면 실제보다 낙관하고 있다는 뜻이다.
 */
function reliabilityChart(bins, tipHost) {
  const W = 420, H = 300;
  const pad = { t: 16, r: 16, b: 44, l: 48 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const X = (v) => pad.l + v * pw;
  const Y = (v) => pad.t + (1 - v) * ph;

  const s = svg('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'viz-svg', role: 'group',
    'aria-label': '예측 확률 대비 실제 정답률',
  });

  // 격자 — 실선 헤어라인
  for (let i = 0; i <= 4; i++) {
    const v = i / 4;
    s.appendChild(svg('line', { x1: pad.l, y1: Y(v), x2: W - pad.r, y2: Y(v), stroke: INK.grid, 'stroke-width': 1 }));
    const yl = svg('text', { x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end', fill: INK.muted, 'font-size': 11 });
    yl.textContent = `${Math.round(v * 100)}%`;
    s.appendChild(yl);
    const xl = svg('text', { x: X(v), y: H - 22, 'text-anchor': 'middle', fill: INK.muted, 'font-size': 11 });
    xl.textContent = `${Math.round(v * 100)}%`;
    s.appendChild(xl);
  }

  // 기준선 — 계열이 아니라 주석이므로 색을 쓰지 않는다
  s.appendChild(svg('line', {
    x1: X(0), y1: Y(0), x2: X(1), y2: Y(1),
    stroke: INK.muted, 'stroke-width': 1.5, opacity: 0.55,
  }));
  const ref = svg('text', { x: X(0.72), y: Y(0.72) - 9, fill: INK.muted, 'font-size': 11, 'font-style': 'italic' });
  ref.textContent = '완벽한 예측';
  s.appendChild(ref);

  const pts = bins.filter((b) => b.n >= 5 && b.predicted != null);
  if (pts.length > 1) {
    const d = pts.map((b, i) => `${i ? 'L' : 'M'}${X(b.predicted)},${Y(b.actual)}`).join(' ');
    s.appendChild(svg('path', { d, fill: 'none', stroke: SERIES, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  }
  for (const b of pts) {
    const g = svg('g');
    // 겹침 방지용 표면 링
    g.appendChild(svg('circle', { cx: X(b.predicted), cy: Y(b.actual), r: 7, fill: '#0d1424' }));
    const dot = svg('circle', { cx: X(b.predicted), cy: Y(b.actual), r: 5, fill: SERIES, class: 'viz-dot' });
    g.appendChild(dot);
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'img');
    g.setAttribute('aria-label', `예측 ${pct(b.predicted, 1)}, 실제 ${pct(b.actual, 1)}, 복습 ${b.n}회`);
    const html = `예측 <b>${pct(b.predicted, 1)}</b> → 실제 <b>${pct(b.actual, 1)}</b><br>복습 ${num(b.n)}회`;
    const show = () => tipHost.show(g, html);
    g.addEventListener('mouseenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('mouseleave', () => tipHost.hide());
    g.addEventListener('blur', () => tipHost.hide());
    s.appendChild(g);
  }

  const xt = svg('text', { x: pad.l + pw / 2, y: H - 5, 'text-anchor': 'middle', fill: INK.secondary, 'font-size': 11 });
  xt.textContent = '알고리즘이 예측한 회상 확률';
  s.appendChild(xt);
  return s;
}

function makeTip(host) {
  const tip = el('div', { class: 'viz-tip', role: 'tooltip' });
  host.appendChild(tip);
  return {
    show(target, html) {
      tip.innerHTML = html;
      tip.classList.add('is-on');
      requestAnimationFrame(() => {
        const hr = host.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        tip.style.left = `${Math.max(6, Math.min(tr.left - hr.left + tr.width / 2 - tip.offsetWidth / 2, hr.width - tip.offsetWidth - 6))}px`;
        tip.style.top = `${tr.top - hr.top - tip.offsetHeight - 10}px`;
      });
    },
    hide() { tip.classList.remove('is-on'); },
  };
}

/**
 * @param {HTMLElement} host
 * @param {{profile:any, store:any, onApply:(w:number[]|null, meta:object|null)=>void}} ctx
 */
export function renderTuning(host, ctx) {
  clear(host);
  const tip = makeTip(host);
  const log = ctx.profile.log || [];
  const seqs = buildSequences(log);
  const ready = readiness(seqs);
  const saved = ctx.profile.fsrsParams;
  const activeW = saved?.w || FSRS5_DEFAULT_W;

  host.appendChild(el('p', { class: 'field-note', html:
    'FSRS 기본 파라미터 19개는 수많은 사용자의 <b>평균</b>이다. '
    + '복습 기록이 쌓이면 내 망각 속도에 맞춰 다시 맞출 수 있다. '
    + 'Anki의 "FSRS 최적화"와 같은 방식으로, 기록을 재생하며 예측이 가장 잘 맞는 값을 찾는다.' }));

  // --- 표본 ---
  const bar = el('div', { class: 'goal-bar' }, [
    el('i', { style: { width: pct(Math.min(1, ready.n / RECOMMENDED_REVIEWS)) } }),
  ]);
  host.appendChild(el('section', { class: 'viz-card' }, [
    el('header', {}, [el('h3', { text: '모아 둔 복습 기록' })]),
    el('div', { class: 'tiles tiles--compact' }, [
      tile('예측에 쓸 수 있는 복습', num(ready.n), `카드 ${num(ready.cards)}개`),
      tile('최소 필요', num(MIN_REVIEWS), ready.ready ? '충족' : `${num(ready.need)}회 더`, ready.ready ? null : WARN),
      tile('권장', num(RECOMMENDED_REVIEWS), ready.strong ? '충족' : '많을수록 정확하다'),
    ]),
    bar,
    el('p', { class: 'viz-note', text: ready.ready
      ? (ready.strong ? '표본이 넉넉하다. 결과를 믿을 만하다.'
        : '최적화는 가능하지만 표본이 적어 결과가 흔들릴 수 있다. 며칠 더 쌓고 다시 해도 좋다.')
      : `아직 기록이 부족하다. 평소처럼 플레이하다 보면 금방 모인다.` }),
  ]));

  // --- 캘리브레이션 ---
  const calibHost = el('div');
  host.appendChild(el('section', { class: 'viz-card' }, [
    el('header', {}, [
      el('h3', { text: '지금 예측이 얼마나 맞는가' }),
      el('p', { text: '점이 대각선 위에 있으면 정확한 것이다. 아래로 처지면 실제보다 낙관하고 있다는 뜻이고, 그러면 복습 간격이 너무 길다.' }),
    ]),
    calibHost,
  ]));

  function paintCalib(w, label) {
    clear(calibHost);
    if (!ready.n) {
      calibHost.appendChild(el('p', { class: 'viz-note', text: '복습 기록이 쌓이면 여기에 그려진다.' }));
      return;
    }
    const c = calibration(w, seqs);
    calibHost.appendChild(reliabilityChart(c.bins, tip));
    const dir = c.bias < -0.02 ? '실제보다 낙관하고 있다 (간격이 길다)'
      : c.bias > 0.02 ? '실제보다 비관하고 있다 (간격이 짧다)'
      : '예측과 실제가 잘 맞는다';
    calibHost.appendChild(el('p', { class: 'viz-note', text:
      `${label} · 치우침 ${(c.bias * 100).toFixed(1)}%p — ${dir}. `
      + `로그손실 ${c.logLoss.toFixed(4)} · RMSE ${c.rmse.toFixed(4)}` }));
  }
  paintCalib(activeW, saved ? '개인 최적화 적용 중' : '기본 파라미터');

  // --- 최적화 실행 ---
  const resultBox = el('div', { class: 'tune-result' });
  const progress = el('div', { class: 'tune-progress', hidden: true }, [
    el('div', { class: 'goal-bar' }, [el('i', { class: 'tune-fill' })]),
    el('span', { class: 'tune-label', text: '' }),
  ]);
  const fill = progress.querySelector('.tune-fill');
  const label = progress.querySelector('.tune-label');

  const runBtn = el('button', {
    class: 'btn btn--primary', type: 'button',
    text: ready.ready ? '내 기록으로 최적화' : `기록이 ${num(ready.need)}회 더 필요하다`,
    disabled: !ready.ready || undefined,
    onClick: () => runOptimize(),
  });

  const resetBtn = saved ? el('button', {
    class: 'btn', type: 'button', text: '기본 파라미터로 되돌리기',
    onClick: () => {
      ctx.onApply(null, null);
      renderTuning(host, { ...ctx, profile: ctx.profile });
    },
  }) : null;

  host.appendChild(el('section', { class: 'viz-card' }, [
    el('header', {}, [
      el('h3', { text: '개인 최적화' }),
      el('p', { text: '카드를 학습용과 검증용으로 나눠서 맞춘다. 한 번도 보지 않은 카드에서도 예측이 좋아졌을 때만 적용을 권한다.' }),
    ]),
    el('div', { class: 'actions actions--wrap' }, [runBtn, resetBtn]),
    progress,
    resultBox,
  ]));

  function runOptimize() {
    runBtn.disabled = true;
    runBtn.textContent = '계산 중…';
    progress.removeAttribute('hidden');
    clear(resultBox);

    const it = optimizeIterative(seqs, { passes: 12 });
    // 한 패스마다 화면에 양보한다 — 브라우저가 멈추면 사용자는 고장으로 읽는다
    const step = () => {
      const r = it.next();
      if (!r.done) {
        fill.style.width = pct(r.value.pass / r.value.passes);
        label.textContent = `${r.value.pass}/${r.value.passes} 패스 · 로그손실 ${r.value.logLoss.toFixed(5)}`;
        setTimeout(step, 0);
        return;
      }
      progress.setAttribute('hidden', '');
      runBtn.disabled = false;
      runBtn.textContent = '다시 최적화';
      showResult(r.value);
    };
    setTimeout(step, 30);
  }

  function showResult(res) {
    const better = res.improvement > 0.005;
    clear(resultBox);

    resultBox.appendChild(el('div', { class: 'tiles tiles--compact' }, [
      tile('검증 세트 개선', `${(res.improvement * 100).toFixed(2)}%`,
        `카드 ${num(res.validCards)}개 · 한 번도 학습에 안 쓴 것`,
        better ? '#199e70' : WARN),
      tile('학습 세트 개선', `${(res.trainImprovement * 100).toFixed(2)}%`, '참고용 — 항상 좋아진다'),
      tile('로그손실', res.validLoss.toFixed(4), `기본 ${res.baselineValid.toFixed(4)}`),
    ]));

    if (better) {
      resultBox.appendChild(el('p', { class: 'tune-verdict is-good', html:
        `처음 보는 카드에서도 예측이 <b>${(res.improvement * 100).toFixed(2)}%</b> 좋아졌다. 적용할 만하다.` }));
      resultBox.appendChild(el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn btn--primary', type: 'button', text: '이 파라미터 적용',
          onClick: () => {
            ctx.onApply(res.w, {
              optimizedAt: Date.now(), n: res.n,
              improvement: res.improvement, logLoss: res.validLoss,
            });
            renderTuning(host, ctx);
          },
        }),
      ]));
    } else {
      resultBox.appendChild(el('p', { class: 'tune-verdict is-flat', html:
        '검증 세트에서는 <b>의미 있는 개선이 없었다.</b> '
        + '기본 파라미터가 이미 내 기억에 잘 맞는다는 뜻이거나, 표본이 아직 부족하다는 뜻이다. '
        + '학습 세트만 좋아진 건 과적합이므로 적용하지 않는 편이 낫다.' }));
      resultBox.appendChild(el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn', type: 'button', text: '그래도 적용',
          onClick: () => {
            ctx.onApply(res.w, {
              optimizedAt: Date.now(), n: res.n,
              improvement: res.improvement, logLoss: res.validLoss, forced: true,
            });
            renderTuning(host, ctx);
          },
        }),
      ]));
    }

    resultBox.appendChild(el('details', { class: 'tune-params' }, [
      el('summary', { text: '파라미터 19개 보기' }),
      el('div', { class: 'param-grid' }, res.w.map((v, i) => el('span', {
        class: Math.abs(v - FSRS5_DEFAULT_W[i]) > 1e-6 ? 'param is-changed' : 'param',
        title: `기본값 ${FSRS5_DEFAULT_W[i]}`,
      }, [el('em', { text: `w${i}` }), String(v.toFixed(4))]))),
    ]));
  }

  if (saved) {
    host.appendChild(el('p', { class: 'viz-note', text:
      `적용 중인 개인 파라미터 — ${new Date(saved.optimizedAt).toLocaleDateString('ko-KR')} 기준, `
      + `복습 ${num(saved.n)}회로 학습, 검증 개선 ${(saved.improvement * 100).toFixed(2)}%`
      + (saved.forced ? ' (개선 없이 수동 적용)' : '') }));
  }
}

function tile(label, value, sub, color) {
  return el('div', { class: 'tile' }, [
    el('label', { text: label }),
    el('b', { class: 'tile-value', style: color ? { color } : {}, text: value }),
    sub ? el('span', { class: 'tile-sub', text: sub }) : null,
  ]);
}
