/**
 * 입력 — 마우스 / 터치 / 키보드.
 *
 * PC가 1순위라 마우스 조준이 기본이지만, 키보드만으로도 완주할 수 있어야 한다.
 * 숫자키는 "현재 문제의 N번째 미사일"을 직접 겨냥한다 —
 * 조준 실력이 아니라 단어 실력으로 승부하고 싶은 사람을 위한 경로.
 */

export class InputController {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./renderer.js').Renderer} renderer
   * @param {{onFire:(x:number,y:number)=>void, onSkill:(slot:number)=>void,
   *          onPause:()=>void, onHover?:(m:object|null)=>void}} handlers
   */
  constructor(canvas, renderer, handlers) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.engine = renderer.engine;
    this.h = handlers;
    this.enabled = true;
    this.bind();
  }

  localPoint(ev) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (this.renderer.W / r.width),
      y: (ev.clientY - r.top) * (this.renderer.H / r.height),
    };
  }

  bind() {
    const canvas = this.canvas;

    this._move = (ev) => {
      const p = this.localPoint(ev);
      this.renderer.pointer.inside = true;
      const m = this.renderer.updateHover(p.x, p.y);
      this.h.onHover?.(m);
    };

    this._leave = () => {
      this.renderer.pointer.inside = false;
      this.renderer.hover = null;
    };

    this._down = (ev) => {
      if (!this.enabled) return;
      ev.preventDefault();
      const p = this.localPoint(ev);
      this.renderer.updateHover(p.x, p.y);
      this.renderer.pointer.inside = true;
      this.h.onFire(p.x, p.y);
    };

    canvas.addEventListener('pointermove', this._move, { passive: true });
    canvas.addEventListener('pointerleave', this._leave, { passive: true });
    canvas.addEventListener('pointerdown', this._down);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this._key = (ev) => {
      if (!this.enabled) return;
      if (ev.target && /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;

      const k = ev.key.toLowerCase();

      // 숫자키 — 현재 문제의 N번째 미사일을 조준
      if (k >= '1' && k <= '9') {
        const idx = parseInt(k, 10) - 1;
        const target = this.nthMissile(idx);
        if (target) {
          ev.preventDefault();
          this.h.onFire(target.x, target.y);
        }
        return;
      }

      const slot = { q: 0, w: 1, e: 2, r: 3 }[k];
      if (slot !== undefined) { ev.preventDefault(); this.h.onSkill(slot); return; }

      if (k === 'escape' || k === 'p') { ev.preventDefault(); this.h.onPause(); }
    };
    window.addEventListener('keydown', this._key);
  }

  /** 가장 오래된 미해결 볼리의 미사일들을 좌→우로 정렬해 N번째를 반환 */
  nthMissile(idx) {
    const e = this.engine;
    const active = e.activeVolleys();
    if (!active.length) return null;
    const v = active[0];
    const list = e.missiles
      .filter((m) => m.volleyId === v.id && m.alive && !m.inert)
      .sort((a, b) => a.x - b.x);
    return list[idx] || null;
  }

  /** 키보드 조준 번호를 그리기 위해 렌더러가 참조한다 */
  currentNumbering() {
    const e = this.engine;
    const active = e.activeVolleys();
    if (!active.length) return new Map();
    const v = active[0];
    const list = e.missiles
      .filter((m) => m.volleyId === v.id && m.alive && !m.inert)
      .sort((a, b) => a.x - b.x);
    const map = new Map();
    list.forEach((m, i) => { if (i < 9) map.set(m.id, i + 1); });
    return map;
  }

  destroy() {
    this.canvas.removeEventListener('pointermove', this._move);
    this.canvas.removeEventListener('pointerleave', this._leave);
    this.canvas.removeEventListener('pointerdown', this._down);
    window.removeEventListener('keydown', this._key);
  }
}
