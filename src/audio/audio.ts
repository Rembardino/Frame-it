/**
 * AUDIO — tutto generato al volo con Web Audio (nessun file): pubblico, fischi, palloni, pugni, voci.
 *
 * Voci: se il dispositivo ha una voce nella lingua del gioco (sintesi vocale) la usa; altrimenti
 * (es. app Android, o voce già occupata) "borbotta" la frase sillaba per sillaba con una voce inventata.
 * In entrambi i casi la bocca del personaggio segue la stessa traccia di sillabe (audio/speech.ts).
 * Volumi e voci si regolano in CONFIG.audio.
 */
import * as THREE from 'three';
import { CONFIG, SPORT } from '../config';
import { LANGUAGE, LOCALE } from '../i18n';
import type { Actor, Cue, Match, SoundName } from '../sim/match';
import type { View } from '../scoring/scoring';
import { SHOUTS, type Shout } from './lines';
import { alignToWord, speech, syllables, type Speech, type Syllable } from './speech';

const A = () => CONFIG.audio;
/** Formanti (Hz) delle vocali: è quello che fa sembrare "parlato" il borbottio. */
const FORMANTS: Record<Syllable['vowel'], [number, number]> = { a: [800, 1250], e: [450, 1950], i: [320, 2300], o: [500, 850], u: [340, 720] };
/** Anticipo (s) con cui si programmano i suoni: sui telefoni lenti un suono breve programmato "adesso" può andare perso. */
const LEAD = 0.05;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

interface VoiceStyle { f0: number; shout: boolean; radio: boolean }

export class AudioEngine {
  muted = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private radio!: AudioNode;
  private noise!: AudioBuffer;
  private claps!: AudioBuffer;
  private crowd!: GainNode;
  private drone!: GainNode;
  private listener = { pos: new THREE.Vector3(), yaw: 0 };
  private lastSay = new Map<Actor, number>();
  /** Fine (tempo audio) delle frasi in corso dei personaggi, per non farne parlare troppi insieme. */
  private talking: number[] = [];
  private synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis ?? null;
  private ttsVoices: SpeechSynthesisVoice[] = [];
  private ttsOwner: 'director' | 'actor' | null = null;

