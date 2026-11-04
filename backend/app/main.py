"""NEXUS OSB — Industrial Zone Operating System · API + live stream + UI server."""
import asyncio
import json
from urllib.parse import unquote
import os
import queue
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import ai, store, realdata, calibrate, tabular
from .bridge import Bridges
from .sim.world import World
from .sim import foresight

STATIC = os.path.join(os.path.dirname(__file__), "static")
SEED = int(os.getenv("NEXUS_SEED", "42"))
PREWARM_MIN = int(os.getenv("NEXUS_PREWARM_MIN", str(1440 + 8 * 60)))   # start on day 2 at 08:00
BOLGE_PATH = os.path.join(store.DATA_DIR, "bolge.json")

settings = realdata.load_settings()
pricing = realdata.Pricing(settings)
weather = realdata.Weather(settings)
bridges = Bridges(settings)
calib = settings.get("kalibrasyon", {})          # plant name -> analysis result


def load_zone():
    try:
        with open(BOLGE_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:  # noqa: BLE001
        return None


def make_world(cfg):
    w = World(seed=SEED, logger=store.log_event, cfg=cfg)
    w.on_day = store.save_day
    for f in w.factories:
        res = calib.get(f.ad)
        if res:
            try:
                calibrate.apply(f, res)
            except Exception:  # noqa: BLE001
                pass
    return w


def persist():
    realdata.save_settings({"fiyat": pricing.settings(), "hava": weather.settings(), "kopruler": bridges.settings(), "kalibrasyon": calib})


def push_real():
    world.real_prices = pricing.prices_kwh()
    world.real_weather = weather.hours if (weather.enabled and weather.status == "ok") else None


world = make_world(load_zone())
sim = {"tps": 1.0, "paused": False, "started": time.time(), "ticks": 0}
clients: set = set()
ingest_q: "queue.Queue" = queue.Queue()
mqtt_info = {"aktif": False, "host": os.getenv("MQTT_HOST", ""), "mesaj": 0, "hata": None}


# ---------------------------------------------------------------- MQTT bridge (optional)
def start_mqtt():
    host = mqtt_info["host"]
    if not host:
        return
    try:
        import paho.mqtt.client as mqtt

        def on_connect(c, u, flags, rc, props=None):
            c.subscribe("nexus/fabrika/+/telemetri")
            mqtt_info["aktif"] = True

        def on_message(c, u, msg):
            try:
                fid = msg.topic.split("/")[2]
                ingest_q.put((fid, json.loads(msg.payload.decode("utf-8"))))
                mqtt_info["mesaj"] += 1
            except Exception as e:  # noqa: BLE001
                mqtt_info["hata"] = str(e)

        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="nexus-osb")
        client.on_connect = on_connect
        client.on_message = on_message
        client.connect_async(host, int(os.getenv("MQTT_PORT", "1883")))
        client.loop_start()
        mqtt_info["client"] = client
    except Exception as e:  # noqa: BLE001
        mqtt_info["hata"] = str(e)


def apply_ingest(fid, data):
    f = world.fmap.get(fid)
    if not f:
        return False
    f.canli = True
    f.canli_until = world.minute + int(data.get("gecerlilik_dk", 15))
    f.canli_data = {k: data[k] for k in ("power_kw", "uretim_dk", "durum", "oee") if k in data}
    return True


async def broadcast(msg):
    dead = []
    for ws in list(clients):
        try:
            await ws.send_text(msg)
        except Exception:  # noqa: BLE001
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)


# ---------------------------------------------------------------- simulation loop
async def sim_loop():
    last_send, last, acc = 0.0, time.perf_counter(), 0.0
    while True:
        await asyncio.sleep(0.05)
        now = time.perf_counter()
        dt, last = now - last, now
        if sim["paused"]:
            continue
        acc += dt * sim["tps"]
        n = min(int(acc), 12)
        acc -= int(acc)
        for _ in range(n):
            while not ingest_q.empty():
                apply_ingest(*ingest_q.get_nowait())
            world.tick()
            sim["ticks"] += 1
            c = mqtt_info.get("client")
            if c and mqtt_info["aktif"] and world.minute % 10 == 0:
                try:
                    c.publish("nexus/bolge/kpi", json.dumps(world.kpis(), ensure_ascii=False))
                except Exception:  # noqa: BLE001
                    pass
        if clients and ((n and now - last_send >= 0.095) or now - last_send >= 1.0):
            last_send = now
            await broadcast(json.dumps({"tip": "canli", "v": world.live(), "tps": sim["tps"]}, ensure_ascii=False))


