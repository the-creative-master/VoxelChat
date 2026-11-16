/**
 * BiteSizedUtilities — Synthesized WebAudio Cozy Kitchen SFX Engine
 * 100% procedural AudioContext synthesis. Zero external MP3/WAV assets.
 */

const SOUND_MUTE_KEY = 'bsu:sound-muted';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private listeners = new Set<(muted: boolean) => void>();
  private lastHoverAt = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(SOUND_MUTE_KEY) === 'true';
    } catch {
      this.muted = false;
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(next: boolean): void {
    this.muted = next;
    try {
      localStorage.setItem(SOUND_MUTE_KEY, String(next));
    } catch {
      // Ignore private browsing quota errors
    }
    this.listeners.forEach((fn) => fn(this.muted));
    if (!this.muted) {
      this.playPop();
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  subscribe(listener: (muted: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Bubbly tactile pop for 2.5D button presses */
  playPop(pitchMultiplier = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340 * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime(680 * pitchMultiplier, now + 0.055);
    osc.frequency.exponentialRampToValueAtTime(490 * pitchMultiplier, now + 0.095);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.105);
  }

  /** Soft mechanical calculator / keyboard click */
  playClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.028);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.032);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  /** Subtle warm wood tap when hovering over a cupboard */
  playHover(): void {
    const perfNow = performance.now();
    if (perfNow - this.lastHoverAt < 90) return;
    this.lastHoverAt = perfNow;

    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(175, now + 0.04);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /** Cozy wooden cupboard latch + gentle warm creak + welcoming sparkle */
  playCupboardOpen(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Brass latch click
    const latch = ctx.createOscillator();
    const latchGain = ctx.createGain();
    latch.type = 'triangle';
    latch.frequency.setValueAtTime(640, now);
    latch.frequency.exponentialRampToValueAtTime(210, now + 0.045);
    latchGain.gain.setValueAtTime(0.11, now);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    latch.connect(latchGain);
    latchGain.connect(ctx.destination);
    latch.start(now);
    latch.stop(now + 0.055);

    // 2. Cozy band-passed wood creak sweep
    const creak = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const creakGain = ctx.createGain();
    creak.type = 'sawtooth';
    creak.frequency.setValueAtTime(125, now + 0.03);
    creak.frequency.linearRampToValueAtTime(195, now + 0.14);
    creak.frequency.linearRampToValueAtTime(160, now + 0.24);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now + 0.03);
    filter.Q.setValueAtTime(4.5, now + 0.03);

    creakGain.gain.setValueAtTime(0.001, now + 0.03);
    creakGain.gain.linearRampToValueAtTime(0.045, now + 0.08);
    creakGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.26);

    creak.connect(filter);
    filter.connect(creakGain);
    creakGain.connect(ctx.destination);
    creak.start(now + 0.03);
    creak.stop(now + 0.27);

    // 3. Soft warm marimba two-note welcome (C5 -> G5)
    [523.25, 783.99].forEach((freq, idx) => {
      const t = now + 0.09 + idx * 0.065;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.075, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.24);
    });
  }

  /** Soft wooden cabinet door close */
  playCupboardClose(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(88, now + 0.11);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  /** Playful double wood knock when clicking a "Baking Soon" cupboard */
  playLockedRattle(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [0, 0.085].forEach((offset, idx) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(idx === 0 ? 310 : 255, t);
      osc.frequency.exponentialRampToValueAtTime(125, t + 0.055);
      gain.gain.setValueAtTime(0.11, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.065);
    });
  }

  /** Sparkly star chime for pinning a tool to My Lunchbox */
  playStar(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [659.25, 880, 1174.66];
    notes.forEach((freq, i) => {
      const t = now + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.085, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  /** Celebratory ascending chime on copy / completion / run success */
  playSuccess(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  /** Sunny morning ascending marimba arpeggio on "Open the Kitchen!" */
  playSplashLaunch(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [392.0, 493.88, 587.33, 783.99, 987.77];
    notes.forEach((freq, i) => {
      const t = now + i * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.095, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  /** Playful wooden dice clatter */
  playDiceRoll(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const taps = [0, 0.045, 0.095, 0.155, 0.23];
    taps.forEach((offset, idx) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const base = 420 + ((idx * 137) % 320);
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.035);
      gain.gain.setValueAtTime(0.085 - idx * 0.01, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.045);
    });
  }
}

export const soundEngine = new SoundEngine();
