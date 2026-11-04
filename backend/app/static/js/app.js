// NEXUS OSB — app core: routing, live connection, top bar, site drawer
import { $, $$, h, esc, fmt, api, toast, icon, st, sectorTag, sev, lineChart, PERIOD, PERIOD_COLOR, scoreColor } from "./ui.js";

const PAGES = [
  ["Operations", [["komuta", "Command Center", "komuta"], ["harita", "Live Map", "harita"], ["ikiz3d", "3D Digital Twin", "kup"], ["tesisler", "Sites", "tesis"], ["kriz", "Crisis Center", "kriz"], ["ustalar", "Technician Pool", "kisi"]]],
  ["Infrastructure", [["enerji", "Energy & Hydrogen", "enerji"], ["lojistik", "Logistics & Fleet", "lojistik"], ["su", "Water & Treatment", "su"]]],
  ["Circular Economy", [["simbiyoz", "Industrial Symbiosis", "simbiyoz"], ["muzakere", "Negotiation Room", "sohbet"], ["karbon", "Carbon Center", "karbon"], ["pazaryeri", "Capacity Marketplace", "pazar"]]],
  ["Intelligence", [["otopilot", "Autopilot", "otopilot"], ["beyin", "Zone Brain", "beyin"], ["tahmin", "Forecast", "tahmin"], ["evrenler", "Parallel Universes", "evren"], ["senaryolar", "Scenario & Disaster Lab", "senaryo"], ["raporlar", "Reports", "rapor"]]],
  ["System", [["veri", "Real Data", "dunya"], ["tasarim", "Zone Designer", "cetvel"], ["entegrasyon", "Integration", "entegrasyon"]]],
];
const TITLES = Object.fromEntries(PAGES.flatMap(([, l]) => l.map(([k, t]) => [k, t])));
const SUBS = {
  komuta: "The whole zone on one screen", harita: "Sites · fleet · shared infrastructure", tesisler: "Live performance per site",
  kriz: "Incident management and response", enerji: "Solar · battery · substations · tariff", lojistik: "Shared fleet and gate management",
  su: "Central treatment and water reuse", simbiyoz: "One plant's waste is another's raw material", karbon: "Scope 1-2, logistics, EU CBAM",
  pazaryeri: "Sharing idle capacity", beyin: "Local AI operations manager", senaryolar: "What if? Live stress tests",
  raporlar: "End-of-day zone reports", entegrasyon: "Connect real plants",
  ikiz3d: "A live three-dimensional copy of the zone", ustalar: "Expert know-how shared between plants", muzakere: "Plant agents bargaining with Zone Credits",
  otopilot: "The zone runs itself — every decision with its reason", veri: "EPİAŞ price · weather · historical data · Fabrika OS bridge",
  tasarim: "Draw your own zone and place its plants", tahmin: "Monte Carlo · the next 24 hours", evrenler: "Same zone, two different futures",
};

const S = { world: null, live: null, tps: 1, page: null, pageKey: null, polls: [], ws: null, connected: false, lastEvent: null };
export const ctx = {
  S,
  get world() { return S.world; },
  live: () => S.live,
  tps: () => S.tps,
  api, toast,
  go: (k) => { location.hash = "#/" + k; },
  openFactory,
  runAction,
  poll(fn, ms) {
    const key = S.pageKey, safe = async () => { try { await fn(); } catch (e) { if (S.pageKey === key) console.warn(e); } };
    safe(); const id = setInterval(safe, ms); S.polls.push(id); return id;
  },
};