async def real_loop():
    """Real data: bridges (every few seconds), prices (15 min), weather (30 min)."""
    t_price = t_wx = 0.0
    while True:
        try:
            await bridges.tick(apply_ingest)
            now = time.time()
            if pricing.mode == "epias" and now - t_price > 900:
                t_price = now
                await pricing.refresh()
            if weather.enabled and now - t_wx > 1800:
                t_wx = now
                await weather.refresh()
            push_real()
        except Exception as e:  # noqa: BLE001
            print("real_loop:", e)
        await asyncio.sleep(2)


@asynccontextmanager
async def lifespan(app):
    t0 = time.time()
    if pricing.mode == "epias":
        await pricing.refresh()
    if weather.enabled:
        await weather.refresh()
    push_real()
    for _ in range(PREWARM_MIN):
        world.tick()
    store.enable(True)
    world.log("sistem", f"NEXUS OSB started · {world.name} · {len(world.factories)} sites · warm-up {time.time()-t0:.1f} s")
    start_mqtt()
    task = asyncio.create_task(sim_loop())
    task2 = asyncio.create_task(real_loop())
    asyncio.create_task(ai.status())
    yield
    task.cancel()
    task2.cancel()


app = FastAPI(title="NEXUS OSB — Industrial Zone Operating System", version="2.2.0", lifespan=lifespan)


# ---------------------------------------------------------------- modeller
class Speed(BaseModel):
    tps: float | None = None
    paused: bool | None = None


class EnergySet(BaseModel):
    mod: str | None = None
    dr_aktif: bool | None = None
    rezerv: float | None = None


class LogSet(BaseModel):
    havuz: bool


class WaterSet(BaseModel):
    geri: float


class MatchReq(BaseModel):
    teklif: str
    talep: str


class ActionReq(BaseModel):
    aksiyon: str


class ChatReq(BaseModel):
    mesaj: str
    gecmis: list | None = None


class ModelReq(BaseModel):
    model: str


class Toggle(BaseModel):
    aktif: bool


class RuleReq(BaseModel):
    kural: str
    acik: bool


class VerseReq(BaseModel):
    a: str = "klasik"
    b: str = "otopilot"
    gun: float = 3


forecast_cache = {"dk": -10 ** 9, "veri": None, "calisiyor": False}
verse_state = {"calisiyor": False, "sonuc": None}


# ---------------------------------------------------------------- endpoints
@app.get("/api/saglik")
def health_check():
    return {"durum": "ok", "dk": world.minute, "gun": world.day, "saat": world.clock()}


@app.get("/api/dunya")
def api_world():
    return world.static()


@app.get("/api/canli")
def api_live():
    return world.live()


@app.get("/api/ozet")
def api_summary():
    return {"kpi": world.kpis(), "saglik": world.health(), "icgoruler": world.insights, "olaylar": world.events[-40:][::-1],
            "senaryo": world.scenario, "gecmis": world.history[-288:], "bugun": world.day_summary()}


@app.get("/api/gecmis")
def api_history(n: int = 288):
    return world.history[-max(1, min(n, 864)):]


@app.get("/api/fabrikalar")
def api_factories():
    return [f.detail(world) | {"gecmis": None} for f in world.factories]


@app.get("/api/fabrikalar/{fid}")
def api_factory(fid: str):
    f = world.fmap.get(fid)
    if not f:
        raise HTTPException(404, "Site not found")
    d = f.detail(world)
    d["simbiyoz"] = [l for l in world.symbiosis.links if f.id in (l["ureten"], l["alan"])]
    d["firsatlar"] = [o for o in world.symbiosis.opps if f.id in (o["ureten"], o["alan"])][:6]
    d["olaylar"] = [i for i in world.incidents.items if i["fabrika"] == f.id][-10:][::-1]
    return d


@app.get("/api/enerji")
def api_energy():
    return world.energy.detail(world) | {"gecmis": world.history[-288:]}


