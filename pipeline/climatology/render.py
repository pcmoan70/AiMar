"""Render monthly statistics to Web-Mercator PNGs for the web app.

    python -m pipeline.climatology.render            # all <field>_mMM.nc in STATS_DIR
    python -m pipeline.climatology.render --pilot    # *_pilot.nc files, written to WEB_DIR/pilot

Each PNG encodes one month of one field (and depth for NorKyst fields):
    vector fields (waves, wind, currents):
      R = mean index       (0 = no data, 1..255 -> min..max)
      G = p90 index        (same scale)
      B = direction "to"   (0..255 -> 0..360 degrees clockwise from north)
      A = steadiness       (1..255 -> 0..1; 0 = no data)
    scalar fields (temperature, salinity):
      R = mean index, G = p90 index, B = p10 index (same scale), A = 255 where data
A manifest.json describes bounds, scales, months and depths so the app can
decode pixels back into values without any server.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path

import numpy as np
import xarray as xr
from PIL import Image
from pyproj import Transformer
from scipy.spatial import cKDTree

from .config import STATS_DIR, WEB_DIR, YEARS

#: lon/lat window rendered for the app
BOUNDS = (3.0, 57.0, 32.0, 71.8)  # west, south, east, north

#: per-field colour-scale maximum, mercator pixel size (m) and source spacing (m) for the nearest-neighbour cutoff
LAYER = {
    "waves": dict(min=0.0, max=8.0, pixel=4000, source_spacing=3000, units="m", title="Significant wave height"),
    "wind": dict(min=0.0, max=30.0, pixel=4000, source_spacing=3000, units="m/s", title="Wind speed (10 m)"),
    "currents": dict(min=0.0, max=1.0, pixel=2000, source_spacing=800, units="m/s", title="Current speed"),
    "temperature": dict(min=-2.0, max=28.0, pixel=2000, source_spacing=800, units="°C", title="Sea temperature"),
    "salinity": dict(min=0.0, max=36.0, pixel=2000, source_spacing=800, units="PSU", title="Salinity"),
}

_to_merc = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


def target_grid(pixel: float):
    x0, y0 = _to_merc.transform(BOUNDS[0], BOUNDS[1])
    x1, y1 = _to_merc.transform(BOUNDS[2], BOUNDS[3])
    w = int(np.ceil((x1 - x0) / pixel))
    h = int(np.ceil((y1 - y0) / pixel))
    xs = x0 + (np.arange(w) + 0.5) * pixel
    ys = y1 - (np.arange(h) + 0.5) * pixel  # row 0 = north
    return xs, ys, (x0, y0, x0 + w * pixel, y1), w, h


def nearest_index(lon: np.ndarray, lat: np.ndarray, xs: np.ndarray, ys: np.ndarray, cutoff: float):
    """Flat source index for every target pixel, -1 where the nearest source cell is farther than
    `cutoff` ground metres. Mercator distances are scaled by 1/cos(lat), so the cutoff is too."""
    sx, sy = _to_merc.transform(lon.ravel(), lat.ravel())
    tree = cKDTree(np.column_stack([sx, sy]))
    gx, gy = np.meshgrid(xs, ys)
    dist, idx = tree.query(np.column_stack([gx.ravel(), gy.ravel()]))
    lat_rad = np.deg2rad(2 * np.arctan(np.exp(gy.ravel() / 6378137.0)) * 180 / np.pi - 90)
    idx = idx.astype(np.int64)
    idx[dist > cutoff / np.cos(lat_rad)] = -1
    return idx.reshape(len(ys), len(xs))


def encode(mean, p90, direction, steadiness, vmax: float, vmin: float = 0.0, p10=None) -> np.ndarray:
    """Vector fields carry direction/steadiness; scalar fields (direction None) carry p10 in B and A = 255."""
    scalar = direction is None
    ok = np.isfinite(mean) if scalar else np.isfinite(mean) & np.isfinite(direction)
    scale = lambda v: (1 + np.round(np.clip((v - vmin) / (vmax - vmin), 0, 1) * 254)).astype(np.uint8)
    rgba = np.zeros((*mean.shape, 4), np.uint8)
    rgba[..., 0] = np.where(ok, scale(np.nan_to_num(mean)), 0)
    rgba[..., 1] = np.where(ok, scale(np.nan_to_num(p90)), 0)
    if scalar:
        rgba[..., 2] = np.where(ok, scale(np.nan_to_num(p10)), 0)
        rgba[..., 3] = np.where(ok, 255, 0)
    else:
        rgba[..., 2] = np.where(ok, np.round(np.nan_to_num(direction) / 360.0 * 255).astype(np.uint8), 0)
        rgba[..., 3] = np.where(ok, (1 + np.round(np.clip(np.nan_to_num(steadiness), 0, 1) * 254)).astype(np.uint8), 0)
    return rgba


def render_file(path: Path, out_dir: Path, manifest: dict) -> None:
    m = re.match(r"(\w+?)_m(\d\d)(_pilot)?\.nc$", path.name)
    if not m:
        return
    field, month = m.group(1), int(m.group(2))
    cfg = LAYER[field]
    ds = xr.open_dataset(path)
    xs, ys, bounds, w, h = target_grid(cfg["pixel"])
    idx = nearest_index(ds.lon.values, ds.lat.values, xs, ys, cutoff=cfg["source_spacing"] * 1.5)
    flat_ok = idx >= 0
    depths = ds.depth.values.tolist() if "depth" in ds.dims else [None]
    for di, depth in enumerate(depths):
        sub = ds.isel(depth=di) if depth is not None else ds
        scalar = "direction" not in ds
        grids = {}
        for var in ("mean", "p90", "p10") if scalar else ("mean", "p90", "direction", "steadiness"):
            src = sub[var].values.ravel()
            arr = np.full((h, w), np.nan, np.float32)
            arr[flat_ok] = src[idx[flat_ok]]
            grids[var] = arr
        rgba = (
            encode(grids["mean"], grids["p90"], None, None, vmax=cfg["max"], vmin=cfg["min"], p10=grids["p10"])
            if scalar
            else encode(grids["mean"], grids["p90"], grids["direction"], grids["steadiness"], vmax=cfg["max"], vmin=cfg["min"])
        )
        name = f"{field}_{int(depth)}m_m{month:02d}.png" if depth is not None else f"{field}_m{month:02d}.png"
        Image.fromarray(rgba).save(out_dir / name, optimize=True)
        lm = manifest["layers"].setdefault(field, {
            "title": cfg["title"], "units": cfg["units"], "min": cfg["min"], "max": cfg["max"], "scalar": scalar, "calm": float(ds.attrs.get("calm", 0) or 0),
            "width": w, "height": h, "bounds": [float(v) for v in _merc_bounds_to_lonlat(bounds)],
            "depths": [int(d) for d in depths] if depth is not None else None, "months": [], "files": {},
        })
        if month not in lm["months"]:
            lm["months"].append(month)
        lm["files"][f"{int(depth)}m_m{month:02d}" if depth is not None else f"m{month:02d}"] = name
        print(f"{name}: {w}x{h}, {(rgba[..., 0] > 0).mean() * 100:.0f}% data, {int(ds.attrs.get('days_used', 0))} days")
    ds.close()


def _merc_bounds_to_lonlat(b):
    inv = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    w, s = inv.transform(b[0], b[1])
    e, n = inv.transform(b[2], b[3])
    return w, s, e, n


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--pilot", action="store_true")
    p.add_argument("--fields", nargs="*", help="only these fields, e.g. waves wind (default: every field with statistics)")
    args = p.parse_args(argv)
    out_dir = WEB_DIR / "pilot" if args.pilot else WEB_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = "*_pilot.nc" if args.pilot else "*_m??.nc"
    manifest = {
        "attribution": "© MET Norway (NORA3 wave hindcast, NorKyst-800), CC BY 4.0",
        "years": YEARS,
        "created": time.strftime("%Y-%m-%d"),
        "encoding": {
            "vector": {"R": "mean index 1..255 -> min..max (0 = no data)", "G": "p90 index", "B": "direction to, 0..255 -> 0..360°", "A": "steadiness 1..255 -> 0..1"},
            "scalar": {"R": "mean index 1..255 -> min..max (0 = no data)", "G": "p90 index", "B": "p10 index", "A": "255 where data"},
        },
        "layers": {},
    }
    for path in sorted(STATS_DIR.glob(pattern)):
        if args.fields and path.name.split("_m")[0] not in args.fields:
            continue
        render_file(path, out_dir, manifest)
    for lm in manifest["layers"].values():
        lm["months"].sort()
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"manifest written to {out_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
