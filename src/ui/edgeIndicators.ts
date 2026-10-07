/**
 * Indicatori ai bordi dello schermo: un alone discreto con una freccetta dalla parte in cui
 * sta succedendo qualcosa di importante fuori inquadratura. Intensità = importanza dell'evento,
 * che cresce avvicinandosi all'istante decisivo.
 */
import { CONFIG } from '../config';
import type { Indicator } from '../events/director';
import { project, type View } from '../scoring/scoring';

const DEG = Math.PI / 180;
const COLOR: Record<Indicator['category'], string> = {
  main: '255,214,64',
  distraction: '255,140,60',
  rare: '235,110,255',
  order: '79,209,255',
};

export class EdgeIndicators {
  private canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;

  constructor() {
    this.canvas.className = 'edge-canvas';
    document.getElementById('hud')!.before(this.canvas);
  }

  draw(view: View, list: Indicator[]) {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const { maxAlpha, radius } = CONFIG.indicators;

    for (const ind of list) {
      if (ind.intensity <= 0.01) continue;
      const pr = project(view, ind.p);
      if (!pr.behind && Math.abs(pr.x) <= 1 && Math.abs(pr.y) <= 1) continue; // già in quadro

      // Direzione verso il punto in "inquadrature": funziona anche se è alle spalle.
      const dx = p2yaw(view, ind.p) / (Math.atan(Math.tan((view.fov / 2) * DEG) * view.aspect) / DEG);
      const dy = p2pitch(view, ind.p) / (view.fov / 2);
      const k = 1 / Math.max(Math.abs(dx), Math.abs(dy), 1e-6);
      const ex = dx * k, ey = dy * k; // sul bordo, in NDC
      const x = ((ex * 0.985 + 1) / 2) * w;
      const y = ((1 - ey * 0.97) / 2) * h;

      const a = maxAlpha * Math.min(1, ind.intensity);
      const c = COLOR[ind.category];
      const grd = g.createRadialGradient(x, y, 0, x, y, radius);
      grd.addColorStop(0, `rgba(${c},${a})`);
      grd.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = grd;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);

      // Freccetta che punta verso l'esterno.
      const ang = Math.atan2(-ey, ex);
      g.save();
      g.translate(x - Math.cos(ang) * 16, y - Math.sin(ang) * 16);
      g.rotate(ang);
      g.fillStyle = `rgba(255,255,255,${Math.min(1, a * 1.6)})`;
      g.beginPath();
      g.moveTo(9, 0);
      g.lineTo(-5, -7);
      g.lineTo(-5, 7);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
}

/** Di quanti gradi bisogna girare a destra (+) per avere il punto al centro. */
function p2yaw(v: View, p: { x: number; z: number }) {
  const yaw = Math.atan2(p.x - v.pos.x, -(p.z - v.pos.z)) / DEG;
  return ((yaw - v.yaw + 540) % 360) - 180;
}

function p2pitch(v: View, p: { x: number; y: number; z: number }) {
  return Math.atan2(p.y - v.pos.y, Math.hypot(p.x - v.pos.x, p.z - v.pos.z)) / DEG - v.pitch;
}
