/**
 * MODALITÀ CARRIERA — soldi, iscritti al canale, offerte di lavoro, negozio dei potenziamenti.
 * Puro (niente DOM, niente CONFIG): lo stato vive in localStorage, config.ts applica i potenziamenti.
 *
 * Due modi di guadagnare:
 *  - Lavoro: un cliente ti paga per riprendere la sua partita. Paga base × qualità (stelle medie).
 *  - In proprio: nessuna paga, ma gli highlights finiscono su FrameTube. Più stelle = più visualizzazioni
 *    = più soldi e più iscritti, e più iscritti = più visualizzazioni la volta dopo.
 */
import type { SportId } from '../config';

export type CareerKind = 'job' | 'own';

export interface Offer { id: string; sport: SportId; client: string; pay: number }
export interface Video { label: string; sport: SportId; stars: number; views: number; money: number }
export interface CareerState {
  money: number;
  subs: number;
  views: number;
  matches: number;
  /** Livello di ogni potenziamento (0 = non comprato). */
  levels: Record<string, number>;
  offers: Offer[];
  /** Ultimi video pubblicati, il più recente per primo. */
  videos: Video[];
}

/** Partita di carriera in arrivo: scritta dal menu, letta al caricamento della pagina. */
export interface PendingMatch { kind: CareerKind; sport: SportId; offerId?: string }

// ==================================================================== numeri da regolare

export const ECONOMY = {
  startMoney: 300,
  /** Paga di un lavoro = base × (minPay + stelle medie × perStar). 3 stelle ≈ paga piena. */
  minPay: 0.25,
  perStar: 0.25,
  /** Paga base delle offerte: [min, max], cresce con gli iscritti (reputazione). */
  jobBase: [250, 450],
  jobPerSub: 0.4,
  /** In modalità assistita si guadagna meno. */
  assistedFactor: 0.7,
  /** Visualizzazioni di un video = (base + iscritti × perSub) × peso delle stelle × caso. */
  viewsBase: 200,
  viewsPerSub: 2,
  starViews: { 3: 0.4, 4: 1, 5: 2.5 } as Record<number, number>,
  rareViews: 4,
  /** I momenti segreti (coppie, travestiti, capitomboli...) diventano virali. */
  viralViews: 6,
  /** Euro per visualizzazione, e nuovi iscritti per visualizzazione. */
  moneyPerView: 0.2,
  subsPerView: 0.02,
  /** Stelle minime perché una ripresa diventi un video. */
  minVideoStars: 3,
};

/** Potenziamenti. cost[i] = prezzo del livello i+1. needs = va comprato prima. sport = vale solo lì (o lo sblocca). */
export interface ShopItem { id: string; name: string; desc: string; cost: number[]; needs?: string; sport?: SportId }
export const SHOP: ShopItem[] = [
  { id: 'pass-basket', name: 'Accredito Basket', desc: 'Lavori e partite in proprio nel basket.', cost: [1000], sport: 'basket' },
  { id: 'pass-tennis', name: 'Accredito Tennis', desc: 'Lavori e partite in proprio nel tennis.', cost: [1500], sport: 'tennis' },
  { id: 'pass-pallavolo', name: 'Accredito Pallavolo', desc: 'Lavori e partite in proprio nella pallavolo.', cost: [1500], sport: 'pallavolo' },
  { id: 'pass-boxe', name: 'Accredito Boxe', desc: 'Lavori e partite in proprio nella boxe.', cost: [2500], sport: 'boxe' },
  { id: 'mic', name: 'Microfono direzionale', desc: 'Senti il campo: indizi del regista più frequenti e precisi.', cost: [800, 2000, 4000] },
  { id: 'track', name: 'Testa motorizzata', desc: 'Quando non tocchi lo schermo, la camera segue da sola la palla.', cost: [1200, 3000, 6000] },
  { id: 'lens', name: 'Obiettivo zoom', desc: 'Zoom più potente e più veloce.', cost: [1000, 2500] },
  { id: 'steady', name: 'Stabilizzatore', desc: 'Niente tremolio e movimenti più fluidi nel voto.', cost: [700, 1800] },
  { id: 'drone', name: 'Drone', desc: 'Vola sopra l’azione quando vuoi. Ha una batteria a partita.', cost: [5000] },
  { id: 'battery', name: 'Batteria drone', desc: '+15 secondi di volo a partita per livello.', cost: [1500, 3000, 6000, 10000], needs: 'drone' },
  { id: 'gear-calcio', name: 'Grandangolo da stadio', desc: 'Calcio: inquadratura più larga per i lanci lunghi.', cost: [1200], sport: 'calcio' },
  { id: 'gear-basket', name: 'Zoom rapido da parquet', desc: 'Basket: zoom ancora più rapido per i cambi di gioco.', cost: [1200], sport: 'basket' },
  { id: 'gear-tennis', name: 'Testa veloce', desc: 'Tennis: la camera gira più in fretta da un lato all’altro.', cost: [1200], sport: 'tennis' },
  { id: 'gear-pallavolo', name: 'Cavalletto alto', desc: 'Pallavolo: camera più in alto, vedi oltre la rete.', cost: [1200], sport: 'pallavolo' },
  { id: 'gear-boxe', name: 'Postazione a bordo ring', desc: 'Boxe: camera più vicina al ring.', cost: [1200], sport: 'boxe' },
];

