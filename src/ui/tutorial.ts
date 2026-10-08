import { SPORT, SPORT_LIST } from '../config';
import { t } from '../i18n';
import { postNative } from '../platform/navigation';

const SEEN_KEY = 'frameit.tutorial.v2';
export const TUTORIAL_PAGES = [
  { title: 'Sei il cameraman', paragraphs: [
    'Riprendi una diretta sportiva: segui l’azione, ascolta la regia e cattura il momento decisivo. Il tuo obiettivo è fare le riprese migliori, non vincere la partita sul campo.',
    'Le frecce ai bordi indicano i soggetti fuori campo. Gli ordini della regia danno punti bonus; le riprese migliori possono diventare replay e le clip rare finiscono nell’album.',
  ] },
  { title: 'Muovi la camera e usa lo zoom', paragraphs: [
    'Telefono: trascina con un dito per inquadrare. Allarga due dita per avvicinare, avvicinale per allontanare. Puoi anche tenere premuto + per zoomare avanti e − per zoomare indietro.',
    'Computer: trascina oppure usa frecce/WASD. Rotella o E/+ per avvicinare; Q/− per allontanare.',
    'Il giroscopio è opzionale: attivalo nel menu o durante la partita e ruota il telefono per mirare. Tocca Ricentra quando cambi posizione. Lo zoom resta manuale.',
  ] },
  { title: 'Scegli l’inquadratura', paragraphs: [
    'Campo largo: mostra lo sviluppo dell’azione, la palla e la zona di arrivo. Lascia spazio davanti a chi corre.',
    'Campo medio: segui il protagonista mantenendo testa, piedi e palla dentro l’immagine. Evita di stringere troppo durante un’azione veloce.',
    'Primo piano: avvicina su esultanze, reazioni o un soggetto richiesto dalla regia. Mantieni la testa intera; qui puoi tagliare i piedi.',
  ] },
  { title: 'Le riprese per ogni sport', paragraphs: [
    'Calcio: largo su passaggi e contropiedi; includi tiratore, palla e porta sul tiro. Stringi sul giocatore durante l’esultanza.',
    'Basket: segui palla e attaccante, includi il canestro su tiri e schiacciate. Allarga se l’azione cambia lato.',
    'Boxe: campo medio su entrambi i pugili e sui guantoni. Mantieni visibile il contatto; includi il corpo a terra durante un knockdown.',
    'Tennis: largo su giocatori, palla e rete durante gli scambi. Segui il colpo fino alla zona di arrivo, senza perdere la traiettoria.',
    'Pallavolo: includi palla, rete e giocatori coinvolti. Allarga su alzata e schiacciata per tenere dentro anche il muro.',
  ] },
  { title: 'Come ottenere più stelle', paragraphs: [
    'Il voto va da 0 a 100, fino a 5 stelle: conta la copertura dei soggetti, lo zoom adatto, la composizione, la fluidità e il tempismo.',
    'Arriva prima del momento decisivo e muovi la camera con dolcezza. Se perdi l’istante decisivo, il voto non supera 2 stelle.',
    'Per arbitro, panchina e tribuna segui il soggetto indicato dalla regia. Le indicazioni possono arrivare mentre l’azione continua: scegli cosa riprendere.',
  ] },
] as const;

export function tutorialSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) === 'done'; } catch { return false; }
}

/** A modal guide runs before the first match; it never advances the match clock. */
export class Tutorial {
  private el = document.getElementById('tutorial')!;
  private index = 0;
  private onClose: (() => void) | null = null;
  private previousFocus: HTMLElement | null = null;
  private startsMatch = false;

  constructor(private onPractice: (done: () => void, back: () => void, startsMatch: boolean) => void) {
    this.el.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(this.el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  open(onClose: () => void = () => {}, startsMatch = false) {
    if (this.onClose) return;
    this.previousFocus = document.activeElement as HTMLElement | null;
    this.index = 0;
    this.onClose = onClose;
    this.startsMatch = startsMatch;
    this.el.classList.remove('hidden');
    postNative({ type: 'screen', screen: 'tutorial' });
    document.getElementById('start')!.inert = true;
    this.render();
  }

  private close() {
    try { localStorage.setItem(SEEN_KEY, 'done'); } catch { /* Guide still works without storage. */ }
    this.el.classList.add('hidden');
    postNative({ type: 'screen', screen: 'menu' });
    document.getElementById('start')!.inert = false;
    this.previousFocus?.focus();
    const callback = this.onClose;
    this.onClose = null;
    callback?.();
  }

  private render() {
    const page = TUTORIAL_PAGES[this.index];
    const diagrams = this.index === 2 ? `<div class="shot-examples" aria-hidden="true">${['wide', 'medium', 'close'].map(size => `<div class="shot-demo ${size}"><i class="shot-person"></i><i class="shot-ball"></i><span>${t(size === 'wide' ? 'Campo largo' : size === 'medium' ? 'Campo medio' : 'Primo piano')}</span></div>`).join('')}</div>` : '';
    this.el.innerHTML = `<div class="tutorial-card">
      <div class="tutorial-top"><span>FRAME IT · ${t('Tutorial')} ${this.index + 1}/${TUTORIAL_PAGES.length}</span><button id="tutorial-skip" class="text-button">${t('Salta tutorial')}</button></div>
      <h2 id="tutorial-title" tabindex="-1">${t(page.title)}</h2>
      ${diagrams}<div class="tutorial-copy">${page.paragraphs.map((key, i) => `<p${this.index === 3 && SPORT_LIST[i].id === SPORT ? ' class="selected-sport"' : ''}>${t(key)}</p>`).join('')}</div>
      ${this.index === TUTORIAL_PAGES.length - 1 ? `<p class="tutorial-practice-note">${t('Prova tre azioni reali: guarda il modello, poi ricrea l’inquadratura da 100/100.')}</p>` : ''}
      <div class="tutorial-nav"><button id="tutorial-back" class="secondary" ${this.index === 0 ? 'disabled' : ''}>${t('Indietro')}</button><span aria-hidden="true">${TUTORIAL_PAGES.map((_, i) => `<i class="${i === this.index ? 'current' : ''}"></i>`).join('')}</span><button id="tutorial-next" class="primary">${t(this.index === TUTORIAL_PAGES.length - 1 ? 'Prova le inquadrature' : 'Avanti')}</button></div>
    </div>`;
    document.getElementById('tutorial-skip')!.addEventListener('click', () => this.close());
    document.getElementById('tutorial-back')!.addEventListener('click', () => { this.index--; this.render(); });
    document.getElementById('tutorial-next')!.addEventListener('click', () => {
      if (this.index === TUTORIAL_PAGES.length - 1) {
        this.el.classList.add('hidden');
        this.onPractice(() => this.close(), () => { this.el.classList.remove('hidden'); this.render(); }, this.startsMatch);
      }
      else { this.index++; this.render(); }
    });
    document.getElementById('tutorial-title')!.focus();
  }
}
