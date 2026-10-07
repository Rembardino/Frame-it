/**
 * Modalità debug (?debug nell'URL): mostra in tempo reale l'inquadratura ideale, i punti chiave
 * (verde = dentro, giallo = sul bordo, rosso = fuori), dove dovrebbe stare il soggetto principale
 * e le componenti del voto. Serve per bilanciare i parametri in config.ts.
 */
import { CONFIG } from '../config';
import {
  COMPONENTS, COMPONENT_LABEL, evaluateFrame, project, starsFor, unproject,
  type Component, type FrameInput, type View,
} from '../scoring/scoring';
import type { MomentTracker } from '../scoring/moment';
import { numberText, t } from '../i18n';

const KP_RADIUS = { head: 5, ball: 5, body: 4, goal: 4, area: 4, feet: 3.5, hands: 2 };

export class DebugOverlay {
  private canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  private panel = document.createElement('div');
  private panelTimer = 0;

  constructor() {
    this.canvas.className = 'debug-canvas';
    this.panel.className = 'debug-panel';
    document.body.append(this.canvas, this.panel);
  }

  draw(dt: number, now: number, view: View, tracker: MomentTracker | null, ambient: FrameInput, enabled: Component[]) {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const sx = (x: number) => ((x + 1) / 2) * w;
    const sy = (y: number) => ((1 - y) / 2) * h;

    const active = !!tracker?.last;
    const ev = tracker?.last ?? evaluateFrame(view, ambient);
    const color = active ? '#ffd23f' : '#4fd1ff';

    // Terzi.
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1;
    g.beginPath();
    for (const f of [1 / 3, 2 / 3]) {
      g.moveTo(w * f, 0); g.lineTo(w * f, h);
      g.moveTo(0, h * f); g.lineTo(w, h * f);
    }
    g.stroke();

    // Inquadratura ideale: i 4 angoli del suo schermo proiettati nel mio.
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => project(view, unproject(ev.ideal, x, y, 40)));
    if (corners.every((c) => !c.behind)) {
      g.strokeStyle = color;
      g.lineWidth = 2.5;
      g.setLineDash([10, 6]);
      g.beginPath();
      corners.forEach((c, i) => (i ? g.lineTo(sx(c.x), sy(c.y)) : g.moveTo(sx(c.x), sy(c.y))));
      g.closePath();
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = color;
      g.font = 'bold 12px system-ui, sans-serif';
      g.fillText(t('IDEALE'), sx(corners[3].x) + 6, sy(corners[3].y) + 16);
    }

    // Soggetto principale: dov'è -> dove dovrebbe stare.
    const target = ev.leadTarget;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(sx(target.x), sy(target.y), 12, 0, Math.PI * 2);
    g.stroke();
    if (ev.leadActual) {
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(sx(ev.leadActual.x), sy(ev.leadActual.y));
      g.lineTo(sx(target.x), sy(target.y));
      g.stroke();
      g.setLineDash([]);
    }

    // Punti chiave (quelli fuori schermo restano incollati al bordo).
    for (const p of ev.points) {
      if (p.behind) continue;
      const x = Math.max(-0.985, Math.min(0.985, p.x));
      const y = Math.max(-0.975, Math.min(0.975, p.y));
      g.fillStyle = p.inside >= 0.99 ? '#3ddc84' : p.inside > 0 ? '#ffd23f' : '#ff4d4d';
      g.beginPath();
      g.arc(sx(x), sy(y), KP_RADIUS[p.kind], 0, Math.PI * 2);
      g.fill();
    }

    // Pannello testuale, aggiornato 10 volte al secondo.
    this.panelTimer -= dt;
    if (this.panelTimer > 0) return;
    this.panelTimer = 0.1;
    const m = tracker?.moment;
    const partial = active && tracker!.samples.length > 1 ? tracker!.result(enabled) : null;
    const frameValue: Partial<Record<Component, number>> = { coverage: ev.coverage * 100, size: ev.size * 100, composition: ev.composition * 100 };
    const rows = COMPONENTS.map((k) => {
      // Il Tempismo ha senso solo dopo l'istante decisivo.
      const v = frameValue[k] ?? (k === 'timing' && m && now < m.decisive ? undefined : partial?.components[k]);
      const off = !enabled.includes(k);
      return `<div class="row${off ? ' off' : ''}"><span>${t(COMPONENT_LABEL[k])}</span><b style="--v:${v ?? 0}%"></b><em>${v === undefined ? '–' : Math.round(v)}</em></div>`;
    }).join('');
    const mag = (fov: number) => numberText(Math.tan((CONFIG.camera.fovMax / 2) * Math.PI / 180) / Math.tan((fov / 2) * Math.PI / 180), 1);
    let head = `<div class="title" style="color:${color}">${t('Libero')} <small>${t('(non valutato)')}</small></div>`;
    if (m) {
      const pct = (x: number) => Math.max(0, Math.min(100, ((x - m.start) / (m.end - m.start)) * 100));
      head = `<div class="title" style="color:${color}">${t(m.label).toUpperCase()}</div>
        <div class="tl"><i style="left:${pct(m.decisive)}%"></i><u style="left:${pct(now)}%"></u></div>`;
    }
    const score = partial ? `<div class="score">${t('Provvisorio')} <b>${partial.score}</b> ${'★'.repeat(starsFor(partial.score))}</div>` : '';
    this.panel.innerHTML = `${head}${rows}${score}<div class="zoom">zoom: ${t('tu')} x${mag(view.fov)} · ${t('ideale')} x${mag(ev.ideal.fov)}</div>`;
  }
}
