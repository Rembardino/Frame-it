/**
 * SCORING MODULE — il voto di un'inquadratura.
 *
 * Puro e testabile: niente DOM, niente Three.js. Riceve i punti chiave 3D dei soggetti e lo stato
 * della camera, restituisce le 5 componenti, il voto 0-100, le stelle e le motivazioni.
 *
 *  - evaluateFrame(): valuta UN frame (usato dal debug in tempo reale e dal tracker dei momenti).
 *  - scoreMoment():   voto finale di un momento a partire dai frame raccolti.
 *
 * Il voto misura la distanza dall'"inquadratura ideale" calcolata dal gioco (idealView), non la centratura.
 * Angoli in gradi. Coordinate schermo in NDC: x,y in [-1, 1], centro = 0, y in alto.
 */
import { CONFIG } from '../config';

export type Vec3 = { x: number; y: number; z: number };
/** area = angoli di una zona (es. un settore di tribuna). */
export type KeypointKind = 'head' | 'body' | 'feet' | 'hands' | 'ball' | 'goal' | 'area';
export type ShotSize = 'wide' | 'medium' | 'close';
export type Component = 'coverage' | 'size' | 'composition' | 'smoothness' | 'timing';
export const COMPONENTS: Component[] = ['coverage', 'size', 'composition', 'smoothness', 'timing'];
export const COMPONENT_LABEL: Record<Component, string> = {
  coverage: 'Copertura',
  size: 'Taglia',
  composition: 'Composizione',
  smoothness: 'Fluidità',
  timing: 'Tempismo',
};

/** Stato della camera (senza la micro-oscillazione a spalla). fov = FOV verticale. */
export interface View { pos: Vec3; yaw: number; pitch: number; fov: number; aspect: number }

export interface Keypoint { p: Vec3; kind: KeypointKind }

/** Un soggetto in un certo istante: i suoi punti chiave e quanto conta in questo momento. */
export interface SubjectFrame {
  label: string;
  kind: 'player' | 'ball' | 'goal' | 'area';
  weight: number;
  points: Keypoint[];
  vel: Vec3;
}

export interface FrameInput {
  subjects: SubjectFrame[];
  /** Indice del soggetto principale (taglia e composizione si misurano su di lui). */
  lead: number;
  size: ShotSize;
}

export interface ProjectedPoint { x: number; y: number; behind: boolean; inside: number; kind: KeypointKind }

export interface FrameEval {
  coverage: number;
  size: number;
  composition: number;
  ideal: View;
  /** ln(fov / fov ideale): > 0 troppo largo, < 0 troppo stretto. */
  zoomRatio: number;
  /** Frazione (pesata) di punti fuori inquadratura, per tipo. */
  cut: Record<KeypointKind, number>;
  /** Copertura di ciascun soggetto (per le motivazioni). */
  subjects: { label: string; kind: SubjectFrame['kind']; coverage: number }[];
  /** Il soggetto è sul lato verso cui corre (manca spazio davanti). */
  leadRoomBad: boolean;
  /** Dove sta il soggetto principale e dove dovrebbe stare (NDC). */
  leadActual: { x: number; y: number } | null;
  leadTarget: { x: number; y: number };
  points: ProjectedPoint[];
}

export interface MomentSample { t: number; view: View; ev: FrameEval }

export interface Reason { text: string; good: boolean }

export interface ScoreResult {
  score: number;
  stars: number;
  /** 0..100 per ciascuna voce (anche quelle non attive, per il debug). */
  components: Record<Component, number>;
  enabled: Component[];
  reasons: Reason[];
  decisiveMissed: boolean;
}

const DEG = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const cfg = () => CONFIG.scoring;
const KINDS: KeypointKind[] = ['head', 'body', 'feet', 'hands', 'ball', 'goal', 'area'];

// ------------------------------------------------------------------ geometria

/** Proietta un punto 3D sullo schermo della camera (stessa convenzione della camera Three.js, ordine YXZ). */
export function project(v: View, p: Vec3): { x: number; y: number; behind: boolean } {
  const cy = Math.cos(v.yaw * DEG), sy = Math.sin(v.yaw * DEG);
  const cp = Math.cos(v.pitch * DEG), sp = Math.sin(v.pitch * DEG);
  const dx = p.x - v.pos.x, dy = p.y - v.pos.y, dz = p.z - v.pos.z;
  const depth = dx * sy * cp + dy * sp - dz * cy * cp; // lungo l'asse ottico
  if (depth <= 1e-3) return { x: 0, y: 0, behind: true };
  const right = dx * cy + dz * sy;
  const up = -dx * sy * sp + dy * cp + dz * sp * cy;
  const tv = Math.tan((v.fov / 2) * DEG);
  return { x: right / (depth * tv * v.aspect), y: up / (depth * tv), behind: false };
}

