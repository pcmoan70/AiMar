import { useEffect, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView, { type Selection } from './components/MapView'
import LayerPanel from './components/LayerPanel'
import InspectPanel from './components/InspectPanel'
import OfflinePanel from './components/OfflinePanel'
import HelpPanel from './components/HelpPanel'
import UpdatePrompt from './components/UpdatePrompt'
import { loadLocalities, type Localities } from './lib/localities'
import { useOnline } from './lib/offline'
import { updateSettings, useSettings, type PanelId } from './lib/settings'

const TABS: { id: Exclude<PanelId, null>; label: string }[] = [
  { id: 'layers', label: 'Layers' },
  { id: 'inspect', label: 'Inspect' },
  { id: 'offline', label: 'Offline' },
  { id: 'help', label: 'Help' },
]

export default function App() {
  const s = useSettings()
  const online = useOnline()
  const [map, setMap] = useState<MlMap | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [localities, setLocalities] = useState<Localities | null>(null)

  useEffect(() => {
    loadLocalities().then(setLocalities).catch(console.error)
  }, [])

  const select = (sel: Selection) => {
    setSelection(sel)
    updateSettings({ panel: 'inspect' })
  }
  const setPanel = (id: PanelId) => updateSettings({ panel: s.panel === id ? null : id })
  const selectedLoknr = selection?.type === 'farm' ? selection.props.loknr : null

  return (
    <div className="app">
      <header>
        <h1>
          AiMar <span className={`dot ${online ? 'on' : 'off'}`} title={online ? 'Online' : 'Offline'} />
        </h1>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={s.panel === t.id ? 'active' : ''} onClick={() => setPanel(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <MapView selectedLoknr={selectedLoknr} onSelect={select} onMap={setMap} />
        {s.panel && (
          <aside>
            {s.panel === 'layers' && <LayerPanel />}
            {s.panel === 'inspect' && <InspectPanel selection={selection} localities={localities} />}
            {s.panel === 'offline' && <OfflinePanel map={map} />}
            {s.panel === 'help' && <HelpPanel />}
          </aside>
        )}
      </main>
      <UpdatePrompt />
    </div>
  )
}
