/**
 * Ton-Grundlage (Web Audio): alle Klänge werden im Browser erzeugt – keine Tondateien.
 * Startet erst nach der ersten Berührung bzw. dem ersten Tastendruck (Browser-Regel).
 */

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  /** Gemeinsamer Hall für Musik und Effekte (macht den Klang runder) */
  private reverb!: ConvolverNode;
  private noiseBuf!: AudioBuffer;
  private musicVol = 0.6;
  private sfxVol = 0.8;
  private muted = false;
  private duck = 1;
  readonly listeners: (() => void)[] = [];

  /** Nach der ersten Interaktion aufrufen. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);
    // Kurzer Hall aus abklingendem Rauschen
    const len = Math.floor(ctx.sampleRate * 1.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    this.reverb.connect(wet).connect(this.master);
    // Rauschen für Schritte, Platschen, Schlagzeug
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    for (const l of this.listeners) l();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  setVolumes(music: number, sfx: number, muted: boolean) {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.muted = muted;
    this.applyVolumes();
  }

  /** Musik leiser (z. B. in der Pause) */
  setDuck(d: number) {
    this.duck = d;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.music.gain.setTargetAtTime(this.musicVol * 0.55 * this.duck, t, 0.1);
    this.sfx.gain.setTargetAtTime(this.sfxVol, t, 0.05);
  }

  /**
   * Ton mit Hüllkurve. `dest` = 'music' oder 'sfx'. Gibt den Oszillator zurück (für Tonhöhen-Verläufe).
   */
  tone(
    freq: number,
    dur: number,
    opts: {
      type?: OscillatorType;
      vol?: number;
      attack?: number;
      release?: number;
      at?: number;
      dest?: 'music' | 'sfx';
      slideTo?: number;
      vibrato?: number;
      filter?: number;
      pan?: number;
      reverb?: number;
    } = {},
  ): OscillatorNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const t0 = opts.at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
    let node: AudioNode = osc;
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = freq * opts.vibrato;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.2);
    }
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.3;
    const a = opts.attack ?? 0.01;
    const r = opts.release ?? 0.08;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.setValueAtTime(vol, t0 + Math.max(a, dur - r));
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g);
    let out: AudioNode = g;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      out = p;
    }
    out.connect(opts.dest === 'music' ? this.music : this.sfx);
    if (opts.reverb) {
      const rg = ctx.createGain();
      rg.gain.value = opts.reverb;
      out.connect(rg).connect(this.reverb);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return osc;
  }

  /** Gefiltertes Rauschen (Schritte, Platschen, Wind, Schlagzeug) */
  noise(
    dur: number,
    opts: { vol?: number; freq?: number; q?: number; type?: BiquadFilterType; at?: number; dest?: 'music' | 'sfx'; slideTo?: number; attack?: number; pan?: number } = {},
  ) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = opts.at ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t0);
    if (opts.slideTo) f.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const vol = opts.vol ?? 0.3;
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g);
    let out: AudioNode = g;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      out = p;
    }
    out.connect(opts.dest === 'music' ? this.music : this.sfx);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }
}

export const audio = new AudioEngine();
