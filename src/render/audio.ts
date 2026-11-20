/**
 * Procedural Web Audio synthesizer: gentle pentatonic night ambience + full SFX set.
 * Client-side only; never imported by src/core/ or headless CLI.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  public volume = 0.7;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('ddl_volume');
      if (saved !== null) {
        const v = Number.parseFloat(saved);
        if (Number.isFinite(v)) this.volume = Math.max(0, Math.min(1, v));
      }
    }
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ddl_volume', String(this.volume));
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.volume <= 0.001) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.volume;
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  startBgm(): void {
    if (this.bgmTimer !== null || typeof window === 'undefined') return;
    // Gentle Vietnamese pentatonic night lullaby notes (D4, F4, G4, A4, C5, D5)
    const scale = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33];
    const pattern = [0, 2, 3, 5, 3, 2, 1, 0];
    this.bgmTimer = window.setInterval(() => {
      if (this.volume <= 0.01) return;
      const freq = scale[pattern[this.bgmStep % pattern.length]];
      this.bgmStep++;
      this.playTone(freq, 1.4, 'sine', 0.032);
    }, 1600);
  }

  stopBgm(): void {
    if (this.bgmTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.14,
    freqEnd?: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playMotePickup(): void {
    this.playTone(784, 0.13, 'sine', 0.11, 1174);
  }

  playCharmPickup(): void {
    [659.25, 880, 1174.66].forEach((f, i) =>
      setTimeout(() => this.playTone(f, 0.25, 'triangle', 0.11), i * 55),
    );
  }

  playDeposit(): void {
    this.playTone(523.25, 0.16, 'triangle', 0.12, 659.25);
  }

  playLanternLit(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((n, idx) =>
      setTimeout(() => this.playTone(n, 0.4, 'sine', 0.11), idx * 65),
    );
  }

  playPulse(): void {
    this.playTone(420, 0.35, 'triangle', 0.17, 920);
  }

  playJump(): void {
    this.playTone(300, 0.14, 'sine', 0.1, 560);
  }

  playDash(): void {
    this.playTone(520, 0.16, 'triangle', 0.12, 240);
  }

  playHit(): void {
    this.playTone(170, 0.28, 'sawtooth', 0.13, 65);
  }

  playShadeSpawn(): void {
    this.playTone(150, 0.4, 'sine', 0.11, 95);
  }

  playCountdownTick(): void {
    this.playTone(880, 0.09, 'square', 0.06);
  }

  playWindWarning(): void {
    this.playTone(260, 0.6, 'sine', 0.07, 420);
  }

  playWin(): void {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((n, idx) =>
      setTimeout(() => this.playTone(n, 0.5, 'triangle', 0.13), idx * 85),
    );
  }

  playLose(): void {
    [330, 293.66, 246.94, 196].forEach((n, idx) =>
      setTimeout(() => this.playTone(n, 0.45, 'sine', 0.11), idx * 115),
    );
  }
}
