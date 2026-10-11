/**
 * Sillabe di una frase e apertura della bocca. Puro: niente audio, niente DOM.
 * La stessa traccia di sillabe guida sia la voce inventata (che la "canta" sillaba per sillaba)
 * sia la bocca dei personaggi, così labbra e voce sono sempre a tempo.
 */
export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';
export interface Syllable {
  /** Inizio e durata (s) dall'inizio della frase. */
  t: number; d: number;
  vowel: Vowel;
  /** 0..1: quanto si apre la bocca su questa vocale. */
  open: number;
  /** Sillaba urlata (fine di un'esclamazione): più alta e più lunga. */
  stress: boolean;
  /** Inizia con una consonante (la voce inventata ci mette un piccolo soffio). */
  consonant: boolean;
  /** Indice della parola, per riallineare la bocca agli eventi della voce vera. */
  word: number;
}
/** Una frase in corso: a = istante d'inizio (tempo di partita), track = sillabe. */
export interface Speech { at: number; track: Syllable[]; dur: number }

const OPEN: Record<Vowel, number> = { a: 1, o: 0.8, e: 0.65, u: 0.45, i: 0.4 };

/** Sillabe stimate dal testo: ogni gruppo di vocali è una sillaba. rate = sillabe al secondo. */
export function syllables(text: string, rate = 5.2): Syllable[] {
  const words = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const out: Syllable[] = [];
  let t = 0;
  words.forEach((word, w) => {
    const shout = /!/.test(word);
    const groups = [...word.matchAll(/([^aeiouy\W\d_]*)([aeiouy]+)/g)];
    if (!groups.length) groups.push(['', '', 'a'] as unknown as RegExpExecArray); // "hm", "shh": una sillaba muta
    groups.forEach((g, i) => {
      const last = i === groups.length - 1;
      const stress = shout && last;
      const v = g[2][0] === 'y' ? 'i' : (g[2][0] as Vowel);
      // Le vocali ripetute ("Gooool") allungano la sillaba.
      const d = (1 / rate) * (stress ? 1.35 : 1) * Math.min(3, 1 + (g[2].length - 1) * 0.45);
      out.push({ t, d, vowel: v, open: OPEN[v], stress, consonant: g[1].length > 0, word: w });
      t += d;
    });
    // Pausa fra le parole, più lunga dopo la punteggiatura.
    t += /[.…,;:]$/.test(word) ? 0.2 : /[!?]$/.test(word) ? 0.14 : 0.04;
  });
  return out;
}

export function speech(at: number, track: Syllable[]): Speech {
  const last = track[track.length - 1];
  return { at, track, dur: last ? last.t + last.d : 0 };
}

/** Larghezza della bocca per vocale: "i" ed "e" tirano le labbra, "o" e "u" le stringono. */
const WIDE: Record<Vowel, number> = { a: 1.05, e: 1.2, i: 1.3, o: 0.72, u: 0.6 };

/** Forma della bocca all'istante time: open = apertura 0..1, wide = larghezza relativa (1 = a riposo). */
export function mouthPose(s: Speech | null, time: number): { open: number; wide: number } {
  const rest = { open: 0, wide: 1 };
  if (!s) return rest;
  const u = time - s.at;
  if (u < 0 || u > s.dur) return rest;
  const track = s.track;
  for (let i = 0; i < track.length; i++) {
    const syl = track[i];
    if (u < syl.t) return rest; // pausa fra due parole
    if (u > syl.t + syl.d) continue;
    // Si apre e si chiude dentro ogni sillaba; la forma della vocale arriva insieme all'apertura.
    const phase = (u - syl.t) / syl.d;
    let k = Math.pow(Math.sin(Math.PI * phase), 0.6);
    // Dentro la stessa parola le labbra non si chiudono del tutto fra due sillabe.
    const joined = phase < 0.5 ? track[i - 1]?.word === syl.word : track[i + 1]?.word === syl.word;
    if (joined) k = Math.max(k, 0.3);
    return { open: syl.open * k, wide: 1 + (WIDE[syl.vowel] - 1) * k };
  }
  return rest;
}

export const mouthOpen = (s: Speech | null, time: number) => mouthPose(s, time).open;

/** Riallinea la frase quando la voce vera annuncia l'inizio di una parola (evento "boundary"). */
export function alignToWord(s: Speech, word: number, now: number) {
  const first = s.track.find((syl) => syl.word === word);
  if (first) s.at = now - first.t;
}
