"""NEXUS OSB simülasyon testleri: python -m pytest -q"""
import json

from app.sim.world import World
from app.sim.data import SCENARIOS


def run(w, n):
    for _ in range(n):
        w.tick()


def test_world_builds_and_runs_a_day():
    w = World(seed=1)
    assert len(w.factories) == 30
    run(w, 1440)
    assert len(w.days) == 1
    d = w.days[0]
    assert d["enerji_mwh"] > 500 and d["co2_t"] > 100
    json.dumps(w.live())
    json.dumps(w.static())


def test_outage_keeps_critical_loads_and_stops_others():
    w = World(seed=2)
    run(w, 600)
    w.start_scenario("sebeke_kesintisi")
    run(w, 10)
    assert w.energy.grid_kw == 0
    stopped = [f for f in w.factories if not f.s["kritik"] and f.status == "durdu"]
    assert len(stopped) >= 20
    w.stop_scenario("test")
    assert not w.outage


def test_fleet_pool_reduces_empty_km():
    a, b = World(seed=3), World(seed=3)
    b.logistics.pool = True
    run(a, 1440 * 2)
    run(b, 1440 * 2)
    assert b.logistics.empty_ratio(b.logistics.total) < a.logistics.empty_ratio(a.logistics.total)


def test_symbiosis_approve_creates_link_and_earns():
    w = World(seed=4)
    opp = w.symbiosis.opps[0]
    link = w.symbiosis.approve(opp["id"])
    assert link and link["aktif"]
    run(w, 1440)
    assert w.symbiosis.total["kazanc_tl"] > 0


def test_all_scenarios_start_and_stop():
    w = World(seed=5)
    for k in SCENARIOS:
        assert w.start_scenario(k)
        run(w, 30)
        w.stop_scenario("test")
    assert w.scenario is None


# ------------------------------------------------------------------ v2
from app.sim import foresight


def test_autopilot_makes_decisions():
    w = World(seed=6)
    run(w, 600)
    w.autopilot.set(True)
    run(w, 720)
    assert w.autopilot.stats["karar"] > 0
    assert w.energy.mode == "otomatik"


def test_agents_negotiate_and_pay_credits():
    w = World(seed=7)
    run(w, 1440 * 2)
    assert w.agents.stats["oda"] > 0
    assert len(w.agents.msgs) > 0


def test_masters_cut_downtime():
    w = World(seed=8)
    run(w, 1440 * 2)
    assert w.masters.total["gorev"] > 0


def test_hydrogen_replaces_gas_in_daylight():
    w = World(seed=9)
    run(w, 720)        # gün ortası
    assert w.hydrogen.total["uretim_kg"] > 0


def test_quake_and_leak():
    w = World(seed=10)
    run(w, 600)
    w.start_scenario("deprem")
    assert w.disaster and w.disaster["hasar"]
    run(w, 60)
    w.stop_scenario("t")
    assert w.disaster is None and not w.outage
    w.start_scenario("kimyasal_sizinti")
    run(w, 50)
    assert w.disaster["uzunluk"] > 0
    w.stop_scenario("t")


def test_forecast_and_multiverse_do_not_touch_original():
    w = World(seed=11)
    run(w, 600)
    m0 = w.minute
    fc = foresight.forecast([foresight.clone(w) for _ in range(2)], hours=3)
    assert len(fc["saatler"]) == 3
    r = foresight.multiverse(foresight.clone(w), foresight.clone(w), "klasik", "otopilot", 0.5)
    assert w.minute == m0
    assert "net" in r and r["a"]["toplam"]["fatura_tl"] > 0


# ------------------------------------------------------------------ v2.1
from app import tabular, calibrate
from app.bridge import Bridges, flatten, suggest


def test_custom_zone_builds_and_runs():
    cfg = {"ad": "Test OSB", "sutun": 5, "satir": 2,
           "tesisler": [{"ad": "A Döküm", "sektor": "dokum", "calisan": 200, "ada": [1, 0], "parsel": 2},
                        {"ad": "B Tekstil", "sektor": "tekstil"}, {"ad": "C Gıda", "sektor": "gida", "vardiya": 3}]}
    w = World(seed=12, cfg=cfg)
    assert w.name == "Test OSB" and len(w.factories) == 3
    a = w.factories[0]
    assert (a.parcel["c"], a.parcel["r"], a.parcel["slot"]) == (1, 0, 2)
    run(w, 1440)
    assert w.days and w.days[0]["enerji_mwh"] > 0
    assert len(w.export_cfg()["tesisler"]) == 3
    World(seed=1)       # varsayılan haritayı geri kur


def test_calibration_from_template():
    w = World(seed=13)
    f = w.factories[0]
    rows = tabular.read("sablon.csv", tabular.template_csv().encode())
    res = calibrate.analyze(rows, f)
    assert res["mod"] == "saatlik" and res["profil"] and len(res["profil"]) == 24
    calibrate.apply(f, res)
    assert f.rated_kw == res["yeni"]["kurulu_kw"]
    run(w, 120)


def test_turkish_numbers_and_ptf_file():
    assert tabular.num("1.234,56") == 1234.56 and tabular.num("2,5") == 2.5
    ptf = "Tarih;Saat;PTF (TL/MWh)\n" + "\n".join(f"04.11.2026;{h:02d}:00;{2000 + h}" for h in range(24))
    days = tabular.price_days(tabular.read("p.csv", ptf.encode()))
    assert days["2026-11-04"][5] == 2005


def test_bridge_mapping():
    data = {"hatlar": [{"plc": {"durum": "RUN", "guc_w": 1500000, "oee_yuzde": 80}}]}
    flat = flatten(data)
    assert suggest(flat)["power_kw"] == "hatlar.0.plc.guc_w"
    b = Bridges({}).upsert({"url": "x", "fabrika": "F01", "alanlar": {"power_kw": "hatlar.0.plc.guc_w", "durum": "hatlar.0.plc.durum",
                                                                       "oee": "hatlar.0.plc.oee_yuzde"}, "carpan": {"power_kw": 0.001}})
    out = Bridges({}).convert(b, data)
    assert out["power_kw"] == 1500 and out["durum"] == "calisiyor" and abs(out["oee"] - 0.8) < 1e-9


def test_real_price_and_weather_hooks():
    w = World(seed=14)
    w.real_prices = [2.0] * 8 + [3.0] * 9 + [6.0] * 5 + [2.5] * 2
    w.real_weather = [{"bulut": 100, "sicaklik": 35, "ruzgar": 5, "ruzgar_yon": 270}] * 24
    run(w, 60 * 18)          # 18:00 → pahalı saat
    assert w.period == "puant" and abs(w.tariff - 6.0) < 1e-9
    assert w.energy.cloud < 0.3 and w.wx["sogutma"] > 1.1
