export default function HelpPanel() {
  return (
    <div className="panel-body help">
      <h2>AiMar</h2>
      <p>
        An open-data map of Norwegian aquaculture sites and the conditions around them, built to keep working offline.
        Every figure in the app has a dotted underline: hover, tap or focus it to see its source and how it was
        calculated.
      </p>

      <h3>Header</h3>
      <ul>
        <li>
          <b>Search</b> finds a locality by name or number and flies to it.
        </li>
        <li>
          <b>Layers</b>, <b>Inspect</b>, <b>Offline</b> and <b>Help</b> open the side panel.
        </li>
        <li>
          <b>⚙ Settings</b> holds the base map (topographic, greytone, nautical chart) and the offline cache limit.
        </li>
        <li>
          <b>Log out</b> returns to the sign-in screen. Sign-in is remembered on this device.
        </li>
      </ul>

      <h3>Map</h3>
      <ul>
        <li>Dots are aquaculture localities; site borders are the licensed outlines.</li>
        <li>
          <b>Left-click</b> a dot or border to open the site in the Inspect panel. Left-click open water to profile a
          hypothetical site: nearest farm, farms and capacity within 5–50 km, and regional lice pressure.
        </li>
        <li>
          <b>Right-click</b> a dot for a menu: select its operator, or clear all selections.
        </li>
        <li>
          <b>Hover</b> anywhere and a card lists what every enabled overlay shows at that point: locality, traffic
          level, protected area, seabed class, depth, temperature, current and so on. A dash means the layer has nothing
          there.
        </li>
        <li>
          The <b>operator dropdown</b> (top-left) limits dots and borders to chosen operators, with a search box, site
          counts and capacity, "Zoom to sites" and "Show all". The selection also drives the lines in the lice chart.
        </li>
        <li>
          <b>Filter chips</b> under the dropdown show active field filters (see Site panel); ✕ clears one, "Clear all"
          clears them.
        </li>
        <li>
          <b>Colours:</b> every operator with 16 or more sites has a fixed colour (legend under Layers → Aquaculture);
          other operators are grey; a selected smaller operator borrows a free colour while selected. Coloured dots
          are drawn above grey ones, largest operators on top. Charts use the same colours.
        </li>
      </ul>

      <h3>Site panel (Inspect)</h3>
      <ul>
        <li>
          Register fields from Akvakulturregisteret: number, status, capacity, species, operators, purpose, production
          form, placement, municipality, production area, first clearance, with a link to the register.
        </li>
        <li>
          <b>Click a field value</b> (status, capacity, species, purpose, production form, placement, municipality,
          production area) to show only sites sharing it — capacity means "at least this many tonnes", species means
          "cleared for the first-listed species". The active field turns blue with a red ✕ that clears that filter.
          Filters combine with the operator selection and are remembered.
        </li>
        <li>
          <b>Fish health:</b> latest reported adult female lice per fish, and a 52-week summary of weeks reported,
          weeks above the 0.5 limit and weeks with treatment. A missing weekly report means the farm was not operating,
          never zero lice.
        </li>
      </ul>

      <h3>Lice chart</h3>
      <ul>
        <li>
          <b>History</b> shows this site's weekly adult female lice since 2012 (navy), the red 0.5 limit, grey bands
          for fallow weeks, ▲ mechanical removal and ◆ medicinal treatment. Hover for the weekly values.
        </li>
        <li>
          A comparison line shows the lice level at other farms within 150 km as seen from this site, weighted by
          inverse squared distance and counting only farms that reported that week: all farms (dark grey) when no
          operator is selected, otherwise one line per selected operator in its colour.
        </li>
        <li>
          <b>Show site vs average</b> switches to a scatter: each week is a dot with the comparison average on the
          x-axis and this site on the y-axis; above the diagonal means this site had more lice. Hover a dot for its
          week; the text below gives the share of weeks above.
        </li>
        <li>The period dropdown chooses last year, 4 years, 8 years or all since 2012. "Last 12 weeks as table" lists the numbers.</li>
      </ul>

      <h3>Layers</h3>
      <ul>
        <li>
          Overlays sit in tabs: Aquaculture, Seabed, Ocean, Environment, Shipping — most useful first. The circle on a
          tab shows how many layers are on (orange) or available (outlined); click it to switch the whole group off or
          back on (your selection is restored).
        </li>
        <li>Each layer states its source, licence and caching; layers with a colour scale show a legend when on.</li>
        <li>AIS density layers fade low-traffic cells so busy lanes stand out.</li>
        <li>All layer choices are remembered on this device.</li>
      </ul>

      <h3>Offline</h3>
      <ul>
        <li>
          Everything viewed while online — base tiles, all overlays, hover lookups — is cached on this device and
          reappears offline; the latest tiles are also kept in memory for instant panning.
        </li>
        <li>
          <b>Download this area</b> prefetches tiles for the current view and chosen extra zoom levels before going out
          of coverage. The panel shows storage use and what is cached.
        </li>
        <li>
          Caches are capped (20 GB by default, changeable under ⚙ Settings). When over the limit, least-recently-used
          overlay images and lookups are removed first, base-map tiles last. "Purge to limit" runs it now.
        </li>
        <li>
          Locality, site-border and fish-health data are bundled with the app and refreshed weekly; the snapshot date
          is shown in the panel.
        </li>
        <li>Install the app from the Offline panel or the browser menu for a full-screen experience.</li>
        <li>
          The app checks for new versions every 10 minutes and when you return to the tab; a bar at the bottom offers
          to reload.
        </li>
      </ul>

      <h3>Data sources</h3>
      <ul>
        <li>Kartverket: topographic maps, nautical chart, bathymetry (CC BY 4.0).</li>
        <li>
          Fiskeridirektoratet: localities, site borders, spawning areas, protected seabed habitats (NLOD 2.0).
        </li>
        <li>BarentsWatch: weekly lice counts, treatments, fallow periods, PD/ILA since 2012 (NLOD 2.0).</li>
        <li>Kystverket: fairways, fairway areas, shipping anchorages, AIS traffic density 2022–2025 (NLOD 2.0).</li>
        <li>Miljødirektoratet: protected areas (NLOD 2.0).</li>
        <li>NGU: seabed sediment, anchoring conditions, deposition areas, slope (NLOD 2.0).</li>
        <li>MET Norway: NorKyst v3 forecast temperature, salinity and currents, latest model hour (CC BY 4.0).</li>
      </ul>
    </div>
  )
}
