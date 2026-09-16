"""Reduce daily hindcast files into monthly per-cell statistics.

Usage (from the repository root):

    python -m pipeline.climatology.accumulate wave     --years 2023 2024 2025 --months 1 2 3
    python -m pipeline.climatology.accumulate norkyst  --max-days 2          # throughput pilot

For each calendar month the days of every requested year are streamed over
OPeNDAP (subset, strided) and folded into accumulators: sum, count, calm
count, direction unit-vector sums and a magnitude histogram for the 90th
percentile. The month is then written to STATS_DIR/<field>_m<MM>.nc and a
done-marker is placed in LOG_DIR so reruns skip finished months.

Robustness: every day is read in a child process with a hard timeout (a hung
OPeNDAP request is killed and retried), failures back off and are retried,
a day that keeps failing is skipped and logged, and the accumulators are
checkpointed to disk every few days so an interrupted month resumes where it
stopped.
"""

from __future__ import annotations

import argparse
import calendar
import logging
import multiprocessing as mp
import os
import sys
import time
from pathlib import Path

import numpy as np
import xarray as xr

from .config import CURRENT_DEPTHS_M, LOG_DIR, MONTHS, RAW_DIR, SOURCES, STATS_DIR, YEARS, Field, Source

log = logging.getLogger("climatology")

#: seconds allowed for one daily read before the child is killed and retried
READ_TIMEOUT = {"wave": 15 * 60, "norkyst": 40 * 60}
MAX_ATTEMPTS = 5
SHM = Path("/dev/shm") if Path("/dev/shm").is_dir() else Path("/tmp")


class Accumulator:
    """Running monthly statistics for one field over a fixed grid shape."""

    ARRAYS = ("sum", "count", "calm", "high", "sx", "sy", "hist")

    def __init__(self, shape: tuple[int, ...], field: Field):
        self.field = field
        self.shape = shape
        self.vector = field.uv is not None or field.direction is not None
        self.n_bins = int(round((field.bin_max - field.bin_min) / field.bin_width))
        self.sum = np.zeros(shape, np.float64)
        self.count = np.zeros(shape, np.int32)
        self.calm = np.zeros(shape, np.int32)
        self.high = np.zeros(shape, np.int32)
        self.sx = np.zeros(shape, np.float64)
        self.sy = np.zeros(shape, np.float64)
        self.hist = np.zeros((self.n_bins, *shape), np.uint16)
        self._cell = np.arange(int(np.prod(shape)))

    def add(self, value: np.ndarray, direction_to: np.ndarray | None) -> None:
        """Fold samples of shape (t, *shape); NaN marks missing data. direction_to is None for scalars."""
        flat_hist = self.hist.reshape(self.n_bins, -1)
        for t in range(value.shape[0]):
            s = value[t]
            valid = np.isfinite(s)
            if direction_to is not None:
                d = direction_to[t]
                valid &= np.isfinite(d)
                rad = np.deg2rad(np.where(valid, d, 0.0))
                self.sx += np.where(valid, np.cos(rad), 0.0)
                self.sy += np.where(valid, np.sin(rad), 0.0)
            s0 = np.where(valid, s, 0.0)
            self.sum += s0
            self.count += valid
            self.calm += valid & (s0 < self.field.calm)
            if self.field.high is not None:
                self.high += valid & (s0 > self.field.high)
            idx = np.clip(((s0 - self.field.bin_min) / self.field.bin_width).astype(np.int32), 0, self.n_bins - 1)
            v = valid.ravel()
            flat_hist[idx.ravel()[v], self._cell[v]] += 1

    def state(self) -> dict[str, np.ndarray]:
        return {k: getattr(self, k) for k in self.ARRAYS}

    def restore(self, state: dict[str, np.ndarray]) -> None:
        for k in self.ARRAYS:
            setattr(self, k, state[k].copy())

    def finalize(self) -> dict[str, np.ndarray]:
        cnt = self.count.astype(np.float64)
        ok = cnt > 0
        with np.errstate(divide="ignore", invalid="ignore"):
            mean = np.where(ok, self.sum / cnt, np.nan)
            cum = np.cumsum(self.hist, axis=0, dtype=np.int32)
            pct = lambda q: np.where(ok, self.field.bin_min + (np.minimum((cum < q * cnt).sum(axis=0), self.n_bins - 1) + 0.5) * self.field.bin_width, np.nan)
            p10, p90 = pct(0.1), pct(0.9)
            calm_share = np.where(ok, self.calm / cnt, np.nan)
            out = {
                "mean": mean.astype(np.float32),
                "p10": p10.astype(np.float32),
                "p90": p90.astype(np.float32),
                "calm_share": calm_share.astype(np.float32),
                "count": self.count,
            }
            if self.vector:
                out["direction"] = np.where(ok, (np.degrees(np.arctan2(self.sy, self.sx)) + 360.0) % 360.0, np.nan).astype(np.float32)
                out["steadiness"] = np.where(ok, np.hypot(self.sx, self.sy) / cnt, np.nan).astype(np.float32)
            if self.field.high is not None:
                out["high_share"] = np.where(ok, self.high / cnt, np.nan).astype(np.float32)
        return out


