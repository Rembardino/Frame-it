// Simula carriere con i numeri attuali di ECONOMY: quanto si guadagna a partita e quando si completa il negozio.
// Uso: npm run sim:career   (prova altri valori: npm run sim:career -- "{\"moneyPerView\":0.05}")
import { createServer } from 'vite';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '' };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const C = await server.ssrLoadModule('/src/career/career.ts');
  Object.assign(C.ECONOMY, JSON.parse(process.argv[2] ?? '{}'));
  const shop = C.SHOP.reduce((t, i) => t + i.cost.reduce((a, b) => a + b, 0), 0);
  const stars = (score) => 1 + [90, 70, 50, 30].filter((x) => score >= x).length;
  let seed = 7;
  Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Giocatore: punteggio medio e quanti momenti virali pubblica (su 3). Una stella cadente ogni 5 partite. Lavoro e in proprio alternati.
  for (const [name, avg, virals] of [['principiante', 40, 0], ['medio', 55, 1], ['bravo', 75, 3]]) {
    seed = 7;
    const s = C.fresh();
    let shopAt = null;
    console.log(`\n${name} (punteggio medio ${avg}, ${virals} virali su 3) — negozio completo: € ${shop}`);
    console.log(' partita |  €/partita |  totale guadagnato | iscritti');
    for (let m = 1; m <= 60; m++) {
      const shots = [0, 1, 2].map((i) => { const score = Math.min(100, avg + (Math.random() - 0.5) * 20); return { label: 'x', score, stars: stars(score), rare: false, viral: i < virals }; });
      if (m % 5 === 0) shots[2] = { label: 'stella', score: avg, stars: stars(avg), rare: true };
      const p = m % 2 ? { kind: 'job', sport: 'calcio', offerId: s.offers[0].id } : { kind: 'own', sport: 'calcio' };
      const r = C.settle(s, p, shots, avg, false);
      const total = s.money - C.ECONOMY.startMoney;
      if (!shopAt && total >= shop) shopAt = m;
      if ([1, 2, 5, 10, 20, 40, 60].includes(m)) console.log(`${String(m).padStart(8)} | ${String(r.earned).padStart(10)} | ${String(total).padStart(18)} | ${String(s.subs).padStart(8)}`);
    }
    console.log(`negozio completo alla partita: ${shopAt ?? 'oltre la 60'}`);
  }
} finally { await server.close(); }