@app.post("/api/enerji/ayar")
def api_energy_set(r: EnergySet):
    e = world.energy
    if r.mod in ("otomatik", "puant", "kapali"):
        e.mode = r.mod
        world.log("enerji", f"Battery mode: {dict(otomatik='auto', puant='peak only', kapali='off')[r.mod]}")
    if r.dr_aktif is not None:
        e.dr_enabled = r.dr_aktif
        world.log("enerji", f"Demand response {'on' if r.dr_aktif else 'off'}")
    if r.rezerv is not None:
        e.reserve = max(0.0, min(0.8, r.rezerv))
    return e.detail(world)


@app.post("/api/enerji/talep-kaydir")
def api_dr():
    n = world.energy.demand_response(world, None, 60)
    world.log("enerji", f"Operator load-shift call: {n} sites for 60 min")
    return {"tesis": n}


@app.get("/api/lojistik")
def api_logistics():
    return world.logistics.detail()


@app.post("/api/lojistik/ayar")
def api_logistics_set(r: LogSet):
    world.logistics.pool = r.havuz
    world.log("lojistik", f"Shared fleet pool {'opened' if r.havuz else 'closed'}")
    return world.logistics.live()


@app.get("/api/simbiyoz")
def api_symbiosis():
    return world.symbiosis.detail()


@app.post("/api/simbiyoz/onayla/{oid:path}")
def api_sym_approve(oid: str):
    l = world.symbiosis.approve(oid)
    if not l:
        raise HTTPException(400, "The opportunity is no longer valid")
    world.symbiosis.compute_opps()
    return l


@app.post("/api/simbiyoz/durdur/{lid}")
def api_sym_stop(lid: str):
    l = world.symbiosis.stop(lid)
    if not l:
        raise HTTPException(404, "Link not found")
    world.symbiosis.compute_opps()
    return l


@app.get("/api/karbon")
def api_carbon():
    return world.carbon()


@app.get("/api/pazaryeri")
def api_market():
    return world.market.detail()


@app.post("/api/pazaryeri/eslestir")
def api_market_match(r: MatchReq):
    c = world.market.match(r.teklif, r.talep)
    if not c:
        raise HTTPException(400, "Invalid match")
    return c


@app.get("/api/su")
def api_water():
    return world.water.detail(world)


@app.post("/api/su/ayar")
def api_water_set(r: WaterSet):
    world.water.reuse = max(0.0, min(0.45, r.geri))
    world.log("su", f"Water reuse rate {world.water.reuse*100:.0f}%")
    return world.water.live()


@app.get("/api/olaylar")
def api_incidents():
    return world.incidents.detail()


@app.post("/api/olaylar/{iid}")
def api_incident_action(iid: str, r: ActionReq):
    inc = world.incidents.action(iid, r.aksiyon)
    if not inc:
        raise HTTPException(404, "Incident not found")
    return inc


@app.get("/api/senaryolar")
def api_scenarios():
    from .sim.data import SCENARIOS
    return {"liste": SCENARIOS, "aktif": world.scenario, "gecmis": world.scenario_log[::-1][:20]}


@app.post("/api/senaryolar/{key}/baslat")
def api_scenario_start(key: str):
    s = world.start_scenario(key)
    if not s:
        raise HTTPException(404, "No such scenario")
    return s


@app.post("/api/senaryolar/durdur")
def api_scenario_stop():
    world.stop_scenario("Stopped by operator")
    return {"ok": True}


@app.get("/api/sim")
def api_sim():
    return {"tps": sim["tps"], "duraklatildi": sim["paused"], "dk": world.minute, "gun": world.day, "saat": world.clock(),
            "adim": sim["ticks"], "kayit": store.count(), "mqtt": {k: v for k, v in mqtt_info.items() if k != "client"}}


@app.post("/api/sim")
def api_sim_set(r: Speed):
    if r.tps is not None:
        sim["tps"] = max(1 / 60, min(60.0, r.tps))
    if r.paused is not None:
        sim["paused"] = r.paused
    return api_sim()


@app.post("/api/veri/{fid}")
def api_ingest(fid: str, data: dict):
    """Data from a real plant: {"power_kw": 1250, "durum": "calisiyor", "uretim_dk": 12.5, "oee": 0.81, "gecerlilik_dk": 15}"""
    if not apply_ingest(fid, data):
        raise HTTPException(404, "Site not found")
    world.log("entegrasyon", f"Live data received: {world.fmap[fid].ad}")
    return {"ok": True, "fabrika": fid, "gecerli_dk": data.get("gecerlilik_dk", 15)}