/** Inverso di project(): il punto 3D a distanza dist lungo il raggio che passa per (x, y) dello schermo. */
export function unproject(v: View, x: number, y: number, dist: number): Vec3 {
  const cy = Math.cos(v.yaw * DEG), sy = Math.sin(v.yaw * DEG);
  const cp = Math.cos(v.pitch * DEG), sp = Math.sin(v.pitch * DEG);
  const tv = Math.tan((v.fov / 2) * DEG);
  const a = x * tv * v.aspect, b = y * tv;
  // avanti + a·destra + b·su
  const d = { x: sy * cp + a * cy - b * sy * sp, y: sp + b * cp, z: -cy * cp + a * sy + b * sp * cy };
  const n = Math.hypot(d.x, d.y, d.z);
  return { x: v.pos.x + (d.x / n) * dist, y: v.pos.y + (d.y / n) * dist, z: v.pos.z + (d.z / n) * dist };
}

/** Direzione (yaw, pitch) di un punto visto dalla camera. */
function angles(from: Vec3, p: Vec3) {
  const dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z;
  return { yaw: Math.atan2(dx, -dz) / DEG, pitch: Math.atan2(dy, Math.hypot(dx, dz)) / DEG };
}

/** Mezzo FOV orizzontale dato il FOV verticale, e viceversa. */
const halfH = (fov: number, aspect: number) => Math.atan(Math.tan((fov / 2) * DEG) * aspect) / DEG;
const fovFromHalfH = (h: number, aspect: number) => (2 * Math.atan(Math.tan(h * DEG) / aspect)) / DEG;

/** 1 = dentro l'inquadratura (con margine), sfuma a 0 appena fuori dal bordo. */
function insideValue(x: number, y: number) {
  const lim = 1 - cfg().edgeMargin;
  const out = Math.max(Math.abs(x) - lim, Math.abs(y) - lim, 0);
  return Math.max(0, 1 - out / cfg().edgeSoftness);
}

/** Punti che contano per la forma del soggetto (le mani no). */
const shapePoints = (s: SubjectFrame) => s.points.filter((k) => k.kind !== 'hands');

function centroid(s: SubjectFrame): Vec3 {
  const pts = shapePoints(s);
  const c = { x: 0, y: 0, z: 0 };
  for (const k of pts) { c.x += k.p.x; c.y += k.p.y; c.z += k.p.z; }
  return { x: c.x / pts.length, y: c.y / pts.length, z: c.z / pts.length };
}

/**
 * L'inquadratura ideale: contiene tutti i soggetti essenziali con un margine, ha la taglia giusta
 * per il soggetto principale e lascia spazio davanti a chi corre.
 */
