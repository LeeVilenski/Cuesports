import type { SoundCue, SoundKind } from './cues';
import { synth } from './synth';

/** At most this many sounds at once; the quietest go first (a break has dozens of clicks). */
const VOICES = 24;

/**
 * Recorded sounds (public/sounds, CC0 recordings of real tables; see CREDITS.md there), several
 * takes of each so a run of clicks doesn't repeat itself. Kinds missing here, or not loaded yet,
 * use the synthesised sound.
 */
const SAMPLES: Partial<Record<SoundKind, number>> = { click: 5, strike: 3, drop: 3 };

/** The music (public/music, CC0 tracks; see CREDITS.md there), played in a shuffled loop. */
export const TRACKS = [
  'taken-lightly',
  'giant-steps',
  'mocha-frapp',
  'jazz-slower',
  'chill-lofi',
  'lofi-hip-hop',
] as const;

/** Music sits under the table sounds: this is its gain at the top setting. */
const MUSIC_LEVEL = 0.5;

export interface SoundSettings {
  /** 0–1. */
  effects: number;
  music: number;
  muted: boolean;
}

export const DEFAULT_SOUND: SoundSettings = { effects: 0.8, music: 0.35, muted: false };

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/** A shuffled copy, never starting with `avoidFirst` (so a new lap doesn't repeat the last track). */
export function shuffled<T>(items: readonly T[], avoidFirst?: T, random = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  if (a.length > 1 && a[0] === avoidFirst) a.push(a.shift()!);
  return a;
}

