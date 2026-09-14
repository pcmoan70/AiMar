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

The NorKyst pass keeps every day's subset for later modelling:
`$AIMAR_DATA/raw/norkyst/YYYY/YYYYMMDD.npz` with int16 arrays
`u_eastward`, `v_northward` (×1000, mm/s), `temperature` (×100), `salinity`
(×500), shape (time=4, depth=6, y=902, x=2520), `-32768` = missing, plus
`time` (unix seconds), `depth` (m) and `<var>_scale`. Load with `np.load`;
divide by the scale after masking the fill value. Statistics for temperature
and salinity (`temperature_mMM.nc`, `salinity_mMM.nc`) carry mean, p10, p90,
`calm_share` (below 4 °C / 20 PSU) and `high_share` (above 18 °C).