export function idealView(pos: Vec3, aspect: number, input: FrameInput): { view: View; dir: number } {
  const c = cfg();
  const S = CONFIG.camera;
  const close = input.size === 'close';
  let minYaw = Infinity, maxYaw = -Infinity, minPitch = Infinity, maxPitch = -Infinity;
  for (const s of input.subjects) {
    for (const k of shapePoints(s)) {
      if (close && k.kind === 'feet') continue; // nel primo piano i piedi possono uscire
      const a = angles(pos, k.p);
      minYaw = Math.min(minYaw, a.yaw); maxYaw = Math.max(maxYaw, a.yaw);
      minPitch = Math.min(minPitch, a.pitch); maxPitch = Math.max(maxPitch, a.pitch);
    }
  }
  const m = c.framingMargin;
  const lead = input.subjects[input.lead];
  const leadAng = shapePoints(lead).map((k) => angles(pos, k.p));
  const leadTop = Math.max(...leadAng.map((a) => a.pitch));
  // Dimensione del soggetto: la maggiore tra altezza e larghezza (uno sdraiato è largo, non alto).
  const leadHeight = Math.max(
    leadTop - Math.min(...leadAng.map((a) => a.pitch)),
    Math.max(...leadAng.map((a) => a.yaw)) - Math.min(...leadAng.map((a) => a.yaw)),
  );

  // Zoom: abbastanza largo per contenere tutto, e con il soggetto principale della taglia giusta.
  const fovContainV = (maxPitch - minPitch) / (1 - 2 * m);
  const fovContainH = fovFromHalfH((maxYaw - minYaw) / 2 / (1 - 2 * m), aspect);
  const fovSize = leadHeight / c.sizeTargets[input.size];
  const fov = clamp(Math.max(fovContainV, fovContainH, fovSize), S.fovMin, S.fovMax);
  const hHalf = halfH(fov, aspect);
  const vHalf = fov / 2;

  // Spazio davanti: chi corre lateralmente va sul terzo opposto alla direzione di corsa.
  const lc = centroid(lead);
  const la = angles(pos, lc);
  const rightX = Math.cos(la.yaw * DEG), rightZ = Math.sin(la.yaw * DEG);
  const lateral = lead.vel.x * rightX + lead.vel.z * rightZ;
  const dir = Math.abs(lateral) > c.leadRoomMinSpeed ? Math.sign(lateral) : 0;
  let yaw = la.yaw + dir * Math.atan(c.leadRoom * Math.tan(hHalf * DEG)) / DEG;
  const loY = maxYaw - hHalf * (1 - m), hiY = minYaw + hHalf * (1 - m);
  yaw = loY <= hiY ? clamp(yaw, loY, hiY) : (minYaw + maxYaw) / 2;

  // Verticale: nel primo piano la testa sul terzo alto, altrimenti soggetti centrati.
  let pitch = close ? leadTop - Math.atan(c.leadRoom * Math.tan(vHalf * DEG)) / DEG : (minPitch + maxPitch) / 2;
  const loP = maxPitch - vHalf * (1 - m), hiP = minPitch + vHalf * (1 - m);
  pitch = loP <= hiP ? clamp(pitch, loP, hiP) : (minPitch + maxPitch) / 2;

  return { view: { pos, yaw, pitch, fov, aspect }, dir };
}

// ------------------------------------------------------------------ un frame

export function evaluateFrame(view: View, input: FrameInput): FrameEval {
  const c = cfg();
  const kw: Record<KeypointKind, number> = { ...c.keypoints };
  if (input.size === 'close') kw.feet = c.feetInCloseUp;

  const cutOut = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<KeypointKind, number>;
  const cutTot = { ...cutOut };
  const points: ProjectedPoint[] = [];
  const subjects: FrameEval['subjects'] = [];
  let covSum = 0, wSum = 0;

  // Copertura: ogni punto fuori inquadratura toglie in base al suo peso.
  for (const s of input.subjects) {
    let sc = 0, sw = 0;
    for (const k of s.points) {
      const pr = project(view, k.p);
      const inside = pr.behind ? 0 : insideValue(pr.x, pr.y);
      const w = kw[k.kind];
      sc += inside * w;
      sw += w;
      cutOut[k.kind] += (1 - inside) * w * s.weight;
      cutTot[k.kind] += w * s.weight;
      points.push({ ...pr, inside, kind: k.kind });
    }
    const cov = sw > 0 ? sc / sw : 1;
    subjects.push({ label: s.label, kind: s.kind, coverage: cov });
    covSum += cov * s.weight;
    wSum += s.weight;
  }
  const cut = Object.fromEntries(KINDS.map((k) => [k, cutTot[k] > 0 ? cutOut[k] / cutTot[k] : 0])) as Record<KeypointKind, number>;

  const coverage = wSum > 0 ? covSum / wSum : 0;

  // Taglia: distanza (logaritmica) dallo zoom ideale. Conta solo per ciò che stai davvero inquadrando.
  const { view: ideal, dir } = idealView(view.pos, view.aspect, input);
  const zoomRatio = Math.log(view.fov / ideal.fov);
  const size = (1 - clamp(Math.abs(zoomRatio) / Math.log(c.sizeTolerance), 0, 1)) * coverage;

  // Composizione: il soggetto principale sta dove lo mette l'inquadratura ideale?
  const lp = centroid(input.subjects[input.lead]);
  const target = project(ideal, lp);
  const actual = project(view, lp);
  let composition = 0;
  let leadRoomBad = false;
  let leadActual: FrameEval['leadActual'] = null;
  if (!actual.behind) {
    leadActual = { x: actual.x, y: actual.y };
    if (insideValue(actual.x, actual.y) > 0.5) {
      const err = Math.hypot(actual.x - target.x, (actual.y - target.y) * 0.7);
      composition = 1 - clamp((err - 0.1) / 0.5, 0, 1);
      leadRoomBad = dir !== 0 && (actual.x - target.x) * dir > 0.25;
    }
  }

  return {
    coverage,
    size,
    composition,
    ideal,
    zoomRatio,
    cut,
    subjects,
    leadRoomBad,
    leadActual,
    leadTarget: { x: target.x, y: target.y },
    points,
  };
}

