/**
 * 사운드 — WebAudio로 직접 합성한다. 오디오 파일이 하나도 없다.
 * 덕분에 전체 앱이 수백 KB 안에 들어가고 오프라인에서도 완전히 동작한다.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.unlocked = false;
  }

  /** 브라우저 자동재생 정책 — 첫 사용자 제스처에서 깨운다 */
  unlock() {
    if (this.unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      this.unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (_) { this.enabled = false; }
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.32 : 0;
  }

  _tone({ freq = 440, type = 'sine', dur = 0.16, gain = 0.3, sweep = null, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.3, gain = 0.25, lp = 900, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(lp, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(120, lp * 0.25), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
  }

  fire() { this._tone({ freq: 880, type: 'square', dur: 0.07, gain: 0.1, sweep: 1500 }); }
  explode() { this._noise({ dur: 0.26, gain: 0.16, lp: 1400 }); }

  correct(combo = 1) {
    const base = 523.25; // C5
    const steps = [0, 4, 7, 12, 16, 19, 24];
    const n = steps[Math.min(steps.length - 1, Math.floor(combo / 2))];
    const f = base * Math.pow(2, n / 12);
    this._tone({ freq: f, type: 'triangle', dur: 0.14, gain: 0.22 });
    this._tone({ freq: f * 1.5, type: 'sine', dur: 0.11, gain: 0.1, delay: 0.045 });
  }

  wrong() {
    this._tone({ freq: 220, type: 'sawtooth', dur: 0.26, gain: 0.2, sweep: 96 });
    this._noise({ dur: 0.2, gain: 0.1, lp: 700 });
  }

  cityLost() {
    this._noise({ dur: 0.62, gain: 0.3, lp: 700 });
    this._tone({ freq: 140, type: 'sine', dur: 0.55, gain: 0.26, sweep: 52 });
  }

  waveClear() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this._tone({ freq: f, type: 'triangle', dur: 0.2, gain: 0.18, delay: i * 0.075 }));
  }

  skill() {
    this._tone({ freq: 300, type: 'sine', dur: 0.3, gain: 0.2, sweep: 1300 });
    this._tone({ freq: 600, type: 'triangle', dur: 0.22, gain: 0.1, delay: 0.05 });
  }

  gameOver() {
    [440, 392, 349.23, 261.63].forEach((f, i) =>
      this._tone({ freq: f, type: 'sine', dur: 0.42, gain: 0.2, delay: i * 0.19 }));
  }

  ui() { this._tone({ freq: 660, type: 'sine', dur: 0.05, gain: 0.09 }); }
  empty() { this._tone({ freq: 150, type: 'square', dur: 0.07, gain: 0.09 }); }
}

/**
 * 영어 발음 재생 — 브라우저 내장 TTS.
 * 맞힌 직후 소리로 한 번 더 듣게 하면 철자–음운 연결이 강화된다.
 */
export class Speaker {
  constructor() {
    this.enabled = true;
    this.voice = null;
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    if (this.supported) {
      const load = () => {
        const voices = window.speechSynthesis.getVoices();
        this.voice = voices.find((v) => /^en[-_]US/i.test(v.lang))
          || voices.find((v) => /^en/i.test(v.lang)) || null;
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }

  say(text) {
    if (!this.enabled || !this.supported || !text) return;
    if (!/[a-zA-Z]/.test(text)) return;   // 한국어 쪽은 읽지 않는다
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = this.voice ? this.voice.lang : 'en-US';
      u.rate = 0.95;
      u.volume = 0.85;
      window.speechSynthesis.speak(u);
    } catch (_) { /* 무음으로 넘어간다 */ }
  }
}