# ---------------------------------------------------------------- reading one day (child process)

def _read_day_worker(source_name: str, y: int, m: int, d: int, out: str) -> None:
    """Child process: read one day's subset and save it as .npz (or an empty 'missing' file)."""
    source = SOURCES[source_name]
    url = source.url.format(y=y, m=m, d=d)
    sel: dict[str, slice] = {"time": slice(0, None, source.stride), **source.index_box}
    if source.depth_slice is not None:
        sel["depth"] = source.depth_slice
    try:
        ds = xr.open_dataset(url, engine="netcdf4", decode_timedelta=False).isel(sel)
    except OSError as e:
        msg = str(e)
        if "404" in msg or "Not Found" in msg or "file not found" in msg.lower():
            Path(out + ".missing").touch()
            return
        raise
    arrays: dict[str, np.ndarray] = {"lon": ds[source.lon_var].values, "lat": ds[source.lat_var].values}
    raw: dict[str, np.ndarray] = {}
    for f in source.fields:
        if f.uv:
            u = ds[f.uv[0]].values.astype(np.float32)
            v = ds[f.uv[1]].values.astype(np.float32)
            raw[f.uv[0]], raw[f.uv[1]] = u, v
            arrays[f"{f.name}_speed"] = np.hypot(u, v)
            arrays[f"{f.name}_dir"] = (np.degrees(np.arctan2(u, v)) + 360.0) % 360.0  # bearing the flow goes to
        elif f.direction:
            arrays[f"{f.name}_speed"] = ds[f.speed].values.astype(np.float32)
            # MET's thq and dd are already "to" directions (standard_name sea_surface_wave_to_direction,
            # wind_to_direction), so they are taken as they stand.
            arrays[f"{f.name}_dir"] = ds[f.direction].values.astype(np.float32) % 360.0
        else:
            val = ds[f.speed].values.astype(np.float32)
            raw[f.speed] = val
            arrays[f"{f.name}_speed"] = val
    if source.archive:
        archive_day(source, y, m, d, ds, raw)
    ds.close()
    tmp = out[:-4] + ".tmp.npz"
    np.savez(tmp, **arrays)
    os.replace(tmp, out)