@app.get("/api/raporlar")
def api_reports():
    return {"gunler": world.days[::-1], "bugun": world.day_summary()}


@app.get("/api/kayit")
def api_log(n: int = 200, tur: str | None = None):
    return store.recent_events(min(n, 1000), tur)


@app.get("/api/beyin/icgoruler")
def api_insights():
    return {"icgoruler": world.insights, "saglik": world.health()}


@app.get("/api/beyin/durum")
async def api_ai_status():
    return await ai.status()


@app.post("/api/beyin/model")
async def api_ai_model(r: ModelReq):
    await ai.status()
    if not ai.set_model(r.model):
        raise HTTPException(400, "Model not found")
    return await ai.status()


@app.post("/api/beyin/sohbet")
async def api_ai_chat(r: ChatReq):
    return await ai.chat(world, r.mesaj, r.gecmis)


# ---------------------------------------------------------------- v2: autopilot, agents, technicians, H2, foresight
@app.get("/api/otopilot")
def api_ap():
    return world.autopilot.detail()


@app.post("/api/otopilot")
def api_ap_set(r: Toggle):
    world.autopilot.set(r.aktif)
    return world.autopilot.detail()


@app.post("/api/otopilot/kural")
def api_ap_rule(r: RuleReq):
    if r.kural in world.autopilot.rules:
        world.autopilot.rules[r.kural] = r.acik
    return world.autopilot.detail()


@app.post("/api/otopilot/onayla/{oid:path}")
def api_ap_approve(oid: str):
    l = world.autopilot.approve_pending(oid)
    if not l:
        raise HTTPException(400, "No pending decision found")
    return l


@app.get("/api/muzakere")
def api_agents():
    return world.agents.detail()


@app.post("/api/muzakere/otonom")
def api_agents_auto(r: Toggle):
    world.agents.otonom = r.aktif
    world.log("muzakere", f"Agent authority: {'autonomous' if r.aktif else 'advisory'}")
    return {"otonom": r.aktif}


@app.post("/api/muzakere/onayla/{rid}")
def api_agents_approve(rid: str):
    l = world.agents.approve(rid)
    if not l:
        raise HTTPException(400, "No deal to approve")
    return l


@app.get("/api/ustalar")
def api_masters():
    return world.masters.detail()


@app.get("/api/hidrojen")
def api_h2():
    return world.hydrogen.detail()


@app.post("/api/hidrojen")
def api_h2_set(r: Toggle):
    world.hydrogen.enabled = r.aktif
    world.log("enerji", f"Hydrogen Valley {'online' if r.aktif else 'offline'}")
    return world.hydrogen.detail()


@app.get("/api/afet")
def api_disaster():
    return {"aktif": world.disaster, "son": world.last_disaster, "ruzgar": world.wind}


@app.get("/api/tahmin")
async def api_forecast(yenile: bool = False):
    fc = forecast_cache
    if fc["veri"] and not yenile and world.minute - fc["dk"] < 30:
        return fc["veri"] | {"yas_dk": world.minute - fc["dk"]}
    if fc["calisiyor"]:
        return (fc["veri"] or {}) | {"hazirlaniyor": True}
    fc["calisiyor"] = True
    try:
        snaps = [foresight.clone(world) for _ in range(6)]
        t0 = time.time()
        res = await asyncio.to_thread(foresight.forecast, snaps, 24)
        res["sure_sn"] = round(time.time() - t0, 1)
        res["baslangic"] = world.minute
        fc["veri"], fc["dk"] = res, world.minute
    finally:
        fc["calisiyor"] = False
    return fc["veri"] | {"yas_dk": 0}


@app.get("/api/evrenler")
def api_verse_info():
    return {"politikalar": foresight.POLICIES, "calisiyor": verse_state["calisiyor"], "sonuc": verse_state["sonuc"]}


@app.post("/api/evrenler")
async def api_verse(r: VerseReq):
    if r.a not in foresight.POLICIES or r.b not in foresight.POLICIES:
        raise HTTPException(400, "No such policy")
    if verse_state["calisiyor"]:
        raise HTTPException(409, "A comparison is already running")
    verse_state["calisiyor"] = True
    try:
        A, B = foresight.clone(world), foresight.clone(world)
        res = await asyncio.to_thread(foresight.multiverse, A, B, r.a, r.b, max(0.5, min(7.0, r.gun)))
        res["baslangic"] = world.minute
        verse_state["sonuc"] = res
        world.log("evren", f"Parallel universes: {res['a']['ad']} vs {res['b']['ad']} · {r.gun} day(s)")
        return res
    finally:
        verse_state["calisiyor"] = False


