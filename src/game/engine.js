/**
 * 게임 엔진 — 미사일 커맨드 시뮬레이션.
 *
 * 렌더링과 입력에서 분리되어 있다. 엔진은 "무엇이 어디에 있는가"만 알고,
 * 그리는 방법은 renderer.js가, 누가 눌렀는지는 input.js가 안다.
 * 텍스트 폭 측정처럼 캔버스가 필요한 일은 주입받는다(measureText).
 *
 * 한 볼리(volley) = 한 문제.
 *   화면 위에서 정답 1개 + 오답 n개가 같은 색으로 함께 내려온다.
 *   정답을 요격하면 성공, 오답을 요격하거나 정답이 착탄하면 실패.
 *   오답은 그냥 땅에 닿으면 사라진다 — 피해는 정답을 놓쳤을 때만.
 */

import { GROUND_RATIO } from '../core/balance.js';
import { fxRandom as R } from '../core/rng.js';

export const VOLLEY_COLORS = [
  { h: 190, name: 'cyan' },
  { h: 45, name: 'amber' },
  { h: 330, name: 'rose' },
  { h: 145, name: 'mint' },
  { h: 265, name: 'violet' },
];

const MAX_PARTICLES = 420;
let _uid = 0;
const uid = () => ++_uid;

export class Engine {
  /**
   * @param {{run:object, measureText:(t:string,size:number)=>number, events?:object}} opts
   */
  constructor(opts) {
    this.run = opts.run;
    this.measureText = opts.measureText || ((t, s) => t.length * s * 0.6);
    this.events = opts.events || {};

    this.W = 1280;
    this.H = 720;
    this.groundY = this.H * GROUND_RATIO;

    this.volleys = [];
    this.missiles = [];
    this.interceptors = [];
    this.explosions = [];
    this.particles = [];
    this.popups = [];
    this.turrets = [];
    this.cities = [];

    this.time = 0;              // 엔진 내부 경과 시간(ms)
    this.spawnTimer = 0;
    this.waveActive = false;
    this.pendingWaveClear = false;
    this.shake = 0;
    this.flash = 0;
    this.ammoRegenTimer = 0;
    this.colorCursor = 0;
    this.paused = false;

    this.resize(this.W, this.H);
  }

  // --- 레이아웃 -------------------------------------------------------

  resize(w, h) {
    const prevW = this.W || w;
    this.W = w;
    this.H = h;
    this.groundY = h * GROUND_RATIO;

    const sx = w / prevW;
    for (const m of this.missiles) { m.x *= sx; }

    this.turretXs = [w * 0.07, w * 0.5, w * 0.93];
    this.cityXs = [0.17, 0.265, 0.36, 0.64, 0.735, 0.83].map((r) => w * r);

    if (!this.turrets.length) {
      this.turrets = this.turretXs.map((x, i) => ({ i, x, y: this.groundY, ammo: 9, max: 9, recoil: 0 }));
      this.cities = this.cityXs.map((x, i) => ({ i, x, y: this.groundY, alive: true, hit: 0 }));
    } else {
      this.turrets.forEach((t, i) => { t.x = this.turretXs[i]; t.y = this.groundY; });
      this.cities.forEach((c, i) => { c.x = this.cityXs[i]; c.y = this.groundY; });
    }
  }

  // --- 웨이브 ---------------------------------------------------------

  beginWave() {
    const cfg = this.run.startWave();
    this.cfg = cfg;
    this.waveActive = true;
    this.pendingWaveClear = false;
    this.spawnTimer = 400;

    const per = Math.ceil(cfg.ammo / 3);
    for (const t of this.turrets) { t.ammo = per; t.max = per; }
    this.syncCities();
    this.events.onWaveStart?.(cfg);
    return cfg;
  }

  /** run.cities 개수를 화면상의 저장소 상태와 맞춘다 */
  syncCities() {
    const target = this.run.cities;
    let alive = this.cities.filter((c) => c.alive).length;
    // 복구
    for (const c of this.cities) {
      if (alive >= target) break;
      if (!c.alive) { c.alive = true; c.hit = 0; alive++; }
    }
    // 파괴
    for (let i = this.cities.length - 1; i >= 0 && alive > target; i--) {
      if (this.cities[i].alive) { this.cities[i].alive = false; alive--; }
    }
  }

