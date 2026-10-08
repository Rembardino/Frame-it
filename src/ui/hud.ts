/**
 * Overlay broadcast in 2D (DOM sopra il canvas). Il markup sta in index.html, qui solo gli aggiornamenti.
 */
import { CONFIG, SPORT } from '../config';
import type { CameraController } from '../camera/cameraController';
import { COMPONENT_LABEL } from '../scoring/scoring';
import type { DirectorResult } from '../events/director';
import type { DirectorVoice } from '../director/voice';
import type { MatchSummary } from '../scoring/summary';
import type { Match } from '../sim/match';
import { showAlbum } from './album';
import { restartGame } from '../platform/navigation';
import { numberText, t } from '../i18n';

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const stars = (n: number) => '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>';

export class Hud {
  private zoom = $('zoom');
  private fps = $('fps');
  private hint = $('hint');
  private result = $('result');
  private score = $('score');
  private clock = $('clock');
  private pts = $('pts');
  private voice = $('voice');
  private voiceText = $('voice-text');
  private voiceBar = $('voice-bar');
  private frames = 0;
  private fpsTime = 0;
  private resultTimer = 0;
  private voiceId = 0;
  /** Momenti finiti insieme (dilemma): le schede si mostrano una dopo l'altra. */
  private queue: DirectorResult[] = [];

  constructor(showFps: boolean) {
    this.fps.hidden = !showFps;
    CONFIG.teams.forEach((team, i) => {
      $(`t${i}`).textContent = SPORT === 'boxe' ? t(team.name).slice(0, 3) : team.short;
      $(`c${i}`).style.background = hex(team.shirt);
    });
  }

  update(dt: number, cam: CameraController, match: Match, voice: DirectorVoice, ended: boolean) {
    this.zoom.textContent = `x${numberText(cam.magnification, 1)}`;
    if (cam.hasInteracted) this.hint.classList.add('hidden');

    // Scoreboard: il tempo di gioco viene mostrato come una partita vera (90' calcio, 40' basket).
    const mins = CONFIG.match.clockMinutes;
    this.score.textContent = match.sportSimulation?.scoreText() ?? `${match.score[0]} - ${match.score[1]}`;
    this.clock.textContent = ended ? t('FINE') : SPORT === 'boxe'
      ? `R${Math.min(3, 1 + Math.floor(match.clock / (CONFIG.match.durationSec / 3)))}/3 · ${t('COLPI')}`
      : SPORT === 'tennis' ? t('GAME · PUNTI') : SPORT === 'pallavolo' ? t('PUNTI')
      : `${Math.min(mins, Math.floor((match.clock / CONFIG.match.durationSec) * mins))}'`;

    // Regista in cuffia.
    const line = voice.current;
    if (line && line.id !== this.voiceId) {
      this.voiceId = line.id;
      this.voiceText.textContent = line.text;
      this.voice.className = `voice k-${line.kind}`;
      // Barra del tempo per eseguire l'ordine.
      this.voiceBar.style.animation = 'none';
      void this.voiceBar.offsetWidth;
      this.voiceBar.style.animation = line.kind === 'order' ? `shrink ${line.dur}s linear forwards` : 'none';
    } else if (!line && !this.voice.classList.contains('hidden')) {
      this.voice.classList.add('hidden');
    }

    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps.textContent = `${Math.round(this.frames / this.fpsTime)} fps`;
      this.frames = this.fpsTime = 0;
    }

    if (this.resultTimer > 0 && (this.resultTimer -= dt) <= 0) {
      this.result.classList.add('hidden');
      const next = this.queue.shift();
      if (next) this.render(next);
    }
  }

  /** Punti e stelle medie in alto a destra. */
  setTotals(points: number, avgStars: number) {
    this.pts.innerHTML = `${numberText(points)} PT${avgStars ? ` · <span class="star">★</span> ${numberText(avgStars, 1)}` : ''}`;
  }

  showResult(r: DirectorResult) {
    if (this.resultTimer > 0) this.queue.push(r);
    else this.render(r);
  }

  /** Scheda voto dopo un momento: stelle, voto, perché, e le sole voci attive al livello corrente. */
  private render({ label, result: r, points, bonus, multiplier }: DirectorResult) {
    this.result.classList.toggle('missed', !r);
    this.resultTimer = r ? CONFIG.scoring.resultSec : CONFIG.scoring.resultSec * 0.6;
    this.result.classList.remove('hidden');
    if (!r) {
      this.result.innerHTML = `<div class="r-head"><span class="r-label">${t('Perso: {label}', { label: t(label) })}</span></div>`;
      return;
    }
    const reasons = r.reasons.map((x) => `<li class="${x.good ? 'good' : 'bad'}">${t(x.text)}</li>`).join('');
    const comps = r.enabled.map((k) => `${t(COMPONENT_LABEL[k])} <b>${Math.round(r.components[k])}</b>`).join(' · ');
    const gain = bonus
      ? `<div class="r-bonus">+${bonus} ${t('BONUS REGIA')}</div>`
      : multiplier
        ? `<div class="r-bonus">+${points} pt · x${multiplier}: ${t('azione precedente ben ripresa!')}</div>`
        : points ? `<span class="r-pts">+${points} pt</span>` : '';
    this.result.innerHTML = `
      <div class="r-head"><span class="r-label">${t(label)}</span><span class="r-stars">${stars(r.stars)}</span><span class="r-score">${r.score}</span></div>
      <ul>${reasons}</ul>
      <div class="r-comps">${comps} ${bonus || multiplier ? '' : gain}</div>${bonus || multiplier ? gain : ''}`;
  }

  /** Riepilogo di fine partita. */
  showSummary(s: MatchSummary, match: Match, record: number, isRecord: boolean) {
    const teams = CONFIG.teams;
    const best = s.best.map((b) => `<li><span>${t(b.label)}</span><span class="r-stars">${stars(b.stars)}</span><b>${b.score}</b></li>`).join('');
    const el = $('summary');
    el.innerHTML = `
      <div class="sum">
        <div class="sum-title">${t('FINE PARTITA')}</div>
        <div class="sum-score">${t(teams[0].name)} <b>${match.score[0]} - ${match.score[1]}</b> ${t(teams[1].name)}</div>
        <div class="sum-grid">
          <div><small>${t('Punti')}</small><b>${numberText(s.points)}</b>${isRecord ? `<em>${t('Nuovo record!')}</em>` : `<em>${t('Record')} ${numberText(record)}</em>`}</div>
          <div><small>${t('Stelle medie')}</small><b class="star">★ ${numberText(s.avgStars, 1)}</b></div>
          <div><small>${t('Ordini eseguiti')}</small><b>${s.orders.done}/${s.orders.total}</b></div>
          <div><small>${t('Distrazioni riprese')}</small><b>${s.distractions.caught}/${s.distractions.total}</b></div>
          <div><small>${t('Clip rare')}</small><b>${s.rareClips}</b></div>
        </div>
        <div class="sum-best"><small>${t('Momenti migliori')}</small><ul>${best || `<li>${t('Nessuno... ahia.')}</li>`}</ul></div>
        <div class="sum-verdict"><span class="tag">${t('REGIA')}</span> “${t(s.verdict)}”</div>
        <div class="sum-btns"><button id="again">${t('Rigioca')}</button><button id="sum-album" class="ghost">${t('Album')}</button></div>
      </div>`;
    el.classList.remove('hidden');
    $('again').addEventListener('click', restartGame);
    $('sum-album').addEventListener('click', () => showAlbum('results'));
  }
}
