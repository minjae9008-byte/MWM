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
