/**
 * HIGHLIGHTS — a fine partita di carriera il giocatore sceglie fino a CONFIG.highlights.pick clip
 * da pubblicare su FrameTube (il canale del gioco): visualizzazioni, soldi, iscritti e quindi lavori migliori.
 */
import { CONFIG } from '../config';
import { t } from '../i18n';

export interface Highlight { label: string; stars: number; img: string }

/** Mostra le candidate prima dei pulsanti del riepilogo; publish riceve gli indici scelti (anche nessuno). */
export function mountHighlights(list: Highlight[], publish: (chosen: number[]) => void) {
  const pick = CONFIG.highlights.pick;
  const chosen = new Set(list.slice(0, pick).map((_, i) => i));
  const box = document.querySelector('#summary .sum-btns')!;
  box.insertAdjacentHTML('beforebegin', `
    <div class="sum-missed sum-hl"><small>${list.length ? t('Scegli fino a {n} clip per FrameTube', { n: pick }) : t('Nessuna ripresa abbastanza buona da pubblicare (servono almeno 3 stelle).')}</small>
      <div class="sum-missed-row">${list.map((h, i) => `
        <figure data-i="${i}" class="${chosen.has(i) ? 'on' : ''}"><img src="${h.img}" alt="">
          <figcaption>${t(h.label)} ${'★'.repeat(h.stars)}</figcaption></figure>`).join('')}</div>
      <button id="hl-publish">${t(list.length ? 'Pubblica su FrameTube' : 'Continua')}</button></div>`);
  const hl = document.querySelector('.sum-hl')!;
  hl.querySelectorAll<HTMLElement>('figure').forEach((fig) => fig.addEventListener('click', () => {
    const i = Number(fig.dataset.i);
    if (chosen.has(i)) chosen.delete(i);
    else if (chosen.size < pick) chosen.add(i);
    fig.classList.toggle('on', chosen.has(i));
  }));
  document.getElementById('hl-publish')!.addEventListener('click', () => {
    hl.remove();
    publish([...chosen].sort((a, b) => a - b));
  });
}
