import numpy as np

from pipeline.climatology import accumulate as acc_mod

from pipeline.climatology.accumulate import Accumulator
from pipeline.climatology.config import Field
from pipeline.climatology.render import encode

FIELD = Field("test", "m", speed="s", direction="d", uv=None, bin_width=0.1, bin_max=10.0, calm=0.5)


def test_accumulator_mean_p90_calm_and_direction():
    acc = Accumulator((1, 2), FIELD)
    # cell 0: speeds 0..9.9 uniformly, direction fixed 90° -> steady east
    # cell 1: constant 0.2 (calm), direction alternating 0/180 -> no steadiness
    t = 100
    speed = np.zeros((t, 1, 2), np.float32)
    direction = np.zeros((t, 1, 2), np.float32)
    speed[:, 0, 0] = np.arange(t) / 10.0
    direction[:, 0, 0] = 90.0
    speed[:, 0, 1] = 0.2
    direction[:, 0, 1] = np.where(np.arange(t) % 2 == 0, 0.0, 180.0)
    acc.add(speed, direction)
    s = acc.finalize()
    assert s["count"][0, 0] == t
    assert abs(s["mean"][0, 0] - 4.95) < 1e-3
    assert abs(s["p90"][0, 0] - 9.0) < 0.15  # 90th percentile of 0..9.9 is ~8.9
    assert abs(s["direction"][0, 0] - 90.0) < 1e-3
    assert abs(s["steadiness"][0, 0] - 1.0) < 1e-6
    assert s["calm_share"][0, 0] == np.float32(5 / 100)
    assert s["calm_share"][0, 1] == 1.0
    assert s["steadiness"][0, 1] < 1e-6
    assert abs(s["p10"][0, 0] - 1.0) < 0.15


def test_scalar_field_with_negative_bins_and_high_share():
    f = Field("temperature", "°C", speed="t", direction=None, uv=None, bin_width=0.5, bin_min=-2.0, bin_max=32.0, calm=4.0, high=18.0)
    acc = Accumulator((1,), f)
    vals = np.array([[-1.0], [3.0], [10.0], [20.0]], np.float32)
    acc.add(vals, None)
    s = acc.finalize()
    assert "direction" not in s
    assert s["mean"][0] == np.float32(8.0)
    assert s["calm_share"][0] == np.float32(0.5)  # -1 and 3 are below 4
    assert s["high_share"][0] == np.float32(0.25)  # 20 above 18
    assert abs(s["p10"][0] - (-1.0)) < 0.6


def test_accumulator_ignores_nan():
    acc = Accumulator((1,), FIELD)
    speed = np.array([[1.0], [np.nan], [3.0]], np.float32)
    direction = np.array([[0.0], [0.0], [0.0]], np.float32)
    acc.add(speed, direction)
    s = acc.finalize()
    assert s["count"][0] == 2
    assert s["mean"][0] == 2.0


def test_encode_round_trip():
    mean = np.array([[0.0, 4.0, np.nan]])
    p90 = np.array([[8.0, 4.0, 1.0]])
    direction = np.array([[0.0, 180.0, 90.0]])
    steadiness = np.array([[1.0, 0.5, 0.2]])
    rgba = encode(mean, p90, direction, steadiness, vmax=8.0)
    assert rgba[0, 2].tolist() == [0, 0, 0, 0]  # no data
    assert rgba[0, 0].tolist() == [1, 255, 0, 255]
    decoded_mean = (rgba[0, 1, 0] - 1) / 254 * 8.0
    assert abs(decoded_mean - 4.0) < 0.02
    assert abs(rgba[0, 1, 2] / 255 * 360 - 180.0) < 1.0


def test_checkpoint_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(acc_mod, "LOG_DIR", tmp_path)
    source = acc_mod.SOURCES["wave"]
    accs = {f.name: acc_mod.Accumulator((2, 3), f) for f in source.fields}
    speed = np.full((4, 2, 3), 1.5, np.float32)
    direction = np.full((4, 2, 3), 45.0, np.float32)
    for a in accs.values():
        a.add(speed, direction)
    lon = np.zeros((2, 3)); lat = np.ones((2, 3))
    acc_mod.save_checkpoint(source, 1, accs, lon, lat, [20240101, 20240102])
    restored, lon2, lat2, days = acc_mod.load_checkpoint(source, 1)
    assert days == [20240101, 20240102]
    assert np.array_equal(lat2, lat)
    for name, a in accs.items():
        for k in acc_mod.Accumulator.ARRAYS:
            assert np.array_equal(getattr(restored[name], k), getattr(a, k)), k
    assert restored["waves"].finalize()["mean"][0, 0] == np.float32(1.5)


def test_encode_scalar_uses_min_max_and_p10():
    mean = np.array([[-2.0, 13.0, np.nan]])
    p90 = np.array([[0.0, 20.0, 1.0]])
    p10 = np.array([[-2.0, 8.0, 1.0]])
    rgba = encode(mean, p90, None, None, vmax=28.0, vmin=-2.0, p10=p10)
    assert rgba[0, 2].tolist() == [0, 0, 0, 0]
    assert rgba[0, 0, 0] == 1 and rgba[0, 0, 3] == 255
    assert abs((rgba[0, 1, 0] - 1) / 254 * 30 - 2 - 13.0) < 0.1
    assert abs((rgba[0, 1, 2] - 1) / 254 * 30 - 2 - 8.0) < 0.1
