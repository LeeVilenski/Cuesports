import type { SoundCue, SoundKind } from './cues';
import { ambience, synth, type AmbienceKind } from './synth';

/** At most this many sounds at once; the quietest go first (a break has dozens of clicks). */
const VOICES = 24;

export interface SoundSettings {
  /** 0–1. */
  effects: number;
  ambience: number;
  muted: boolean;
}

export const DEFAULT_SOUND: SoundSettings = { effects: 0.8, ambience: 0.35, muted: false };

/**
 * Web Audio playback. The context starts on the first touch (browsers won't play sound before
 * one); until then, and where Web Audio is missing, everything is silently a no-op.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private fx: GainNode | null = null;
  private room: GainNode | null = null;
  private buffers = new Map<SoundKind, AudioBuffer>();
  private voices: { src: AudioBufferSourceNode; gain: number; end: number }[] = [];
  private loop: AudioBufferSourceNode | null = null;
  private loopKind: AmbienceKind | null = null;
  private wanted: AmbienceKind | null = null;

  constructor(private settings: SoundSettings = DEFAULT_SOUND) {}

  /** Call from a user gesture. Creates the context and the sounds on the first call. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.fx = ctx.createGain();
    this.room = ctx.createGain();
    this.fx.connect(ctx.destination);
    this.room.connect(ctx.destination);
    for (const kind of ['click', 'strike', 'miscue', 'cushion', 'jaw', 'drop'] as SoundKind[]) {
      const data = synth(kind, ctx.sampleRate);
      const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(kind, b);
    }
    this.apply();
    if (this.wanted) this.setAmbience(this.wanted);
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  set(settings: SoundSettings): void {
    this.settings = settings;
    this.apply();
  }

  private apply(): void {
    if (!this.fx || !this.room || !this.ctx) return;
    const on = this.settings.muted ? 0 : 1;
    this.fx.gain.setTargetAtTime(this.settings.effects * on, this.ctx.currentTime, 0.02);
    this.room.gain.setTargetAtTime(this.settings.ambience * 0.6 * on, this.ctx.currentTime, 0.3);
  }

  play(cue: SoundCue): void {
    const ctx = this.ctx;
    const buffer = this.buffers.get(cue.kind);
    if (!ctx || !buffer || !this.fx || ctx.state !== 'running' || cue.gain <= 0) return;
    const now = ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= VOICES) {
      // Drop the quietest, unless this one is quieter still.
      const quietest = this.voices.reduce((a, b) => (b.gain < a.gain ? b : a));
      if (quietest.gain >= cue.gain) return;
      quietest.src.stop();
      this.voices.splice(this.voices.indexOf(quietest), 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = cue.pitch;
    const g = ctx.createGain();
    g.gain.value = cue.gain;
    src.connect(g).connect(this.fx);
    src.start(now);
    this.voices.push({ src, gain: cue.gain, end: now + buffer.duration / cue.pitch });
  }

  /** The room around the table (null for silence). Changes cross-fade. */
  setAmbience(kind: AmbienceKind | null): void {
    this.wanted = kind;
    const ctx = this.ctx;
    if (!ctx || !this.room || kind === this.loopKind) return;
    const old = this.loop;
    if (old) {
      const g = old.context.createGain();
      // Fade the old loop out on its own gain.
      old.disconnect();
      old.connect(g).connect(this.room);
      g.gain.setValueAtTime(1, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
      old.stop(ctx.currentTime + 1.3);
    }
    this.loop = null;
    this.loopKind = kind;
    if (!kind) return;
    const data = ambience(kind, ctx.sampleRate);
    const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
    b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.5);
    src.connect(g).connect(this.room);
    src.start();
    this.loop = src;
  }
}
