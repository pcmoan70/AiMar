import { useEffect, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView, { type MapHit, type Selection } from './components/MapView'
import LayerPanel from './components/LayerPanel'
import InspectPanel from './components/InspectPanel'
import OfflinePanel from './components/OfflinePanel'
import OperatorDropdown from './components/OperatorDropdown'
import HoverInfo from './components/HoverInfo'
import ContextMenu, { type MenuState } from './components/ContextMenu'
import HeatmapLayer from './components/HeatmapLayer'
import SettingsMenu from './components/SettingsMenu'
import HelpPanel from './components/HelpPanel'
import UpdatePrompt from './components/UpdatePrompt'
import SearchBox from './components/SearchBox'
import LoginScreen from './components/LoginScreen'
import { logout, useAuth } from './lib/auth'
import { scheduleJanitor } from './lib/cacheJanitor'
import { useT } from './lib/i18n'
import { getSettings } from './lib/settings'
import { loadLocalities, type Localities, type LocalityFeature } from './lib/localities'
import { filteredLoknrs as computeFiltered } from './lib/filters'
import FilterChips from './components/FilterChips'
import { loadFishHealth, liceStatsIndex, type FishHealth } from './lib/fishhealth'
import { loadCases, type Cases } from './lib/cases'
import { useOnline } from './lib/offline'
import { updateSettings, useSettings, type PanelId } from './lib/settings'

const TABS: Exclude<PanelId, null>[] = ['layers', 'inspect', 'help']

export default function App() {
  const authed = useAuth()
  return authed ? <MapApp /> : <LoginScreen />
}

function MapApp() {
  const t = useT()
  const s = useSettings()
  const online = useOnline()
  const [map, setMap] = useState<MlMap | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [localities, setLocalities] = useState<Localities | null>(null)
  const [fishhealth, setFishhealth] = useState<FishHealth | null>(null)
  const [cases, setCases] = useState<Cases | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    loadLocalities().then(setLocalities).catch(console.error)
    loadFishHealth().then(setFishhealth).catch(console.error)
    loadCases().then(setCases).catch(console.error)
    scheduleJanitor(() => getSettings().cacheLimitGb * 1024 ** 3)
  }, [])

  const select = (hit: MapHit) => {
    let sel: Selection
    if (hit.type === 'loknr') {
      const f = localities?.features.find((x) => x.properties.loknr === hit.loknr)
      if (!f) return
      sel = { type: 'farm', props: f.properties }
    } else sel = hit
    setSelection(sel)
    updateSettings({ panel: 'inspect' })
  }
  const pickLocality = (f: LocalityFeature) => {
    map?.flyTo({ center: f.geometry.coordinates as [number, number], zoom: Math.max(map.getZoom(), 11) })
    select({ type: 'farm', props: f.properties })
  }
  const setPanel = (id: PanelId) => updateSettings({ panel: s.panel === id ? null : id })
  const selectedLoknr = selection?.type === 'farm' ? selection.props.loknr : null
  const filteredLoknrs = localities ? computeFiltered(localities, s.operatorFilter, s.fieldFilters, fishhealth ? liceStatsIndex(fishhealth) : undefined) : null

  return (
    <div className="app">
      <header>
        <h1>
          AiMar <span className={`dot ${online ? 'on' : 'off'}`} title={online ? 'Online' : 'Offline'} />
        </h1>
        <SearchBox localities={localities} onPick={pickLocality} />
        <nav>
          {TABS.map((id) => (
            <button key={id} className={s.panel === id ? 'active' : ''} onClick={() => setPanel(id)}>
              {t(`tab.${id}`)}
            </button>
          ))}
          <SettingsMenu />
          <button onClick={logout} title={t('header.logout.title')}>
            {t('header.logout')}
          </button>
        </nav>
      </header>
      <main>
        <MapView
          selectedLoknr={selectedLoknr}
          filteredLoknrs={filteredLoknrs}
          onSelect={select}
          onContextMenu={(locality, point) => setMenu({ locality, x: point.x, y: point.y })}
          onMap={setMap}
        />
        <ContextMenu menu={menu} onClose={() => setMenu(null)} />
        <OperatorDropdown localities={localities} map={map} />
        <FilterChips />
        <HoverInfo map={map} />
        <HeatmapLayer map={map} localities={localities} fishhealth={fishhealth} />
        {s.panel && (
          <aside>
            {s.panel === 'layers' && <LayerPanel />}
            {s.panel === 'inspect' && <InspectPanel selection={selection} localities={localities} fishhealth={fishhealth} cases={cases} />}
            {s.panel === 'offline' && <OfflinePanel map={map} />}
            {s.panel === 'help' && <HelpPanel />}
          </aside>
        )}
      </main>
      <UpdatePrompt />
    </div>
  )
}