const CLIENTS = ['Polisportiva Aurora', 'Canale 7 Locale', 'Torneo dei Quartieri', 'Circolo Sportivo Riviera',
  'TeleValle', 'Lega Amatori', 'Sport Week TV', 'Accademia Giovani'];
const SPORTS: SportId[] = ['calcio', 'basket', 'tennis', 'pallavolo', 'boxe'];

// ==================================================================== stato

/** ?test nell'indirizzo: negozio tutto al massimo, soldi infiniti, salvataggio separato da quello vero. */
export const TEST = new URLSearchParams(globalThis.location?.search ?? '').has('test');
const KEY = TEST ? 'frameit.career.test' : 'frameit.career';
const PENDING = 'frameit.career.pending';
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function fresh(): CareerState {
  const s: CareerState = { money: ECONOMY.startMoney, subs: 0, views: 0, matches: 0, levels: {}, offers: [], videos: [] };
  s.offers = makeOffers(s);
  return s;
}

export function loadCareer(): CareerState {
  if (TEST) {
    const s = fresh();
    s.money = 999999;
    for (const i of SHOP) s.levels[i.id] = i.cost.length;
    s.offers = makeOffers(s);
    return s;
  }
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch { /* niente salvataggi o dati rovinati: si riparte */ }
  return fresh();
}

export function saveCareer(s: CareerState) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(s)); } catch { /* navigazione privata */ }
}

export function setPending(p: PendingMatch | null) {
  try {
    if (p) globalThis.localStorage?.setItem(PENDING, JSON.stringify(p));
    else globalThis.localStorage?.removeItem(PENDING);
  } catch { /* idem */ }
}

export function readPending(): PendingMatch | null {
  try { return JSON.parse(globalThis.localStorage?.getItem(PENDING) ?? 'null'); } catch { return null; }
}

export const level = (s: CareerState, id: string) => s.levels[id] ?? 0;
export const unlocked = (s: CareerState, sport: SportId) => sport === 'calcio' || level(s, `pass-${sport}`) > 0;

// ==================================================================== negozio

export type BuyCheck = 'ok' | 'max' | 'money' | 'needs';
export function canBuy(s: CareerState, item: ShopItem): BuyCheck {
  const lv = level(s, item.id);
  if (lv >= item.cost.length) return 'max';
  if (item.needs && !level(s, item.needs)) return 'needs';
  if (item.id.startsWith('gear-') && item.sport && !unlocked(s, item.sport)) return 'needs';
  return s.money >= item.cost[lv] ? 'ok' : 'money';
}

export function buy(s: CareerState, id: string): boolean {
  const item = SHOP.find((i) => i.id === id);
  if (!item || canBuy(s, item) !== 'ok') return false;
  s.money -= item.cost[level(s, id)];
  s.levels[id] = level(s, id) + 1;
  if (id.startsWith('pass-')) s.offers = makeOffers(s); // nuovo sport, nuove offerte
  return true;
}

// ==================================================================== offerte e paghe

