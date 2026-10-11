// Voci e bocche: sillabe, apertura della bocca, frasi in tutte le lingue, segnali della partita. Uso: npm run check:audio
import assert from 'node:assert/strict';
import { createServer } from 'vite';

globalThis.location = { search: '?sport=calcio' };
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const S = await server.ssrLoadModule('/src/audio/speech.ts');
  const { SHOUTS } = await server.ssrLoadModule('/src/audio/lines.ts');
  const { LANGUAGES } = await server.ssrLoadModule('/src/i18n/index.ts');

  // Sillabe: una per gruppo di vocali, le vocali ripetute allungano, l'esclamazione è urlata.
  const ciao = S.syllables('Passala!');
  assert.deepEqual(ciao.map((s) => s.vowel), ['a', 'a', 'a']);
  assert(ciao[2].stress && !ciao[0].stress, 'the last syllable of a shout is stressed');
  const goal = S.syllables('Gooooool!'), gol = S.syllables('Gol!');
  assert(goal[0].d > gol[0].d * 1.5, 'a long vowel lasts longer');
  assert.equal(S.syllables('Ça va, l’arbitre ?').length > 0, true);

  // Bocca: chiusa prima e dopo la frase e fra le parole, aperta dentro le sillabe, mai oltre 1.
  const say = S.speech(10, S.syllables('Ma arbitro!'));
  assert.equal(S.mouthOpen(say, 9.9), 0);
  assert.equal(S.mouthOpen(say, 10 + say.dur + 0.01), 0);
  const mid = say.track[0].t + say.track[0].d / 2;
  assert(S.mouthOpen(say, 10 + mid) > 0.9, 'open on the "a" vowel');
  for (let t = 10; t < 10 + say.dur; t += 0.01) assert(S.mouthOpen(say, t) <= 1);
  // Riallineamento sulla seconda parola annunciata dalla voce vera.
  S.alignToWord(say, 1, 20);
  assert.equal(say.at, 20 - say.track.find((s) => s.word === 1).t);

  // Ogni frase esiste in tutte le lingue e produce sillabe.
  for (const [kind, langs] of Object.entries(SHOUTS)) {
    for (const { id } of LANGUAGES) {
      assert(langs[id]?.length, `${kind}: missing ${id}`);
      for (const text of langs[id]) assert(S.syllables(text).length > 0, `${kind}/${id}: "${text}" has no syllables`);
    }
  }

  // La partita segnala suoni e frasi: fischio d'inizio dopo un gol, urlo del marcatore, cartellino dell'arbitro.
  const { Match } = await server.ssrLoadModule('/src/sim/match.ts');
  const m = new Match();
  m.cues.length = 0;
  m.setPose(m.actors[3], 'protest', 1);
  m.setPose(m.referee, 'card', 1);
  assert.deepEqual(m.cues.map((c) => c.line), ['protest', 'card']);
  m.endMatch();
  assert(m.cues.some((c) => c.sound === 'whistleEnd') && !m.cues.some((c) => c.line === 'foul'), 'final whistle, no foul call');
  for (let i = 0; i < 2000; i++) m.update(1 / 60);
  assert(m.cues.length <= 64, 'unread cues stay bounded');
  console.log('OK: syllables, mouth sync, five-language shouts and match cues');
} finally { await server.close(); }
