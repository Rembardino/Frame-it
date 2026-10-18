/**
 * MODALITÀ CARRIERA — soldi, iscritti al canale, offerte di lavoro, negozio dei potenziamenti.
 * Puro (niente DOM, niente CONFIG): lo stato vive in localStorage, config.ts applica i potenziamenti.
 *
 * Il modello, tutto lineare (raddoppi una cosa, raddoppia il risultato):
 *  - Lavoro: paga = paga base dell'offerta × (minPay + (1 − minPay) × punteggio medio / fullPayScore).
 *  - Paga base dell'offerta = base × (1 + gradino del cliente × clientStep);
 *    ogni subsPerClient iscritti si sblocca un cliente più importante (fino all'ultimo della lista).
 *  - Video su FrameTube (fino a 3 a partita, lavoro o in proprio): visualizzazioni totali =
 *    (viewsBase + iscritti × viewsPerSub) × punteggio / scoreRef × raro/virale × in proprio × assistita.
 *    Arrivano a rate uguali nelle videoLife partite di carriera successive (la prima subito).
 *  - Ogni visualizzazione = moneyPerView €. Più iscritti = video e lavori migliori.
 *  - Nuovi iscritti di un video = fansPerVideo × la stessa qualità (punteggio, raro/virale...), ma NON dipendono
 *    dagli iscritti che hai già: così gli iscritti crescono in modo lineare e non esplodono (niente circolo
 *    iscritti → visualizzazioni → iscritti, che faceva miliardi in 30 partite).
 */
import type { SportId } from '../config';

export type CareerKind = 'job' | 'own';

export interface Offer { id: string; sport: SportId; client: string; pay: number }
export interface Video {
  clipId?: string;
  label: string; sport: SportId; stars: number; views: number; money: number;
  /** Visualizzazioni totali previste e partite passate dalla pubblicazione (i video vecchi non li hanno: non crescono). */
  potential?: number; age?: number;
  /** Nuovi iscritti che il video porta in tutta la sua vita. */
  fans?: number;
}
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
  /** Paga di un lavoro = base × (minPay + (1 − minPay) × punteggio medio / fullPayScore).
   *  Punteggio medio 50 (≈ 3 stelle) = paga piena, 0 = un quarto, 100 = 1,75 volte. */
  minPay: 0.25,
  fullPayScore: 50,
  /** Paga base delle offerte: [min, max], poi la moltiplica il gradino del cliente (vedi subsPerClient). */
  jobBase: [250, 450],
  /** In modalità assistita si guadagna meno. */
  assistedFactor: 0.7,
  /** Visualizzazioni totali di un video = (viewsBase + iscritti × viewsPerSub) × punteggio / scoreRef × moltiplicatori. */
  viewsBase: 200,
  viewsPerSub: 1,
  scoreRef: 50,
  /** Variazione casuale delle visualizzazioni (±10%): due video uguali non fanno mai numeri identici. */
  noise: 0.1,
  /** Partite di carriera in cui un video continua a crescere (a quote uguali, la prima subito). */
  videoLife: 5,
  rareViews: 4,
  /** I momenti segreti (coppie, travestiti, capitomboli...) diventano virali. */
  viralViews: 6,
  /** Euro per visualizzazione. Tarato con npm run sim:career: giocatore medio ~500 €/partita dopo 10 partite,
   *  negozio completo in ~30 partite per un giocatore bravo (0.2 dava 4 volte tanto e negozio pieno in 14). */
  moneyPerView: 0.03,
  /** Nuovi iscritti portati da un video di qualità 1 (ripresa normale, punteggio scoreRef) in tutta la sua vita. */
  fansPerVideo: 4,
  /** In proprio le visualizzazioni valgono di più: è il tuo canale, non il cliente. */
  ownViews: 1.5,
  /** Ogni N iscritti si fa avanti un cliente più importante, che paga clientStep in più per gradino. */
  subsPerClient: 400,
  clientStep: 0.2,
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

/** Dal meno al più importante: i clienti in fondo arrivano solo con la fama (iscritti). */
const CLIENTS = ['Polisportiva Aurora', 'Accademia Giovani', 'Torneo dei Quartieri', 'Lega Amatori',
  'Circolo Sportivo Riviera', 'Canale 7 Locale', 'TeleValle', 'Sport Week TV',
  'Campionato Regionale', 'Rete Sport Nazionale', 'Coppa Internazionale', 'Finale Europea Live'];
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
    // I 4 clienti più importanti raggiungibili con gli iscritti attuali.
    const top = Math.min(CLIENTS.length, 4 + Math.floor(s.subs / ECONOMY.subsPerClient));
    const tier = Math.max(0, top - 1 - Math.floor(Math.random() * 4));
    const pay = Math.round((rand(lo, hi) * (1 + tier * ECONOMY.clientStep)) / 10) * 10;
    return { id: `${Date.now().toString(36)}-${i}`, sport, client: CLIENTS[tier], pay };
  });
}