export function makeOffers(s: CareerState): Offer[] {
  const open = SPORTS.filter((sp) => unlocked(s, sp));
  return Array.from({ length: 3 }, (_, i) => {
    const sport = open[Math.floor(Math.random() * open.length)];
    const [lo, hi] = ECONOMY.jobBase;
    const pay = Math.round((rand(lo, hi) + s.subs * ECONOMY.jobPerSub) / 10) * 10;
    return { id: `${Date.now().toString(36)}-${i}`, sport, client: CLIENTS[Math.floor(Math.random() * CLIENTS.length)], pay };
  });
}

/** Una ripresa della partita (azione, distrazione, ordine, evento raro) con le sue stelle. */
export interface Shot { label: string; stars: number; rare: boolean; viral?: boolean }

export interface Report { kind: CareerKind; earned: number; videos: Video[]; newSubs: number }

/** Fine partita: paga o pubblica, aggiorna lo stato (salvarlo tocca a chi chiama). */
export function settle(s: CareerState, p: PendingMatch, shots: Shot[], avgStars: number, assisted: boolean): Report {
  const factor = assisted ? ECONOMY.assistedFactor : 1;
  let earned = 0, newSubs = 0;
  const videos: Video[] = [];
  if (p.kind === 'job') {
    const offer = s.offers.find((o) => o.id === p.offerId);
    const base = offer?.pay ?? ECONOMY.jobBase[0];
    earned = Math.round(base * (ECONOMY.minPay + avgStars * ECONOMY.perStar) * factor);
  } else {
    for (const shot of shots) {
      if (shot.stars < ECONOMY.minVideoStars) continue;
      const weight = (ECONOMY.starViews[shot.stars] ?? 1) * (shot.rare ? ECONOMY.rareViews : shot.viral ? ECONOMY.viralViews : 1);
      const views = Math.round((ECONOMY.viewsBase + s.subs * ECONOMY.viewsPerSub) * weight * rand(0.7, 1.3) * factor);
      const money = Math.round(views * ECONOMY.moneyPerView);
      videos.push({ label: shot.label, sport: p.sport, stars: shot.stars, views, money });
      earned += money;
      newSubs += Math.round(views * ECONOMY.subsPerView);
      s.views += views;
    }
    s.videos = [...videos, ...s.videos].slice(0, 30);
  }
  s.money += earned;
  s.subs += newSubs;
  s.matches++;
  s.offers = makeOffers(s);
  return { kind: p.kind, earned, videos, newSubs };
}

// ==================================================================== effetto dei potenziamenti

type Bag = Record<string, unknown> & Record<string, number>;
/** Applica i potenziamenti comprati ai numeri di gioco (solo nelle partite di carriera). */
export function applyUpgrades(cfg: { camera: Bag; voice: Bag; scoring: Bag }, s: CareerState, sport: SportId) {
  const c = cfg.camera, v = cfg.voice;
  const mic = level(s, 'mic');
  v.hintChance = Math.min(1, v.hintChance + mic * 0.09);
  v.hintAccuracy = Math.min(1, v.hintAccuracy + mic * 0.05);
  c.autoTrack = [0, 0.6, 1.2, 2][level(s, 'track')];
  const lens = level(s, 'lens');
  c.fovMin = c.fovMin - lens;
  c.buttonZoomSpeed = c.buttonZoomSpeed + lens * 0.3;
  const steady = level(s, 'steady');
  c.shakeAmplitude = c.shakeAmplitude * (1 - steady / 2);
  cfg.scoring.smoothAccelRef = cfg.scoring.smoothAccelRef * (1 + steady * 0.25);
  c.droneBattery = level(s, 'drone') ? 20 + level(s, 'battery') * 15 : 0;
  if (!level(s, `gear-${sport}`)) return;
  const pos = c.position as unknown as { x: number; y: number; z: number };
  if (sport === 'calcio') c.fovMax += 8;
  if (sport === 'basket') c.buttonZoomSpeed += 0.6;
  if (sport === 'tennis') { c.maxFlickSpeed += 80; c.dragSensitivity += 0.2; }
  if (sport === 'pallavolo') c.position = { ...pos, y: pos.y + 1.5 } as never;
  if (sport === 'boxe') c.position = { ...pos, z: pos.z - 1.2 } as never;
}
