"""Reduce daily hindcast files into monthly per-cell statistics.

Usage (from the repository root):

    python -m pipeline.climatology.accumulate wave     --years 2023 2024 2025 --months 1 2 3
    python -m pipeline.climatology.accumulate norkyst  --max-days 2          # throughput pilot

For each calendar month the days of every requested year are streamed over
OPeNDAP (subset, strided) and folded into accumulators: sum, count, calm
count, direction unit-vector sums and a magnitude histogram for the 90th
percentile. The month is then written to STATS_DIR/<field>_m<MM>.nc and a
done-marker is placed in LOG_DIR so reruns skip finished months.
"""

from __future__ import annotations

import argparse
import calendar
import logging
import sys
import time
from pathlib import Path

import numpy as np
import xarray as xr

from .config import CURRENT_DEPTHS_M, LOG_DIR, MONTHS, SOURCES, STATS_DIR, YEARS, Field, Source

log = logging.getLogger("climatology")


class Accumulator:
    """Running monthly statistics for one field over a fixed grid shape."""

    def __init__(self, shape: tuple[int, ...], field: Field):
        self.field = field
        self.shape = shape
        self.n_bins = int(round(field.bin_max / field.bin_width))
        self.sum = np.zeros(shape, np.float64)
        self.count = np.zeros(shape, np.int32)
        self.calm = np.zeros(shape, np.int32)
        self.sx = np.zeros(shape, np.float64)
        self.sy = np.zeros(shape, np.float64)
        self.hist = np.zeros((self.n_bins, *shape), np.uint16)
        self._cell = np.arange(int(np.prod(shape)))

    def add(self, speed: np.ndarray, direction_to: np.ndarray) -> None:
        """Fold samples of shape (t, *shape); NaN marks missing data."""
        flat_hist = self.hist.reshape(self.n_bins, -1)
        for t in range(speed.shape[0]):
            s = speed[t]
            d = direction_to[t]
            valid = np.isfinite(s) & np.isfinite(d)
            s0 = np.where(valid, s, 0.0)
            self.sum += s0
            self.count += valid
            self.calm += valid & (s0 < self.field.calm)
            rad = np.deg2rad(np.where(valid, d, 0.0))
            self.sx += np.where(valid, np.cos(rad), 0.0)
            self.sy += np.where(valid, np.sin(rad), 0.0)
            idx = np.minimum((s0 / self.field.bin_width).astype(np.int32), self.n_bins - 1)
            v = valid.ravel()
            flat_hist[idx.ravel()[v], self._cell[v]] += 1

    def finalize(self) -> dict[str, np.ndarray]:
        cnt = self.count.astype(np.float64)
        ok = cnt > 0
        with np.errstate(divide="ignore", invalid="ignore"):
            mean = np.where(ok, self.sum / cnt, np.nan)
            cum = np.cumsum(self.hist, axis=0, dtype=np.int32)
            bin_idx = np.minimum((cum < 0.9 * cnt).sum(axis=0), self.n_bins - 1)
            p90 = np.where(ok, (bin_idx + 0.5) * self.field.bin_width, np.nan)
            direction = np.where(ok, (np.degrees(np.arctan2(self.sy, self.sx)) + 360.0) % 360.0, np.nan)
            steadiness = np.where(ok, np.hypot(self.sx, self.sy) / cnt, np.nan)
            calm_share = np.where(ok, self.calm / cnt, np.nan)
        return {
            "mean": mean.astype(np.float32),
            "p90": p90.astype(np.float32),
            "direction": direction.astype(np.float32),
            "steadiness": steadiness.astype(np.float32),
            "calm_share": calm_share.astype(np.float32),
            "count": self.count,
        }


def open_day(source: Source, y: int, m: int, d: int) -> xr.Dataset | None:
    """Open one daily file subset, retrying on transient OPeNDAP errors. None if the day is missing."""
    url = source.url.format(y=y, m=m, d=d)
    sel: dict[str, slice] = {"time": slice(0, None, source.stride), **source.index_box}
    if source.depth_slice is not None:
        sel["depth"] = source.depth_slice
    for attempt in range(5):
        try:
            return xr.open_dataset(url, engine="netcdf4", decode_timedelta=False).isel(sel)
        except OSError as e:
            msg = str(e)
            if "404" in msg or "Not Found" in msg or "NetCDF: file not found" in msg:
                return None
            wait = 30 * 2**attempt
            log.warning("%s attempt %d failed (%s); retrying in %ds", url.rsplit("/", 1)[-1], attempt + 1, msg[:120], wait)
            time.sleep(wait)
    raise RuntimeError(f"giving up on {url}")


