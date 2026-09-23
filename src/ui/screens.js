/**
 * 모달 화면들 — 시작 / 보상 선택 / 결과 / 일시정지 / 설정 / 덱 / 통계 / 도움말.
 *
 * 오버레이 하나를 돌려 쓴다. 게임 루프는 계속 돌지만 engine.paused가 켜진다.
 */

import { el, clear, num, pct, duration, toast } from './dom.js';
import { renderStats } from './stats.js';
import { renderWordbook } from './wordbook.js';
import { renderTuning } from './tuning.js';
import { DIFFICULTY_PRESETS } from '../core/balance.js';
import { Direction, AnswerMode } from '../core/scheduler.js';
import { RunMode } from '../core/run.js';
import { formatInterval, State } from '../core/fsrs.js';
import { RELIC_BY_ID } from '../core/upgrades.js';
import { parseWordList } from '../data/decks.js';

const ANSWER_MODE_OPTIONS = [
  { id: AnswerMode.AUTO, name: '자동 승급 (권장)', desc: '재인으로 시작해, 기억이 자리 잡은 단어부터 철자 입력으로 올린다.' },
  { id: AnswerMode.CHOICE, name: '4지선다', desc: '보기 중에 고른다. 빠르고 부담이 적다.' },
  { id: AnswerMode.TYPING, name: '철자 입력', desc: '항상 직접 쓴다. 가장 강하게 남지만 느리고 어렵다.' },
];

const MODE_OPTIONS = [
  { id: RunMode.CAMPAIGN, name: '방어전', icon: '🛡️',
    desc: '기본 모드. 저장소가 무너지면 끝. 유물을 모아 멀리 간다.' },
  { id: RunMode.TRAINING, name: '훈련', icon: '🎯',
    desc: '저장소가 무너지지 않는다. 오늘 밀린 복습을 마음 편히 비우는 모드.' },
];

const DIRECTION_OPTIONS = [
  { id: Direction.KO_TO_EN, name: '뜻 → 영단어', desc: '가장 강한 인출 훈련. 시험과 작문에 직결된다.' },
  { id: Direction.EN_TO_KO, name: '영단어 → 뜻', desc: '읽기용. 부담이 적어 처음 외울 때 좋다.' },
  { id: Direction.MIXED, name: '섞어서', desc: '두 방향을 번갈아. 가장 튼튼하게 남는다.' },
];