// ------------------------------------------------------------------ un momento

export const starsFor = (score: number) => 1 + cfg().stars.filter((s) => score >= s).length;
const fmtSec = (s: number) => s.toFixed(1).replace('.', ',');

/**
 * Voto finale di un momento. L'istante decisivo (± decisiveWindow) pesa decisiveWeight volte;
 * se manca del tutto, il voto è limitato a 2 stelle. I soggetti possono cambiare tra le fasi:
 * vengono aggregati per nome.
 */
export function scoreMoment(samples: MomentSample[], decisiveT: number, enabled: Component[]): ScoreResult {
  const c = cfg();
  const empty = Object.fromEntries(COMPONENTS.map((k) => [k, 0])) as Record<Component, number>;
  if (samples.length < 2) {
    return { score: 0, stars: 1, components: empty, enabled, reasons: [{ text: 'Momento non ripreso', good: false }], decisiveMissed: true };
  }

  // Medie pesate di copertura, taglia, composizione.
  let W = 0, cov = 0, size = 0, comp = 0, zoom = 0, leadBad = 0, dCov = 0, dN = 0;
  const cut = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<KeypointKind, number>;
  const subj = new Map<string, { kind: SubjectFrame['kind']; sum: number; w: number }>();
  for (const s of samples) {
    const decisive = Math.abs(s.t - decisiveT) <= c.decisiveWindow;
    const w = decisive ? c.decisiveWeight : 1;
    W += w;
    cov += s.ev.coverage * w;
    size += s.ev.size * w;
    comp += s.ev.composition * w;
    zoom += s.ev.zoomRatio * w;
    leadBad += (s.ev.leadRoomBad ? 1 : 0) * w;
    for (const k of KINDS) cut[k] += s.ev.cut[k] * w;
    for (const x of s.ev.subjects) {
      const e = subj.get(x.label) ?? { kind: x.kind, sum: 0, w: 0 };
      e.sum += x.coverage * w;
      e.w += w;
      subj.set(x.label, e);
    }
    if (decisive) { dCov += s.ev.coverage; dN++; }
  }
  cov /= W; size /= W; comp /= W; zoom /= W; leadBad /= W;
  for (const k of KINDS) cut[k] /= W;

  // Fluidità: accelerazione media della camera, misurata a passi di 0,1 s (filtra il tremolio del dito).
  let accSum = 0, prevV: number[] | null = null, last = samples[0];
  for (const s of samples) {
    const dt = s.t - last.t;
    if (dt < 0.1) continue;
    const fov = (s.view.fov + last.view.fov) / 2;
    const v = [
      (s.view.yaw - last.view.yaw) / dt / fov,
      (s.view.pitch - last.view.pitch) / dt / fov,
      (Math.log(s.view.fov / last.view.fov) / dt) * 0.5,
    ];
    if (prevV) accSum += Math.hypot(v[0] - prevV[0], v[1] - prevV[1], v[2] - prevV[2]);
    prevV = v;
    last = s;
  }
  const span = samples[samples.length - 1].t - samples[0].t;
  // Una camera ferma sul nulla non è "fluida": la voce vale in proporzione a quanto hai inquadrato.
  const smooth = (1 - clamp(accSum / Math.max(span, 0.5) / c.smoothAccelRef, 0, 1)) * cov;

  // Tempismo: da quanto eri già sul posto all'istante decisivo, o quanto sei arrivato tardi.
  const onTarget = samples.map((s) => s.ev.coverage >= c.onTargetCoverage);
  let iD = 0;
  samples.forEach((s, i) => { if (Math.abs(s.t - decisiveT) < Math.abs(samples[iD].t - decisiveT)) iD = i; });
  let timing = 0, lead = -1, late = -1;
  if (onTarget[iD]) {
    let i = iD;
    while (i > 0 && onTarget[i - 1]) i--;
    lead = decisiveT - samples[i].t;
    timing = 0.6 + 0.4 * clamp(lead / c.anticipationGood, 0, 1);
  } else {
    const j = onTarget.findIndex((on, i) => on && i > iD);
    if (j >= 0) {
      late = samples[j].t - decisiveT;
      timing = 0.5 * (1 - clamp(late / c.maxLate, 0, 1));
    }
  }

  const components: Record<Component, number> = {
    coverage: cov * 100,
    size: size * 100,
    composition: comp * 100,
    smoothness: smooth * 100,
    timing: timing * 100,
  };
  let wTot = 0, total = 0;
  for (const k of enabled) { wTot += c.weights[k]; total += c.weights[k] * components[k]; }
  let score = wTot > 0 ? total / wTot : 0;
  const decisiveMissed = dN === 0 || dCov / dN < c.decisiveMissCoverage;
  if (decisiveMissed) score = Math.min(score, c.stars[2] - 1); // massimo 2 stelle
  score = Math.round(score);

  // Motivazioni: le perdite più grosse (solo voci attive), poi i punti di forza.
  const on = (k: Component) => enabled.includes(k);
  const bad: { text: string; loss: number }[] = [];
  const good: string[] = [];
  const lossOf = (k: Component, v: number) => c.weights[k] * (1 - v) * 100;
  if (decisiveMissed) bad.push({ text: 'Momento decisivo mancato (max 2 stelle)', loss: 1000 });
  if (on('coverage')) {
    for (const [label, e] of subj) {
      const v = e.sum / e.w;
      if ((e.kind === 'player' || e.kind === 'area') && v < 0.4) bad.push({ text: `${label} fuori inquadratura`, loss: lossOf('coverage', v) });
    }
    if (cut.ball > 0.25) bad.push({ text: 'Palla tagliata', loss: lossOf('coverage', 1 - cut.ball) });
    if (cut.head > 0.25) bad.push({ text: 'Testa tagliata', loss: lossOf('coverage', 1 - cut.head) * 0.9 });
    if (cut.goal > 0.35) bad.push({ text: `${CONFIG.pitch.goalName} fuori inquadratura`, loss: lossOf('coverage', 1 - cut.goal) * 0.8 });
    if (cut.feet > 0.35) bad.push({ text: 'Piedi tagliati', loss: lossOf('coverage', 1 - cut.feet) * 0.5 });
  }
  if (on('size') && Math.abs(zoom) > Math.log(1.4)) {
    bad.push({ text: zoom > 0 ? 'Troppo lontano' : 'Troppo vicino', loss: lossOf('size', size) });
  }
  if (on('composition') && comp < 0.6) {
    bad.push({ text: leadBad > 0.4 ? 'Lascia spazio nella direzione della corsa' : 'Posiziona meglio il soggetto principale', loss: lossOf('composition', comp) });
  }
  if (on('smoothness')) {
    if (smooth < 0.6) bad.push({ text: 'Movimenti bruschi', loss: lossOf('smoothness', smooth) });
    else if (smooth > 0.92) good.push('Camera fluida');
  }
  if (on('timing')) {
    // Se il ritardo ti ha fatto perdere il momento decisivo, è LA causa: va subito dopo.
    if (late >= 0) bad.push({ text: `In ritardo di ${fmtSec(late)} s`, loss: decisiveMissed ? 500 : lossOf('timing', timing) });
    else if (lead < 0 && !decisiveMissed) bad.push({ text: 'Inquadratura mai completa', loss: lossOf('timing', 0) });
    else if (lead >= c.anticipationGood) good.push('Ottima anticipazione');
  }
  if (score >= c.stars[0]) good.unshift('Inquadratura da manuale');

  bad.sort((a, b) => b.loss - a.loss);
  const reasons: Reason[] = bad.slice(0, 2).map((b) => ({ text: b.text, good: false }));
  for (const g of good) if (reasons.length < 3) reasons.push({ text: g, good: true });
  if (reasons.length < 3 && bad.length > 2) reasons.push({ text: bad[2].text, good: false });

  return { score, stars: starsFor(score), components, enabled, reasons, decisiveMissed };
}