def archive_day(source: Source, y: int, m: int, d: int, ds: xr.Dataset, raw: dict[str, np.ndarray]) -> None:
    """Keep the day's subset as compressed int16 NetCDF for advection and biology modelling.

    Variables are packed with scale_factor = 1/archive_scale and _FillValue -32768,
    zlib level 4 with byte shuffle (~7-8x smaller than raw int16). The grid
    (lon, lat, depth) is written once to raw/<source>/grid.nc; day files carry
    only time and depth coordinates.
    """
    out = RAW_DIR / source.name / f"{y}" / f"{y}{m:02d}{d:02d}.nc"
    if out.exists():
        return
    out.parent.mkdir(parents=True, exist_ok=True)
    grid = RAW_DIR / source.name / "grid.nc"
    if not grid.exists():
        g = xr.Dataset({
            "lon": (("y", "x"), ds[source.lon_var].values.astype(np.float32)),
            "lat": (("y", "x"), ds[source.lat_var].values.astype(np.float32)),
        })
        if "h" in ds:
            g["h"] = (("y", "x"), ds["h"].values.astype(np.float32))
        g.attrs.update(source=source.attribution, index_box=str(source.index_box))
        g.to_netcdf(grid.with_suffix(".tmp.nc"), encoding={k: {"zlib": True, "complevel": 4} for k in g.data_vars})
        os.replace(grid.with_suffix(".tmp.nc"), grid)
    scales = source.archive_scale or {}
    dims = ("time", "depth", "y", "x") if "depth" in ds.coords else ("time", "y", "x")
    coords: dict = {"time": ds["time"].values}
    if "depth" in ds.coords:
        coords["depth"] = ds["depth"].values.astype(np.float32)
    day = xr.Dataset({name: (dims, arr) for name, arr in raw.items()}, coords=coords)
    encoding = {}
    for name in raw:
        scale = scales.get(name, 1.0)
        encoding[name] = {"dtype": "int16", "scale_factor": 1.0 / scale, "add_offset": 0.0, "_FillValue": -32768,
                          "zlib": True, "complevel": 4, "shuffle": True, "chunksizes": (1, 1, 902, 2520)[: len(dims)] if len(dims) == 4 else None}
    encoding["time"] = {"units": "seconds since 1970-01-01", "dtype": "int64"}
    day.attrs.update(source=source.attribution, hour_stride=source.stride, created=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    tmp = out.with_suffix(".tmp.nc")
    day.to_netcdf(tmp, encoding=encoding)
    os.replace(tmp, out)


def read_day(source: Source, y: int, m: int, d: int) -> dict[str, np.ndarray] | None:
    """Read one day with a hard timeout and retries. Returns None when the day is missing or keeps failing."""
    out = str(SHM / f"aimar_{source.name}_{os.getpid()}_{y}{m:02d}{d:02d}.npz")
    ctx = mp.get_context("spawn")
    for attempt in range(1, MAX_ATTEMPTS + 1):
        for p in (out, out + ".missing", out[:-4] + ".tmp.npz"):
            Path(p).unlink(missing_ok=True)
        proc = ctx.Process(target=_read_day_worker, args=(source.name, y, m, d, out), daemon=True)
        t0 = time.time()
        proc.start()
        proc.join(READ_TIMEOUT[source.name])
        if proc.is_alive():
            proc.kill()
            proc.join()
            log.warning("%04d-%02d-%02d attempt %d timed out after %.0f min", y, m, d, attempt, (time.time() - t0) / 60)
        elif Path(out + ".missing").exists():
            Path(out + ".missing").unlink()
            log.warning("%04d-%02d-%02d not on the server, skipped", y, m, d)
            return None
        elif proc.exitcode == 0 and Path(out).exists():
            with np.load(out) as z:
                data = {k: z[k] for k in z.files}
            Path(out).unlink()
            return data
        else:
            log.warning("%04d-%02d-%02d attempt %d failed (exit %s)", y, m, d, attempt, proc.exitcode)
        if attempt < MAX_ATTEMPTS:
            wait = 30 * 2 ** (attempt - 1)
            log.info("retrying in %ds", wait)
            time.sleep(wait)
    log.error("%04d-%02d-%02d given up after %d attempts, skipped", y, m, d, MAX_ATTEMPTS)
    return None


# ---------------------------------------------------------------- checkpoints

def ckpt_path(source: Source, month: int) -> Path:
    return LOG_DIR / f"ckpt_{source.name}_m{month:02d}.npz"


def save_checkpoint(source: Source, month: int, accs: dict[str, Accumulator], lon, lat, days_done: list[int]) -> None:
    path = ckpt_path(source, month)
    arrays = {"lon": lon, "lat": lat, "days_done": np.array(days_done, np.int64)}
    for name, acc in accs.items():
        for k, v in acc.state().items():
            arrays[f"{name}__{k}"] = v
    tmp = path.with_suffix(".tmp.npz")
    np.savez(tmp, **arrays)
    os.replace(tmp, path)


def load_checkpoint(source: Source, month: int):
    path = ckpt_path(source, month)
    if not path.exists():
        return None
    with np.load(path) as z:
        arrays = {k: z[k] for k in z.files}
    accs = {}
    for f in source.fields:
        shape = arrays[f"{f.name}__sum"].shape
        acc = Accumulator(shape, f)
        acc.restore({k: arrays[f"{f.name}__{k}"] for k in Accumulator.ARRAYS})
        accs[f.name] = acc
    return accs, arrays["lon"], arrays["lat"], arrays["days_done"].tolist()


# ---------------------------------------------------------------- output

def write_stats(source: Source, field: Field, month: int, stats: dict[str, np.ndarray], lon: np.ndarray, lat: np.ndarray,
                years: list[int], days_used: int, out_path: Path) -> None:
    dims = ("depth", "y", "x") if stats["mean"].ndim == 3 else ("y", "x")
    coords: dict = {"lon": (("y", "x"), lon.astype(np.float32)), "lat": (("y", "x"), lat.astype(np.float32))}
    if "depth" in dims:
        coords["depth"] = ("depth", np.array(CURRENT_DEPTHS_M[: stats["mean"].shape[0]], np.float32))
    ds = xr.Dataset({k: (dims, v) for k, v in stats.items()}, coords=coords)
    ds["mean"].attrs.update(long_name=f"mean {field.name}", units=field.units)
    ds["p10"].attrs.update(long_name=f"10th percentile {field.name}", units=field.units)
    ds["p90"].attrs.update(long_name=f"90th percentile {field.name}", units=field.units)
    if "direction" in ds:
        ds["direction"].attrs.update(long_name="vector-mean direction the flow/waves/wind go to", units="degrees clockwise from north")
        ds["steadiness"].attrs.update(long_name="resultant length of direction unit vectors", units="1")
    ds["calm_share"].attrs.update(long_name=f"share of samples below {field.calm} {field.units}", units="1")
    if "high_share" in ds:
        ds["high_share"].attrs.update(long_name=f"share of samples above {field.high} {field.units}", units="1")
    ds.attrs.update(
        title=f"Monthly climatology of {field.name}, month {month:02d}",
        source=source.attribution,
        years=" ".join(map(str, years)),
        hour_stride=source.stride,
        days_used=days_used,
        calm=field.calm,
        created=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    ds.to_netcdf(out_path, encoding={k: {"zlib": True, "complevel": 4} for k in stats})


# ---------------------------------------------------------------- main loop

def run(source: Source, years: list[int], months: list[int], max_days: int | None, checkpoint_every: int) -> None:
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
        days_done: list[int] = []
        if not pilot and (ck := load_checkpoint(source, month)):
            accs, lon, lat, days_done = ck
            log.info("month %02d: resumed checkpoint with %d days done", month, len(days_done))
        t0 = time.time()
        since_ckpt = 0
        for i, (y, m, d) in enumerate(days, 1):
            ymd = y * 10000 + m * 100 + d
            if ymd in days_done:
                continue
            t1 = time.time()
            data = read_day(source, y, m, d)
            if data is None:
                continue
            if accs is None:
                lon, lat = data["lon"], data["lat"]
                accs = {f.name: Accumulator(data[f"{f.name}_speed"].shape[1:], f) for f in source.fields}
            for f in source.fields:
                accs[f.name].add(data[f"{f.name}_speed"], data.get(f"{f.name}_dir"))
            days_done.append(ymd)
            since_ckpt += 1
            nbytes = sum(v.nbytes for v in data.values())
            log.info("month %02d day %d/%d %04d-%02d-%02d: %.0f MB in %.1fs, elapsed %.1f min",
                     month, i, len(days), y, m, d, nbytes / 1e6, time.time() - t1, (time.time() - t0) / 60)
            if not pilot and since_ckpt >= checkpoint_every:
                save_checkpoint(source, month, accs, lon, lat, days_done)
                since_ckpt = 0
                log.info("month %02d checkpoint saved (%d days)", month, len(days_done))
        if accs is None:
            log.error("month %02d: no data at all", month)
            continue
        for f in source.fields:
            suffix = "_pilot" if pilot else ""
            out = STATS_DIR / f"{f.name}_m{month:02d}{suffix}.nc"
            write_stats(source, f, month, accs[f.name].finalize(), lon, lat, years, len(days_done), out)
            log.info("wrote %s (%d of %d days)", out, len(days_done), len(days))
        if not pilot:
            marker.touch()
            ckpt_path(source, month).unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", choices=sorted(SOURCES))
    p.add_argument("--years", type=int, nargs="+", default=YEARS)
    p.add_argument("--months", type=int, nargs="+", default=MONTHS)
    p.add_argument("--max-days", type=int, default=None, help="pilot: stop after this many days and write *_pilot.nc")
    p.add_argument("--checkpoint-every", type=int, default=3, help="days between accumulator checkpoints")
    args = p.parse_args(argv)

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler(LOG_DIR / f"accumulate_{args.source}.log")],
    )
    run(SOURCES[args.source], args.years, args.months, args.max_days, args.checkpoint_every)


if __name__ == "__main__":
    main()