// ---------------------------------------------------------- layout
function shell() {
  document.body.innerHTML = `<div class="app">
    <aside class="side" id="side"><div class="brand"><div class="brand-mark"><span>N</span></div><div><b>NEXUS OSB</b><small id="bname">Industrial Zone Operating System</small></div></div>
      <nav class="nav">${PAGES.map(([g, l]) => `<div class="nav-group">${g}</div>` + l.map(([k, t, ic]) => `<a href="#/${k}" data-k="${k}">${icon(ic)}<span>${t}</span>${k === "kriz" ? `<span class="badge" id="nb-kriz" style="display:none"></span>` : ""}</a>`).join("")).join("")}</nav>
      <div class="side-foot"><span class="dot" id="conn"></span><span id="conn-t">Connecting…</span><div style="margin-top:4px">v2.2 · local · Docker</div></div></aside>
    <div class="main">
      <header class="top"><button class="hamb" id="hamb">☰</button><h1 id="ttl">—</h1>
        <span class="scn-banner" id="scn"></span>
        <button class="pill ap-pill" id="ap" title="Autopilot">✈ Autopilot <b>OFF</b></button>
        <button class="pill tour-pill" id="tourbtn" title="Guided presentation">▶ Presentation Mode</button>
        <span class="pill clock" title="Simulation clock"><span id="clk-d" class="muted">DAY —</span><b id="clk">--:--</b></span>
        <span class="pill" id="tar" title="Electricity tariff band"><span class="sw"></span><span></span></span>
        <span class="pill" id="hl" title="Zone health score">Health <b>—</b></span>
        <a class="pill" id="real" href="#/veri" style="display:none;color:inherit" title="Real data connected"></a>
        <span class="speed" id="spd">${[[0, "⏸"], ["rt", "⏱ Real"], [1, "1×"], [5, "5×"], [20, "20×"], [60, "60×"]].map(([v, t]) => `<button data-v="${v}" ${v === "rt" ? 'title="Real time: 1 s = 1 s (clock synced to real time)"' : ""}>${t}</button>`).join("")}</span>
      </header>
      <main class="content" id="page"></main>
    </div></div>
    <div class="drawer-bg" id="dbg"></div><aside class="drawer" id="drw"></aside><div class="toasts" id="toasts"></div>`;
  $("#hamb").onclick = () => $("#side").classList.toggle("on");
  $$("#spd button").forEach((b) => b.onclick = async () => {
    if (b.dataset.v === "rt") { await api("/sim/esitle", {}); const r = await api("/sim", { tps: 1 / 60, paused: false }); S.tps = r.tps; S.paused = false; paintSpeed(); toast("⏱ Real time: simulation clock synced to the real clock", "ok"); return; }
    const v = +b.dataset.v;
    const r = await api("/sim", v === 0 ? { paused: true } : { tps: v, paused: false });
    S.tps = r.tps; S.paused = r.duraklatildi; paintSpeed();
  });
  $("#dbg").onclick = closeDrawer;
  $("#ap").onclick = async () => { const r = await api("/otopilot", { aktif: !(S.live && S.live.ap) }); toast(r.aktif ? "✈ Autopilot engaged — the zone is running itself" : "Autopilot disengaged", r.aktif ? "ok" : ""); };
  $("#tourbtn").onclick = () => import("./tour.js").then((m) => m.default(ctx));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
}
function paintSpeed() {
  $$("#spd button").forEach((b) => b.classList.toggle("on", S.paused ? b.dataset.v === "0" : b.dataset.v === "rt" ? S.tps < 0.5 : +b.dataset.v === S.tps));
}