  constructor() {
    try { this.muted = localStorage.getItem('frameit.sound') === 'off'; } catch { /* niente salvataggi */ }
    if (this.synth) {
      const load = () => {
        const all = this.synth!.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(LANGUAGE));
        // Prima le voci installate sul dispositivo: rispondono subito e segnalano l'inizio delle parole.
        this.ttsVoices = [...all.filter((v) => v.localService), ...all.filter((v) => !v.localService)];
      };
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  /** Va chiamato da un tocco del giocatore (i browser non fanno partire l'audio da soli). */
  unlock() {
    if (!this.ctx) {
      const Ctx = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('frameit.sound', m ? 'off' : 'on'); } catch { /* idem */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : A().master, this.ctx.currentTime, 0.05);
    if (m) this.stopTts();
  }

  /** App in pausa o in background: silenzio, e niente voce vera rimasta a metà. */
  pause() { this.ctx?.suspend().catch(() => {}); this.stopTts(); }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {}); }

  /** A ogni fotogramma: pubblico, ronzio del drone, posizione dell'ascoltatore (la camera). */
  update(view: View, excitement: number, droneFlying: boolean) {
    this.listener.pos.set(view.pos.x, view.pos.y, view.pos.z);
    this.listener.yaw = view.yaw * Math.PI / 180;
    const ctx = this.ctx;
    if (!ctx) return;
    this.crowd.gain.setTargetAtTime(A().crowd * (0.25 + 1.3 * excitement ** 1.5), ctx.currentTime, 0.4);
    this.drone.gain.setTargetAtTime(droneFlying ? A().drone : 0, ctx.currentTime, 0.3);
    const now = ctx.currentTime;
    this.talking = this.talking.filter((end) => end > now);
  }

  /** Svuota i segnali della partita: suoni e frasi dei personaggi. */
  handle(cues: Cue[], match: Match) {
    for (const c of cues.splice(0)) {
      if (c.type === 'sound') this.play(c.sound, c.at, c.power);
      else this.shout(c.actor, c.line, match);
    }
  }

  /** Una battuta del regista in cuffia (nessuna bocca: non si vede). */
  director(text: string) {
    if (!this.ctx || this.muted) return;
    // Il regista ha la precedenza sulla voce vera: interrompe un personaggio.
    if (this.ttsOwner === 'actor') this.stopTts();
    const track = syllables(text, 5.4);
    if (!this.tts(text, 'director', 1.1, 0.95, null)) this.babble(track, { f0: A().directorPitch, shout: false, radio: true }, 1, 0);
  }

  // ---------------------------------------------------------------- frasi dei personaggi

  private shout(a: Actor, line: Shout, match: Match) {
    if (!a.active) return;
    if (match.time - (this.lastSay.get(a) ?? -99) < A().sayCooldown) return;
    if (this.talking.length >= A().maxVoices) return;
    this.lastSay.set(a, match.time);
    const options = SHOUTS[line][LANGUAGE];
    // Nel basket o nella pallavolo il fallo non è una "punizione".
    const text = line === 'foul' && SPORT !== 'calcio' ? options[0] : pick(options);
    const track = syllables(text, 5.8);
    // La bocca si muove anche a volume zero: è parte della scena. Parte insieme alla voce (stesso anticipo).
    a.say = speech(match.time + LEAD, track);
    const { gain, pan } = this.place(a.pos);
    const dur = a.say.dur;
    if (this.ctx) this.talking.push(this.ctx.currentTime + dur);
    if (!this.ctx || this.muted || gain < 0.08) return;
    const style: VoiceStyle = { f0: this.pitchOf(a), shout: true, radio: false };
    if (!this.tts(text, 'actor', 1.15, style.f0 / 130, { actor: a, say: a.say, match }, gain)) this.babble(track, style, gain, pan);
  }

  private pitchOf(a: Actor) {
    const base = a.role === 'ref' ? 105 : a.role === 'coach' ? 98 : a.role === 'fan' ? 175 : a.role === 'steward' ? 112 : 118;
    return base * (1 + ((a.seed * 7.3) % 1) * 0.3);
  }

  /** Voce vera del dispositivo. false = non disponibile o occupata (allora si borbotta). */
  private tts(text: string, owner: 'director' | 'actor', rate: number, pitch: number,
    sync: { actor: Actor; say: Speech; match: Match } | null, volume = 1): boolean {
    const s = this.synth;
    if (!s || !this.ttsVoices.length || A().voice === 'invented') return false;
    if (s.speaking || s.pending) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LOCALE;
    u.voice = this.ttsVoices[(sync?.actor.id ?? 0) % this.ttsVoices.length];
    u.rate = rate; u.pitch = THREE.MathUtils.clamp(pitch, 0.5, 1.6); u.volume = THREE.MathUtils.clamp(volume * A().master * 1.4, 0, 1);
    if (sync) {
      // La bocca parte quando parte davvero la voce, e si riallinea a ogni parola.
      u.onstart = () => { if (sync.actor.say === sync.say) sync.say.at = sync.match.time; };
      u.onboundary = (e) => {
        if (sync.actor.say !== sync.say || e.name === 'sentence') return;
        const word = text.slice(0, e.charIndex).split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
        alignToWord(sync.say, word, sync.match.time);
      };
    }
    u.onend = u.onerror = () => { if (this.ttsOwner === owner) this.ttsOwner = null; };
    this.ttsOwner = owner;
    s.speak(u);
    return true;
  }

  private stopTts() {
    if (this.synth && (this.synth.speaking || this.synth.pending)) this.synth.cancel();
    this.ttsOwner = null;
  }

  /** Voce inventata: per ogni sillaba un piccolo soffio (consonante) e una vocale con le sue formanti. */
  private babble(track: Syllable[], v: VoiceStyle, gain: number, pan: number) {
    const ctx = this.ctx!;
    const out = this.output(gain * (v.shout ? 0.9 : 0.75) * A().voices, pan, v.radio ? this.radio : this.master);
    const start = ctx.currentTime + LEAD, total = track.length ? track[track.length - 1].t + track[track.length - 1].d : 0;
    for (const syl of track) {
      const t0 = start + syl.t, t1 = t0 + syl.d;
      // Intonazione: scende lungo la frase, sale sulle sillabe urlate.
      const f0 = v.f0 * (1 - 0.15 * (syl.t / Math.max(total, 0.1))) * (syl.stress ? 1.3 : 1) * rand(0.96, 1.04);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.linearRampToValueAtTime(f0 * (syl.stress ? 0.85 : 0.95), t1);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(syl.stress ? 0.5 : 0.35, t0 + 0.025);
      env.gain.setValueAtTime(syl.stress ? 0.45 : 0.3, t1 - Math.min(0.05, syl.d * 0.3));
      env.gain.linearRampToValueAtTime(0, t1);
      const [f1, f2] = FORMANTS[syl.vowel];
      const lift = v.f0 > 150 ? 1.15 : 1; // voci più acute, formanti un po' più alte
      for (const [f, q, g] of [[f1 * lift, 6, 1], [f2 * lift, 9, 0.55]] as const) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f * (v.shout ? 1.08 : 1); bp.Q.value = q;
        const fg = ctx.createGain(); fg.gain.value = g;
        osc.connect(bp).connect(fg).connect(env);
      }
      env.connect(out);
      osc.start(t0); osc.stop(t1 + 0.02);
      if (syl.consonant) this.noiseBurst(t0, 0.03, 3200, 0.12 * (v.shout ? 1.3 : 1), out, 'bandpass');
    }
  }

  // ---------------------------------------------------------------- suoni

  private play(sound: SoundName, at: THREE.Vector3, power: number) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + LEAD;
    const { gain, pan } = this.place(at);
    const out = this.output(gain * A().sfx, pan, this.master);
    const thump = (f0: number, f1: number, dur: number, g: number) => {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(e).connect(out); o.start(t); o.stop(t + dur + 0.02);
    };
    const ring = (partials: number[], dur: number, g: number, when = t) => partials.forEach((f, i) => {
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.frequency.value = f;
      e.gain.setValueAtTime(g / (i + 1), when); e.gain.exponentialRampToValueAtTime(0.001, when + dur / (1 + i * 0.3));
      o.connect(e).connect(out); o.start(when); o.stop(when + dur);
    });
    switch (sound) {
      case 'kick': case 'shot':
        thump(150, 55, 0.13, 0.5 * power * (sound === 'shot' ? 1.4 : 1));
        this.noiseBurst(t, 0.04, 1400, 0.25 * power, out, 'lowpass');
        break;
      case 'net': this.noiseBurst(t, 0.45, 500, 1.2, out, 'bandpass'); break;
      case 'save': thump(120, 60, 0.15, 0.6); this.noiseBurst(t, 0.08, 900, 0.35, out, 'lowpass'); this.crowdSwell('ooh'); break;
      case 'ooh': this.crowdSwell('ooh'); break;
      case 'goal': case 'knockdown': this.crowdSwell('roar'); if (sound === 'knockdown') thump(80, 35, 0.3, 1); break;
      case 'point': this.crowdSwell('claps'); break;
      case 'bounce': thump(SPORT === 'tennis' ? 260 : 95, SPORT === 'tennis' ? 140 : 60, 0.08, 0.45 * power); this.noiseBurst(t, 0.015, 1500, 0.12 * power, out, 'highpass'); break;
      case 'swish': this.noiseBurst(t, 0.35, 2600, 0.22, out, 'highpass'); this.crowdSwell('roar'); break;
      case 'rim': ring([590, 1470, 2640, 3900], 0.7 * power, 0.22 * power); break;
      case 'racket': ring([520], 0.08, 0.6); this.noiseBurst(t, 0.03, 2200, 0.3, out, 'bandpass'); break;
      case 'volley': thump(180, 90, 0.08, 0.45); this.noiseBurst(t, 0.07, 1100, 0.55, out, 'bandpass'); break;
      case 'punch': thump(90, 45, 0.16, 0.8 * power); this.noiseBurst(t, 0.09, 700, 0.6 * power, out, 'lowpass'); break;
      case 'bell': ring([650, 1330, 2120, 3010], 1.6, 0.35); ring([650, 1330, 2120, 3010], 1.6, 0.35, t + 0.4); break;
      case 'whistle': this.whistle(t, 0.28 * (0.8 + power * 0.4), out); break;
      case 'whistleEnd': this.whistle(t, 0.35, out); this.whistle(t + 0.5, 0.35, out); this.whistle(t + 1, 1, out); break;
      // ---- golf
      case 'drive': ring([1850, 3150], 0.14, 0.32); thump(420, 170, 0.05, 0.45); this.noiseBurst(t, 0.2, 2600, 0.22, out, 'highpass'); break;
      case 'iron': thump(320, 140, 0.06, 0.5); ring([1400], 0.07, 0.2); this.noiseBurst(t, 0.07, 1700, 0.35, out, 'bandpass'); break;
      case 'putt': ring([950, 2100], 0.06, 0.22); break;
      case 'cup': thump(520, 260, 0.05, 0.4 * power); thump(420, 220, 0.05, 0.25 * power); ring([780], 0.09, 0.12 * power, t + 0.07); break;
      case 'land': thump(130, 70, 0.08, 0.35 * power); break;
      case 'splash': this.noiseBurst(t, 0.55, 800, 0.9, out, 'lowpass'); this.noiseBurst(t, 0.3, 3200, 0.3, out, 'highpass'); break;
      case 'sand': this.noiseBurst(t, 0.3, 1500, 0.55, out, 'bandpass'); break;
      case 'tree': thump(230, 120, 0.08, 0.6); this.noiseBurst(t, 0.45, 2500, 0.3, out, 'highpass'); break;
    }
  }

  /** Fischietto: tono acuto con il "trillo" della pallina interna. */
  private whistle(t: number, dur: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), e = ctx.createGain();
    o.frequency.value = 3100;
    lfo.frequency.value = 38; depth.gain.value = 140;
    lfo.connect(depth).connect(o.frequency);
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.35, t + 0.015);
    e.gain.setValueAtTime(0.35, t + dur - 0.04); e.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(e).connect(out);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
  }

  /** Il pubblico reagisce: boato, "ooh" che scende, o applauso (tennis e pallavolo). */
  private crowdSwell(kind: 'roar' | 'ooh' | 'claps') {
    const ctx = this.ctx!, t = ctx.currentTime + LEAD;
    const src = ctx.createBufferSource();
    src.buffer = kind === 'claps' ? this.claps : this.noise; src.loop = kind !== 'claps';
    const f = ctx.createBiquadFilter(), e = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = kind === 'ooh' ? 3 : 0.7;
    f.frequency.setValueAtTime(kind === 'ooh' ? 650 : 1000, t);
    if (kind === 'ooh') f.frequency.exponentialRampToValueAtTime(330, t + 1.1);
    const peak = A().crowd * (kind === 'roar' ? 3.5 : kind === 'ooh' ? 6 : 5);
    const dur = kind === 'roar' ? 3 : kind === 'ooh' ? 1.3 : 2.5;
    e.gain.setValueAtTime(0.001, t); e.gain.exponentialRampToValueAtTime(peak, t + (kind === 'roar' ? 0.25 : 0.15));
    e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(e).connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  private noiseBurst(t: number, dur: number, freq: number, g: number, out: AudioNode, type: BiquadFilterType) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const e = ctx.createGain();
    e.gain.setValueAtTime(g, t); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(e).connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  /** Volume (più lontano = più piano) e posizione destra/sinistra rispetto a dove guarda la camera. */
  private place(at: THREE.Vector3) {
    const dx = at.x - this.listener.pos.x, dz = at.z - this.listener.pos.z;
    const dist = Math.hypot(dx, dz, at.y - this.listener.pos.y);
    // Il percorso da golf è enorme: lì conta la distanza vera, non la larghezza del "campo".
    const ref = Math.min(CONFIG.pitch.width * 0.6, 40);
    const right = (dx * Math.cos(this.listener.yaw) + dz * Math.sin(this.listener.yaw)) / Math.max(1, Math.hypot(dx, dz));
    return { gain: ref / (ref + dist), pan: THREE.MathUtils.clamp(right, -1, 1) * 0.8 };
  }

  private output(gain: number, pan: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const g = ctx.createGain(); g.gain.value = gain;
    if (!ctx.createStereoPanner) { g.connect(dest); return g; }
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    g.connect(p).connect(dest);
    return g;
  }

  // ---------------------------------------------------------------- impianto

  private build() {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : A().master;
    this.master.connect(ctx.destination);
    // Rumore bianco: base di pubblico, soffi, reti, pugni.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = this.noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    // Applauso: centinaia di battiti di mani brevissimi, sempre più radi.
    this.claps = ctx.createBuffer(1, ctx.sampleRate * 2.5, ctx.sampleRate);
    const c = this.claps.getChannelData(0);
    for (let k = 0; k < 500; k++) {
      const at = Math.floor(Math.pow(Math.random(), 1.6) * (c.length - 800)), amp = rand(0.3, 1);
      for (let i = 0; i < 600; i++) c[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / 90);
    }
    // Brusio del pubblico: rumore filtrato in loop, il volume segue l'eccitazione.
    const crowd = ctx.createBufferSource(); crowd.buffer = this.noise; crowd.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.crowd = ctx.createGain(); this.crowd.gain.value = 0;
    crowd.connect(bp).connect(lp).connect(this.crowd).connect(this.master);
    crowd.start();
    // Drone: due eliche leggermente stonate.
    this.drone = ctx.createGain(); this.drone.gain.value = 0;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 900;
    for (const f of [190, 197, 380]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(dlp); o.start();
    }
    dlp.connect(this.drone).connect(this.master);
    // Cuffia del regista: banda stretta, come una radio.
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 3000;
    hp.connect(rlp).connect(this.master);
    this.radio = hp;
  }
}