  get totalAmmo() {
    return this.turrets.reduce((s, t) => s + t.ammo, 0);
  }

  // --- 볼리 생성 ------------------------------------------------------

  spawnVolley(now) {
    const q = this.run.nextQuestion(now);
    if (!q) return null;

    const cfg = this.cfg;
    const color = VOLLEY_COLORS[this.colorCursor % VOLLEY_COLORS.length];
    this.colorCursor += 1;

    const volley = {
      id: uid(),
      color,
      question: q,
      spawnedAt: now,
      resolved: false,
      revealed: this.run.effects.reveal > now,
      assisted: false,
      missileIds: [],
      windowMs: cfg.fallTime * 1000,
      fade: 0,
    };

    const n = q.options.length;
    const margin = Math.min(110, this.W * 0.09);
    const usable = this.W - margin * 2;
    const slot = usable / n;
    const order = [...Array(n).keys()].sort(() => R.next() - 0.5);

    q.options.forEach((opt, idx) => {
      const pos = order[idx];
      const fontSize = this.chipFontSize();
      const tw = this.measureText(opt.text, fontSize);
      const w = Math.max(74, tw + 30);
      const h = fontSize + 20;
      const x = clampNum(margin + slot * pos + slot / 2 + R.range(-slot * 0.22, slot * 0.22), w / 2 + 6, this.W - w / 2 - 6);
      // 화면 밖에 머무는 시간을 짧게 잡는다. 반응 시간은 볼리가 뜬 순간부터 재는데
      // 단어가 한참 안 보이면 "읽을 수 없던 시간"까지 인출 시간에 포함되어
      // 평가가 실제보다 박해진다.
      const y = -h / 2 - R.range(6, 64) - idx * 7;

      const travel = this.groundY - y;
      const vy = travel / (cfg.fallTime * 1000);

      const armored = opt.correct && (cfg.isBoss || R.next() < cfg.armoredChance);
      const mirv = !opt.correct && q.spares?.length > 0 && R.next() < cfg.mirvChance;

      this.missiles.push({
        id: uid(),
        volleyId: volley.id,
        word: opt.word,
        text: opt.text,
        correct: opt.correct,
        x, y, w, h,
        vx: R.range(-0.012, 0.012),
        vy,
        baseVy: vy,
        hp: armored ? (cfg.isBoss ? 2 : 2) : 1,
        armored,
        mirv,
        mirvY: mirv ? this.groundY * R.range(0.3, 0.5) : -1,
        alive: true,
        inert: false,
        fade: 1,
        wobble: R.range(0, Math.PI * 2),
        trail: [],
      });
      volley.missileIds.push(this.missiles[this.missiles.length - 1].id);
    });

    this.volleys.push(volley);
    this.events.onVolleySpawn?.(volley);
    return volley;
  }

  chipFontSize() {
    return Math.round(clampNum(this.W * 0.0155, 15, 24));
  }

  /** 다탄두 분열 */
  splitMissile(m, volley) {
    const spares = volley.question.spares || [];
    if (!spares.length) return;
    m.mirv = false;
    const dir = volley.question.direction;
    const count = Math.min(2, spares.length);
    for (let i = 0; i < count; i++) {
      const sw = spares[(i + volley.missileIds.length) % spares.length];
      const text = dir === 'ko2en' ? sw.en : sw.ko;
      const fontSize = this.chipFontSize();
      const w = Math.max(74, this.measureText(text, fontSize) + 30);
      const h = fontSize + 20;
      const nm = {
        id: uid(), volleyId: volley.id, word: sw, text, correct: false,
        x: clampNum(m.x + (i === 0 ? -1 : 1) * R.range(60, 130), w / 2 + 6, this.W - w / 2 - 6),
        y: m.y, w, h,
        vx: (i === 0 ? -1 : 1) * R.range(0.02, 0.05),
        vy: m.vy * R.range(0.95, 1.12),
        baseVy: m.baseVy, hp: 1, armored: false, mirv: false, mirvY: -1,
        alive: true, inert: false, fade: 1, wobble: R.range(0, Math.PI * 2), trail: [],
      };
      this.missiles.push(nm);
      volley.missileIds.push(nm.id);
    }
    this.addParticles(m.x, m.y, 10, volley.color.h, 0.6);
  }