// ---------------------------------------------------------- live connection
function connect() {
  const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  S.ws = ws;
  ws.onopen = () => { S.connected = true; $("#conn").classList.add("on"); $("#conn-t").textContent = "Live connection"; };
  ws.onclose = () => { S.connected = false; $("#conn").classList.remove("on"); $("#conn-t").textContent = "Reconnecting…"; setTimeout(connect, 1500); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.tip === "yeniden") { toast("Zone rebuilt — reloading the page…", "ok"); setTimeout(() => location.reload(), 900); return; }
    if (m.tip !== "canli") return;
    S.live = m.v; S.tps = m.tps;
    paintTop();
    if (S.page && S.page.update) { try { S.page.update(S.live, ctx); } catch (e) { console.error(e); } }
  };
}
function paintTop() {
  const l = S.live;
  $("#clk").textContent = l.saat;
  $("#clk-d").textContent = `DAY ${l.gun}`;
  const tp = $("#tar");
  tp.querySelector(".sw").style.background = PERIOD_COLOR[l.k.tarife];
  tp.querySelector("span:last-child").innerHTML = `${PERIOD[l.k.tarife]} rate <b>₺${fmt.n(l.k.fiyat, 2)}/kWh</b>`;
  $("#hl").innerHTML = `Health <b style="color:${scoreColor(l.saglik)}">${l.saglik}</b>`;
  const rl = $("#real"), g = l.gercek || {};
  if (g.fiyat || g.hava || l.canli_tesis) {
    rl.style.display = "";
    rl.innerHTML = `🌐 ${[g.fiyat ? "MCP" : "", g.hava ? `${g.sicaklik ?? "—"}°C ☁${g.bulut ?? "—"}%` : "", l.canli_tesis ? `${l.canli_tesis} live site${l.canli_tesis > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ")}`;
  } else rl.style.display = "none";
  const ap = $("#ap");
  ap.classList.toggle("on", !!l.ap);
  ap.querySelector("b").textContent = l.ap ? "ON" : "OFF";
  const nb = $("#nb-kriz");
  if (l.o.toplam) { nb.style.display = ""; nb.textContent = l.o.toplam; nb.className = "badge" + (l.o.kritik ? "" : " w"); } else nb.style.display = "none";
  const sc = $("#scn");
  if (l.sc) {
    sc.classList.add("on");
    sc.innerHTML = `⚠ ${esc(l.sc.ad)} · <b class="num">${fmt.dur(l.sc.kalan)}</b> <button id="scn-x">Stop</button>`;
    $("#scn-x").onclick = () => api("/senaryolar/durdur", {}).then(() => toast("Scenario stopped", "ok"));
  } else sc.classList.remove("on");
  paintSpeed();
  const ev = l.olay_son;
  if (ev && S.lastEvent && (ev.t !== S.lastEvent.t || ev.metin !== S.lastEvent.metin)) {
    if (["olay", "senaryo", "simbiyoz", "pazaryeri", "afet", "evren"].includes(ev.tur)) {
      const k = ev.metin.includes("[CRITICAL]") ? "kritik" : ev.metin.includes("[WARNING]") ? "uyari" : ev.tur === "olay" ? "" : "ok";
      if (!ev.metin.includes("[INFO]")) toast(`<b>${ev.saat}</b> · ${esc(ev.metin)}`, k);
    }
  }
  S.lastEvent = ev;
}

// ---------------------------------------------------------- routing
const loaders = {};
async function route() {
  const key = (location.hash.replace(/^#\/?/, "") || "komuta").split("?")[0];
  const k = TITLES[key] ? key : "komuta";
  if (S.page && S.page.unmount) try { S.page.unmount(); } catch (_) {}
  S.polls.forEach(clearInterval); S.polls = [];
  $$(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.k === k));
  $("#side").classList.remove("on");
  $("#ttl").innerHTML = `${TITLES[k]} <small>${SUBS[k] || ""}</small>`;
  const root = $("#page");
  root.innerHTML = `<div class="empty">Loading…</div>`;
  root.scrollTop = 0;
  try {
    if (!loaders[k]) loaders[k] = (await import(`./pages/${k}.js`)).default;
    S.page = loaders[k];
    S.pageKey = k;
    root.innerHTML = "";
    await S.page.mount(root, ctx);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card"><b>Page failed to load</b><div class="muted">${esc(e.message)}</div></div>`;
  }
}

// ---------------------------------------------------------- quick actions (Zone Brain recommendations)
async function runAction(a) {
  try {
    if (a.tip === "dr") { const r = await api("/enerji/talep-kaydir", {}); toast(`Load shift: ${r.tesis} sites for 60 min`, "ok"); }
    else if (a.tip === "bess") { await api("/enerji/ayar", { mod: "otomatik" }); toast("Battery set to auto mode", "ok"); }
    else if (a.tip === "havuz") { await api("/lojistik/ayar", { havuz: true }); toast("Shared fleet pool opened", "ok"); }
    else if (a.tip === "simbiyoz") { const l = await api("/simbiyoz/onayla/" + encodeURIComponent(a.id), {}); toast(`Symbiosis link created: ${esc(l.atik_ad)}`, "ok"); }
    else if (a.tip === "su") { await api("/su/ayar", { geri: 0.25 }); toast("Water reuse set to 25%", "ok"); }
    else if (a.tip === "pazar") { const c = await api("/pazaryeri/eslestir", { teklif: a.teklif, talep: a.talep }); toast(`Contract created: ${esc(c.kaynak)}`, "ok"); }
    return true;
  } catch (e) { toast("Action failed: " + esc(e.message), "uyari"); return false; }
}

// ---------------------------------------------------------- site drawer
let drawerTimer = null;
async function openFactory(id) {
  const d = $("#drw");
  $("#dbg").classList.add("on"); d.classList.add("on");
  d.innerHTML = `<div class="empty">Loading…</div>`;
  clearInterval(drawerTimer);
  const render = async () => {
    let f;
    try { f = await api("/fabrikalar/" + id); } catch (e) { d.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const W = S.world, b = f.bugun;
    const keep = d.scrollTop;
    d.innerHTML = `<button class="btn sm x" id="dx">Close ✕</button>
      <div class="muted" style="font-size:12px">${f.id} · ${esc(f.tm)} · ${f.vardiya} shift(s) · ${fmt.n(f.calisan)} employees</div>
      <h2 style="font-size:22px;margin:4px 0 8px">${esc(f.ad)}</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${sectorTag(W, f.sektor)} ${st(f.d)} ${f.canli ? `<span class="tag" style="color:#fda4af">● LIVE DATA</span>` : ""}
        ${f.dr ? `<span class="tag t-acc">Load shift active</span>` : ""} ${f.kritik ? `<span class="tag">Critical load</span>` : ""} ${f.skdm ? `<span class="tag t-warn">EU CBAM scope</span>` : ""}</div>
      ${f.neden ? `<div class="muted" style="margin-top:6px">${esc(f.neden)}</div>` : ""}
      <div class="kv-grid mt">
        <div><span>Current power</span><b>${fmt.mw(f.kw, 2)} MW</b></div><div><span>Installed power</span><b>${fmt.mw(f.kurulu_kw, 1)} MW</b></div><div><span>OEE</span><b>${fmt.pct(f.oee)}</b></div>
        <div><span>Output / hour</span><b>${fmt.n(f.uretim_saat)} ${esc(f.birim)}</b></div><div><span>Gas</span><b>${fmt.n(f.gaz_m3h)} m³/h</b></div><div><span>Water</span><b>${fmt.n(f.su_m3h, 1)} m³/h</b></div>
        <div><span>Energy today</span><b>${fmt.n(b.kwh / 1000, 1)} MWh</b></div><div><span>CO₂ today</span><b>${fmt.n(b.co2_kg / 1000, 1)} t</b></div><div><span>Revenue today</span><b>${fmt.ktl(b.ciro_tl)}</b></div>
        <div><span>Cost today</span><b>${fmt.ktl(b.maliyet_tl)}</b></div><div><span>Downtime</span><b>${fmt.n(b.durus_dk)} min</b></div><div><span>CO₂ intensity</span><b>${f.co2_yogunluk != null ? fmt.n(f.co2_yogunluk, 1) : "—"}</b></div>
      </div>
      <div class="card flat mt"><div class="card-h"><h3>Power profile</h3><span class="sub">last 12 hours · kW</span></div><div id="dch"></div></div>
      <div class="card flat mt"><div class="card-h"><h3>Waste & by-products</h3><span class="sub">generated today / in stock</span></div>
        ${Object.keys(f.atik_bugun).length ? `<table class="tbl"><tr><th>Type</th><th class="r">Today</th><th class="r">Stock</th></tr>${Object.entries(f.atik_bugun).map(([k, v]) => `<tr><td><span class="tag"><span class="sw" style="background:${W.atiklar[k].renk}"></span>${esc(W.atiklar[k].ad)}</span></td><td class="r num">${fmt.n(v, 2)} ${W.atiklar[k].birim}</td><td class="r num">${fmt.n(f.atik_stok[k], 2)}</td></tr>`).join("")}</table>` : `<div class="empty">This site produces no significant waste</div>`}
        ${f.kabul.length ? `<div class="muted mt" style="font-size:12.5px">Accepts as raw material: ${f.kabul.map((k) => esc(W.atiklar[k].ad)).join(", ")}</div>` : ""}</div>
      <div class="card flat mt"><div class="card-h"><h3>Symbiosis</h3></div>
        <div class="list">${f.simbiyoz.map((l) => `<div class="item"><div class="ttl">${l.aktif ? "🟢" : "⚪"} ${esc(l.atik_ad)} <span class="muted" style="font-weight:400">${esc(l.ureten_ad)} → ${esc(l.alan_ad)}</span></div><div class="txt">${fmt.n(l.aktarilan, 1)} ${l.birim} transferred · ${fmt.ktl(l.kazanc_tl)} gained</div></div>`).join("") || ""}
        ${f.firsatlar.map((o) => `<div class="item"><div class="ttl">${sev("firsat")} ${esc(o.atik_ad)} <span class="muted" style="font-weight:400">${esc(o.ureten_ad)} → ${esc(o.alan_ad)}</span></div><div class="txt">≈ ${fmt.ktl(o.aylik_kazanc_tl)}/month · ${fmt.n(o.aylik_co2_t, 1)} tCO₂ · ${o.tasima}</div>
          <div class="row"><button class="btn sm pri" data-opp="${esc(o.id)}">Approve</button></div></div>`).join("")}
        ${!f.simbiyoz.length && !f.firsatlar.length ? `<div class="empty">No links or opportunities</div>` : ""}</div></div>
      <div class="card flat mt"><div class="card-h"><h3>Recent incidents</h3></div><div class="list">${f.olaylar.map((i) => `<div class="item"><div class="ttl">${sev(i.seviye)} ${esc(i.baslik)}</div><div class="txt">${fmt.t(i.zaman)} · ${i.durum === "kapandi" ? "closed" : i.durum === "mudahale" ? "in response" : "open"}</div></div>`).join("") || `<div class="empty">No recorded incidents</div>`}</div></div>
      <div class="card flat mt"><div class="card-h"><h3>Connect live data</h3><span class="sub">Fabrika OS / PLC / SCADA</span></div>
        <div class="code">curl -X POST http://localhost:8080/api/veri/${f.id} \\
  -H "content-type: application/json" \\
  -d '{"power_kw": 1250, "durum": "calisiyor", "oee": 0.82, "gecerlilik_dk": 15}'</div></div>`;
    d.scrollTop = keep;
    $("#dx").onclick = closeDrawer;
    $$("[data-opp]", d).forEach((b) => b.onclick = async () => { if (await runAction({ tip: "simbiyoz", id: b.dataset.opp })) render(); });
    const hist = (f.gecmis || []).map((p) => [p[0], p[1]]);
    lineChart($("#dch"), { height: 170, series: [{ label: "Power", color: f.renk, data: hist, area: true, unit: "kW" }], legend: false, unit: "kW" });
  };
  await render();
  drawerTimer = setInterval(() => { if ($("#drw").classList.contains("on")) render(); }, 4000);
}
function closeDrawer() { clearInterval(drawerTimer); $("#dbg").classList.remove("on"); $("#drw").classList.remove("on"); }

// ---------------------------------------------------------- boot
(async function boot() {
  shell();
  S.world = await api("/dunya");
  if (S.world.bolge_ad) { $("#bname").textContent = S.world.bolge_ad; document.title = `${S.world.bolge_ad} · NEXUS OSB`; }
  S.live = await api("/canli");
  const sim = await api("/sim");
  S.tps = sim.tps; S.paused = sim.duraklatildi;
  paintTop(); paintSpeed();
  connect();
  window.addEventListener("hashchange", route);
  route();
})();
