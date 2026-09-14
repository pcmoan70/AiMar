# AiMar pipeline (Phase 2)

Python processing that produces derived products for the web app. Data and
intermediate files live on the external disk (`AIMAR_DATA`, default
`/media/pc/ext4TB/AiMar`); only small rendered assets are copied into `web/`.

## climatology

Monthly wave, wind and current statistics from MET Norway hindcasts. Design and
status: `tasks/climatology_20260914.md` (local, not in the public repo).

```bash
# pilot / throughput check (2 days)
python -m pipeline.climatology.accumulate wave --max-days 2
python -m pipeline.climatology.accumulate norkyst --max-days 2

# full run, resumable per month
python -m pipeline.climatology.accumulate wave
python -m pipeline.climatology.accumulate norkyst
```

Requires Python ≥ 3.11 with xarray, netCDF4, numpy, pyproj, Pillow (all present
in the local Anaconda install).

### Raw NorKyst archive

The NorKyst pass keeps every day's subset for later modelling, at 3-hourly
resolution (8 snapshots per day, four per tidal cycle):
`$AIMAR_DATA/raw/norkyst/YYYY/YYYYMMDD.nc` — NetCDF4 with `u_eastward`,
`v_northward`, `temperature`, `salinity` of shape (time=8, depth=6, y=902,
x=2520), packed as int16 with scale factors (1 cm/s, 0.01 °C, 0.01 PSU),
`-32768` = missing, zlib level 4 + shuffle (~120 MB/day). xarray unpacks them
automatically: `xr.open_dataset(path)`. The grid (lon, lat, bathymetry h) is
in `raw/norkyst/grid.nc`. Statistics for temperature and salinity
(`temperature_mMM.nc`, `salinity_mMM.nc`) carry mean, p10, p90, `calm_share`
(below 4 °C / 20 PSU) and `high_share` (above 18 °C).
