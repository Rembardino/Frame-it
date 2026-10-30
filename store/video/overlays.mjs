// Scritte dello spot (PNG trasparenti 1080 px) e schermata finale: node store/video/overlays.mjs
// Testi in TEXTS; <y>...</y> = parola in giallo. Escono in artifacts/video-frames/overlays/.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = `${root}artifacts/video-frames/overlays/`;
mkdirSync(out, { recursive: true });
export const TEXTS = {
  'c1-basket-camera': { head: 'YOU’RE THE <y>CAMERAMAN</y>', sub: 'Frame the action, live 🎥', tag: 'CAMERA MODE' },
  'd1-calcio-drone': { head: 'NOW FLY THE <y>DRONE</y>', sub: 'Two-stick remote · any angle', tag: 'DRONE MODE' },
  'c2-boxe-camera': { head: 'EVERY SHOT <y>RATED</y> ⭐', sub: 'Zoom in · keep both in frame', tag: 'CAMERA MODE' },
  'd2-golf-drone': { head: 'CHASE EVERY <y>SHOT</y>', sub: 'Golf, filmed by drone ⛳', tag: 'DRONE MODE' },
  'd3-ciclismo-aquila': { head: 'WAIT… AN <y>EAGLE?!</y>', sub: 'Follow the race · watch the sky 🦅', tag: 'RARE EVENT' },
  'x1-proposta': { head: 'SECRET <y>EVENTS</y>', sub: 'Nobody warns you. Catch them! 💍', tag: 'SECRET EVENT' },
  'x2-bacio': { head: '<y>KISS CAM</y> 💋', sub: 'Frame them… and they go for it', tag: 'SECRET EVENT' },
  'x4-stella': { head: 'MAKE A <y>WISH</y> ✨', sub: 'Shooting star · bonus points', tag: 'RARE EVENT' },
  'x5-golf-ace': { head: 'HOLE IN <y>ONE!</y> 🏆', sub: 'Rare moments · huge bonus', tag: 'RARE EVENT' },
};
const icon = `data:image/png;base64,${readFileSync(`${root}public/icons/frame-it-icon-concept-v3-action.png`).toString('base64')}`;
const css = `
  body { margin: 0; background: transparent; font-family: 'Segoe UI', system-ui, sans-serif; color: #fff; }
  y { color: #ffd23f; }
  .head { width: 1080px; padding: 0 40px; box-sizing: border-box; text-align: center; font-weight: 900; font-size: 80px; line-height: 1.02;
    letter-spacing: 0.01em; text-shadow: 0 6px 0 rgba(0,0,0,.35), 0 0 30px rgba(0,0,0,.6); -webkit-text-stroke: 2px rgba(0,0,0,.25); }
  .sub { display: inline-block; margin-top: 16px; padding: 10px 26px; border-radius: 999px; background: rgba(8,14,32,.72); font-weight: 700; font-size: 40px; }
  .tag { display: inline-flex; align-items: center; gap: 10px; padding: 10px 22px; border-radius: 12px; background: #ffd23f; color: #0b1731; font-weight: 900; font-size: 36px; letter-spacing: .06em; box-shadow: 0 6px 20px rgba(0,0,0,.4); }
  .rec { display: inline-block; width: 22px; height: 22px; border-radius: 50%; background: #ff2d2d; box-shadow: 0 0 12px #ff2d2d; }
`;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: edge }) });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
async function shot(html, name, height, transparent = true) {
  await page.setViewportSize({ width: 1080, height });
  await page.setContent(`<html><head><style>${css}</style></head><body>${html}</body></html>`);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}${name}.png`, omitBackground: transparent });
}
for (const [id, t] of Object.entries(TEXTS)) {
  await shot(`<div style="text-align:center;padding-top:6px"><div class="head">${t.head}</div><div class="sub">${t.sub}</div></div>`, `${id}-head`, 300);
  await shot(`<div style="padding:8px"><span class="tag"><span class="rec"></span>${t.tag}</span></div>`, `${id}-tag`, 80);
}
// Schermata finale (opaca): icona, nome, motto, "ora su Google Play".
await shot(`<div style="width:1080px;height:1920px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;
    background:radial-gradient(ellipse at 50% 38%, #2265d8 0%, #0d2f7a 45%, #050f33 100%)">
  <img src="${icon}" style="width:430px;height:430px;border-radius:96px;box-shadow:0 30px 80px rgba(0,0,0,.55)">
  <div style="font-weight:900;font-size:150px;line-height:1;letter-spacing:.02em;text-shadow:0 8px 0 rgba(0,0,0,.35)">FRAME <y>IT</y></div>
  <div style="font-weight:900;font-size:66px;text-align:center;line-height:1.1;text-shadow:0 5px 0 rgba(0,0,0,.35)">BE THE BEST<br><y>CAMERAMAN</y></div>
  <div style="margin-top:20px;display:flex;align-items:center;gap:22px;padding:22px 44px;border-radius:24px;background:#000;border:3px solid #fff;box-shadow:0 14px 40px rgba(0,0,0,.5)">
    <svg width="70" height="78" viewBox="0 0 70 78"><path d="M6 4 L64 39 L6 74 Z" fill="#ffd23f"/></svg>
    <div style="text-align:left"><div style="font-size:30px;font-weight:600;opacity:.85;letter-spacing:.08em">NOW ON</div><div style="font-size:58px;font-weight:800;line-height:1">Google Play</div></div>
  </div>
  <div style="margin-top:10px;font-size:36px;font-weight:700;opacity:.85">Camera · drone · special events · <span class="rec"></span> LIVE</div>
</div>`, 'end', 1920, false);
await browser.close();
console.log('overlays ok');