export class Screens {
  /**
   * @param {HTMLElement} root
   * @param {object} app  main.js의 App 인스턴스
   */
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.current = null;
    root.addEventListener('click', (e) => {
      if (e.target === root && this.dismissible) this.close();
    });
  }

  open(name, builder, { dismissible = false, wide = false } = {}) {
    this.current = name;
    this.dismissible = dismissible;
    clear(this.root);
    const panel = el('div', { class: `panel${wide ? ' panel--wide' : ''}`, role: 'dialog', 'aria-modal': 'true' });
    builder(panel);
    this.root.appendChild(panel);
    this.root.classList.add('is-open');
    this.root.setAttribute('aria-hidden', 'false');
    const focusable = panel.querySelector('button, [href], input, select, textarea');
    if (focusable) setTimeout(() => focusable.focus(), 30);
  }

  close() {
    this.current = null;
    this.root.classList.remove('is-open');
    this.root.setAttribute('aria-hidden', 'true');
    clear(this.root);
    this.app.onScreenClosed?.();
  }

  get isOpen() { return !!this.current; }

  // -------------------------------------------------------------------
  // 시작 화면
  // -------------------------------------------------------------------

  title() {
    const app = this.app;
    const s = app.profile.settings;
    // 직전 판의 멈춘 전장이 시작 화면 뒤에 남아 있지 않게 한다
    if (!app.run) app.resetBattlefield();

    this.open('title', (p) => {
      const daily = app.dailyProgress();
      p.appendChild(el('div', { class: 'brand' }, [
        el('div', { class: 'brand-row' }, [
          el('div', {}, [
            el('h1', {}, [el('span', { class: 'brand-mark', text: '▲' }), ' 미사일 커맨드 : 어휘 방어전']),
            el('p', { class: 'tagline', text: '떨어지는 단어를 요격하라. 놓친 단어는 내일 다시 온다.' }),
          ]),
          goalRing(daily, app.profile.meta.streak),
        ]),
      ]));

      // 모드
      p.appendChild(section('모드', null, el('div', { class: 'choice-row' },
        MODE_OPTIONS.map((o) => el('button', {
          class: `choice choice--sm${app.runMode === o.id ? ' is-on' : ''}`, type: 'button',
          onClick: (e) => {
            app.runMode = o.id;
            [...e.currentTarget.parentElement.children].forEach((c) => c.classList.remove('is-on'));
            e.currentTarget.classList.add('is-on');
            app.audio.ui();
          },
        }, [el('b', { text: `${o.icon} ${o.name}` }), el('span', { class: 'choice-desc', text: o.desc })])))));

      // 덱 선택
      const deckBox = el('div', { class: 'choice-grid' });
      const renderDecks = () => {
        clear(deckBox);
        for (const d of app.allDecks()) {
          const on = s.deckIds.includes(d.id);
          const prog = app.deckProgress(d.id);
          deckBox.appendChild(el('button', {
            class: `choice${on ? ' is-on' : ''}`, type: 'button',
            'aria-pressed': on ? 'true' : 'false',
            onClick: () => {
              const set = new Set(s.deckIds);
              if (set.has(d.id)) set.delete(d.id); else set.add(d.id);
              if (!set.size) set.add(d.id);
              app.profile.updateSettings({ deckIds: [...set] });
              renderDecks();
              updateSummary();
              app.audio.ui();
            },
          }, [
            el('b', { text: d.name }),
            el('span', { class: 'choice-desc', text: d.desc || '' }),
            el('span', { class: 'choice-meta', text:
              `${num(d.words.length)}단어 · 학습 ${num(prog.studied)} · 복습 대기 ${num(prog.due)}` }),
          ]));
        }
      };
      renderDecks();

      p.appendChild(section('덱 선택', '여러 개를 함께 고르면 섞어서 나온다.', deckBox));

      // 출제 방향
      p.appendChild(section('출제 방향', null, el('div', { class: 'choice-row' },
        DIRECTION_OPTIONS.map((o) => el('button', {
          class: `choice choice--sm${s.direction === o.id ? ' is-on' : ''}`, type: 'button',
          onClick: (e) => {
            app.profile.updateSettings({ direction: o.id });
            [...e.currentTarget.parentElement.children].forEach((c) => c.classList.remove('is-on'));
            e.currentTarget.classList.add('is-on');
            app.audio.ui();
          },
        }, [el('b', { text: o.name }), el('span', { class: 'choice-desc', text: o.desc })])))));

      // 출제 형식
      p.appendChild(section('출제 형식',
        '철자 입력은 보기 없이 직접 쓰는 자유 회상이다. 재인보다 훨씬 강하게 남는다.',
        el('div', { class: 'choice-row' },
          ANSWER_MODE_OPTIONS.map((o) => el('button', {
            class: `choice choice--sm${s.answerMode === o.id ? ' is-on' : ''}`, type: 'button',
            onClick: (e) => {
              app.profile.updateSettings({ answerMode: o.id });
              [...e.currentTarget.parentElement.children].forEach((c) => c.classList.remove('is-on'));
              e.currentTarget.classList.add('is-on');
              app.audio.ui();
            },
          }, [el('b', { text: o.name }), el('span', { class: 'choice-desc', text: o.desc })])))));

      // 난이도
      p.appendChild(section('속도', null, el('div', { class: 'choice-row' },
        DIFFICULTY_PRESETS.map((o) => el('button', {
          class: `choice choice--sm${s.difficulty === o.id ? ' is-on' : ''}`, type: 'button',
          onClick: (e) => {
            app.profile.updateSettings({ difficulty: o.id });
            [...e.currentTarget.parentElement.children].forEach((c) => c.classList.remove('is-on'));
            e.currentTarget.classList.add('is-on');
            app.audio.ui();
          },
        }, [el('b', { text: o.name }), el('span', { class: 'choice-desc', text: o.desc })])))));

      // 신규 단어 수
      const newOut = el('output', { text: String(s.newPerRun) });
      const slider = el('input', {
        type: 'range', min: '0', max: '40', step: '2', value: String(s.newPerRun),
        oninput: (e) => {
          newOut.textContent = e.target.value;
          app.profile.updateSettings({ newPerRun: Number(e.target.value) });
          updateSummary();
        },
      });
      p.appendChild(section('한 판에 새로 배울 단어', '0으로 두면 복습만 한다.',
        el('div', { class: 'slider-row' }, [slider, newOut, el('span', { class: 'unit', text: '개' })])));

      const summary = el('p', { class: 'start-summary' });
      const updateSummary = () => {
        const st = app.sessionOutlook();
        summary.textContent = st.pool
          ? `선택한 덱 ${num(st.pool)}단어 · 지금 복습 대기 ${num(st.due)}개 · 이번 판 신규 최대 ${num(st.newLimit)}개`
          : '덱을 하나 이상 선택해 주세요.';
      };
      updateSummary();
      p.appendChild(summary);

      p.appendChild(el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: '출격',
          onClick: () => { app.audio.unlock(); app.startRun({ mode: app.runMode }); } }),
        el('button', { class: 'btn', type: 'button', text: '단어장', onClick: () => this.wordbook() }),
        el('button', { class: 'btn', type: 'button', text: '학습 통계', onClick: () => this.stats() }),
        el('button', { class: 'btn', type: 'button', text: '덱 관리', onClick: () => this.decks() }),
        el('button', { class: 'btn', type: 'button', text: '설정', onClick: () => this.settings() }),
        el('button', { class: 'btn btn--ghost', type: 'button', text: '조작법', onClick: () => this.help() }),
      ]));
    }, { wide: true });
  }

  // -------------------------------------------------------------------
  // 웨이브 보상
  // -------------------------------------------------------------------

  offer(offers, run) {
    this.open('offer', (p) => {
      p.appendChild(el('h2', { text: `웨이브 ${run.wave} 완료` }));
      p.appendChild(el('p', { class: 'sub', text:
        `점수 ${num(run.score)} · 최고 연속 ${run.maxCombo} · 저장소 ${run.cities}/6 — 하나를 고르자.` }));

      p.appendChild(el('div', { class: 'offers' }, offers.map((o) => el('button', {
        class: `offer offer--${o.rarity || 'common'}`, type: 'button',
        onClick: () => { this.app.audio.ui(); this.app.chooseOffer(o.id); },
      }, [
        el('span', { class: 'offer-icon', text: o.icon }),
        el('b', { class: 'offer-name', text: o.name }),
        el('span', { class: 'offer-kind', text:
          o.kind === 'skill' ? '액티브 스킬' : o.kind === 'pact' ? '거래' : o.rarity === 'rare' ? '희귀 유물' : '유물' }),
        el('span', { class: 'offer-desc', text: o.desc }),
        o.kind === 'skill' ? el('span', { class: 'offer-cost', text: `집중 ${o.cost} 소모` }) : null,
      ]))));

      p.appendChild(el('div', { class: 'actions actions--end' }, [
        el('button', { class: 'btn btn--ghost', type: 'button', text: '건너뛰기',
          onClick: () => this.app.chooseOffer(null) }),
      ]));
    }, { wide: true });
  }

  // -------------------------------------------------------------------
  // 결과
  // -------------------------------------------------------------------

  results(sum, records) {
    this.open('results', (p) => {
      p.appendChild(el('h2', { text:
        sum.reason === 'cleared' ? '오늘 몫 완료'
        : sum.mode === 'focus' ? '집중 훈련 종료'
        : sum.wave > 1 ? '기억 방어선 붕괴' : '작전 종료' }));

      p.appendChild(el('div', { class: 'tiles tiles--compact' }, [
        statTile('점수', num(sum.score), records.score ? '신기록!' : `최고 ${num(this.app.profile.meta.bestScore)}`, records.score),
        statTile('도달 웨이브', String(sum.wave), records.wave ? '신기록!' : null, records.wave),
        statTile('최고 연속', String(sum.maxCombo), records.combo ? '신기록!' : null, records.combo),
        statTile('정답률', pct(sum.accuracy, 1), `${sum.correct}/${sum.answered}`),
        statTile('새로 배운 단어', String(sum.newLearned), `총 ${sum.uniqueWords}단어 접함`),
        statTile('플레이 시간', duration(sum.durationMs), null),
      ]));

      // 평가 분포 — 이번 판의 기억 상태 요약
      const br = sum.byRating;
      const totalR = br[1] + br[2] + br[3] + br[4] || 1;
      p.appendChild(section('이번 판 평가 분포', 'FSRS가 이 판정으로 다음 복습일을 계산했다.',
        el('div', { class: 'rating-bar' }, [
          ratingSeg('다시', br[1], totalR, '#e66767'),
          ratingSeg('어려움', br[2], totalR, '#c98500'),
          ratingSeg('보통', br[3], totalR, '#199e70'),
          ratingSeg('쉬움', br[4], totalR, '#3987e5'),
        ])));

      if (sum.relics.length) {
        p.appendChild(section('가지고 있던 유물', null, el('div', { class: 'relic-list' },
          sum.relics.map((r) => el('span', { class: `relic-chip${r.curse ? ' is-curse' : ''}`, title: r.desc },
            [`${r.icon} ${r.name}`])))));
      }

      // 놓친 단어 복습표
      const missed = sum.log.filter((e) => !e.correct);
      if (missed.length) {
        const seen = new Set();
        const rows = missed.filter((m) => !seen.has(m.word.id) && seen.add(m.word.id)).slice(0, 14);
        p.appendChild(section('놓친 단어', '다음 판에서 먼저 다시 나온다. 예문이 있는 단어는 함께 보아 두자.',
          el('div', { class: 'missed-list' }, rows.map((m) => el('div', { class: 'missed-row' }, [
            el('div', { class: 'missed-head' }, [
              el('b', { text: m.word.en }),
              el('span', { class: 'missed-ko', text: m.word.ko }),
              m.chosen && m.chosen.id !== m.word.id
                ? el('span', { class: 'missed-pick', text: `↔ ${m.chosen.en} (${m.chosen.ko})와 헷갈림` })
                : null,
              el('span', { class: 'missed-due', text:
                m.intervalDays > 0 ? `${formatInterval(m.intervalDays)} 뒤` : '이번 판 안에서' }),
            ]),
            m.word.ex ? el('p', { class: 'missed-ex', text: m.word.ex }) : null,
            m.word.exKo ? el('p', { class: 'missed-ex-ko', text: m.word.exKo }) : null,
          ])))));
      }

      const missedIds = [...new Set(sum.log.filter((e) => !e.correct).map((e) => e.word.id))];
      p.appendChild(el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn--primary btn--lg', type: 'button', text: '한 판 더',
          onClick: () => this.app.startRun({ mode: this.app.runMode }) }),
        missedIds.length >= 3 ? el('button', {
          class: 'btn', type: 'button', text: `놓친 ${missedIds.length}개 집중 복습`,
          onClick: () => this.app.startFocusRun(missedIds),
        }) : null,
        el('button', { class: 'btn', type: 'button', text: '학습 통계', onClick: () => this.stats() }),
        el('button', { class: 'btn btn--ghost', type: 'button', text: '메인으로', onClick: () => this.title() }),
      ]));
    }, { wide: true });
  }

  // -------------------------------------------------------------------
  // 일시정지 / 통계 / 설정 / 덱 / 도움말
  // -------------------------------------------------------------------

  pause() {
    this.open('pause', (p) => {
      p.appendChild(el('h2', { text: '일시정지' }));
      p.appendChild(el('p', { class: 'sub', text: '지금까지의 복습 기록은 이미 저장되어 있다.' }));
      p.appendChild(el('div', { class: 'actions' }, [
        el('button', { class: 'btn btn--primary', type: 'button', text: '계속하기', onClick: () => this.app.resume() }),
        el('button', { class: 'btn', type: 'button', text: '조작법', onClick: () => this.help(() => this.pause()) }),
        el('button', { class: 'btn btn--ghost', type: 'button', text: '포기하고 나가기',
          onClick: () => this.app.abandonRun() }),
      ]));
    }, { dismissible: true });
  }

  wordbook() {
    const app = this.app;
    this.open('wordbook', (p) => {
      p.appendChild(el('h2', { text: '단어장' }));
      p.appendChild(el('p', { class: 'sub', text:
        '즐겨찾기한 단어는 먼저 나오고, 보류한 단어는 아예 나오지 않는다. 이미 아는 단어를 치우면 남은 시간이 모르는 단어로 간다.' }));
      const host = el('div', { class: 'wb-host' });
      p.appendChild(host);
      renderWordbook(host, {
        words: app.allWords(),
        decks: app.allDecks(),
        store: app.store,
        onChange: () => app.profile.markDirty(),
        onSpeak: (w) => app.speaker.say(w),
        onFocusRun: (ids) => {
          app.audio.unlock();
          app.startFocusRun(ids);
        },
      });
      p.appendChild(el('div', { class: 'actions actions--end' }, [
        el('button', { class: 'btn', type: 'button', text: '닫기',
          onClick: () => { app.profile.flush(); (app.run ? this.pause() : this.title()); } }),
      ]));
    }, { wide: true });
  }

  tuning() {
    const app = this.app;
    this.open('tuning', (p) => {
      p.appendChild(el('h2', { text: '알고리즘 개인 최적화' }));
      const host = el('div', { class: 'stats-host' });
      p.appendChild(host);
      renderTuning(host, {
        profile: app.profile.data,
        store: app.store,
        onApply: (w, meta) => app.applyFsrsParams(w, meta),
      });
      p.appendChild(el('div', { class: 'actions actions--end' }, [
        el('button', { class: 'btn', type: 'button', text: '닫기', onClick: () => this.settings() }),
      ]));
    }, { wide: true });
  }

  stats() {
    this.open('stats', (p) => {
      p.appendChild(el('h2', { text: '학습 통계' }));
      const host = el('div', { class: 'stats-host' });
      p.appendChild(host);
      renderStats(host, {
        store: this.app.store,
        profile: this.app.profile.data,
        words: this.app.activeWords(),
        onFocusRun: (ids) => { this.app.audio.unlock(); this.app.startFocusRun(ids); },
      });
      p.appendChild(el('div', { class: 'actions actions--end' }, [
        el('button', { class: 'btn', type: 'button', text: '닫기',
          onClick: () => (this.app.run ? this.pause() : this.title()) }),
      ]));
    }, { wide: true });
  }

  settings() {
    const app = this.app;
    const s = app.profile.settings;
    this.open('settings', (p) => {
      p.appendChild(el('h2', { text: '설정' }));

      p.appendChild(toggleRow('효과음', s.sound, (v) => {
        app.profile.updateSettings({ sound: v });
        app.audio.setEnabled(v);
      }));
      p.appendChild(toggleRow('영어 발음 읽어주기', s.tts, (v) => {
        app.profile.updateSettings({ tts: v });
        app.speaker.enabled = v;
      }, app.speaker.supported ? null : '이 브라우저는 음성 합성을 지원하지 않는다.'));
      p.appendChild(toggleRow('놓친 단어 발음 들려주기', s.ttsOnMiss, (v) => {
        app.profile.updateSettings({ ttsOnMiss: v });
      }, '틀린 직후가 가장 잘 박히는 순간이다.'));
      p.appendChild(toggleRow('화면 흔들림 줄이기', s.reduceMotion, (v) => {
        app.profile.updateSettings({ reduceMotion: v });
        if (app.renderer) app.renderer.reduceMotion = v;
      }));
      p.appendChild(toggleRow('볼리 기호 항상 표시', s.volleyMarkers, (v) => {
        app.profile.updateSettings({ volleyMarkers: v });
        if (app.engine) app.engine.alwaysMarkers = v;
      }, '색 대신 기호(●▲■)로도 문제를 구분한다. 색각 이상이 있어도 겹친 문제를 가릴 수 있다.'));

      // 글자 크기
      const fsOut = el('output', { text: `${Math.round(s.fontScale * 100)}%` });
      p.appendChild(section('글자 크기', '떨어지는 단어와 문제 카드에 적용된다.',
        el('div', { class: 'slider-row' }, [
          el('input', {
            type: 'range', min: '0.85', max: '1.4', step: '0.05', value: String(s.fontScale),
            oninput: (e) => {
              const v = Number(e.target.value);
              fsOut.textContent = `${Math.round(v * 100)}%`;
              app.profile.updateSettings({ fontScale: v });
              if (app.engine) app.engine.fontScale = v;
            },
          }),
          fsOut,
        ])));

      // 철자 입력 승급 기준
      const thOut = el('output', { text: `${s.typingThreshold}일` });
      p.appendChild(section('철자 입력으로 올리는 기준',
        '자동 승급 모드에서, 기억 안정성이 이 값을 넘은 단어부터 보기 없이 직접 쓰게 한다. 낮출수록 빨리 어려워진다.',
        el('div', { class: 'slider-row' }, [
          el('input', {
            type: 'range', min: '3', max: '60', step: '1', value: String(s.typingThreshold),
            oninput: (e) => {
              thOut.textContent = `${e.target.value}일`;
              app.profile.updateSettings({ typingThreshold: Number(e.target.value) });
            },
          }),
          thOut,
        ])));

      // 일일 목표
      const goalOut = el('output', { text: `${s.dailyGoal}개` });
      p.appendChild(section('하루 복습 목표',
        '간격 반복은 몰아치기보다 매일 조금씩이 강하다. 목표는 시작 화면의 고리로 표시된다.',
        el('div', { class: 'slider-row' }, [
          el('input', {
            type: 'range', min: '10', max: '200', step: '5', value: String(s.dailyGoal),
            oninput: (e) => {
              goalOut.textContent = `${e.target.value}개`;
              app.profile.updateSettings({ dailyGoal: Number(e.target.value) });
            },
          }),
          goalOut,
        ])));

      // 목표 기억유지율
      const rOut = el('output', { text: pct(s.requestRetention) });
      p.appendChild(section('목표 기억유지율',
        '복습 시점에 기억하고 있을 확률의 목표치. 높이면 더 자주 복습하고 더 잘 외우지만 분량이 늘어난다. 0.90이 표준이다.',
        el('div', { class: 'slider-row' }, [
          el('input', {
            type: 'range', min: '0.75', max: '0.97', step: '0.01', value: String(s.requestRetention),
            oninput: (e) => {
              const v = Number(e.target.value);
              rOut.textContent = pct(v);
              app.profile.updateSettings({ requestRetention: v });
              app.store.fsrs.requestRetention = v;
            },
          }),
          rOut,
        ])));

      p.appendChild(section('알고리즘',
        `내 복습 기록으로 FSRS 파라미터를 다시 맞춘다. ${app.profile.data.fsrsParams ? '현재 개인 파라미터를 쓰고 있다.' : '지금은 기본 파라미터를 쓰고 있다.'}`,
        el('div', { class: 'actions actions--wrap' }, [
          el('button', { class: 'btn', type: 'button', text: '개인 최적화 열기', onClick: () => this.tuning() }),
        ])));

      p.appendChild(section('데이터', '복습 기록은 이 브라우저에만 저장된다. 기기를 옮기려면 내보내기를 쓰자.',
        el('div', { class: 'actions actions--wrap' }, [
          el('button', { class: 'btn', type: 'button', text: '내보내기 (.json)', onClick: () => app.exportData() }),
          el('button', { class: 'btn', type: 'button', text: '가져오기', onClick: () => app.importData() }),
          el('button', { class: 'btn btn--danger', type: 'button', text: '모든 기록 삭제',
            onClick: () => {
              if (confirm('복습 기록과 통계가 모두 지워진다. 되돌릴 수 없다. 계속할까?')) {
                app.profile.reset();
                app.rebuild();
                toast('기록을 초기화했다.', 'warn');
                this.title();
              }
            } }),
        ])));

      p.appendChild(el('div', { class: 'actions actions--end' }, [
        el('button', { class: 'btn btn--primary', type: 'button', text: '닫기',
          onClick: () => (app.run ? this.pause() : this.title()) }),
      ]));
    });
  }

  decks() {
    const app = this.app;
    this.open('decks', (p) => {
      p.appendChild(el('h2', { text: '덱 관리' }));

      p.appendChild(el('div', { class: 'deck-list' }, app.allDecks().map((d) => {
        const prog = app.deckProgress(d.id);
        const ratio = d.words.length ? prog.studied / d.words.length : 0;
        return el('div', { class: 'deck-row' }, [
          el('div', {}, [
            el('b', { text: d.name }),
            el('span', { class: 'choice-desc', text: d.desc || '' }),
            el('div', { class: 'deck-meter' }, [el('i', { style: { width: pct(ratio) } })]),
            el('span', { class: 'choice-meta', text:
              `${num(prog.studied)}/${num(d.words.length)} 학습 · 복습 대기 ${num(prog.due)} · 성숙 ${num(prog.matured)}` }),
          ]),
          d.builtin ? el('span', { class: 'tag', text: '기본' })
            : el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: '삭제',
                onClick: () => { app.deleteDeck(d.id); this.decks(); } }),
        ]);
      })));

      const ta = el('textarea', {
        rows: '7', class: 'code-input',
        placeholder: 'apple, 사과\nbread, 빵\n\n쉼표 · 탭 · 세로줄(|) 모두 인식한다. 3번째 칸에 품사, 4번째 칸에 태그를 넣으면 오답 선택이 정교해진다.',
      });
      const nameInput = el('input', { type: 'text', class: 'text-input', placeholder: '덱 이름 (예: 워드마스터 Day 12)' });

      p.appendChild(section('내 단어장 추가', 'CSV·TSV를 그대로 붙여 넣으면 된다.', el('div', { class: 'stack' }, [
        nameInput, ta,
        el('div', { class: 'actions' }, [
          el('button', { class: 'btn btn--primary', type: 'button', text: '덱 만들기',
            onClick: () => {
              const name = nameInput.value.trim() || '내 단어장';
              const n = app.addCustomDeck(name, ta.value);
              if (n > 0) { toast(`"${name}" 덱에 ${n}단어를 추가했다.`, 'ok'); this.decks(); }
              else toast('인식할 수 있는 단어가 없다. 형식을 확인해 주세요.', 'warn');
            } }),
        ]),
      ])));

      p.appendChild(el('div', { class: 'actions actions--end' }, [
        el('button', { class: 'btn', type: 'button', text: '닫기', onClick: () => this.title() }),
      ]));
    }, { wide: true });
  }

  help(back) {
    this.open('help', (p) => {
      p.appendChild(el('h2', { text: '조작법' }));
      p.appendChild(el('div', { class: 'help-grid' }, [
        helpRow('마우스 클릭', '그 지점에 요격 미사일을 쏜다. 십자선의 원이 폭발 범위 — 오답이 같이 들어오면 오답 처리된다. 미사일을 직접 클릭하면 도착 시점을 예측해 조준한다.'),
        helpRow('숫자키 1–9', '지금 문제의 왼쪽부터 N번째 미사일을 조준한다. 키보드만으로도 완주 가능.'),
        helpRow('철자 입력', '⌨ 표시가 뜬 문제는 보기가 없다. 영단어를 직접 쓰고 Enter. 틀려도 낙하 전까지 다시 칠 수 있다.'),
        helpRow('Q · W · E · R', '보유한 스킬 발동. 집중 게이지를 소모한다.'),
        helpRow('ESC 또는 P', '일시정지. 입력창에 있을 때도 ESC로 빠져나온다.'),
      ]));

      p.appendChild(section('규칙', null, el('ul', { class: 'rules' }, [
        el('li', { html: '화면 아래 <b>문제</b>에 해당하는 단어를 위에서 떨어지는 것들 중에 찾아 요격한다.' }),
        el('li', { html: '<b>오답 미사일</b>은 땅에 닿아도 아무 일도 없다. 하지만 <b>정답을 놓치면</b> 기억 저장소가 하나 무너진다.' }),
        el('li', { html: '오답을 요격해도 실패다 — 폭발 범위에 오답이 휩쓸리지 않게 조준하자.' }),
        el('li', { html: '연속으로 맞히면 <b>콤보 배수</b>가 오르고 <b>집중</b>이 차서 스킬을 쓸 수 있다.' }),
        el('li', { html: '웨이브를 넘길 때마다 <b>유물</b>이나 <b>스킬</b>을 하나 고른다.' }),
      ])));

      p.appendChild(section('외우기는 어떻게 되는가',
        null,
        el('ul', { class: 'rules' }, [
          el('li', { html: '맞히기까지 걸린 시간으로 <b>다시 / 어려움 / 보통 / 쉬움</b>이 매겨진다.' }),
          el('li', { html: 'FSRS-5가 그 판정으로 단어별 <b>안정성</b>과 <b>난이도</b>를 갱신하고 다음 복습일을 잡는다.' }),
          el('li', { html: '틀린 단어는 <b>같은 판 안에서</b> 두세 문제 뒤에 반드시 다시 나온다.' }),
          el('li', { html: '기억이 자리 잡은 단어는 <b>철자 입력</b>으로 올라간다. 보기 중에 고르는 것과 직접 쓰는 것은 난이도가 다르고, 남는 정도도 다르다.' }),
          el('li', { html: '오답은 무작위가 아니라 같은 품사·같은 주제·비슷한 철자에서 고른다. 진짜로 헷갈리는 것끼리 붙여야 구별이 는다.' }),
          el('li', { html: '틀리면 <b>무엇과 헷갈렸는지</b>를 정답과 나란히 보여 준다. 두 단어를 갈라 주는 게 어휘 학습의 핵심이다.' }),
          el('li', { html: '유물은 점수와 속도만 바꾼다. <b>복습 일정은 어떤 유물로도 조작되지 않는다.</b>' }),
        ])));

      p.appendChild(el('div', { class: 'actions actions--end' }, [
        el('button', { class: 'btn btn--primary', type: 'button', text: '닫기',
          onClick: () => (back ? back() : (this.app.run ? this.pause() : this.title())) }),
      ]));
    }, { wide: true });
  }
}

