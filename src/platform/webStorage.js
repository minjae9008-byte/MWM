/**
 * 웹 플랫폼 저장 어댑터.
 *
 * 코어(src/core/*)는 저장 매체를 모른다 — read/write/clear 세 개짜리 인터페이스만 안다.
 * 그래서 이 파일이 브라우저에 묶여 있는 유일한 저장 코드이고,
 * Flutter로 옮길 때 이 파일 하나만 shared_preferences 구현으로 갈아 끼우면 된다.
 */

const KEY = 'mwm:profile:v1';

export class WebStorageAdapter {
  constructor(key = KEY) {
    this.key = key;
    this.available = false;
    this.memory = null;
    try {
      const probe = '__mwm_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      this.available = true;
    } catch (_) {
      // 사생활 보호 모드나 쿠키 차단 — 메모리에만 들고 간다
      this.available = false;
    }
  }

  read() {
    if (!this.available) return this.memory;
    try {
      const raw = window.localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  write(data) {
    if (!this.available) { this.memory = data; return false; }
    try {
      window.localStorage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch (_) {
      // 용량 초과라면 복습 로그부터 버린다 — 카드 상태가 훨씬 중요하다
      try {
        window.localStorage.setItem(this.key, JSON.stringify({ ...data, log: (data.log || []).slice(-500) }));
        return true;
      } catch (_) {
        this.memory = data;
        return false;
      }
    }
  }

  clear() {
    this.memory = null;
    if (!this.available) return;
    try { window.localStorage.removeItem(this.key); } catch (_) { /* noop */ }
  }
}

export { KEY as STORAGE_KEY };
