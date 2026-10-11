/**
 * Modalità assistita: mostra l'inquadratura perfetta del momento in corso (angoli tratteggiati).
 * Diventa verde quando ci sei sopra. In modalità esperto non si vede nulla.
 */
import { project, unproject, type View } from '../scoring/scoring';
import type { MomentTracker } from '../scoring/moment';
import { t } from '../i18n';

export class AssistFrame {
  private canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;

  constructor() {
    this.canvas.className = 'assist-canvas';
    document.body.append(this.canvas);
  }

  draw(view: View, tracker: MomentTracker | null) {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio, 2);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const ev = tracker?.last;
    if (!ev) return;
    // I 4 angoli dell'inquadratura ideale, proiettati nello schermo del giocatore.
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => project(view, unproject(ev.ideal, x, y, 40)));
    if (c.some((p) => p.behind)) return;
    const pts = c.map((p) => [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h]);
    const good = ev.coverage > 0.9 && ev.size > 0.7 && ev.composition > 0.7;
    g.strokeStyle = good ? '#3ddc84' : '#ffffff';
    g.globalAlpha = good ? 0.9 : 0.7;
    g.lineWidth = 3;
    // Solo gli angoli, come un mirino: si vede la partita sotto.
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const [x, y] = pts[i], prev = pts[(i + 3) % 4], next = pts[(i + 1) % 4];
      g.moveTo(x + (prev[0] - x) * 0.18, y + (prev[1] - y) * 0.18);
      g.lineTo(x, y);
      g.lineTo(x + (next[0] - x) * 0.18, y + (next[1] - y) * 0.18);
    }
    g.stroke();
    g.fillStyle = g.strokeStyle;
    g.font = 'bold 12px system-ui, sans-serif';
    g.fillText(t('IDEALE'), pts[3][0] + 6, pts[3][1] + 16);
    g.globalAlpha = 1;
  }

  clear() {
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
