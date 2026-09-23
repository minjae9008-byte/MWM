/**
 * 단어장 — 내가 아는 단어와 모르는 단어를 직접 들여다보는 곳.
 *
 * 게임만 있으면 "내가 뭘 못 외우고 있는지"를 알 수 없다.
 * 검색해서 찾고, 상태를 보고, 필요하면 손대야 한다:
 *   즐겨찾기 — 먼저 나오게
 *   보류    — 아예 안 나오게 (이미 아는 단어, 지금 필요 없는 단어)
 *   초기화  — 기억 기록을 지우고 처음부터
 */

import { el, clear, num, pct } from './dom.js';
import { State, DAY_MS, formatInterval } from '../core/fsrs.js';

const PAGE = 60;

const POS_LABEL = { n: '명사', v: '동사', a: '형용사', ad: '부사', prep: '전치사', phr: '구' };

const FILTERS = [
  { id: 'all', name: '전체' },
  { id: 'due', name: '복습 대기' },
  { id: 'learning', name: '학습 중' },
  { id: 'review', name: '복습 궤도' },
  { id: 'new', name: '미학습' },
  { id: 'leech', name: '자주 틀림' },
  { id: 'starred', name: '★ 즐겨찾기' },
  { id: 'suspended', name: '보류' },
];

const SORTS = [
  { id: 'due', name: '복습 순' },
  { id: 'lapses', name: '실패 많은 순' },
  { id: 'difficulty', name: '어려운 순' },
  { id: 'alpha', name: '가나다·ABC 순' },
];

/**
 * @param {HTMLElement} host
 * @param {{words:object[], store:any, decks:object[], onChange:()=>void,
 *          onSpeak?:(w:string)=>void, onFocusRun?:(ids:string[])=>void}} ctx
 */