// --- 작은 조립 부품 -----------------------------------------------------

/** 오늘의 복습 목표 고리 — 습관이 알고리즘보다 먼저다 */
function goalRing(daily, streak) {
  const size = 92;
  const r = 38;
  const circ = 2 * Math.PI * r;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'goal-ring');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `오늘 복습 ${daily.done}회, 목표 ${daily.goal}회`);

  const mk = (attrs) => {
    const c = document.createElementNS(NS, 'circle');
    for (const [k, v] of Object.entries(attrs)) c.setAttribute(k, String(v));
    return c;
  };
  svg.appendChild(mk({ cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'rgba(255,255,255,.09)', 'stroke-width': 8 }));
  svg.appendChild(mk({
    cx: size / 2, cy: size / 2, r, fill: 'none',
    stroke: daily.met ? '#5ce0b0' : '#3987e5', 'stroke-width': 8, 'stroke-linecap': 'round',
    'stroke-dasharray': `${circ * daily.ratio} ${circ}`,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
  }));

  return el('div', { class: `goal${daily.met ? ' is-met' : ''}` }, [
    el('div', { class: 'goal-ring-wrap' }, [svg, el('b', { class: 'goal-num', text: String(daily.done) })]),
    el('div', { class: 'goal-text' }, [
      el('b', { text: daily.met ? '오늘 목표 달성' : `오늘 ${daily.done} / ${daily.goal}` }),
      el('span', { text: streak > 0 ? `🔥 ${streak}일 연속` : '오늘 첫 판' }),
    ]),
  ]);
}

