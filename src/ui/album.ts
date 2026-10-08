/**
 * ALBUM delle clip rare: salvato in localStorage. Per ogni evento raro tiene quante volte è stato catturato
 * e la cattura migliore (stelle, voto, data, miniatura). Gli eventi rari della libreria non ancora catturati
 * compaiono come caselle bloccate.
 */
import { LIBRARY } from '../events/library';
import { dateText, numberText, t } from '../i18n';
import { postNative } from '../platform/navigation';

export interface AlbumEntry {
  count: number;
  best: { stars: number; score: number; date: string; thumb: string };
}
type Album = Record<string, AlbumEntry>;

const KEY = 'frameit.album';
const $ = (id: string) => document.getElementById(id)!;

export function loadAlbum(): Album {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Album;
  } catch {
    return {};
  }
}

/** Aggiunge una cattura. true se è la migliore per quell'evento. */
export function addToAlbum(id: string, stars: number, score: number, thumb: string): boolean {
  const album = loadAlbum();
  const prev = album[id];
  const isBest = !prev || score > prev.best.score;
  album[id] = {
    count: (prev?.count ?? 0) + 1,
    best: isBest ? { stars, score, date: new Date().toISOString(), thumb } : prev.best,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(album));
  } catch { /* spazio pieno o salvataggi disattivati: pazienza */ }
  return isBest;
}

export function showAlbum(returnTo: 'menu' | 'results' = 'menu') {
  const album = loadAlbum();
  const rares = LIBRARY.filter((d) => d.category === 'rare');
  const cards = rares.map((d) => {
    const e = album[d.id];
    if (!e) return `<div class="al-card locked"><div class="al-thumb">?</div><b>???</b><small>${t('Non ancora catturata')}</small></div>`;
    const stars = '★'.repeat(e.best.stars) + '<span class="dim">' + '★'.repeat(5 - e.best.stars) + '</span>';
    return `<div class="al-card"><img class="al-thumb" src="${e.best.thumb}" alt=""><b>${t(d.label)}</b>
      <small><span class="r-stars">${stars}</span> ${e.best.score} · ${dateText(e.best.date)} · x${numberText(e.count)}</small></div>`;
  }).join('');
  const el = $('album');
  el.innerHTML = `
    <div class="sum">
      <div class="sum-title">${t('ALBUM CLIP RARE')}</div>
      <div class="al-grid">${cards}</div>
      <p class="al-note">${t('Altre clip rare in arrivo.')}</p>
      <button id="album-close">${t('Chiudi')}</button>
    </div>`;
  el.classList.remove('hidden');
  postNative({ type: 'screen', screen: 'album' });
  $('album-close').addEventListener('click', (ev) => {
    ev.stopPropagation();
    el.classList.add('hidden');
    postNative({ type: 'screen', screen: returnTo });
  });
}