# ---------------------------------------------------------------- v2.1: real data, bridge, calibration, zone design
class PriceSet(BaseModel):
    mod: str | None = None
    sabit_bilesen: float | None = None


class Cred(BaseModel):
    kullanici: str
    sifre: str


class WxSet(BaseModel):
    aktif: bool | None = None
    ad: str | None = None
    lat: float | None = None
    lon: float | None = None


class ProbeReq(BaseModel):
    url: str
    basliklar: dict | None = None


def _calib_list():
    return [{"fabrika": f.id, "fabrika_ad": f.ad, **(f.kalibre or {})} for f in world.factories if f.kalibre]


@app.get("/api/gercek")
def api_real():
    return {"fiyat": pricing.detail(), "hava": weather.detail(), "kopruler": bridges.detail(), "kalibrasyon": _calib_list(),
            "simdi": realdata.now().isoformat(timespec="minutes"), "sim_saat": world.clock(), "tps": sim["tps"]}


@app.post("/api/gercek/fiyat")
async def api_price_set(r: PriceSet):
    if r.mod in ("simule", "epias", "dosya"):
        pricing.mode = r.mod
    if r.sabit_bilesen is not None:
        pricing.fee = max(0.0, min(10.0, r.sabit_bilesen))
    if pricing.mode == "epias":
        await pricing.refresh()
    push_real()
    persist()
    world.log("enerji", f"Electricity price source: {dict(simule='simulated', epias='EPİAŞ live', dosya='file')[pricing.mode]}")
    return pricing.detail()


@app.post("/api/gercek/fiyat/giris")
async def api_price_cred(r: Cred):
    pricing.set_session_cred(r.kullanici.strip(), r.sifre)
    pricing.mode = "epias"
    await pricing.refresh()
    push_real()
    persist()
    return pricing.detail()


@app.post("/api/gercek/fiyat/dosya")
async def api_price_file(request: Request):
    name = unquote(request.headers.get("x-dosya-adi", "ptf.csv"))
    raw = await request.body()
    try:
        days = pricing.load_file(name, raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))
    pricing.mode = "dosya"
    push_real()
    persist()
    world.log("enerji", f"PTF file loaded: {name} · {len(days)} days")
    return pricing.detail()


@app.post("/api/gercek/hava")
async def api_wx_set(r: WxSet):
    if r.ad and r.ad in realdata.CITIES and r.lat is None:
        weather.name = r.ad
        weather.lat, weather.lon = realdata.CITIES[r.ad]
    elif r.lat is not None and r.lon is not None:
        weather.lat, weather.lon = r.lat, r.lon
        weather.name = r.ad or f"{r.lat:.2f}, {r.lon:.2f}"
    if r.aktif is not None:
        weather.enabled = r.aktif
    if weather.enabled:
        await weather.refresh()
    push_real()
    persist()
    return weather.detail()


