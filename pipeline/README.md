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