  // --- 발사 -----------------------------------------------------------

  /**
   * 좌표를 향해 요격 미사일을 쏜다.
   * @returns {boolean} 실제로 발사했는가
   */
  fireAt(tx, ty, now = this.time) {
    if (this.paused || !this.waveActive) return false;

    let forced = null;

    // 자동 조준: 가장 오래된 미해결 볼리의 정답을 대신 겨냥한다
    if (this.run.effects.autolock > 0) {
      const target = this.findAutolockTarget();
      if (target) {
        forced = target.m;
        tx = target.m.x;
        ty = target.m.y;
        this.run.effects.autolock -= 1;
        target.v.assisted = true;
        this.events.onSkillTick?.('autolock', this.run.effects.autolock);
      }
    }

    ty = Math.min(ty, this.groundY - 12);

    // 클릭 지점에 걸리는 미사일을 "잠금" — 정밀 신관은 이것만 파괴한다.
    // 칩이 겹칠 때는 배열 순서가 아니라 클릭 지점에 가장 가까운 것을 고른다.
    let lock = forced;
    if (!lock) {
      let best = Infinity;
      for (const m of this.missiles) {
        if (!m.alive || m.inert || !hitTest(m, tx, ty)) continue;
        const d = (m.x - tx) ** 2 + (m.y - ty) ** 2;
        if (d < best) { best = d; lock = m; }
      }
    }

    const avail = this.turrets.filter((t) => t.ammo > 0);
    if (!avail.length) {
      this.events.onOutOfAmmo?.();
      return false;
    }
    avail.sort((a, b) => Math.abs(a.x - tx) - Math.abs(b.x - tx));
    const turret = avail[0];
    turret.ammo -= 1;
    turret.recoil = 1;
    this.run.registerShot();

    const sx = turret.x;
    const sy = turret.y - 18;
    const speed = 1.5 * this.run.mods.interceptorSpeed * (this.W / 1280);

    // 잡힌 미사일이 있으면 "지금 위치"가 아니라 "요격탄이 도착할 때의 위치"를 겨눈다.
    // 리드샷은 원래 미사일 커맨드의 핵심 재미지만, 여기서 겨루는 건 어휘력이다.
    // 맞는 단어를 골랐는데 비행시간 때문에 빗나가면 엉뚱한 능력을 벌하는 셈이 된다.
    // 비행시간·폭발 반경·탄약 제한은 그대로 두고 조준만 보정한다 —
    // 빗맞히는 이유는 "단어를 잘못 골랐을 때"뿐이어야 한다.
    if (lock) {
      const fall = lock.vy * this.run.fallSpeedFactor(Date.now());
      let t = Math.hypot(lock.x - sx, lock.y - sy) / speed;
      for (let i = 0; i < 3; i++) {
        t = Math.hypot((lock.x + lock.vx * t) - sx, (lock.y + fall * t) - sy) / speed;
      }
      tx = clampNum(lock.x + lock.vx * t, 8, this.W - 8);
      ty = Math.min(lock.y + fall * t, this.groundY - 12);
    }

    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy) || 1;

