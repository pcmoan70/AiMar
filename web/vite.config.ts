import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const DAY = 60 * 60 * 24

// Hosts below must match the layer registry in src/lib/layers.ts.
// BASE_PATH is set by the GitHub Pages workflow (project pages live under /<repo>/).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*'],
      manifest: {
        name: 'AiMar – Norwegian Aquaculture Map',
        short_name: 'AiMar',
        description: 'Offline-capable map of Norwegian aquaculture sites and marine conditions',
        theme_color: '#0b3d5c',
        background_color: '#0b3d5c',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // App shell plus bundled data snapshots are precached at install.
        globPatterns: ['**/*.{js,css,html,svg,png,geojson,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        // Control the page from the first load so tiles are cached immediately.
        clientsClaim: true,
        runtimeCaching: [
          {
            // Kartverket WMTS base-map tiles
            urlPattern: /^https:\/\/cache\.kartverket\.no\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 20000, maxAgeSeconds: 180 * DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // WMS overlay images (bathymetry, protected areas, Fiskeridir layers)
            urlPattern: /^https:\/\/(wms\.geonorge\.no|kart\.miljodirektoratet\.no|gis\.fiskeridir\.no|geo\.ngu\.no|services\.kystverket\.no|wms-geo\.kystverket\.no|kystdatahuset\.no)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wms-images',
              expiration: { maxEntries: 10000, maxAgeSeconds: 60 * DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // NorKyst forecast images change every model run; keep them briefly
            urlPattern: /^https:\/\/thredds\.met\.no\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'forecast-images',
              expiration: { maxEntries: 3000, maxAgeSeconds: DAY },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
})
