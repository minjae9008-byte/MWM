/**
 * 인게임 HUD.
 *
 * 캔버스 위에 얹는 DOM 레이어. 텍스트가 많은 정보(점수, 유물, 복습 간격)는
 * 캔버스보다 DOM이 훨씬 또렷하고 접근성도 좋다.
 *
 * 복습 간격을 매 정답마다 보여주는 게 의도적인 설계다 —
 * "3일 뒤에 다시 물어볼게" 가 눈에 보여야 알고리즘을 신뢰하게 된다.
 */

import { el, clear, num } from './dom.js';
import { MAX_FOCUS, MAX_CITIES } from '../core/run.js';
import { SKILL_BY_ID } from '../core/upgrades.js';
import { RELIC_BY_ID } from '../core/upgrades.js';
import { formatInterval } from '../core/fsrs.js';

/** 예문 안의 대상 단어를 굵게 — 어형이 바뀌어도 어간으로 잡는다 */
function highlight(sentence, word) {
  const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const stem = word.replace(/(e|y)$/i, '');
  const safe = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!safe) return esc(sentence);
  return esc(sentence).replace(new RegExp(`\\b${safe}[a-z]*`, 'gi'), (m) => `<b>${m}</b>`);
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.build();
    this.feedItems = [];
  }

  build() {
    const r = clear(this.root);

    this.elScore = el('b', { class: 'hud-score', text: '0' });
    this.elWave = el('b', { text: '1' });
    this.elCombo = el('span', { class: 'hud-combo', text: '' });
    this.elCities = el('div', { class: 'hud-cities' });
    this.elAmmo = el('b', { text: '0' });
    this.elRelics = el('div', { class: 'hud-relics' });
    this.elFocusFill = el('i', { class: 'focus-fill' });
    this.elFocusText = el('span', { class: 'focus-text', text: '0' });
    this.elSkills = el('div', { class: 'hud-skills' });
    this.elFeed = el('div', { class: 'hud-feed', 'aria-live': 'polite' });
    this.elEffects = el('div', { class: 'hud-effects' });
    this.elProgress = el('i', { class: 'wave-fill' });

    // 철자 입력 — 타이핑 볼리가 떴을 때만 나타난다
    this.elTypeInput = el('input', {
      class: 'type-input', type: 'text', autocomplete: 'off', autocapitalize: 'off',
      autocorrect: 'off', spellcheck: 'false', 'aria-label': '영단어 철자 입력',
      placeholder: '영단어를 입력하고 Enter',
    });
    this.elTypeMeaning = el('b', { class: 'type-meaning' });
    this.elTypeNote = el('span', { class: 'type-note' });
    this.elTypeBar = el('div', { class: 'type-bar', hidden: true }, [
      el('span', { class: 'type-badge', text: '⌨' }),
      this.elTypeMeaning,
      this.elTypeInput,
      this.elTypeNote,
    ]);

    // 오답 학습 카드 — 놓친 직후가 가장 잘 들어오는 순간이다
    this.elMissCard = el('div', { class: 'miss-card', hidden: true, 'aria-live': 'assertive' });

    r.appendChild(el('div', { class: 'hud-top' }, [
      el('div', { class: 'hud-left' }, [
        el('div', { class: 'stat' }, [el('label', { text: '웨이브' }), this.elWave]),
        el('div', { class: 'stat stat--score' }, [el('label', { text: '점수' }), this.elScore]),
        this.elCombo,
      ]),
      el('div', { class: 'hud-right' }, [
        el('div', { class: 'stat' }, [el('label', { text: '탄약' }), this.elAmmo]),
        el('div', { class: 'stat' }, [el('label', { text: '기억 저장소' }), this.elCities]),
      ]),
    ]));

    r.appendChild(el('div', { class: 'wave-bar' }, [this.elProgress]));
    r.appendChild(this.elMissCard);
    r.appendChild(this.elTypeBar);
    r.appendChild(this.elEffects);
    r.appendChild(this.elFeed);
    r.appendChild(el('div', { class: 'hud-bottom' }, [
      el('div', { class: 'focus' }, [
        el('label', { text: '집중' }),
        el('div', { class: 'focus-bar' }, [this.elFocusFill]),
        this.elFocusText,
      ]),
      this.elSkills,
      this.elRelics,
    ]));
  }

  /** 스킬 버튼 (보유 스킬이 바뀔 때만 다시 만든다) */
  buildSkills(run, onUse) {
    this._skillSig = run.skills.join(',');
    const keys = ['Q', 'W', 'E', 'R'];
    clear(this.elSkills);
    run.skills.forEach((id, i) => {
      const s = SKILL_BY_ID.get(id);
      if (!s) return;
      const btn = el('button', {
        class: 'skill', type: 'button', dataset: { skill: id },
        title: `${s.name} — ${s.desc} (집중 ${s.cost})`,
        onClick: () => onUse(id),
      }, [
        el('span', { class: 'skill-key', text: keys[i] || '' }),
        el('span', { class: 'skill-icon', text: s.icon }),
        el('span', { class: 'skill-name', text: s.name }),
        el('span', { class: 'skill-cost', text: String(s.cost) }),
      ]);
      this.elSkills.appendChild(btn);
    });
  }

  buildRelics(run) {
    this._relicSig = run.relics.join(',');
    clear(this.elRelics);
    for (const id of run.relics) {
      const rel = RELIC_BY_ID.get(id);
      if (!rel) continue;
      this.elRelics.appendChild(el('span', {
        class: `relic-chip${rel.curse ? ' is-curse' : ''}`,
        title: `${rel.name} — ${rel.desc}`,
        text: rel.icon,
      }));
    }
  }

  update(run, engine, onUse) {
    if (this._skillSig !== run.skills.join(',')) this.buildSkills(run, onUse);
    if (this._relicSig !== run.relics.join(',')) this.buildRelics(run);

    this.elScore.textContent = num(run.score);
    this.elWave.textContent = String(run.wave);
    this.elAmmo.textContent = String(engine.totalAmmo);
    this.elAmmo.parentElement.classList.toggle('is-low', engine.totalAmmo <= 4);

    if (run.combo >= 2) {
      this.elCombo.textContent = `${run.combo}연속  ×${run.comboMul().toFixed(2)}`;
      this.elCombo.classList.add('is-on');
    } else {
      this.elCombo.textContent = '';
      this.elCombo.classList.remove('is-on');
    }

    // 기억 저장소
    const cities = run.cities;
    if (this._cities !== cities) {
      this._cities = cities;
      clear(this.elCities);
      for (let i = 0; i < MAX_CITIES; i++) {
        this.elCities.appendChild(el('i', { class: `city-dot${i < cities ? ' is-alive' : ''}` }));
      }
      if (run.shields > 0) this.elCities.appendChild(el('i', { class: 'shield-dot', text: '🛡' }));
    }

    const f = run.focus / MAX_FOCUS;
    this.elFocusFill.style.width = `${Math.round(f * 100)}%`;
    this.elFocusText.textContent = String(Math.round(run.focus));

    for (const btn of this.elSkills.children) {
      const ready = run.canUseSkill(btn.dataset.skill);
      btn.classList.toggle('is-ready', ready);
      btn.disabled = !ready;
    }

    const cfg = engine.cfg;
    if (cfg) {
      const done = cfg.volleys - run.volleysLeftInWave;
      this.elProgress.style.width = `${Math.round((done / cfg.volleys) * 100)}%`;
    }

    this.updateEffects(run);
  }

  updateEffects(run) {
    const now = Date.now();
    const active = [];
    if (run.effects.slow > now) active.push(['🕰️', '시간 왜곡', run.effects.slow - now]);
    if (run.effects.overcharge > now) active.push(['🔥', '과부하', run.effects.overcharge - now]);
    if (run.effects.reveal > now) active.push(['💡', '기억 소환', run.effects.reveal - now]);
    if (run.effects.autolock > 0) active.push(['🔒', `자동 조준 ${run.effects.autolock}`, 0]);

    const sig = active.map((a) => a[1]).join('|');
    if (sig !== this._fxSig) {
      this._fxSig = sig;
      clear(this.elEffects);
      for (const [icon, name] of active) {
        this.elEffects.appendChild(el('span', { class: 'fx-chip' }, [`${icon} ${name}`]));
      }
    }
  }

  /**
   * 철자 입력 바 표시 제어.
   * 입력창에 포커스가 가 있어야 바로 칠 수 있다 — 매번 클릭하게 만들면
   * 그 0.5초가 그대로 반응 시간에 더해져 평가까지 왜곡된다.
   */
  updateTyping(engine, onSubmit, onEscape) {
    const v = engine.typingVolley?.();
    const id = v ? v.id : null;
    if (id === this._typingId) {
      if (v) this.elTypeNote.textContent = v.attempts ? `${v.attempts}회 시도` : '';
      return;
    }
    this._typingId = id;

    if (!v) {
      this.elTypeBar.setAttribute('hidden', '');
      this.elTypeInput.value = '';
      this.elTypeInput.blur();
      return;
    }

    this.elTypeMeaning.textContent = v.question.prompt;
    this.elTypeNote.textContent = '';
    this.elTypeInput.value = '';
    this.elTypeBar.removeAttribute('hidden');
    this._escape = onEscape;
    if (!this._typingBound) {
      this._typingBound = true;
      this.elTypeInput.addEventListener('keydown', (ev) => {
        // 입력창에 포커스가 있으면 전역 단축키가 막히므로 ESC만은 여기서 받는다
        if (ev.key === 'Escape') {
          ev.preventDefault();
          this.elTypeInput.blur();
          this._escape?.();
          return;
        }
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const text = this.elTypeInput.value;
        if (!text.trim()) return;
        const res = onSubmit(text);
        if (res && !res.ok) {
          this.elTypeInput.classList.remove('is-wrong');
          void this.elTypeInput.offsetWidth;   // 리플로우로 애니메이션 재시작
          this.elTypeInput.classList.add('is-wrong');
          this.elTypeInput.select();
        } else {
          this.elTypeInput.value = '';
        }
      });
    }
    setTimeout(() => this.elTypeInput.focus(), 20);
  }

  /** 놓친 단어를 잠깐 크게 보여 준다 */
  showMissCard(entry, onSpeak) {
    clear(this.elMissCard);
    const rows = [
      el('div', { class: 'miss-inner' }, [
        el('span', { class: 'miss-label', text: entry.landed ? '놓쳤다' : '오답' }),
        el('b', { class: 'miss-word', text: entry.word.en }),
        el('span', { class: 'miss-ko', text: entry.word.ko }),
        onSpeak ? el('button', {
          class: 'miss-speak', type: 'button', title: '발음 듣기', text: '🔊',
          onClick: () => onSpeak(entry.word.en),
        }) : null,
      ]),
    ];

    // 무엇과 헷갈렸는지 바로 옆에 붙여 준다.
    // "틀렸다"보다 "이것과 헷갈렸다"가 훨씬 많은 정보를 준다 — 두 단어를 갈라 주는 게
    // 어휘 학습의 핵심이고, 그 비교는 틀린 직후에 해야 붙는다.
    if (entry.chosen && entry.chosen.id !== entry.word.id) {
      rows.push(el('div', { class: 'miss-confuse' }, [
        el('span', { class: 'miss-pick' }, [
          el('em', { text: '고른 것' }), ` ${entry.chosen.en}`,
          el('i', { text: entry.chosen.ko }),
        ]),
        el('span', { class: 'miss-vs', text: '↔' }),
        el('span', { class: 'miss-right' }, [
          el('em', { text: '정답' }), ` ${entry.word.en}`,
          el('i', { text: entry.word.ko }),
        ]),
      ]));
    }

    // 예문이 있으면 함께 — 맥락 없이 외운 단어는 문장에서 못 알아본다
    if (entry.word.ex) {
      rows.push(el('div', { class: 'miss-ex' }, [
        el('span', { class: 'miss-ex-en', html: highlight(entry.word.ex, entry.word.en) }),
        entry.word.exKo ? el('span', { class: 'miss-ex-ko', text: entry.word.exKo }) : null,
      ]));
    }

    for (const r of rows) this.elMissCard.appendChild(r);
    this.elMissCard.removeAttribute('hidden');
    this.elMissCard.classList.add('is-in');
    clearTimeout(this._missTimer);
    this._missTimer = setTimeout(() => {
      this.elMissCard.classList.remove('is-in');
      setTimeout(() => this.elMissCard.setAttribute('hidden', ''), 300);
    }, 2300);
  }

  /** 한 문제가 끝날 때마다 우측에 쌓이는 기록 */
  pushFeed(entry) {
    const w = entry.word;
    const correct = entry.correct;
    const label = entry.intervalDays > 0
      ? `다음 복습 ${formatInterval(entry.intervalDays)} 뒤`
      : '이번 판에서 다시';

    const item = el('div', { class: `feed-item ${correct ? 'is-ok' : 'is-bad'}` }, [
      el('div', { class: 'feed-word' }, [
        el('b', { text: w.en }),
        el('span', { text: w.ko }),
      ]),
      el('div', { class: 'feed-meta' }, [
        el('span', { class: 'feed-rating', text: ['', '다시', '어려움', '보통', '쉬움'][entry.rating] }),
        entry.typing ? el('span', { class: 'feed-typed', text: '⌨' }) : null,
        el('span', { text: label }),
      ]),
    ]);
    this.elFeed.prepend(item);
    requestAnimationFrame(() => item.classList.add('is-in'));
    this.feedItems.push(item);
    while (this.feedItems.length > 5) {
      const old = this.feedItems.shift();
      old.classList.remove('is-in');
      setTimeout(() => old.remove(), 320);
    }
  }

  clearFeed() {
    clear(this.elFeed);
    this.feedItems = [];
  }
}
