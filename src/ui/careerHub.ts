/**
 * Schermata della Carriera: soldi e canale in alto, poi tre schede (Lavori, Negozio, FrameTube).
 * Scegliere un lavoro o una partita in proprio chiama onPlay: la partita parte ricaricando la pagina.
 */
import { SPORT_LIST } from '../config';
import {
  ECONOMY, SHOP, buy, canBuy, level, loadCareer, saveCareer, unlocked,
  type CareerState, type PendingMatch, type Report, type Video,
} from '../career/career';
import { numberText, t } from '../i18n';

const $ = (id: string) => document.getElementById(id)!;
const sportName = (id: string) => t(SPORT_LIST.find((s) => s.id === id)?.name ?? id);
const euro = (n: number) => `€ ${numberText(n)}`;
const stars = (n: number) => '★'.repeat(n);

export class CareerHub {
  private tab: 'jobs' | 'shop' | 'channel' = 'jobs';

  constructor(private onPlay: (p: PendingMatch) => void, private assisted: () => boolean, private onReplay: (v: Video) => Promise<void>) {}

  open() {
    $('career').classList.remove('hidden');
    this.render();
  }

  openChannel() {
    this.tab = 'channel';
    this.open();
  }

  private render() {
    const s = loadCareer();
    const body = this.tab === 'jobs' ? this.jobs(s) : this.tab === 'shop' ? this.shop(s) : this.channel(s);
    const tab = (id: string, label: string) => `<button data-tab="${id}" class="${this.tab === id ? 'on' : ''}">${label}</button>`;
    $('career').innerHTML = `
      <div class="cr-box">
        <div class="cr-head">
          <button id="cr-back" class="text-button">← ${t('Torna al menu')}</button>
          <b>${t('CARRIERA')}</b>
          <span class="cr-wallet"><b>${euro(s.money)}</b><span>${numberText(s.subs)} ${t('iscritti')}</span><span>${numberText(s.views)} ${t('visualizzazioni')}</span></span>
        </div>
        <div class="cr-tabs sports">${tab('jobs', t('Lavori'))}${tab('shop', t('Negozio'))}${tab('channel', 'FrameTube')}</div>
        <div class="cr-body">${body}</div>
      </div>`;
    $('cr-back').addEventListener('click', () => $('career').classList.add('hidden'));
    $('career').querySelectorAll<HTMLButtonElement>('[data-replay]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await this.onReplay(s.videos[Number(b.dataset.replay)]); }
      catch { b.textContent = t('Clip non disponibile'); }
      finally { b.disabled = false; }
    }));
    $('career').querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab as typeof this.tab;
      this.render();
    }));
    $('career').querySelectorAll<HTMLElement>('[data-offer]').forEach((b) => b.addEventListener('click', () => {
      const offer = s.offers.find((o) => o.id === b.dataset.offer)!;
      this.onPlay({ kind: 'job', sport: offer.sport, offerId: offer.id });
    }));
    $('career').querySelectorAll<HTMLElement>('[data-own]').forEach((b) => b.addEventListener('click', () => {
      this.onPlay({ kind: 'own', sport: b.dataset.own as PendingMatch['sport'] });
    }));
    $('career').querySelectorAll<HTMLElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      if (buy(s, b.dataset.buy!)) saveCareer(s);
      this.render();
    }));
  }

  private jobs(s: CareerState) {
    const offers = s.offers.map((o) => `
      <div class="cr-card"><b data-sport="${o.sport}">${sportName(o.sport)}</b><span>${o.client}</span><em>${t('Paga base')} ${euro(o.pay)}</em>
      <button class="primary" data-offer="${o.id}">${t('Accetta')}</button></div>`).join('');
    const own = SPORT_LIST.filter((sp) => unlocked(s, sp.id)).map((sp) => `
      <div class="cr-card"><b data-sport="${sp.id}">${t(sp.name)}</b><span>FrameTube</span>
      <button class="secondary" data-own="${sp.id}">${t('Gioca')}</button></div>`).join('');
    return `
      <h3>${t('Richieste di lavoro')}</h3><p class="cr-note">${t('Il cliente paga in base alla qualità: con 3 stelle medie prendi la paga piena, di più se fai meglio.')}</p>
      <div class="cr-cards">${offers}</div>
      <h3>${t('In proprio')}</h3><p class="cr-note">${t('Nessuna paga: i tuoi highlights vanno su FrameTube. Più stelle = più visualizzazioni, soldi e iscritti.')}</p>
      <div class="cr-cards">${own}</div>
      ${this.assisted() ? `<p class="cr-note warn">${t('In modalità assistita guadagni il 30% in meno.')}</p>` : ''}`;
  }

  private shop(s: CareerState) {
    return SHOP.map((item) => {
      const lv = level(s, item.id), check = canBuy(s, item);
      const needs = SHOP.find((i) => i.id === item.needs);
      const action = check === 'max' ? `<span class="cr-owned">${t('Comprato')}</span>`
        : check === 'needs' ? `<span class="cr-owned">${needs ? t('Serve prima: {item}', { item: t(needs.name) }) : t('Serve l’accredito')}</span>`
        : `<button class="primary" data-buy="${item.id}" ${check === 'money' ? 'disabled' : ''}>${euro(item.cost[lv])}</button>`;
      const levels = item.cost.length > 1 ? `<small>${t('Livello {n}/{max}', { n: lv, max: item.cost.length })}</small>` : '';
      return `<div class="cr-row"><div><b>${t(item.name)}</b> ${levels}<p>${t(item.desc)}</p></div>${action}</div>`;
    }).join('');
  }

  private channel(s: CareerState) {
    if (!s.videos.length) return `<p class="cr-note">${t('Nessun video ancora. A fine partita scegli i tuoi highlights da pubblicare.')}</p>`;
    return s.videos.map((v, i) => {
      // Video ancora in crescita: quante visualizzazioni prenderà alla prossima partita.
      const left = v.potential && (v.age ?? 0) < ECONOMY.videoLife ? v.potential - v.views : 0;
      const next = left ? `<small class="cr-grow">${t('+{n} alla prossima partita', { n: numberText(Math.min(left, Math.round(v.potential! / ECONOMY.videoLife))) })}</small>` : '';
      return `<div class="cr-row"><div><b>${t(v.label)}</b> <span class="r-stars">${stars(v.stars)}</span>
      <p>${sportName(v.sport)}</p></div><span>${numberText(v.views)} ${t('visualizzazioni')} · ${euro(v.money)} ${next}</span>
      ${v.clipId ? `<button class="secondary" data-replay="${i}">${t('Rivedi clip')}</button>` : `<small>${t('Clip non disponibile')}</small>`}</div>`;
    }).join('');
  }
}

/** Riquadro "carriera" da aggiungere al riepilogo di fine partita. */
export function careerReport(r: Report, s: CareerState) {
  const videos = r.videos.length
    ? `<ul>${r.videos.map((v) => `<li><span>${t(v.label)}</span><span class="r-stars">${stars(v.stars)}</span><b>${numberText(v.potential ?? v.views)}</b></li>`).join('')}</ul>`
    : '';
  return `
    <div class="sum-grid cr-sum">
      ${r.kind === 'job' ? `<div><small>${t('Pagamento del cliente')}</small><b>${euro(r.pay)}</b></div>` : ''}
      <div><small>${t('Entrate FrameTube')}</small><b>${euro(r.channelMoney)}</b><em>${numberText(r.channelViews)} ${t('visualizzazioni')}</em></div>
      <div><small>${t('Nuovi iscritti')}</small><b>+${numberText(r.newSubs)}</b></div>
      <div><small>${t('Soldi')}</small><b>${euro(s.money)}</b></div>
    </div>
    ${videos ? `<div class="sum-best"><small>${t('Nuovi video · visualizzazioni previste')}</small>${videos}</div>` : ''}`;
}
