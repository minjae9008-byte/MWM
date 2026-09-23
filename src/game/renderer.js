/**
 * 캔버스 렌더러.
 *
 * 가독성이 최우선이다. 단어를 읽지 못하면 게임이 성립하지 않으므로
 * 배경 대비, 칩 외곽선, 글자 크기 순으로 예산을 쓴다.
 * 화려한 연출은 그 다음.
 */

import { hitTest } from './engine.js';

const FONT_STACK = `'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,-apple-system,'Segoe UI',sans-serif`;
/** 마스킹된 철자는 고정폭이어야 글자 수가 눈에 들어온다 */
const MONO_STACK = `ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace`;

export class Renderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.engine = engine;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.stars = [];
    this.reduceMotion = false;
    this.hover = null;
    this.numbering = null;
    this.pointer = { x: -999, y: -999, inside: false };
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(320, Math.floor(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.W = w;
    this.H = h;
    this.engine.resize(w, h);
    this.buildStars();
  }

  buildStars() {
    this.stars = [];
    const n = Math.round((this.W * this.H) / 14000);
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * this.W,
        y: Math.random() * this.engine.groundY,
        r: Math.random() * 1.25 + 0.25,
        a: Math.random() * 0.55 + 0.12,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  measure(text, size) {
    const c = this.ctx;
    c.save();
    c.font = `700 ${size}px ${FONT_STACK}`;
    const w = c.measureText(text).width;
    c.restore();
    return w;
  }

  draw(t) {
    const c = this.ctx;
    const e = this.engine;
    c.save();
    c.scale(this.dpr, this.dpr);

    const shake = this.reduceMotion ? 0 : e.shake;
    const ox = shake ? (Math.random() - 0.5) * shake : 0;
    const oy = shake ? (Math.random() - 0.5) * shake : 0;

    this.drawBackground(t);
    c.translate(ox, oy);

    this.drawGround();
    this.drawCities();
    this.drawTurrets();
    this.drawTrails();
    this.drawMissiles(t);
    this.drawInterceptors();
    this.drawExplosions();
    this.drawParticles();
    this.drawPrompts();
    this.drawPopups();
    this.drawCrosshair();

    c.restore();

    if (e.flash > 0) {
      c.save();
      c.scale(this.dpr, this.dpr);
      c.fillStyle = `rgba(255,70,70,${e.flash * 0.22})`;
      c.fillRect(0, 0, this.W, this.H);
      c.restore();
    }
  }

  drawBackground(t) {
    const c = this.ctx;
    const g = c.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#05070f');
    g.addColorStop(0.55, '#0a0f1e');
    g.addColorStop(1, '#0e1526');
    c.fillStyle = g;
    c.fillRect(0, 0, this.W, this.H);

    for (const s of this.stars) {
      const a = this.reduceMotion ? s.a : s.a * (0.65 + 0.35 * Math.sin(t * 0.0012 + s.tw));
      c.fillStyle = `rgba(190,215,255,${a})`;
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      c.fill();
    }

    // 과부하 상태에서 배경이 달아오른다
    if (this.engine.run.effects.overcharge > Date.now()) {
      c.fillStyle = 'rgba(255,120,40,0.055)';
      c.fillRect(0, 0, this.W, this.H);
    }
    if (this.engine.run.effects.slow > Date.now()) {
      c.fillStyle = 'rgba(70,170,255,0.05)';
      c.fillRect(0, 0, this.W, this.H);
    }
  }

  drawGround() {
    const c = this.ctx;
    const e = this.engine;
    const gy = e.groundY;

    const g = c.createLinearGradient(0, gy, 0, this.H);
    g.addColorStop(0, '#1b2740');
    g.addColorStop(1, '#0a0f1a');
    c.fillStyle = g;
    c.fillRect(0, gy, this.W, this.H - gy);

    c.strokeStyle = 'rgba(120,180,255,0.42)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, gy);
    c.lineTo(this.W, gy);
    c.stroke();

    // 위험선 — 이 아래로 내려오면 곧 착탄
    c.strokeStyle = 'rgba(255,90,90,0.13)';
    c.setLineDash([7, 11]);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, gy - 74);
    c.lineTo(this.W, gy - 74);
    c.stroke();
    c.setLineDash([]);
  }

  drawCities() {
    const c = this.ctx;
    const e = this.engine;
    for (const city of e.cities) {
      const x = city.x;
      const y = e.groundY;
      c.save();
      if (city.alive) {
        c.fillStyle = 'rgba(90,200,255,0.9)';
        c.shadowColor = 'rgba(90,200,255,0.65)';
        c.shadowBlur = 14;
        // 기억 저장소: 작은 데이터 타워 3개
        const bars = [[-14, 20], [0, 30], [14, 24]];
        for (const [dx, hh] of bars) {
          c.fillRect(x + dx - 5, y - hh, 10, hh);
        }
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(200,245,255,0.95)';
        c.fillRect(x - 3, y - 36, 6, 5);
      } else {
        c.fillStyle = 'rgba(120,80,80,0.5)';
        c.beginPath();
        c.moveTo(x - 18, y);
        c.lineTo(x - 9, y - 9);
        c.lineTo(x, y - 3);
        c.lineTo(x + 10, y - 11);
        c.lineTo(x + 18, y);
        c.closePath();
        c.fill();
      }
      c.restore();
    }
  }

  drawTurrets() {
    const c = this.ctx;
    const e = this.engine;
    const px = this.pointer.x;
    const py = this.pointer.y;

    for (const t of e.turrets) {
      const empty = t.ammo <= 0;
      c.save();
      c.translate(t.x, e.groundY);
      if (t.recoil > 0) { c.translate(0, t.recoil * 3); t.recoil = Math.max(0, t.recoil - 0.08); }

      // 포신은 마우스를 향한다
      const ang = Math.atan2(py - (e.groundY - 18), px - t.x);
      const aim = Math.max(-Math.PI * 0.95, Math.min(-Math.PI * 0.05, ang));
      c.save();
      c.strokeStyle = empty ? 'rgba(120,130,150,0.5)' : 'rgba(180,225,255,0.92)';
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, -14);
      c.lineTo(Math.cos(aim) * 22, -14 + Math.sin(aim) * 22);
      c.stroke();
      c.restore();

      c.fillStyle = empty ? 'rgba(90,100,120,0.75)' : 'rgba(120,200,255,0.92)';
      c.beginPath();
      c.moveTo(-20, 0);
      c.lineTo(-12, -16);
      c.lineTo(12, -16);
      c.lineTo(20, 0);
      c.closePath();
      c.fill();

      // 탄약 표시
      const perRow = 10;
      const n = Math.min(t.ammo, 30);
      c.fillStyle = empty ? 'rgba(255,110,110,0.85)' : 'rgba(150,235,190,0.95)';
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        c.fillRect(-perRow * 2 + col * 4, 6 + row * 5, 2.5, 3.5);
      }
      // 전투 중이 아닐 때(시작 화면 배경)는 경고를 띄우지 않는다
      if (empty && e.waveActive) {
        c.fillStyle = 'rgba(255,120,120,0.95)';
        c.font = `700 11px ${FONT_STACK}`;
        c.textAlign = 'center';
        c.fillText('탄약 없음', 0, 20);
      }
      c.restore();
    }
  }

  drawTrails() {
    const c = this.ctx;
    for (const m of this.engine.missiles) {
      if (m.trail.length < 2) continue;
      const v = this.engine.volleys.find((x) => x.id === m.volleyId);
      const h = v ? v.color.h : 200;
      c.strokeStyle = `hsla(${h},70%,62%,${0.16 * (m.inert ? m.fade : 1)})`;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(m.trail[0].x, m.trail[0].y);
      for (let i = 1; i < m.trail.length; i++) c.lineTo(m.trail[i].x, m.trail[i].y);
      c.lineTo(m.x, m.y);
      c.stroke();
    }
  }

  drawMissiles(t) {
    const c = this.ctx;
    const e = this.engine;
    const fs = e.chipFontSize();
    const blur = e.run.mods.blurText;
    const marks = e.showMarkers();

    for (const m of e.missiles) {
      const v = e.volleys.find((x) => x.id === m.volleyId);
      const h = v ? v.color.h : 200;
      const alpha = m.inert ? Math.max(0, m.fade) : 1;
      const danger = m.y > e.groundY - 92 && m.correct;
      const hovered = this.hover && this.hover.id === m.id;

      c.save();
      c.globalAlpha = alpha;
      c.translate(m.x, m.y);

      const w = m.w;
      const hh = m.h;
      const r = 9;

      // 예광탄 / 기억 소환 — 정답을 희미하게 표시
      const reveal = (v && v.revealed && m.correct) || (e.run.mods.tracer && m.correct);
      if (reveal) {
        c.shadowColor = `hsla(55,100%,70%,0.95)`;
        c.shadowBlur = v && v.revealed ? 22 : 10;
      } else if (danger && !this.reduceMotion) {
        c.shadowColor = 'rgba(255,80,80,0.8)';
        c.shadowBlur = 14 + Math.sin(t * 0.012) * 7;
      } else if (hovered) {
        c.shadowColor = `hsla(${h},90%,70%,0.9)`;
        c.shadowBlur = 16;
      }

      // 칩 본체
      c.fillStyle = `hsla(${h},52%,13%,0.93)`;
      roundRect(c, -w / 2, -hh / 2, w, hh, r);
      c.fill();
      c.shadowBlur = 0;

      c.strokeStyle = danger ? 'rgba(255,110,110,0.95)' : `hsla(${h},82%,${hovered ? 74 : 62}%,${hovered ? 1 : 0.85})`;
      c.lineWidth = m.armored ? 3.5 : hovered ? 2.6 : 1.8;
      roundRect(c, -w / 2, -hh / 2, w, hh, r);
      c.stroke();

      if (m.typing) {
        c.setLineDash([6, 4]);
        c.strokeStyle = `hsla(${h},80%,66%,0.8)`;
        c.lineWidth = 1.6;
        roundRect(c, -w / 2 + 5, -hh / 2 + 5, w - 10, hh - 10, r - 3);
        c.stroke();
        c.setLineDash([]);
      }

      if (m.armored) {
        c.strokeStyle = 'rgba(255,215,130,0.9)';
        c.lineWidth = 1.4;
        roundRect(c, -w / 2 + 4.5, -hh / 2 + 4.5, w - 9, hh - 9, r - 3);
        c.stroke();
      }

      // 탄두 노즈
      c.fillStyle = danger ? 'rgba(255,120,120,0.95)' : `hsla(${h},85%,68%,0.9)`;
      c.beginPath();
      c.moveTo(-6, hh / 2);
      c.lineTo(6, hh / 2);
      c.lineTo(0, hh / 2 + 8);
      c.closePath();
      c.fill();

      // 단어
      c.font = `700 ${fs}px ${m.typing ? MONO_STACK : FONT_STACK}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (blur && !hovered) { c.filter = 'blur(1.6px)'; }
      c.fillStyle = danger ? '#ffe6e6' : '#f2f8ff';
      c.fillText(m.text, 0, 1);
      c.filter = 'none';

      // 색각 보조 — 여러 문제가 겹칠 때 어느 문제 것인지 기호로도 알 수 있게
      if (marks && v) {
        c.font = `700 ${Math.round(fs * 0.52)}px ${FONT_STACK}`;
        c.fillStyle = `hsla(${h},85%,72%,0.95)`;
        c.fillText(v.color.mark, w / 2 - 9, -hh / 2 + 9);
      }

      if (reveal) {
        c.fillStyle = 'rgba(255,225,90,0.95)';
        c.font = `700 ${Math.round(fs * 0.62)}px ${FONT_STACK}`;
        c.fillText('▾', 0, -hh / 2 - 8);
      }

      // 키보드 조준 번호 — 현재 문제의 미사일에만 붙는다
      const numLabel = this.numbering && this.numbering.get(m.id);
      if (numLabel) {
        const bx = -w / 2 - 2;
        c.fillStyle = `hsla(${h},70%,20%,0.95)`;
        c.beginPath();
        c.arc(bx, -hh / 2 - 1, 9, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = `hsla(${h},85%,65%,0.9)`;
        c.lineWidth = 1.2;
        c.stroke();
        c.fillStyle = '#eaf3ff';
        c.font = `700 11px ${FONT_STACK}`;
        c.fillText(String(numLabel), bx, -hh / 2);
      }
      c.restore();
    }
  }

  drawInterceptors() {
    const c = this.ctx;
    for (const it of this.engine.interceptors) {
      c.save();
      c.strokeStyle = 'rgba(160,255,215,0.75)';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(it.sx, it.sy);
      c.lineTo(it.x, it.y);
      c.stroke();

      c.fillStyle = '#eafff6';
      c.shadowColor = 'rgba(140,255,210,0.95)';
      c.shadowBlur = 10;
      c.beginPath();
      c.arc(it.x, it.y, 3.2, 0, Math.PI * 2);
      c.fill();
      c.restore();

      // 목표 마커
      c.save();
      c.strokeStyle = 'rgba(160,255,215,0.4)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(it.tx, it.ty, 8, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
  }

  drawExplosions() {
    const c = this.ctx;
    for (const ex of this.engine.explosions) {
      const p = ex.t / ex.life;
      const hue = ex.hostile ? 6 : 165;
      const a = Math.max(0, 1 - p);
      const g = c.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, Math.max(1, ex.r));
      g.addColorStop(0, `hsla(${hue + 40},100%,88%,${a * 0.95})`);
      g.addColorStop(0.45, `hsla(${hue},100%,66%,${a * 0.65})`);
      g.addColorStop(1, `hsla(${hue},100%,50%,0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(ex.x, ex.y, Math.max(0, ex.r), 0, Math.PI * 2);
      c.fill();

      c.strokeStyle = `hsla(${hue + 30},100%,80%,${a * 0.55})`;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(ex.x, ex.y, Math.max(0, ex.r), 0, Math.PI * 2);
      c.stroke();
    }
  }

  drawParticles() {
    const c = this.ctx;
    for (const p of this.engine.particles) {
      const a = 1 - p.t / p.life;
      c.fillStyle = `hsla(${p.hue},90%,68%,${a * 0.85})`;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  /** 화면 하단 — 지금 풀어야 할 문제들 */
  drawPrompts() {
    const c = this.ctx;
    const e = this.engine;
    const active = e.activeVolleys();
    if (!active.length) return;

    const baseY = this.H - (this.H - e.groundY) * 0.42;
    const fs = Math.round(Math.min(34, Math.max(19, this.W * 0.021)) * this.engine.fontScale);
    const gap = 16;

    const cards = active.slice(0, 3).map((v) => {
      const tw = this.measure(v.question.prompt, fs);
      return { v, w: Math.max(150, tw + 54), h: fs + 34 };
    });
    const total = cards.reduce((s, x) => s + x.w, 0) + gap * (cards.length - 1);
    let x = this.W / 2 - total / 2;

    for (const card of cards) {
      const { v, w, h } = card;
      const cx = x + w / 2;
      const hue = v.color.h;

      // 남은 시간 게이지
      const elapsed = Date.now() - v.spawnedAt;
      const prog = Math.min(1, elapsed / v.windowMs);

      c.save();
      c.fillStyle = `hsla(${hue},45%,10%,0.92)`;
      roundRect(c, x, baseY - h / 2, w, h, 12);
      c.fill();

      c.fillStyle = `hsla(${hue},80%,55%,0.17)`;
      roundRect(c, x, baseY - h / 2, w * (1 - prog), h, 12);
      c.fill();

      c.strokeStyle = `hsla(${hue},85%,${prog > 0.75 ? 72 : 58}%,0.95)`;
      c.lineWidth = prog > 0.75 ? 2.6 : 1.8;
      roundRect(c, x, baseY - h / 2, w, h, 12);
      c.stroke();

      c.font = `800 ${fs}px ${FONT_STACK}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#f4f9ff';
      c.fillText(v.question.prompt, cx, baseY + 1);

      // 볼리 기호 — 미사일 칩의 기호와 짝이 맞는다
      c.font = `700 ${Math.round(fs * 0.5)}px ${FONT_STACK}`;
      c.fillStyle = `hsla(${hue},85%,70%,0.9)`;
      c.fillText(v.color.mark, x + 15, baseY + 1);

      // 상태 뱃지
      let badge = null;
      let badgeColor = 'rgba(140,255,190,0.95)';
      if (v.typing) { badge = '⌨ 철자 입력'; badgeColor = 'rgba(255,225,130,0.98)'; }
      else if (v.question.isNew) { badge = 'NEW'; }
      else if (v.question.lapses >= 3) { badge = '자주 틀림'; badgeColor = 'rgba(255,170,120,0.95)'; }
      else if (v.question.starred) { badge = '★ 즐겨찾기'; badgeColor = 'rgba(255,215,130,0.95)'; }
      if (badge) {
        c.font = `700 10px ${FONT_STACK}`;
        c.fillStyle = badgeColor;
        c.fillText(badge, cx, baseY - h / 2 - 9);
      }
      c.restore();
      x += w + gap;
    }
  }

  drawPopups() {
    const c = this.ctx;
    for (const p of this.engine.popups) {
      const life = p.t / p.life;
      const a = life < 0.12 ? life / 0.12 : 1 - Math.max(0, (life - 0.55) / 0.45);
      const size = Math.round(18 * p.scale);
      c.save();
      c.globalAlpha = Math.max(0, a);
      c.font = `800 ${size}px ${FONT_STACK}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(4,7,14,0.85)';
      c.strokeText(p.text, p.x, p.y);
      c.fillStyle = `hsl(${p.hue},95%,${p.hue === 0 ? 68 : 72}%)`;
      c.fillText(p.text, p.x, p.y);
      c.restore();
    }
  }

  drawCrosshair() {
    if (!this.pointer.inside) return;
    const c = this.ctx;
    const { x, y } = this.pointer;
    const r = this.engine.blastRadius();

    c.save();
    // 폭발 예상 범위 — 오폭을 피하려면 이게 보여야 한다
    c.strokeStyle = this.engine.run.mods.precision
      ? 'rgba(150,255,210,0.28)'
      : 'rgba(150,255,210,0.16)';
    c.setLineDash([4, 6]);
    c.lineWidth = 1;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);

    c.strokeStyle = 'rgba(180,255,225,0.9)';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x - 11, y); c.lineTo(x - 4, y);
    c.moveTo(x + 4, y); c.lineTo(x + 11, y);
    c.moveTo(x, y - 11); c.lineTo(x, y - 4);
    c.moveTo(x, y + 4); c.lineTo(x, y + 11);
    c.stroke();
    c.restore();
  }

  updateHover(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.hover = this.engine.missileAt(x, y);
    return this.hover;
  }
}

function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

export { FONT_STACK, roundRect };