def read_fields(source: Source, ds: xr.Dataset) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Return {field: (speed, direction_to)} arrays of shape (t[, depth], y, x)."""
    out = {}
    for f in source.fields:
        if f.uv:
            u = ds[f.uv[0]].values.astype(np.float32)
            v = ds[f.uv[1]].values.astype(np.float32)
            speed = np.hypot(u, v)
            direction_to = (np.degrees(np.arctan2(u, v)) + 360.0) % 360.0  # compass bearing the flow goes to
        else:
            speed = ds[f.speed].values.astype(np.float32)
            direction_to = (ds[f.direction].values.astype(np.float32) + 180.0) % 360.0  # "from" -> "to"
        out[f.name] = (speed, direction_to)
    return out


def write_stats(source: Source, field: Field, month: int, stats: dict[str, np.ndarray], lon: np.ndarray, lat: np.ndarray,
                years: list[int], days_used: int, out_path: Path) -> None:
    dims = ("depth", "y", "x") if stats["mean"].ndim == 3 else ("y", "x")
    coords: dict = {"lon": (("y", "x"), lon.astype(np.float32)), "lat": (("y", "x"), lat.astype(np.float32))}
    if "depth" in dims:
        coords["depth"] = ("depth", np.array(CURRENT_DEPTHS_M[: stats["mean"].shape[0]], np.float32))
    ds = xr.Dataset({k: (dims, v) for k, v in stats.items()}, coords=coords)
    ds["mean"].attrs.update(long_name=f"mean {field.name}", units=field.units)
    ds["p90"].attrs.update(long_name=f"90th percentile {field.name}", units=field.units)
    ds["direction"].attrs.update(long_name="vector-mean direction the flow/waves/wind go to", units="degrees clockwise from north")
    ds["steadiness"].attrs.update(long_name="resultant length of direction unit vectors", units="1")
    ds["calm_share"].attrs.update(long_name=f"share of samples below {field.calm} {field.units}", units="1")
    ds.attrs.update(
        title=f"Monthly climatology of {field.name}, month {month:02d}",
        source=source.attribution,
        years=" ".join(map(str, years)),
        hour_stride=source.stride,
        days_used=days_used,
        created=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ds.to_netcdf(out_path, encoding={k: {"zlib": True, "complevel": 4} for k in stats})


def run(source: Source, years: list[int], months: list[int], max_days: int | None) -> None:
    STATS_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    pilot = max_days is not None
    for month in months:
        marker = LOG_DIR / f"{source.name}_m{month:02d}.done"
        if marker.exists() and not pilot:
            log.info("month %02d already done, skipping", month)
            continue
        days = [(y, month, d) for y in years for d in range(1, calendar.monthrange(y, month)[1] + 1)]
        if pilot:
            days = days[:max_days]
        accs: dict[str, Accumulator] | None = None
        lon = lat = None
        used = 0
        t0 = time.time()
        for i, (y, m, d) in enumerate(days, 1):
            ds = open_day(source, y, m, d)
            if ds is None:
                log.warning("%04d-%02d-%02d missing, skipped", y, m, d)
                continue
            t1 = time.time()
            data = read_fields(source, ds)
            if accs is None:
                lon = ds[source.lon_var].values
                lat = ds[source.lat_var].values
                accs = {f.name: Accumulator(data[f.name][0].shape[1:], f) for f in source.fields}
            ds.close()
            for f in source.fields:
                accs[f.name].add(*data[f.name])
            used += 1
            nbytes = sum(a.nbytes + b.nbytes for a, b in data.values())
            log.info("month %02d day %d/%d %04d-%02d-%02d: %.0f MB in %.1fs, elapsed %.1f min",
                     month, i, len(days), y, m, d, nbytes / 1e6, time.time() - t1, (time.time() - t0) / 60)
        if accs is None:
            log.error("month %02d: no data at all", month)
            continue
        for f in source.fields:
            suffix = "_pilot" if pilot else ""
            out = STATS_DIR / f"{f.name}_m{month:02d}{suffix}.nc"
            write_stats(source, f, month, accs[f.name].finalize(), lon, lat, years, used, out)
            log.info("wrote %s", out)
        if not pilot:
            marker.touch()


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", choices=sorted(SOURCES))
    p.add_argument("--years", type=int, nargs="+", default=YEARS)
    p.add_argument("--months", type=int, nargs="+", default=MONTHS)
    p.add_argument("--max-days", type=int, default=None, help="pilot: stop after this many days and write *_pilot.nc")
    args = p.parse_args(argv)

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler(LOG_DIR / f"accumulate_{args.source}.log")],
    )
    run(SOURCES[args.source], args.years, args.months, args.max_days)


if __name__ == "__main__":
    main()
