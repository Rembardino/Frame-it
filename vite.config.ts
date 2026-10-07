import { defineConfig } from 'vite';

export default defineConfig({
  // Percorsi relativi: la build in dist/ funziona da qualsiasi hosting statico (Netlify, Vercel, GitHub Pages).
  base: './',
  // host: true espone il server sulla rete locale, così lo apri dal telefono.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: { chunkSizeWarningLimit: 1000 }, // three.js da solo pesa ~550 kB
});