/**
 * Web Audio playback. The context starts on the first touch (browsers won't play sound before
 * one); until then, and where Web Audio is missing, everything is silently a no-op.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private fx: GainNode | null = null;
  private musicGain: GainNode | null = null;
  /** Each kind's takes: the synthesised one until the recordings arrive. */
  private buffers = new Map<SoundKind, AudioBuffer[]>();
  private lastTake = new Map<SoundKind, AudioBuffer>();
  private voices: { src: AudioBufferSourceNode; gain: number; end: number }[] = [];
  /** The app is in the background: everything stays silent until it comes back. */
  private hidden = false;

  private player: HTMLAudioElement | null = null;
  private queue: string[] = [];
  private track: string | null = null;
  private trackUrl: string | null = null;
  /** Tracks that failed to load in a row (offline and not cached): stop trying after a lap. */
  private failures = 0;
  private loading = false;

  constructor(private settings: SoundSettings = DEFAULT_SOUND) {}

  /** Call from a user gesture. Creates the context and the sounds on the first call. */
  unlock(): void {
    if (this.ctx) {
      // 'interrupted' is iOS's own state after a call or a trip to the background.
      if (this.ctx.state !== 'running' && !this.hidden) void this.ctx.resume().catch(() => {});
      this.syncMusic();
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
    this.musicGain = ctx.createGain();
    this.fx.connect(ctx.destination);
    this.musicGain.connect(ctx.destination);
    for (const kind of ['click', 'strike', 'miscue', 'cushion', 'jaw', 'drop'] as SoundKind[]) {
      const data = synth(kind, ctx.sampleRate);
      const b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(kind, [b]);
    }
    void this.loadSamples(ctx);
    this.setupMusic(ctx);
    this.apply();
  }

  private async loadSamples(ctx: AudioContext): Promise<void> {
    await Promise.all(
      Object.entries(SAMPLES).map(async ([kind, n]) => {
        const takes = await Promise.all(
          Array.from({ length: n }, (_, i) =>
            fetch(asset(`sounds/${kind}-${i + 1}.wav`))
              .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
              // The callback form: older Safari has no promise from decodeAudioData.
              .then(
                (data) => new Promise<AudioBuffer>((ok, fail) => void ctx.decodeAudioData(data, ok, fail)),
              )
              .catch(() => null),
          ),
        );
        const got = takes.filter((b): b is AudioBuffer => b !== null);
        if (got.length) this.buffers.set(kind as SoundKind, got);
      }),
    );
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  set(settings: SoundSettings): void {
    this.settings = settings;
    this.apply();
  }

  /**
   * The app went to the background or came back. Suspending the context stops the effects
   * where they are, and the music pauses; coming back picks up from there. Where a browser
   * won't resume without a gesture, the next touch does it through unlock().
   */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    if (hidden) {
      // Cut the shot's sounds rather than leave them to finish on return.
      for (const v of this.voices) v.src.stop();
      this.voices = [];
      void ctx.suspend().catch(() => {});
    } else void ctx.resume().catch(() => {});
    this.syncMusic();
  }

  private apply(): void {
    if (!this.fx || !this.musicGain || !this.ctx) return;
    const on = this.settings.muted ? 0 : 1;
    this.fx.gain.setTargetAtTime(this.settings.effects * on, this.ctx.currentTime, 0.02);
    this.musicGain.gain.setTargetAtTime(this.settings.music * MUSIC_LEVEL * on, this.ctx.currentTime, 0.3);
    this.syncMusic();
  }

  /** One of the kind's takes, not the same one twice running where there is a choice. */
  private take(kind: SoundKind): AudioBuffer | undefined {
    const takes = this.buffers.get(kind);
    if (!takes?.length) return undefined;
    const last = this.lastTake.get(kind);
    const pool = takes.length > 1 ? takes.filter((b) => b !== last) : takes;
    const b = pool[Math.floor(Math.random() * pool.length)]!;
    this.lastTake.set(kind, b);
    return b;
  }

  play(cue: SoundCue): void {
    const ctx = this.ctx;
    const buffer = this.take(cue.kind);
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
    // A touch of variation between otherwise identical hits.
    const pitch = cue.pitch * (0.98 + Math.random() * 0.04);
    src.playbackRate.value = pitch;
    const g = ctx.createGain();
    g.gain.value = cue.gain;
    let out: AudioNode = src;
    if (cue.kind === 'click' && cue.gain < 0.8) {
      // Gentle contacts are duller as well as quieter, not just a turned-down crack.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2500 + 14000 * cue.gain * cue.gain;
      out = src.connect(lp);
    }
    out.connect(g).connect(this.fx);
    src.start(now);
    this.voices.push({ src, gain: cue.gain, end: now + buffer.duration / pitch });
  }

  // -------------------------------------------------------------------------------------------
  // Music

  private setupMusic(ctx: AudioContext): void {
    if (typeof Audio === 'undefined' || !ctx.createMediaElementSource || !this.musicGain) return;
    const el = new Audio();
    el.preload = 'auto';
    // Routed through the context so its level follows the settings (iOS ignores el.volume)
    // and so suspending the context silences it too.
    try {
      ctx.createMediaElementSource(el).connect(this.musicGain);
    } catch {
      return;
    }
    el.addEventListener('ended', () => void this.nextTrack());
    el.addEventListener('error', () => {
      if (this.trackUrl) this.failed();
    });
    this.player = el;
    // Back online after a lap of failures: try again.
    window.addEventListener('online', () => {
      this.failures = 0;
      this.syncMusic();
    });
    void this.nextTrack();
  }

  private get musicWanted(): boolean {
    return !this.hidden && !this.settings.muted && this.settings.music > 0;
  }

  /** Plays or pauses the music to match the settings and visibility. */
  private syncMusic(): void {
    const el = this.player;
    if (!el) return;
    if (!this.musicWanted) {
      if (!el.paused) el.pause();
    } else if (el.paused && this.trackUrl) {
      // Refused without a gesture on some browsers; the next touch calls this again.
      void el.play().catch(() => {});
    } else if (!this.trackUrl && !this.loading && this.failures < TRACKS.length) {
      void this.nextTrack();
    }
  }

  /**
   * Fetches the next track whole and plays it from memory. A whole response (not the ranges
   * an audio element asks for) is what the service worker can cache, so music plays offline
   * once heard.
   */
  private async nextTrack(): Promise<void> {
    const el = this.player;
    if (!el || this.loading) return;
    if (!this.queue.length) this.queue = shuffled(TRACKS, this.track ?? undefined);
    const name = this.queue.shift()!;
    this.track = name;
    this.loading = true;
    let blob: Blob | null = null;
    try {
      const r = await fetch(asset(`music/${name}.mp3`));
      if (r.ok) blob = await r.blob();
    } catch {
      blob = null;
    }
    this.loading = false;
    if (this.trackUrl) URL.revokeObjectURL(this.trackUrl);
    this.trackUrl = null;
    if (!blob) {
      this.failed();
      return;
    }
    this.failures = 0;
    this.trackUrl = URL.createObjectURL(blob);
    el.src = this.trackUrl;
    this.syncMusic();
  }

  private failed(): void {
    if (this.trackUrl) URL.revokeObjectURL(this.trackUrl);
    this.trackUrl = null;
    // Try the next one, unless a whole lap has failed (offline before any were cached).
    if (++this.failures < TRACKS.length) void this.nextTrack();
  }
}
