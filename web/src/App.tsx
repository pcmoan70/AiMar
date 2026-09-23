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
import { farmSeasonStats, farmWeekStats, liceAtSeasonWeek, liceAtWeek, liceBin, liceColour, LICE_BINS, SEASON_WEEKS, setLiceWeekValues, WEEK_HEAT_MAX } from './lib/liceWeek'
import { liceLimit } from './lib/fishhealth'
import SettingsMenu from './components/SettingsMenu'
import HelpPanel from './components/HelpPanel'
import UpdatePrompt from './components/UpdatePrompt'
import SearchBox from './components/SearchBox'
import LoginScreen from './components/LoginScreen'
import { logout, useAuth } from './lib/auth'
import { scheduleJanitor } from './lib/cacheJanitor'
import { useT } from './lib/i18n'
import { getSettings } from './lib/settings'
import { loadApplications, loadHearings, loadLocalities, type ApplicationProps, type Hearing, type Localities, type LocalityFeature } from './lib/localities'
import { filteredLoknrs as computeFiltered } from './lib/filters'
import FilterChips from './components/FilterChips'
import { loadFishHealth, liceStatsIndex, type FishHealth } from './lib/fishhealth'
import { loadCases, type Cases } from './lib/cases'
import { CLIM_FIELDS, loadClimManifest, type ClimManifest } from './lib/climatology'
import ClimatologyLayer from './components/ClimatologyLayer'
import ClimMonthControl from './components/ClimMonthControl'
import { loadSeaTemp, loadTides, warmAtSeasonWeek, warmAtWeek, warmCounts, type SeaTemp, type Tides } from './lib/siteData'
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
  const [casesFailed, setCasesFailed] = useState(false)
  const [seatemp, setSeatemp] = useState<SeaTemp | null>(null)
  const [tides, setTides] = useState<Tides | null>(null)
  const [clim, setClim] = useState<ClimManifest | null>(null)
  const [applications, setApplications] = useState<ApplicationProps[] | null>(null)
  const [hearings, setHearings] = useState<Hearing[] | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [caseSites, setCaseSites] = useState<number[] | null>(null)

  useEffect(() => {
    loadLocalities().then(setLocalities).catch(console.error)
    loadFishHealth().then(setFishhealth).catch(console.error)
    loadCases()
      .then(setCases)
      .catch((e) => {
        console.error(e)
        setCasesFailed(true)
      })
    loadSeaTemp().then(setSeatemp)
    loadTides().then(setTides)
    loadClimManifest().then(setClim)
    loadApplications().then(setApplications)
    loadHearings().then(setHearings)
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
  // Draw order while scrubbing: the worst lice levels on top, sites with no report at the bottom.
  const liceRanks = useMemo(() => {
    if (!liceColours || !liceValues) return null
    const bins: number[][] = LICE_BINS.map(() => [])
    for (const [nr, v] of liceValues) if (v != null) bins[liceBin(v)].push(nr)
    return bins
  }, [liceColours, liceValues])
  const warmSeries = useMemo(
    () => (seatemp && fishhealth && liceLayersOn ? warmCounts(seatemp, fishhealth.weeks, s.warmC) : null),
    [seatemp, fishhealth, liceLayersOn, s.warmC],
  )
  const warm = useMemo(() => {
    if (!seatemp || !fishhealth || !liceLayersOn) return null
    const weeks = fishhealth.weeks
    return season ? warmAtSeasonWeek(seatemp, seasonWeek, s.warmC) : warmAtWeek(seatemp, weeks[liceWeek], s.warmC)
  }, [seatemp, fishhealth, liceLayersOn, season, seasonWeek, liceWeek, s.warmC])
  // Sites over the limit in force that week — 0.2 in the spring weeks, by region — get a dark ring.
  const liceOver = useMemo(() => {
    if (!liceColours || !liceValues || !fishhealth || !localities) return null
    const weeks = fishhealth.weeks
    const label = season ? `${weeks[weeks.length - 1].slice(0, 4)}-${String(seasonWeek).padStart(2, '0')}` : weeks[liceWeek]
    const fylke = new Map(localities.features.map((f) => [f.properties.loknr, f.properties.fylke]))
    return [...liceValues].filter(([nr, v]) => v != null && v > liceLimit(label, fylke.get(nr))).map(([nr]) => nr)
  }, [liceColours, liceValues, fishhealth, localities, season, seasonWeek, liceWeek])
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
          liceOver={liceOver}
          liceRanks={liceRanks}
          caseSites={s.panel === 'cases' ? caseSites : null}
          onSelect={select}
          onContextMenu={(locality, point) => setMenu({ locality, x: point.x, y: point.y })}
          onMap={setMap}
        />
        <ContextMenu menu={menu} onClose={() => setMenu(null)} />
        <OperatorDropdown localities={localities} map={map} />
        <FilterChips />
        <ClimMonthControl manifest={clim} />
        <HoverInfo map={map} />
        {Object.entries(CLIM_FIELDS).map(([id, field]) => (
          <ClimatologyLayer key={id} map={map} id={id} field={field} manifest={clim} />
        ))}
        <HeatmapLayer map={map} id={HEAT_LAYER_ID} farms={treatmentFarms} />
        <HeatmapLayer map={map} id={LICE_HEAT_LAYER_ID} farms={liceFarms} max={WEEK_HEAT_MAX[s.weekHeatMode]} minDen={0.5} />
        {fishhealth && liceValues && <LiceWeekSlider fishhealth={fishhealth} localities={localities} week={liceWeek} values={liceValues} warm={warm} warmSeries={warmSeries} />}
        {s.panel && (
          <aside>
            {s.panel === 'layers' && <LayerPanel />}
            {s.panel === 'inspect' && <InspectPanel
                selection={selection}
                localities={localities}
                fishhealth={fishhealth}
                cases={cases}
                casesFailed={casesFailed}
                seatemp={seatemp}
                tides={tides}
                applications={applications}
                hearings={hearings}
                onSelectApplication={(props) => setSelection({ type: 'application', props })}
                map={map}
              />}
            {s.panel === 'cases' && (
              <CasesPanel
                cases={cases}
                casesFailed={casesFailed}
                localities={localities}
                loknrs={filteredLoknrs}
                onSites={setCaseSites}
                onPick={(nr) => {
                  const f = localities?.features.find((x) => x.properties.loknr === nr)
                  if (f) pickLocality(f)
                }}
                hearings={hearings}
                applications={applications}
                onLocate={(lngLat) => map?.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 11) })}
                onPickApplication={(props) => {
                  setSelection({ type: 'application', props })
                  updateSettings({ panel: 'inspect' })
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
