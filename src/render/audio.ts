/**
 * Lightweight procedural Web Audio synthesizer for fairy-tale lantern soundscape.
 * Purely client-side visual/audio layer; never imported by src/core/ or headless CLI.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.12,
    freqEnd?: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playMotePickup(): void {
    this.playTone(784, 0.14, 'sine', 0.1, 1174);
  }

  playDeposit(): void {
    this.playTone(523.25, 0.18, 'triangle', 0.12, 659.25);
  }

  playLanternLit(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.4, 'sine', 0.1), idx * 70);
    });
  }

  playPulse(): void {
    this.playTone(440, 0.35, 'triangle', 0.16, 880);
  }

  playHit(): void {
    this.playTone(180, 0.28, 'sawtooth', 0.12, 70);
  }

  playWin(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.5, 'triangle', 0.12), idx * 90);
    });
  }

  playLose(): void {
    const notes = [330, 293.66, 246.94, 196];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.45, 'sine', 0.1), idx * 120);
    });
  }
}