function section(title, note, body) {
  return el('section', { class: 'field' }, [
    el('h3', { text: title }),
    note ? el('p', { class: 'field-note', text: note }) : null,
    body,
  ]);
}

function statTile(label, value, sub, highlight) {
  return el('div', { class: `tile${highlight ? ' is-record' : ''}` }, [
    el('label', { text: label }),
    el('b', { class: 'tile-value', text: value }),
    sub ? el('span', { class: 'tile-sub', text: sub }) : null,
  ]);
}

function ratingSeg(label, v, total, color) {
  const w = (v / total) * 100;
  return el('div', {
    class: 'rating-seg', style: { width: `${w}%`, background: color },
    title: `${label} ${v}회 (${w.toFixed(0)}%)`,
  }, [w > 12 ? el('span', { text: `${label} ${v}` }) : null]);
}

function toggleRow(label, value, onChange, note) {
  const input = el('input', { type: 'checkbox', onChange: (e) => onChange(e.target.checked) });
  input.checked = !!value;
  return el('label', { class: 'toggle-row' }, [
    el('span', {}, [el('b', { text: label }), note ? el('em', { text: note }) : null]),
    input,
    el('i', { class: 'switch' }),
  ]);
}

function helpRow(key, desc) {
  return el('div', { class: 'help-row' }, [el('kbd', { text: key }), el('span', { text: desc })]);
}

export { parseWordList, State, RELIC_BY_ID };