export function renderWordbook(host, ctx) {
  const state = { q: '', filter: 'all', sort: 'due', deck: 'all', limit: PAGE };

  const search = el('input', {
    class: 'text-input', type: 'search', placeholder: '단어나 뜻으로 검색',
    'aria-label': '단어 검색',
    oninput: (e) => { state.q = e.target.value.trim().toLowerCase(); state.limit = PAGE; paint(); },
  });

  const chips = el('div', { class: 'chip-row' });
  const deckChips = el('div', { class: 'chip-row' });
  const sortSel = el('select', {
    class: 'select', 'aria-label': '정렬',
    onChange: (e) => { state.sort = e.target.value; paint(); },
  }, SORTS.map((s) => el('option', { value: s.id, text: s.name })));

  const summary = el('p', { class: 'wb-summary' });
  const list = el('div', { class: 'wb-list' });
  const more = el('div', { class: 'wb-more' });

  clear(host);
  host.appendChild(el('div', { class: 'wb-controls' }, [
    search,
    el('div', { class: 'wb-filters' }, [chips, sortSel]),
    deckChips,
  ]));
  host.appendChild(summary);
  host.appendChild(list);
  host.appendChild(more);

  function buildChips() {
    clear(chips);
    for (const f of FILTERS) {
      chips.appendChild(el('button', {
        class: `chip${state.filter === f.id ? ' is-on' : ''}`, type: 'button',
        'aria-pressed': state.filter === f.id ? 'true' : 'false',
        text: f.name,
        onClick: () => { state.filter = f.id; state.limit = PAGE; paint(); },
      }));
    }
    clear(deckChips);
    if (ctx.decks.length > 1) {
      deckChips.appendChild(deckChip('all', '모든 덱'));
      for (const d of ctx.decks) deckChip(d.id, d.name, deckChips);
    }
  }

  function deckChip(id, name, parent = deckChips) {
    const b = el('button', {
      class: `chip chip--sm${state.deck === id ? ' is-on' : ''}`, type: 'button', text: name,
      onClick: () => { state.deck = id; state.limit = PAGE; paint(); },
    });
    if (parent !== deckChips || id !== 'all') parent.appendChild(b);
    return b;
  }

  function rowsFor() {
    const now = Date.now();
    const q = state.q;
    let rows = ctx.words;
    if (state.deck !== 'all') rows = rows.filter((w) => w.deck === state.deck);
    if (q) rows = rows.filter((w) => w.en.toLowerCase().includes(q) || w.ko.toLowerCase().includes(q));

    rows = rows.map((w) => ({ w, c: ctx.store.cards[w.id] || null }));

    rows = rows.filter(({ c }) => {
      switch (state.filter) {
        case 'due': return c && !c.suspended && c.state !== State.New && c.due <= now;
        case 'learning': return c && (c.state === State.Learning || c.state === State.Relearning);
        case 'review': return c && c.state === State.Review;
        case 'new': return !c || c.state === State.New;
        case 'leech': return c && c.lapses >= 4;
        case 'starred': return c && c.starred;
        case 'suspended': return c && c.suspended;
        default: return true;
      }
    });

    const cmp = {
      due: (a, b) => (a.c ? a.c.due : Infinity) - (b.c ? b.c.due : Infinity),
      lapses: (a, b) => (b.c?.lapses || 0) - (a.c?.lapses || 0),
      difficulty: (a, b) => (b.c?.d || 0) - (a.c?.d || 0),
      alpha: (a, b) => a.w.en.localeCompare(b.w.en),
    }[state.sort];
    rows.sort(cmp);
    return rows;
  }

  function stateBadge(c) {
    if (!c || c.state === State.New) return { text: '미학습', cls: 'new' };
    if (c.suspended) return { text: '보류', cls: 'suspended' };
    if (c.state === State.Relearning) return { text: '재학습', cls: 'relearning' };
    if (c.state === State.Learning) return { text: '학습 중', cls: 'learning' };
    return { text: '복습 궤도', cls: 'review' };
  }

  function dueText(c) {
    if (!c || c.state === State.New) return '—';
    if (c.state !== State.Review) return '이번 판';
    const days = (c.due - Date.now()) / DAY_MS;
    if (days <= 0) return '지금';
    return `${formatInterval(days)} 뒤`;
  }

  function paint() {
    buildChips();
    sortSel.value = state.sort;
    const rows = rowsFor();
    const shown = rows.slice(0, state.limit);

    summary.textContent = rows.length
      ? `${num(rows.length)}개 · 표시 ${num(shown.length)}개`
      : '조건에 맞는 단어가 없다.';

    clear(list);
    for (const { w, c } of shown) {
      const badge = stateBadge(c);
      const acc = c && c.seen ? c.correct / c.seen : null;

      list.appendChild(el('div', { class: `wb-row${c?.suspended ? ' is-suspended' : ''}` }, [
        el('div', { class: 'wb-main' }, [
          el('div', { class: 'wb-word' }, [
            c?.starred ? el('span', { class: 'wb-star', text: '★' }) : null,
            el('b', { text: w.en }),
            w.pos ? el('span', { class: 'wb-pos', text: POS_LABEL[w.pos] || w.pos }) : null,
            ctx.onSpeak ? el('button', {
              class: 'icon-btn', type: 'button', title: `${w.en} 발음 듣기`,
              'aria-label': `${w.en} 발음 듣기`, text: '🔊',
              onClick: () => ctx.onSpeak(w.en),
            }) : null,
          ]),
          el('span', { class: 'wb-ko', text: w.ko }),
          w.ex ? el('details', { class: 'wb-ex' }, [
            el('summary', { text: '예문' }),
            el('p', { class: 'wb-ex-en', text: w.ex }),
            w.exKo ? el('p', { class: 'wb-ex-ko', text: w.exKo }) : null,
          ]) : null,
        ]),
        el('div', { class: 'wb-meta' }, [
          el('span', { class: `wb-badge wb-badge--${badge.cls}`, text: badge.text }),
          el('span', { class: 'wb-due', text: dueText(c) }),
          el('span', { class: 'wb-num', title: '기억 안정성', text: c && c.s ? `S ${c.s.toFixed(1)}` : '' }),
          el('span', { class: 'wb-num', title: '실패 횟수', text: c && c.lapses ? `✗${c.lapses}` : '' }),
          el('span', { class: 'wb-num', title: '정답률', text: acc !== null ? pct(acc) : '' }),
        ]),
        el('div', { class: 'wb-actions' }, [
          el('button', {
            class: `icon-btn${c?.starred ? ' is-on' : ''}`, type: 'button',
            title: c?.starred ? '즐겨찾기 해제' : '즐겨찾기 — 먼저 출제된다',
            'aria-label': '즐겨찾기', text: '★',
            onClick: () => { const card = ctx.store.get(w.id); card.starred = !card.starred; ctx.onChange(); paint(); },
          }),
          el('button', {
            class: `icon-btn${c?.suspended ? ' is-on' : ''}`, type: 'button',
            title: c?.suspended ? '보류 해제' : '보류 — 출제하지 않는다',
            'aria-label': '보류', text: c?.suspended ? '▶' : '⏸',
            onClick: () => { const card = ctx.store.get(w.id); card.suspended = !card.suspended; ctx.onChange(); paint(); },
          }),
          el('button', {
            class: 'icon-btn', type: 'button', title: '기억 기록 초기화', 'aria-label': '초기화', text: '↺',
            onClick: () => {
              if (!c || c.state === State.New) return;
              if (!confirm(`"${w.en}" 의 학습 기록을 지우고 처음부터 시작할까?`)) return;
              delete ctx.store.cards[w.id];
              ctx.onChange();
              paint();
            },
          }),
        ]),
      ]));
    }

    clear(more);
    if (rows.length > shown.length) {
      more.appendChild(el('button', {
        class: 'btn', type: 'button', text: `${num(rows.length - shown.length)}개 더 보기`,
        onClick: () => { state.limit += PAGE * 3; paint(); },
      }));
    }
    if (ctx.onFocusRun && rows.length >= 4) {
      more.appendChild(el('button', {
        class: 'btn btn--primary', type: 'button',
        text: `이 ${num(Math.min(rows.length, 40))}개로 집중 훈련`,
        onClick: () => ctx.onFocusRun(rows.slice(0, 40).map((r) => r.w.id)),
      }));
    }
  }

  paint();
  setTimeout(() => search.focus(), 40);
}