/** Una ripresa della partita (azione, distrazione, ordine, evento raro) con stelle e punteggio 0..100. */
export interface Shot { label: string; stars: number; score: number; rare: boolean; viral?: boolean; clipId?: string }

export interface Report {
  kind: CareerKind;
  /** Paga del cliente (0 in proprio). */
  pay: number;
  /** Entrate dal canale in questa partita: video nuovi e vecchi ancora in crescita. */
  channelMoney: number;
  channelViews: number;
  earned: number;
  /** Video pubblicati in questa partita. */
  videos: Video[];
  newSubs: number;
}

/** Qualità di un video: 1 = ripresa normale con punteggio scoreRef. Lineare nel punteggio. */
function videoQuality(shot: Shot, kind: CareerKind, assisted: boolean) {
  const special = shot.rare ? ECONOMY.rareViews : shot.viral ? ECONOMY.viralViews : 1;
  return (shot.score / ECONOMY.scoreRef) * special * (kind === 'own' ? ECONOMY.ownViews : 1) * (assisted ? ECONOMY.assistedFactor : 1);
}

/** Visualizzazioni totali che un video farà nella sua vita. */
export function videoPotential(subs: number, shot: Shot, kind: CareerKind, assisted: boolean, luck = 1) {
  return Math.round((ECONOMY.viewsBase + subs * ECONOMY.viewsPerSub) * videoQuality(shot, kind, assisted) * luck);
}

/** Nuovi iscritti che un video porterà: dipendono solo dalla qualità, non dagli iscritti che hai già. */
export function videoFans(shot: Shot, kind: CareerKind, assisted: boolean, luck = 1) {
  return Math.round(ECONOMY.fansPerVideo * videoQuality(shot, kind, assisted) * luck);
}

/** Una partita in più: il video prende la sua quota di visualizzazioni e iscritti (l'ultima chiude il conto esatto). */
function grow(v: Video) {
  if (!v.potential || (v.age ?? 0) >= ECONOMY.videoLife) return { views: 0, money: 0, subs: 0 };
  v.age = (v.age ?? 0) + 1;
  const share = (n: number, age: number) => Math.round((n * age) / ECONOMY.videoLife);
  const views = share(v.potential, v.age) - share(v.potential, v.age - 1);
  const subs = share(v.fans ?? 0, v.age) - share(v.fans ?? 0, v.age - 1);
  const money = Math.round(views * ECONOMY.moneyPerView);
  v.views += views;
  v.money += money;
  return { views, money, subs };
}

/** Fine partita: paga (lavoro), pubblica le clip scelte e fa crescere il canale. Salvare tocca a chi chiama. */
export function settle(s: CareerState, p: PendingMatch, shots: Shot[], avgScore: number, assisted: boolean): Report {
  let pay = 0;
  if (p.kind === 'job') {
    const offer = s.offers.find((o) => o.id === p.offerId);
    const base = offer?.pay ?? ECONOMY.jobBase[0];
    const quality = ECONOMY.minPay + (1 - ECONOMY.minPay) * avgScore / ECONOMY.fullPayScore;
    pay = Math.round(base * quality * (assisted ? ECONOMY.assistedFactor : 1));
  }
  const videos: Video[] = shots.filter((shot) => shot.stars >= ECONOMY.minVideoStars).map((shot) => {
    const luck = rand(1 - ECONOMY.noise, 1 + ECONOMY.noise);
    return { label: shot.label, sport: p.sport, stars: shot.stars, views: 0, money: 0, age: 0, clipId: shot.clipId,
      potential: videoPotential(s.subs, shot, p.kind, assisted, luck), fans: videoFans(shot, p.kind, assisted, luck) };
  });
  s.videos = [...videos, ...s.videos].slice(0, 30);
  let channelViews = 0, channelMoney = 0, newSubs = 0;
  for (const v of s.videos) {
    const g = grow(v);
    channelViews += g.views;
    channelMoney += g.money;
    newSubs += g.subs;
  }
  const earned = pay + channelMoney;
  s.views += channelViews;
  s.money += earned;
  s.subs += newSubs;
  s.matches++;
  s.offers = makeOffers(s);
  return { kind: p.kind, pay, channelMoney, channelViews, earned, videos, newSubs };
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