    this.interceptors.push({
      id: uid(),
      x: sx, y: sy,
      sx, sy,
      tx, ty,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      dist, travelled: 0,
      lockId: lock ? lock.id : null,
      turret: turret.i,
    });
    this.events.onFire?.(turret);
    return true;
  }

  findAutolockTarget() {
    const sorted = this.volleys.filter((v) => !v.resolved).sort((a, b) => a.spawnedAt - b.spawnedAt);
    for (const v of sorted) {
      const m = this.missiles.find((x) => x.volleyId === v.id && x.correct && x.alive && !x.inert);
      if (m) return { v, m };
    }
    return null;
  }

  blastRadius() {
    const base = 62 * (this.W / 1280);
    const over = this.run.effects.overcharge > this.time ? 1.6 : 1;
    return base * this.run.mods.blastRadius * over;
  }

  detonate(x, y, lockId, hostile = false) {
    this.explosions.push({
      id: uid(), x, y,
      r: 4, maxR: hostile ? 48 * (this.W / 1280) : this.blastRadius(),
      t: 0, life: hostile ? 480 : 620,
      lockId, hostile,
      precision: !hostile && this.run.mods.precision,
      hit: new Set(),
    });
    this.shake = Math.min(this.shake + (hostile ? 11 : 4), 18);
    this.addParticles(x, y, hostile ? 26 : 16, hostile ? 8 : 190, hostile ? 1.3 : 0.9);
  }

  // --- 메인 루프 -------------------------------------------------------

  /**
   * @param {number} dt 밀리초
   */
  update(dt) {
    if (this.paused) return;
    this.time += dt;
    const now = this.time;
    const wallNow = Date.now();
    this.run.tickEffects(wallNow);

    const speedFactor = this.run.fallSpeedFactor(wallNow);

    // 자동 장전
    if (this.run.mods.ammoRegenSec > 0 && this.waveActive) {
      this.ammoRegenTimer += dt;
      const period = this.run.mods.ammoRegenSec * 1000;
      while (this.ammoRegenTimer >= period) {
        this.ammoRegenTimer -= period;
        const t = this.turrets.filter((x) => x.ammo < x.max).sort((a, b) => a.ammo - b.ammo)[0];
        if (t) t.ammo += 1;
      }
    }

    // 볼리 스폰
    if (this.waveActive) {
      const live = this.volleys.filter((v) => !v.resolved).length;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && live < this.cfg.maxConcurrent && this.run.hasVolleysLeft()) {
        if (this.spawnVolley(wallNow)) this.spawnTimer = this.cfg.gap * 1000;
        else this.spawnTimer = 400;
      }
    }

    this.updateMissiles(dt, speedFactor, wallNow);
    this.updateInterceptors(dt);
    this.updateExplosions(dt, wallNow);
    this.updateFx(dt);

    // 해결된 볼리 정리
    this.volleys = this.volleys.filter((v) => {
      if (!v.resolved) return true;
      v.fade += dt;
      return v.fade < 900;
    });

    // 웨이브 종료 판정
    if (this.waveActive && !this.run.hasVolleysLeft()
        && !this.volleys.some((v) => !v.resolved)
        && !this.missiles.some((m) => m.alive && !m.inert)) {
      this.waveActive = false;
      this.events.onWaveClear?.();
    }
  }

  updateMissiles(dt, speedFactor, wallNow) {
    for (const m of this.missiles) {
      if (!m.alive) continue;

      if (m.inert) {
        m.fade -= dt / 340;
        m.y += m.vy * dt * 0.3;
        if (m.fade <= 0) m.alive = false;
        continue;
      }

      m.wobble += dt * 0.003;
      m.x += (m.vx + Math.sin(m.wobble) * 0.008) * dt;
      m.y += m.vy * speedFactor * dt;
      m.x = clampNum(m.x, m.w / 2 + 4, this.W - m.w / 2 - 4);

      if (m.trail.length === 0 || Math.abs(m.y - m.trail[m.trail.length - 1].y) > 14) {
        m.trail.push({ x: m.x, y: m.y });
        if (m.trail.length > 16) m.trail.shift();
      }

      if (m.mirv && m.y >= m.mirvY) {
        const v = this.volleys.find((x) => x.id === m.volleyId);
        if (v && !v.resolved) this.splitMissile(m, v);
        else m.mirv = false;
      }

      // 착탄
      if (m.y + m.h / 2 >= this.groundY) {
        m.alive = false;
        const v = this.volleys.find((x) => x.id === m.volleyId);
        if (m.correct && v && !v.resolved) {
          this.detonate(m.x, this.groundY - 10, null, true);
          this.destroyNearestCity(m.x);
          this.resolveVolley(v, { correct: false, landed: true, now: wallNow });
        } else {
          // 오답은 그냥 흩어진다 — 피해 없음
          this.addParticles(m.x, this.groundY - 6, 6, 210, 0.4);
        }
      }
    }
    this.missiles = this.missiles.filter((m) => m.alive);
  }

  updateInterceptors(dt) {
    for (const it of this.interceptors) {
      const step = Math.hypot(it.vx, it.vy) * dt;
      it.travelled += step;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      if (it.travelled >= it.dist) {
        it.done = true;
        this.detonate(it.tx, it.ty, it.lockId, false);
      }
    }
    this.interceptors = this.interceptors.filter((it) => !it.done);
  }

  updateExplosions(dt, wallNow) {
    for (const ex of this.explosions) {
      ex.t += dt;
      const p = ex.t / ex.life;
      ex.r = p < 0.32
        ? ex.maxR * easeOutCubic(p / 0.32)
        : ex.maxR * (1 - easeInQuad((p - 0.32) / 0.68));
      if (ex.r < 0) ex.r = 0;

      if (!ex.hostile) {
        // 정답을 먼저 판정한다.
        // 한 폭발이 정답과 오답을 동시에 덮었다면 플레이어는 단어를 맞게 골랐고
        // 조준이 약간 넓었을 뿐이다. 배열 순서 때문에 오답 처리가 되면
        // 어휘 실력이 아니라 운을 벌하는 게 된다.
        const caught = this.missiles.filter((m) =>
          m.alive && !m.inert && !ex.hit.has(m.id)
          && (!ex.precision || ex.lockId === m.id)
          && circleRectOverlap(ex.x, ex.y, ex.r, m));
        caught.sort((a, b) => (b.correct ? 1 : 0) - (a.correct ? 1 : 0));
        for (const m of caught) {
          if (!m.alive || ex.hit.has(m.id)) continue;
          ex.hit.add(m.id);
          this.damageMissile(m, ex, wallNow);
        }
      }
      if (ex.t >= ex.life) ex.done = true;
    }
    this.explosions = this.explosions.filter((e) => !e.done);
  }

  damageMissile(m, ex, wallNow) {
    m.hp -= 1;
    if (m.hp > 0) {
      m.armored = false;
      this.addParticles(m.x, m.y, 8, 40, 0.7);
      this.pushPopup(m.x, m.y - 18, '장갑 관통!', 40);
      return;
    }
    m.alive = false;
    this.run.registerHit();
    const v = this.volleys.find((x) => x.id === m.volleyId);
    this.addParticles(m.x, m.y, 14, v ? v.color.h : 190, 0.9);

    if (!v || v.resolved) return;

    if (m.correct) {
      if (this.run.mods.chainClear) {
        for (const o of this.missiles) {
          if (o.volleyId === v.id && o.alive && !o.correct) {
            o.inert = true;
            this.addParticles(o.x, o.y, 6, v.color.h, 0.4);
          }
        }
      }
      this.resolveVolley(v, { correct: true, landed: false, now: wallNow, hitX: m.x, hitY: m.y });
    } else {
      this.resolveVolley(v, { correct: false, landed: false, now: wallNow, hitX: m.x, hitY: m.y, wrongWord: m.word });
    }
  }

  resolveVolley(v, ev) {
    if (v.resolved) return;
    v.resolved = true;
    v.fade = 0;
    v.resolvedCorrect = ev.correct;

    const reactionMs = Math.max(0, (ev.now || Date.now()) - v.spawnedAt);
    const entry = this.run.resolveVolley({
      question: v.question,
      correct: ev.correct,
      landed: !!ev.landed,
      reactionMs,
      windowMs: v.windowMs,
      assisted: v.assisted,
      revealed: v.revealed,
      now: ev.now,
    });

    // 남은 미사일은 무해하게 흩어진다 (연쇄 유물이 없어도 화면은 정리해 준다)
    for (const o of this.missiles) {
      if (o.volleyId === v.id && o.alive) o.inert = true;
    }

    const px = ev.hitX ?? this.W / 2;
    const py = ev.hitY ?? this.groundY - 120;
    if (ev.correct) {
      this.pushPopup(px, py, `+${entry.gained}`, v.color.h, 1.15);
      if (this.run.combo >= 3) this.pushPopup(px, py - 30, `${this.run.combo} COMBO ×${this.run.comboMul().toFixed(2)}`, 45, 0.85);
    } else {
      this.flash = 1;
      this.shake = Math.min(this.shake + 9, 20);
      this.pushPopup(px, py, entry.shielded ? '방패 소모' : (ev.landed ? '착탄!' : '오답!'), 0, 1.05);
      this.pushPopup(this.W / 2, this.groundY - 190, `${v.question.prompt} → ${v.question.answer}`, 200, 1.0, 2100);
    }

    this.syncCities();
    this.events.onResolve?.(entry, v);
    if (!this.run.alive) {
      this.waveActive = false;
      this.events.onGameOver?.();
    }
  }

  destroyNearestCity(x) {
    const alive = this.cities.filter((c) => c.alive);
    if (!alive.length) return;
    alive.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
    const c = alive[0];
    c.alive = false;
    c.hit = 1;
    this.addParticles(c.x, this.groundY - 14, 30, 20, 1.4);
    this.shake = Math.min(this.shake + 14, 24);
  }

  // --- 스킬 훅 ---------------------------------------------------------

  applySkill(id) {
    if (id === 'emp') {
      let n = 0;
      for (const m of this.missiles) {
        if (m.alive && !m.inert && !m.correct) {
          m.inert = true; n += 1;
          this.addParticles(m.x, m.y, 8, 265, 0.7);
        }
      }
      this.flash = 0.6;
      this.pushPopup(this.W / 2, this.groundY - 240, `EMP — 오답 ${n}개 소거`, 265, 1.2);
    } else if (id === 'recall') {
      for (const v of this.volleys) if (!v.resolved) v.revealed = true;
    } else if (id === 'slowfield') {
      this.pushPopup(this.W / 2, this.groundY - 240, '시간 왜곡', 190, 1.2);
    } else if (id === 'overcharge') {
      this.pushPopup(this.W / 2, this.groundY - 240, '과부하!', 40, 1.3);
      this.flash = 0.4;
    } else if (id === 'repair') {
      this.syncCities();
      this.pushPopup(this.W / 2, this.groundY - 240, '저장소 재건', 145, 1.2);
    }
  }

  // --- 연출 -----------------------------------------------------------

  addParticles(x, y, n, hue, power = 1) {
    if (this.particles.length > MAX_PARTICLES) return;
    for (let i = 0; i < n; i++) {
      const a = R.range(0, Math.PI * 2);
      const sp = R.range(0.04, 0.34) * power;
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.04,
        life: R.range(380, 900), t: 0,
        size: R.range(1.4, 3.6), hue: hue + R.range(-16, 16),
      });
    }
  }

  pushPopup(x, y, text, hue, scale = 1, life = 1300) {
    this.popups.push({ x, y, text, hue, scale, t: 0, life });
    if (this.popups.length > 26) this.popups.shift();
  }

  updateFx(dt) {
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.00042 * dt;
      p.vx *= 0.995;
    }
    this.particles = this.particles.filter((p) => p.t < p.life);

    for (const p of this.popups) { p.t += dt; p.y -= dt * 0.022; }
    this.popups = this.popups.filter((p) => p.t < p.life);

    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.032);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 0.0026);
  }

  /** 좌표에 걸리는 미사일 (마우스 호버 강조용) */
  missileAt(x, y) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      if (m.alive && !m.inert && hitTest(m, x, y)) return m;
    }
    return null;
  }

  /** 아직 해결되지 않은 볼리 (HUD 프롬프트용) */
  activeVolleys() {
    return this.volleys.filter((v) => !v.resolved).sort((a, b) => a.spawnedAt - b.spawnedAt);
  }
}

// --- 기하 유틸 ---------------------------------------------------------

function hitTest(m, x, y) {
  const pad = 8;
  return x >= m.x - m.w / 2 - pad && x <= m.x + m.w / 2 + pad
      && y >= m.y - m.h / 2 - pad && y <= m.y + m.h / 2 + pad;
}

function circleRectOverlap(cx, cy, r, m) {
  const nx = clampNum(cx, m.x - m.w / 2, m.x + m.w / 2);
  const ny = clampNum(cy, m.y - m.h / 2, m.y + m.h / 2);
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= r * r;
}

function clampNum(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

const easeOutCubic = (t) => 1 - Math.pow(1 - clampNum(t, 0, 1), 3);
const easeInQuad = (t) => clampNum(t, 0, 1) ** 2;

export { hitTest, clampNum };
