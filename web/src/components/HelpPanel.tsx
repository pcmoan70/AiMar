export default function HelpPanel() {
  return (
    <div className="panel-body">
      <h2>AiMar</h2>
      <p>An open-data map of Norwegian aquaculture sites that keeps working offline.</p>
      <h3>Using the map</h3>
      <ul>
        <li>Click a coloured dot or a site border to see a locality's register entry and its lice history since 2012. Hover the chart for weekly values.</li>
        <li>Every figure has a dotted underline: hover, tap or focus it to see its source and how it was calculated.</li>
        <li>Moving the pointer over the map shows a card with what each enabled overlay contains at that point: locality, traffic level, protected area, seabed class, temperature and so on.</li>
        <li>Type a name or locality number in the search box to fly to a site.</li>
        <li>The operator dropdown in the map's top-left corner limits the dots and site borders to chosen operators; use "Zoom to sites" to see them all.</li>
        <li>Click anywhere else in the sea to profile a hypothetical site: nearest farm, farms within 5–50 km and regional lice pressure.</li>
        <li>Choose the base map under <b>⚙ Settings</b> in the header and overlays under <b>Layers</b>. Overlays are grouped in tabs (Aquaculture, Seabed, Ocean, Environment, Shipping), most useful first. The circle on each tab shows how many layers are on (orange) or available (outlined); click it to switch the whole group off or back on. Choices are remembered on this device.</li>
        <li>Layers with a colour scale show their legend under the checkbox when enabled.</li>
      </ul>
      <h3>Working offline</h3>
      <ul>
        <li>Everything you have viewed while online (base tiles, all overlays, hover lookups) is cached on this device and reappears offline; the most recent tiles are also kept in memory for instant panning.</li>
        <li>Use <b>Offline</b> → <b>Download this area</b> to prefetch tiles for the current view before going out of coverage.</li>
        <li>Locality data is bundled with the app; the snapshot date is shown under <b>Offline</b>.</li>
        <li>Caches are capped (20 GB by default, adjustable under <b>⚙ Settings</b>); the least recently used overlay images go first, base-map tiles last.</li>
        <li>Install the app from the <b>Offline</b> panel or your browser menu for a full-screen experience.</li>
        <li>The app checks for new versions every 10 minutes and when you return to the tab; a bar at the bottom offers to reload.</li>
      </ul>
      <h3>Data sources</h3>
      <ul>
        <li>Kartverket: topographic maps, nautical charts, bathymetry (CC BY 4.0).</li>
        <li>Fiskeridirektoratet: localities, site borders, spawning areas, protected seabed habitats (NLOD 2.0).</li>
        <li>Kystverket: fairways, fairway areas, shipping anchorages, AIS traffic density 2022–2025 (NLOD 2.0).</li>
        <li>BarentsWatch: weekly lice counts, treatments, fallow periods, PD/ILA (NLOD 2.0).</li>
        <li>Miljødirektoratet: protected areas (NLOD 2.0).</li>
        <li>NGU: seabed sediment, anchoring conditions, deposition areas, slope (NLOD 2.0).</li>
        <li>MET Norway: NorKyst v3 forecast temperature, salinity and currents, latest model hour (CC BY 4.0).</li>
      </ul>
    </div>
  )
}
