"""Configuration for the monthly climatology pipeline.

See tasks/climatology_20260914.md for the design. Data lives on the external
disk (AIMAR_DATA); only rendered web assets are copied into the repo.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

DATA_ROOT = Path(os.environ.get("AIMAR_DATA", "/media/pc/ext4TB/AiMar"))
STATS_DIR = DATA_ROOT / "climatology" / "stats"
RAW_DIR = DATA_ROOT / "raw"
WEB_DIR = DATA_ROOT / "climatology" / "web"
LOG_DIR = DATA_ROOT / "logs"

YEARS = [2023, 2024, 2025]
MONTHS = list(range(1, 13))

# NorKyst z-levels 0, 3, 10, 15, 25, 50 m are the first six depth indices.
CURRENT_DEPTHS_M = [0, 3, 10, 15, 25, 50]


@dataclass(frozen=True)
class Field:
    """One output product read from a source file."""

    name: str
    units: str
    #: variable holding the magnitude, or None when derived from `uv`
    speed: str | None
    #: variable holding the direction the waves/wind travel to, in degrees, or None when derived from `uv`
    direction: str | None
    #: (eastward, northward) component variables
    uv: tuple[str, str] | None
    #: histogram bin width and bounds for the percentile estimates
    bin_width: float
    bin_max: float
    #: threshold below which a sample counts as calm / stagnant / low (share reported as calm_share)
    calm: float
    #: lower histogram bound (0 for speeds; negative for temperature)
    bin_min: float = 0.0
    #: optional upper threshold: share of samples above it (e.g. warm water)
    high: float | None = None


@dataclass(frozen=True)
class Source:
    name: str
    #: OPeNDAP URL template with {y} {m} {d}
    url: str
    #: take every n-th hour of the 24 in a daily file
    stride: int
    #: index subset per spatial dimension
    index_box: dict[str, slice]
    depth_slice: slice | None
    lon_var: str
    lat_var: str
    fields: tuple[Field, ...]
    attribution: str
    #: keep each day's subset as compressed int16 NetCDF under DATA_ROOT/raw/<name>/YYYY/ (advection + biology modelling)
    archive: bool = False
    #: int16 scale factor per archived variable
    archive_scale: dict[str, float] | None = None


WAVE = Source(
    name="wave",
    url="https://thredds.met.no/thredds/dodsC/windsurfer/mywavewam3km_files/{y}/{m:02d}/{y}{m:02d}{d:02d}_MyWam3km_hindcast.nc",
    stride=3,
    index_box={"rlat": slice(367, 1003), "rlon": slice(1753, 2379)},
    depth_slice=None,
    lon_var="longitude",
    lat_var="latitude",
    fields=(
        Field("waves", "m", speed="hs", direction="thq", uv=None, bin_width=0.1, bin_max=20.0, calm=0.5),
        Field("wind", "m/s", speed="ff", direction="dd", uv=None, bin_width=0.25, bin_max=40.0, calm=3.0),
    ),
    attribution="MET Norway NORA3 wave hindcast (MyWaveWAM 3 km), CC BY 4.0",
)

NORKYST = Source(
    name="norkyst",
    url="https://thredds.met.no/thredds/dodsC/fou-hi/norkyst800m-1h/NorKyst-800m_ZDEPTHS_his.an.{y}{m:02d}{d:02d}00.nc",
    stride=3,  # 8 snapshots/day: four per tidal cycle, enough for particle tracking
    index_box={"Y": slice(0, 902), "X": slice(0, 2520)},
    depth_slice=slice(0, len(CURRENT_DEPTHS_M)),
    lon_var="lon",
    lat_var="lat",
    fields=(
        Field("currents", "m/s", speed=None, direction=None, uv=("u_eastward", "v_northward"), bin_width=0.02, bin_max=2.0, calm=0.05),
        # Sea-lice biology: development and survival follow temperature and salinity at cage depths.
        Field("temperature", "°C", speed="temperature", direction=None, uv=None, bin_width=0.5, bin_min=-2.0, bin_max=32.0, calm=4.0, high=18.0),
        Field("salinity", "PSU", speed="salinity", direction=None, uv=None, bin_width=0.5, bin_min=0.0, bin_max=36.0, calm=20.0, high=None),
    ),
    attribution="MET Norway NorKyst-800 hourly hindcast, CC BY 4.0",
    archive=True,
    # int16 precision: 1 cm/s, 0.01 °C, 0.01 PSU — compresses ~7-8x with zlib+shuffle
    archive_scale={"u_eastward": 100.0, "v_northward": 100.0, "temperature": 100.0, "salinity": 100.0},
)

SOURCES = {s.name: s for s in (WAVE, NORKYST)}
