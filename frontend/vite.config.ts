import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  // Prefisso pubblico dell'app: resta '/' in locale. Il deploy sulla VPS, dove
  // nginx serve l'app sotto /workout/, builda con VITE_BASE=/workout/ — asset,
  // router (basename in App.tsx) e chiamate API (lib/api.ts) leggono tutti e
  // tre lo stesso valore da import.meta.env.BASE_URL, quindi restano allineati.
  base: process.env.VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8456',
        changeOrigin: true,
      },
    },
  },
})
