import { useEffect, useMemo, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import MapView, { type MapHit, type Selection } from './components/MapView'
import LayerPanel from './components/LayerPanel'
import InspectPanel from './components/InspectPanel'
import CasesPanel from './components/CasesPanel'
import OfflinePanel from './components/OfflinePanel'
import OperatorDropdown from './components/OperatorDropdown'
import HoverInfo from './components/HoverInfo'
import ContextMenu, { type MenuState } from './components/ContextMenu'
import HeatmapLayer, { HEAT_LAYER_ID, LICE_HEAT_LAYER_ID } from './components/HeatmapLayer'
import LiceWeekSlider from './components/LiceWeekSlider'
import { farmTreatmentStats } from './lib/heatmap'
import { farmSeasonStats, farmWeekStats, liceAtSeasonWeek, liceAtWeek, liceColour, SEASON_WEEKS, setLiceWeekValues, WEEK_HEAT_MAX } from './lib/liceWeek'
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
import { loadSeaTemp, loadTides, type SeaTemp, type Tides } from './lib/siteData'
import { useOnline } from './lib/offline'
import { updateSettings, useSettings, type PanelId } from './lib/settings'

const TABS: Exclude<PanelId, null>[] = ['layers', 'inspect', 'cases', 'help']

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
  const [seatemp, setSeatemp] = useState<SeaTemp | null>(null)
  const [tides, setTides] = useState<Tides | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    loadLocalities().then(setLocalities).catch(console.error)
    loadFishHealth().then(setFishhealth).catch(console.error)
    loadCases().then(setCases).catch(console.error)
    loadSeaTemp().then(setSeatemp)
    loadTides().then(setTides)
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
  const filteredLoknrs = localities ? computeFiltered(localities, s.operatorFilter, s.fieldFilters, fishhealth ? liceStatsIndex(fishhealth, localities) : undefined) : null

  // Lice per week: the chosen week's values feed the dot colours, the hover card and the weekly heatmap.
  const liceLayersOn = s.overlays.includes('lice-week') || s.overlays.includes(LICE_HEAT_LAYER_ID)
  const liceWeek = fishhealth ? (s.liceWeek < 0 || s.liceWeek >= fishhealth.weeks.length ? fishhealth.weeks.length - 1 : s.liceWeek) : 0
  const season = s.weekAxis === 'season'
  const seasonWeek = Math.min(SEASON_WEEKS, Math.max(1, s.seasonWeek))
  const liceValues = useMemo(
    () => (fishhealth && liceLayersOn ? (season ? liceAtSeasonWeek(fishhealth, seasonWeek) : liceAtWeek(fishhealth, liceWeek)) : null),
    [fishhealth, liceLayersOn, season, seasonWeek, liceWeek],
  )
  useEffect(() => {
    setLiceWeekValues(liceValues)
  }, [liceValues])
  const liceColours = useMemo(() => (liceValues && s.overlays.includes('lice-week') ? new Map([...liceValues].map(([nr, v]) => [nr, liceColour(v)])) : null), [liceValues, s.overlays])
  const liceDim = useMemo(() => (liceColours && liceValues ? [...liceValues].filter(([, v]) => v == null).map(([nr]) => nr) : null), [liceColours, liceValues])
  const treatmentFarms = useMemo(() => (localities && fishhealth ? farmTreatmentStats(fishhealth, localities) : null), [localities, fishhealth])
  const liceFarms = useMemo(
    () =>
      localities && fishhealth && s.overlays.includes(LICE_HEAT_LAYER_ID)
        ? season
          ? farmSeasonStats(fishhealth, localities, seasonWeek, s.weekHeatMode)
          : farmWeekStats(fishhealth, localities, liceWeek, s.weekHeatMode)
        : null,
    [localities, fishhealth, s.overlays, season, seasonWeek, liceWeek, s.weekHeatMode],
  )

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
          liceColours={liceColours}
          liceDim={liceDim}
          onSelect={select}
          onContextMenu={(locality, point) => setMenu({ locality, x: point.x, y: point.y })}
          onMap={setMap}
        />
        <ContextMenu menu={menu} onClose={() => setMenu(null)} />
        <OperatorDropdown localities={localities} map={map} />
        <FilterChips />
        <HoverInfo map={map} />
        <HeatmapLayer map={map} id={HEAT_LAYER_ID} farms={treatmentFarms} />
        <HeatmapLayer map={map} id={LICE_HEAT_LAYER_ID} farms={liceFarms} max={WEEK_HEAT_MAX[s.weekHeatMode]} minDen={0.5} />
        {fishhealth && liceValues && <LiceWeekSlider fishhealth={fishhealth} localities={localities} week={liceWeek} values={liceValues} />}
        {s.panel && (
          <aside>
            {s.panel === 'layers' && <LayerPanel />}
            {s.panel === 'inspect' && <InspectPanel selection={selection} localities={localities} fishhealth={fishhealth} cases={cases} seatemp={seatemp} tides={tides} />}
            {s.panel === 'cases' && (
              <CasesPanel
                cases={cases}
                localities={localities}
                loknrs={filteredLoknrs}
                onPick={(nr) => {
                  const f = localities?.features.find((x) => x.properties.loknr === nr)
                  if (f) pickLocality(f)
                }}
              />
            )}
            {s.panel === 'offline' && <OfflinePanel map={map} />}
            {s.panel === 'help' && <HelpPanel />}
          </aside>
        )}
      </main>
      <UpdatePrompt />
    </div>
  )
}
