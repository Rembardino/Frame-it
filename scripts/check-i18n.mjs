// Deterministic catalog coverage and locale resolution tests (no browser required).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const languages = { en: 1, it: 0, es: 2, fr: 3, de: 4 };
const sports = ['calcio', 'basket', 'boxe', 'tennis', 'pallavolo'];
const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
async function withModules(search, saved, callback) {
  globalThis.location = { search };
  globalThis.localStorage = { getItem: () => saved, setItem: () => {} };
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
  try { await callback(server, await server.ssrLoadModule('/src/i18n/index.ts')); }
  finally { await server.close(); }
}

for (const [language, column] of Object.entries(languages)) {
  for (const sport of sports) await withModules(`?sport=${sport}&lang=${language}`, null, async (server, i18n) => {
    assert.equal(i18n.LANGUAGE, language);
    const { ROWS } = await server.ssrLoadModule('/src/i18n/catalog.ts');
    const catalog = new Map();
    for (const row of ROWS) {
      assert.equal(row.length, 5);
      assert(!catalog.has(row[0]), 'Duplicate key: ' + row[0]);
      row.forEach(value => {
        assert(value.trim(), 'Empty translation: ' + row[0]);
        assert.deepEqual(placeholders(value), placeholders(row[0]), 'Placeholder mismatch: ' + row[0]);
      });
      catalog.set(row[0], row);
      assert.equal(i18n.t(row[0]), row[column]);
    }
    const covered = key => { assert(catalog.has(key), `${sport}: missing ${key}`); assert.equal(i18n.t(key), catalog.get(key)[column]); };
    const { LIBRARY } = await server.ssrLoadModule('/src/events/library.ts');
    const { LINES, ORDERS, VERDICTS } = await server.ssrLoadModule('/src/director/lines.ts');
    const { TUTORIAL_PAGES } = await server.ssrLoadModule('/src/ui/tutorial.ts');
    TUTORIAL_PAGES.forEach(page => { covered(page.title); page.paragraphs.forEach(covered); });
    const { LESSONS } = await server.ssrLoadModule('/src/tutorial/lessons.ts');
    Object.values(LESSONS).flat().forEach(lesson => covered(lesson.tip));
    LIBRARY.forEach(def => {
      covered(def.label);
      if (def.hint) covered(def.hint);
      Object.values(def.outcomeLabels ?? {}).forEach(covered);
      Object.values(def.roles ?? {}).forEach(role => covered(role.label));
    });
    Object.values(LINES).flat().forEach(covered);
    ORDERS.forEach(order => { covered(order.label); order.lines.forEach(covered); });
    VERDICTS.forEach(([, text]) => covered(text));
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    for (const match of html.matchAll(/data-i18n(?:-aria|-title)?="([^"]+)"/g)) covered(match[1].replaceAll('&amp;', '&'));
    assert.equal(i18n.t('Giocatore fuori inquadratura'), i18n.t('{subject} fuori inquadratura', { subject: i18n.t('Giocatore') }));
    assert.equal(i18n.t('Ordine: Arbitro'), i18n.t('Ordine: {label}', { label: i18n.t('Arbitro') }));
    assert.equal(i18n.t('In ritardo di 1,9 s'), i18n.t('In ritardo di {seconds} s', { seconds: language === 'en' ? '1.9' : '1,9' }));
    // Run the actual HUD/album presentation against a small DOM adapter.
    const elements = new Map();
    globalThis.document = { getElementById: id => {
      if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {} });
      return elements.get(id);
    } };
    const { Hud } = await server.ssrLoadModule('/src/ui/hud.ts');
    const hud = new Hud(false);
    const result = { id: 'test', category: 'order', label: 'Ordine: Arbitro', importance: 0.5, points: 150, bonus: 150,
      result: { score: 75, stars: 3, components: { coverage: 75 }, enabled: ['coverage'], reasons: [{ text: 'Giocatore fuori inquadratura', good: false }, { text: 'In ritardo di 1,9 s', good: false }] } };
    hud.showResult(result);
    assert(elements.get('result').innerHTML.includes(i18n.t('Ordine: Arbitro')));
    assert(elements.get('result').innerHTML.includes(i18n.t('Giocatore fuori inquadratura')));
    assert(elements.get('result').innerHTML.includes(i18n.t('BONUS REGIA')));
    hud.setTotals(1234, 3.5);
    assert(elements.get('pts').innerHTML.includes(i18n.numberText(1234)));
    hud.showSummary({ points: 1234, avgStars: 3.5, orders: { done: 1, total: 2 }, distractions: { caught: 1, total: 3 }, rareClips: 0, best: [{ label: 'Contropiede', stars: 4, score: 80 }], verdict: VERDICTS[0][1] }, { score: [1, 2] }, 1234, true);
    for (const key of ['FINE PARTITA', 'Nuovo record!', 'Stelle medie', 'Ordini eseguiti', 'Rigioca', VERDICTS[0][1]]) assert(elements.get('summary').innerHTML.includes(i18n.t(key)));
    const { showAlbum } = await server.ssrLoadModule('/src/ui/album.ts');
    showAlbum();
    assert(elements.get('album').innerHTML.includes(i18n.t('Non ancora catturata')));
    const messages = [];
    globalThis.window = { ReactNativeWebView: { postMessage: value => messages.push(JSON.parse(value)) } };
    const { nativeMessage, restartGame } = await server.ssrLoadModule('/src/platform/navigation.ts');
    assert(nativeMessage('set-language', undefined, language));
    assert(nativeMessage('language-ready', undefined, language));
    restartGame();
    assert.deepEqual(messages, [{ type: 'set-language', language }, { type: 'language-ready', language }, { type: 'restart' }]);
    delete globalThis.window;
    delete globalThis.document;
    // Test the actual director, not just the catalog: combined hints and missed moments.
    const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
    const { Director } = await server.ssrLoadModule('/src/events/director.ts');
    const { DirectorVoice } = await server.ssrLoadModule('/src/director/voice.ts');
    const { CONFIG } = await server.ssrLoadModule('/src/config.ts');
    const match = new Match();
    const director = new Director(match, []);
    const voice = new DirectorVoice(match, director, []);
    voice.start();
    voice.update(0.1, {});
    assert(LINES.kickoff.map(i18n.t).includes(voice.current.text));
    const originalRandom = Math.random;
    try {
      Math.random = () => 0;
      const voice2 = new DirectorVoice(match, director, []);
      voice2.onResult({ category: 'main', label: 'Contropiede', result: null });
      voice2.update(0.1, {});
      assert.equal(voice2.current.text, i18n.t(LINES.missed[0], { label: i18n.t('Contropiede').toLocaleLowerCase(i18n.LOCALE) }));
      const voice3 = new DirectorVoice(match, director, []);
      const def = LIBRARY.find(def => def.hint);
      voice3.hint({ def, focus: { x: CONFIG.camera.position.x, y: CONFIG.camera.position.y, z: CONFIG.camera.position.z - 20 } }, {
        pos: { ...CONFIG.camera.position }, yaw: 0, pitch: 0, fov: 60, aspect: 2,
      });
      voice3.update(0.1, {});
      assert.equal(voice3.current.text, `${i18n.t(def.hint)} ${i18n.t(LINES.here[0])}`);
    } finally { Math.random = originalRandom; }
    if (sport === 'calcio') console.log(`${language}: ${ROWS.length} translated keys; five sports covered`);
  });
}
for (const [search, saved, expected] of [['', null, 'en'], ['', 'it', 'it'], ['?lang=fr', 'it', 'fr'], ['?lang=invalid', 'de', 'de'], ['?lang=invalid', 'invalid', 'en']]) {
  await withModules(search, saved, async (_, i18n) => assert.equal(i18n.LANGUAGE, expected));
}
delete globalThis.location;
delete globalThis.localStorage;
console.log('OK: localization, director messages, default language and saved preference');
