import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import App from './App.tsx'

// MapLibre resolves its worker relative to import.meta.url, which breaks once bundled.
setWorkerUrl(maplibreWorkerUrl)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
