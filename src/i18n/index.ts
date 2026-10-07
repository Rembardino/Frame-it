import { ROWS } from './catalog';

export const LANGUAGES = [
  { id: 'en', name: 'English' }, { id: 'it', name: 'Italiano' },
  { id: 'es', name: 'Español' }, { id: 'fr', name: 'Français' }, { id: 'de', name: 'Deutsch' },
] as const;
export type Language = typeof LANGUAGES[number]['id'];
const COLUMNS: Record<Language, number> = { it: 0, en: 1, es: 2, fr: 3, de: 4 };
export const isLanguage = (value: unknown): value is Language => LANGUAGES.some(language => language.id === value);
const params = new URLSearchParams(globalThis.location?.search ?? '');
let saved: string | null = null;
try { saved = globalThis.localStorage?.getItem('frameit.language') ?? null; } catch { /* private mode */ }
const requested = params.get('lang');
export const LANGUAGE: Language = isLanguage(requested) ? requested : isLanguage(saved) ? saved : 'en';
export const LOCALE = { en: 'en-GB', it: 'it-IT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' }[LANGUAGE];
const entries = new Map(ROWS.map(row => [row[0], row]));
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = ROWS.filter(row => /\{\w+\}/.test(row[0])).map(row => {
  const names: string[] = [];
  let expression = '', position = 0;
  for (const match of row[0].matchAll(/\{(\w+)\}/g)) {
    expression += escape(row[0].slice(position, match.index)) + '(.+?)';
    names.push(match[1]); position = match.index! + match[0].length;
  }
  expression += escape(row[0].slice(position));
  return { row, names, regex: new RegExp('^' + expression + '$') };
});

export function t(key: string, values: Record<string, string | number> = {}): string {
  const row = entries.get(key);
  if (row) return row[COLUMNS[LANGUAGE]].replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] === undefined ? placeholder : String(values[name]));
  // Existing simulation results keep stable Italian labels; localize at presentation.
  for (const template of templates) {
    const match = key.match(template.regex);
    if (!match) continue;
    const substitutions = Object.fromEntries(template.names.map((name, i) => [name, name === 'subject' || name === 'label' ? t(match[i + 1]) : match[i + 1].replace(',', LANGUAGE === 'en' ? '.' : ',')]));
    return t(template.row[0], substitutions);
  }
  return key; // Proper names and broadcast marks such as LIVE/REC are unchanged.
}

export function saveLanguage(language: Language) {
  try { globalThis.localStorage?.setItem('frameit.language', language); } catch { /* URL still preserves the choice */ }
}

export function localizePage() {
  document.documentElement.lang = LANGUAGE;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n!); });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAria!)); });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(node => { node.title = t(node.dataset.i18nTitle!); });
}

export const numberText = (value: number, digits = 0) => value.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
export function dateText(value: string) {
  // Keep old album dates readable; new entries use a language-neutral ISO date.
  return /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value).toLocaleDateString(LOCALE) : value;
}