@app.post("/api/sim/esitle")
def api_sim_sync():
    """Syncs the simulation clock to real time (forward only; crossing midnight closes the day)."""
    real = realdata.now()
    target = real.hour * 60 + real.minute
    cur = world.minute % 1440
    if target < cur:
        world.minute = (world.minute // 1440 + 1) * 1440 - 1
        world.tick()           # day close
        cur = 0
    world.minute += target - cur
    world.log("sistem", f"Simulation clock synced to real time: {world.clock()}")
    return {"saat": world.clock(), "gun": world.day}


@app.get("/api/kopru")
def api_bridges():
    return {"kopruler": bridges.detail(), "tesisler": [{"id": f.id, "ad": f.ad} for f in world.factories]}


@app.post("/api/kopru/dene")
async def api_bridge_probe(r: ProbeReq):
    try:
        return await Bridges.probe(r.url, r.basliklar)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Could not read the address: {type(e).__name__}: {str(e)[:200]}")


@app.post("/api/kopru")
def api_bridge_save(b: dict):
    if not b.get("url") or not b.get("fabrika"):
        raise HTTPException(400, "URL and target site are required")
    if b["fabrika"] not in world.fmap:
        raise HTTPException(400, "Target site not found")
    out = bridges.upsert(b)
    persist()
    world.log("entegrasyon", f"Bridge saved: {out.get('ad') or out['url']} → {world.fmap[out['fabrika']].ad}")
    return out


@app.delete("/api/kopru/{bid}")
def api_bridge_delete(bid: str):
    bridges.remove(bid)
    persist()
    return {"ok": True}


@app.get("/api/kalibrasyon/sablon")
def api_calib_template():
    return Response(content="\ufeff" + tabular.template_csv(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=nexus-history-template.csv"})


@app.post("/api/kalibrasyon/{fid}")
async def api_calib(fid: str, request: Request, uygula: bool = False):
    f = world.fmap.get(fid)
    if not f:
        raise HTTPException(404, "Site not found")
    name = unquote(request.headers.get("x-dosya-adi", "veri.csv"))
    try:
        rows = tabular.read(name, await request.body())
        res = calibrate.analyze(rows, f)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, str(e))
    res["dosya"] = name
    if uygula:
        calibrate.apply(f, res)
        calib[f.ad] = res
        persist()
        world.log("entegrasyon", f"Calibration applied: {f.ad} ({res['mod']}, {res['satir']} rows)")
    return res


@app.delete("/api/kalibrasyon/{fid}")
def api_calib_reset(fid: str):
    f = world.fmap.get(fid)
    if not f:
        raise HTTPException(404, "Site not found")
    s = f.s
    f.rated_kw, f.rate_h = s["kw_kisi"] * f.calisan, s["uretim_kisi_saat"] * f.calisan
    f.gaz_k, f.su_k, f.profile, f.kalibre = s["gaz_kisi"], s["su_kisi"], None, None
    calib.pop(f.ad, None)
    persist()
    return {"ok": True}


@app.get("/api/bolge")
def api_zone():
    from .sim import geo
    from .sim.data import SECTORS
    return {"cfg": world.export_cfg(), "ozel": os.path.exists(BOLGE_PATH),
            "sektorler": {k: {"ad": v["ad"], "renk": v["renk"], "kisa": v["kisa"], "calisan": v["calisan"], "vardiya": v["vardiya"]} for k, v in SECTORS.items()},
            "izgara": {"sutun": geo.COLS, "satir": geo.ROWS, "rezerv": {v: list(k) for k, v in geo.RESERVED_BLOCKS.items()}}}


async def _rebuild(cfg, save):
    global world
    try:
        nw = make_world(cfg)
    except Exception as e:  # noqa: BLE001
        from .sim import geo
        geo.configure(world.cfg)    # restore the map layout of the current zone
        raise HTTPException(400, f"Could not build the zone: {e}")
    for _ in range(PREWARM_MIN):
        nw.tick()
    world = nw
    push_real()
    if save:
        with open(BOLGE_PATH, "w", encoding="utf-8") as fh:
            json.dump(cfg, fh, ensure_ascii=False, indent=1)
    elif os.path.exists(BOLGE_PATH):
        os.remove(BOLGE_PATH)
    forecast_cache.update(dk=-10 ** 9, veri=None)
    verse_state["sonuc"] = None
    world.log("sistem", f"Zone rebuilt: {world.name} · {len(world.factories)} sites")
    await broadcast(json.dumps({"tip": "yeniden"}))
    return {"ok": True, "ad": world.name, "tesis": len(world.factories)}


@app.post("/api/bolge")
async def api_zone_set(cfg: dict):
    t = cfg.get("tesisler") or []
    if not t:
        raise HTTPException(400, "At least one site is required")
    if len(t) > 200:
        raise HTTPException(400, "At most 200 sites")
    return await _rebuild(cfg, True)


@app.post("/api/bolge/varsayilan")
async def api_zone_default():
    return await _rebuild(None, False)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    try:
        await ws.send_text(json.dumps({"tip": "canli", "v": world.live(), "tps": sim["tps"]}, ensure_ascii=False))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(ws)


# ---------------------------------------------------------------- UI
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))


@app.exception_handler(404)
async def nf(request, exc):
    if request.url.path.startswith("/api"):
        return JSONResponse({"detail": getattr(exc, "detail", "Not found")}, status_code=404)
    return FileResponse(os.path.join(STATIC, "index.html"))
