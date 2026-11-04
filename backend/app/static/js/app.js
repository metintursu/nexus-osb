// NEXUS OSB — app core: routing, live connection, top bar, site drawer
import { $, $$, h, esc, fmt, api, toast, icon, st, sectorTag, sev, lineChart, PERIOD, PERIOD_COLOR, scoreColor } from "./ui.js";

const PAGES = [
  [L("Operations", "Operasyon"), [["komuta", L("Command Center", "Komuta Merkezi"), "komuta"], ["harita", L("Live Map", "Canlı Harita"), "harita"], ["ikiz3d", L("3D Digital Twin", "3D Dijital İkiz"), "kup"], ["tesisler", L("Sites", "Tesisler"), "tesis"], ["kriz", L("Crisis Center", "Kriz Merkezi"), "kriz"], ["ustalar", L("Technician Pool", "Usta Havuzu"), "kisi"]]],
  [L("Infrastructure", "Altyapı"), [["enerji", L("Energy & Hydrogen", "Enerji & Hidrojen"), "enerji"], ["lojistik", L("Logistics & Fleet", "Lojistik & Filo"), "lojistik"], ["su", L("Water & Treatment", "Su & Arıtma"), "su"]]],
  [L("Circular Economy", "Döngüsel Ekonomi"), [["simbiyoz", L("Industrial Symbiosis", "Endüstriyel Simbiyoz"), "simbiyoz"], ["muzakere", L("Negotiation Room", "Müzakere Odası"), "sohbet"], ["karbon", L("Carbon Center", "Karbon Merkezi"), "karbon"], ["pazaryeri", L("Capacity Marketplace", "Kapasite Pazaryeri"), "pazar"]]],
  [L("Intelligence", "Zekâ"), [["otopilot", L("Autopilot", "Otopilot"), "otopilot"], ["beyin", L("Zone Brain", "Bölge Beyni"), "beyin"], ["tahmin", L("Forecast", "Gelecek Tahmini"), "tahmin"], ["evrenler", L("Parallel Universes", "Paralel Evrenler"), "evren"], ["senaryolar", L("Scenario & Disaster Lab", "Senaryo & Afet Lab"), "senaryo"], ["raporlar", L("Reports", "Raporlar"), "rapor"]]],
  [L("System", "Sistem"), [["veri", L("Real Data", "Gerçek Veri"), "dunya"], ["tasarim", L("Zone Designer", "Bölge Tasarımcısı"), "cetvel"], ["entegrasyon", L("Integration", "Entegrasyon"), "entegrasyon"]]],
];
const TITLES = Object.fromEntries(PAGES.flatMap(([, l]) => l.map(([k, t]) => [k, t])));
const SUBS = {
  komuta: L("The whole zone on one screen", "Bölgenin tamamı tek ekranda"), harita: L("Sites · fleet · shared infrastructure", "30 tesis · 48 araç · ortak altyapı"), tesisler: L("Live performance per site", "Tesis bazında canlı performans"),
  kriz: L("Incident management and response", "Olay yönetimi ve müdahale"), enerji: L("Solar · battery · substations · tariff", "GES · batarya · trafolar · tarife"), lojistik: L("Shared fleet and gate management", "Ortak filo ve kapı yönetimi"),
  su: L("Central treatment and water reuse", "Merkezi arıtma ve geri kazanım"), simbiyoz: L("One plant's waste is another's raw material", "Bir tesisin atığı, diğerinin hammaddesi"), karbon: L("Scope 1-2, logistics, EU CBAM", "Kapsam 1-2, lojistik, SKDM"),
  pazaryeri: L("Sharing idle capacity", "Atıl kapasite paylaşımı"), beyin: L("Local AI operations manager", "Yerel yapay zekâ operasyon müdürü"), senaryolar: L("What if? Live stress tests", "Ya olursa? Canlı stres testleri"),
  raporlar: L("End-of-day zone reports", "Gün sonu bölge raporları"), entegrasyon: L("Connect real plants", "Gerçek tesisleri bağla"),
  ikiz3d: L("A live three-dimensional copy of the zone", "Bölgenin üç boyutlu canlı kopyası"), ustalar: L("Expert know-how shared between plants", "Uzman bilgisi tesisler arasında paylaşılır"), muzakere: L("Plant agents bargaining with Zone Credits", "Tesis ajanları OSB Kredisi ile pazarlık ediyor"),
  otopilot: L("The zone runs itself — every decision with its reason", "Bölge kendini yönetiyor — her karar gerekçesiyle"), veri: L("EPİAŞ price · weather · historical data · Fabrika OS bridge", "EPİAŞ fiyatı · hava durumu · geçmiş veri · Fabrika OS köprüsü"),
  tasarim: L("Draw your own zone and place its plants", "Kendi OSB'ni çiz, tesislerini yerleştir"), tahmin: L("Monte Carlo · the next 24 hours", "Monte Carlo · önümüzdeki 24 saat"), evrenler: L("Same zone, two different futures", "Aynı bölge, iki farklı gelecek"),
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
    <aside class="side" id="side"><div class="brand"><div class="brand-mark"><span>N</span></div><div><b>NEXUS OSB</b><small id="bname">${L(`Industrial Zone Operating System`, `Sanayi Bölgesi İşletim Sistemi`)}</small></div></div>
      <nav class="nav">${PAGES.map(([g, l]) => `<div class="nav-group">${g}</div>` + l.map(([k, t, ic]) => `<a href="#/${k}" data-k="${k}">${icon(ic)}<span>${t}</span>${k === "kriz" ? `<span class="badge" id="nb-kriz" style="display:none"></span>` : ""}</a>`).join("")).join("")}</nav>
      <div class="side-foot"><span class="dot" id="conn"></span><span id="conn-t">${L(`Connecting…`, `Bağlanıyor…`)}</span><div class="lang-row"><span>${L(`v2.3 · local · Docker`, `v2.3 · yerel · Docker`)}</span>
        <span class="seg lang-seg" id="lang" title="${L(`Language`, `Dil`)}"><button data-l="en" class="${LANG === "en" ? "on" : ""}">EN</button><button data-l="tr" class="${LANG === "tr" ? "on" : ""}">TR</button></span></div></div></aside>
    <div class="main">
      <header class="top"><button class="hamb" id="hamb">☰</button><h1 id="ttl">—</h1>
        <span class="scn-banner" id="scn"></span>
        <button class="pill ap-pill" id="ap" title="${L(`Autopilot`, `Otopilot`)}">${L(`✈ Autopilot`, `✈ Otopilot`)} <b>${L(`OFF`, `KAPALI`)}</b></button>
        <button class="pill tour-pill" id="tourbtn" title="${L(`Guided presentation`, `Rehberli sunum`)}">${L(`▶ Presentation Mode`, `▶ Sunum Modu`)}</button>
        <span class="pill clock" title="${L(`Simulation clock`, `Simülasyon saati`)}"><span id="clk-d" class="muted">${L(`DAY —`, `GÜN —`)}</span><b id="clk">--:--</b></span>
        <span class="pill" id="tar" title="${L(`Electricity tariff band`, `Elektrik tarife dilimi`)}"><span class="sw"></span><span></span></span>
        <span class="pill" id="hl" title="${L(`Zone health score`, `Bölge sağlık skoru`)}">${L(`Health`, `Sağlık`)} <b>—</b></span>
        <a class="pill" id="real" href="#/veri" style="display:none;color:inherit" title="${L(`Real data connected`, `Gerçek veri bağlı`)}"></a>
        <span class="speed" id="spd">${[[0, "⏸"], ["rt", L("⏱ Real", "⏱ Gerçek")], [1, "1×"], [5, "5×"], [20, "20×"], [60, "60×"]].map(([v, t]) => `<button data-v="${v}" ${v === "rt" ? L('title="Real time: 1 s = 1 s (clock synced to real time)"', 'title="Gerçek zaman: 1 sn = 1 sn (saat gerçek saate eşitlenir)"') : ""}>${t}</button>`).join("")}</span>
      </header>
      <main class="content" id="page"></main>
    </div></div>
    <div class="drawer-bg" id="dbg"></div><aside class="drawer" id="drw"></aside><div class="toasts" id="toasts"></div>`;
  $("#hamb").onclick = () => $("#side").classList.toggle("on");
  $$("#spd button").forEach((b) => b.onclick = async () => {
    if (b.dataset.v === "rt") { await api("/sim/esitle", {}); const r = await api("/sim", { tps: 1 / 60, paused: false }); S.tps = r.tps; S.paused = false; paintSpeed(); toast(L("⏱ Real time: simulation clock synced to the real clock", "⏱ Gerçek zaman: simülasyon saati gerçek saate eşitlendi"), "ok"); return; }
    const v = +b.dataset.v;
    const r = await api("/sim", v === 0 ? { paused: true } : { tps: v, paused: false });
    S.tps = r.tps; S.paused = r.duraklatildi; paintSpeed();
  });
  $("#dbg").onclick = closeDrawer;
  $("#ap").onclick = async () => { const r = await api("/otopilot", { aktif: !(S.live && S.live.ap) }); toast(r.aktif ? L("✈ Autopilot engaged — the zone is running itself", "✈ Otopilot devrede — bölge kendini yönetiyor") : L("Autopilot disengaged", "Otopilot kapatıldı"), r.aktif ? "ok" : ""); };
  $("#tourbtn").onclick = () => import("./tour.js").then((m) => m.default(ctx));
  $$("#lang button").forEach((b) => b.onclick = () => switchLang(b.dataset.l));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
}
async function switchLang(lang) {
  if (lang === LANG) return;
  const T = lang === "tr" ? ["Dil değiştiriliyor…", "Bölge Türkçe olarak yeniden kuruluyor, birkaç saniye sürer."] : ["Switching language…", "The zone is being rebuilt in English, this takes a few seconds."];
  document.body.insertAdjacentHTML("beforeend", `<div class="lang-wait"><div><b>${T[0]}</b><div class="muted mt">${T[1]}</div></div></div>`);
  try { await api("/dil", { dil: lang }); } catch (e) { toast(esc(e.message), "uyari"); document.querySelector(".lang-wait").remove(); return; }
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try { const d = await fetch("/api/dil").then((r) => r.json()); if (d.dil === lang) { const h = await fetch("/api/saglik"); if (h.ok) break; } } catch (_) {}
  }
  location.reload();
}
function paintSpeed() {
  $$("#spd button").forEach((b) => b.classList.toggle("on", S.paused ? b.dataset.v === "0" : b.dataset.v === "rt" ? S.tps < 0.5 : +b.dataset.v === S.tps));
}

// ---------------------------------------------------------- live connection
function connect() {
  const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  S.ws = ws;
  ws.onopen = () => { S.connected = true; $("#conn").classList.add("on"); $("#conn-t").textContent = L("Live connection", "Canlı bağlantı"); };
  ws.onclose = () => { S.connected = false; $("#conn").classList.remove("on"); $("#conn-t").textContent = L("Reconnecting…", "Yeniden bağlanıyor…"); setTimeout(connect, 1500); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.tip === "yeniden") { toast(L("Zone rebuilt — reloading the page…", "Bölge yeniden kuruldu — sayfa yenileniyor…"), "ok"); setTimeout(() => location.reload(), 900); return; }
    if (m.tip !== "canli") return;
    S.live = m.v; S.tps = m.tps;
    paintTop();
    if (S.page && S.page.update) { try { S.page.update(S.live, ctx); } catch (e) { console.error(e); } }
  };
}
function paintTop() {
  const l = S.live;
  $("#clk").textContent = l.saat;
  $("#clk-d").textContent = `${L(`DAY`, `GÜN`)} ${l.gun}`;
  const tp = $("#tar");
  tp.querySelector(".sw").style.background = PERIOD_COLOR[l.k.tarife];
  tp.querySelector("span:last-child").innerHTML = `${PERIOD[l.k.tarife]} ${L("rate", "tarife")} <b>${fmt.price(l.k.fiyat, 2)}/kWh</b>`;
  $("#hl").innerHTML = `${L(`Health <b style="color:`, `Sağlık <b style="color:`)}${scoreColor(l.saglik)}">${l.saglik}</b>`;
  const rl = $("#real"), g = l.gercek || {};
  if (g.fiyat || g.hava || l.canli_tesis) {
    rl.style.display = "";
    rl.innerHTML = `🌐 ${[g.fiyat ? L("MCP", "PTF") : "", g.hava ? `${g.sicaklik ?? "—"}°C ☁${g.bulut ?? "—"}%` : "", l.canli_tesis ? L(`${l.canli_tesis} live site${l.canli_tesis > 1 ? "s" : ""}`, `${l.canli_tesis} canlı tesis`) : ""].filter(Boolean).join(" · ")}`;
  } else rl.style.display = "none";
  const ap = $("#ap");
  ap.classList.toggle("on", !!l.ap);
  ap.querySelector("b").textContent = l.ap ? L("ON", "AÇIK") : L("OFF", "KAPALI");
  const nb = $("#nb-kriz");
  if (l.o.toplam) { nb.style.display = ""; nb.textContent = l.o.toplam; nb.className = "badge" + (l.o.kritik ? "" : " w"); } else nb.style.display = "none";
  const sc = $("#scn");
  if (l.sc) {
    sc.classList.add("on");
    sc.innerHTML = `⚠ ${esc(l.sc.ad)} · <b class="num">${fmt.dur(l.sc.kalan)}</b> <button id="scn-x">${L(`Stop`, `Durdur`)}</button>`;
    $("#scn-x").onclick = () => api("/senaryolar/durdur", {}).then(() => toast(L("Scenario stopped", "Senaryo durduruldu"), "ok"));
  } else sc.classList.remove("on");
  paintSpeed();
  const ev = l.olay_son;
  if (ev && S.lastEvent && (ev.t !== S.lastEvent.t || ev.metin !== S.lastEvent.metin)) {
    if (["olay", "senaryo", "simbiyoz", "pazaryeri", "afet", "evren"].includes(ev.tur)) {
      const k = ev.metin.includes(L("[CRITICAL]", "[KRİTİK]")) ? "kritik" : ev.metin.includes(L("[WARNING]", "[UYARI]")) ? "uyari" : ev.tur === "olay" ? "" : "ok";
      if (!ev.metin.includes(L("[INFO]", "[BİLGİ]"))) toast(`<b>${ev.saat}</b> · ${esc(ev.metin)}`, k);
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
  root.innerHTML = `<div class="empty">${L(`Loading…`, `Yükleniyor…`)}</div>`;
  root.scrollTop = 0;
  try {
    if (!loaders[k]) loaders[k] = (await import(`./pages/${k}.js`)).default;
    S.page = loaders[k];
    S.pageKey = k;
    root.innerHTML = "";
    await S.page.mount(root, ctx);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card"><b>${L(`Page failed to load`, `Sayfa yüklenemedi`)}</b><div class="muted">${esc(e.message)}</div></div>`;
  }
}

// ---------------------------------------------------------- quick actions (Zone Brain recommendations)
async function runAction(a) {
  try {
    if (a.tip === "dr") { const r = await api("/enerji/talep-kaydir", {}); toast(`${L(`Load shift:`, `Talep kaydırma:`)} ${r.tesis} ${L(`sites for 60 min`, `tesis 60 dk`)}`, "ok"); }
    else if (a.tip === "bess") { await api("/enerji/ayar", { mod: "otomatik" }); toast(L("Battery set to auto mode", "Batarya otomatik moda alındı"), "ok"); }
    else if (a.tip === "havuz") { await api("/lojistik/ayar", { havuz: true }); toast(L("Shared fleet pool opened", "Ortak filo havuzu açıldı"), "ok"); }
    else if (a.tip === "simbiyoz") { const l = await api("/simbiyoz/onayla/" + encodeURIComponent(a.id), {}); toast(`${L(`Symbiosis link created:`, `Simbiyoz bağlantısı kuruldu:`)} ${esc(l.atik_ad)}`, "ok"); }
    else if (a.tip === "su") { await api("/su/ayar", { geri: 0.25 }); toast(L("Water reuse set to 25%", "Su geri kazanımı %25"), "ok"); }
    else if (a.tip === "pazar") { const c = await api("/pazaryeri/eslestir", { teklif: a.teklif, talep: a.talep }); toast(`${L(`Contract created:`, `Sözleşme kuruldu:`)} ${esc(c.kaynak)}`, "ok"); }
    return true;
  } catch (e) { toast(L("Action failed: ", "İşlem yapılamadı: ") + esc(e.message), "uyari"); return false; }
}

// ---------------------------------------------------------- site drawer
let drawerTimer = null;
async function openFactory(id) {
  const d = $("#drw");
  $("#dbg").classList.add("on"); d.classList.add("on");
  d.innerHTML = `<div class="empty">${L(`Loading…`, `Yükleniyor…`)}</div>`;
  clearInterval(drawerTimer);
  const render = async () => {
    let f;
    try { f = await api("/fabrikalar/" + id); } catch (e) { d.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const W = S.world, b = f.bugun;
    const keep = d.scrollTop;
    d.innerHTML = `<button class="btn sm x" id="dx">${L(`Close ✕`, `Kapat ✕`)}</button>
      <div class="muted" style="font-size:12px">${f.id} · ${esc(f.tm)} · ${f.vardiya} ${L(`shift(s) ·`, `vardiya ·`)} ${fmt.n(f.calisan)} ${L(`employees`, `çalışan`)}</div>
      <h2 style="font-size:22px;margin:4px 0 8px">${esc(f.ad)}</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${sectorTag(W, f.sektor)} ${st(f.d)} ${f.canli ? `<span class="tag" style="color:#fda4af">${L(`● LIVE DATA`, `● CANLI VERİ`)}</span>` : ""}
        ${f.dr ? `<span class="tag t-acc">${L(`Load shift active`, `Talep kaydırma aktif`)}</span>` : ""} ${f.kritik ? `<span class="tag">${L(`Critical load`, `Kritik yük`)}</span>` : ""} ${f.skdm ? `<span class="tag t-warn">${L(`EU CBAM scope`, `SKDM kapsamı`)}</span>` : ""}</div>
      ${f.neden ? `<div class="muted" style="margin-top:6px">${esc(f.neden)}</div>` : ""}
      <div class="kv-grid mt">
        <div><span>${L(`Current power`, `Anlık güç`)}</span><b>${fmt.mw(f.kw, 2)} MW</b></div><div><span>${L(`Installed power`, `Kurulu güç`)}</span><b>${fmt.mw(f.kurulu_kw, 1)} MW</b></div><div><span>OEE</span><b>${fmt.pct(f.oee)}</b></div>
        <div><span>${L(`Output / hour`, `Üretim / saat`)}</span><b>${fmt.n(f.uretim_saat)} ${esc(f.birim)}</b></div><div><span>${L(`Gas`, `Gaz`)}</span><b>${fmt.n(f.gaz_m3h)} m³/h</b></div><div><span>${L(`Water`, `Su`)}</span><b>${fmt.n(f.su_m3h, 1)} m³/h</b></div>
        <div><span>${L(`Energy today`, `Bugün enerji`)}</span><b>${fmt.n(b.kwh / 1000, 1)} MWh</b></div><div><span>${L(`CO₂ today`, `Bugün CO₂`)}</span><b>${fmt.n(b.co2_kg / 1000, 1)} t</b></div><div><span>${L(`Revenue today`, `Bugün ciro`)}</span><b>${fmt.ktl(b.ciro_tl)}</b></div>
        <div><span>${L(`Cost today`, `Bugün maliyet`)}</span><b>${fmt.ktl(b.maliyet_tl)}</b></div><div><span>${L(`Downtime`, `Duruş`)}</span><b>${fmt.n(b.durus_dk)} ${L(`min`, `dk`)}</b></div><div><span>${L(`CO₂ intensity`, `CO₂ yoğunluğu`)}</span><b>${f.co2_yogunluk != null ? fmt.n(f.co2_yogunluk, 1) : "—"}</b></div>
      </div>
      <div class="card flat mt"><div class="card-h"><h3>${L(`Power profile`, `Güç profili`)}</h3><span class="sub">${L(`last 12 hours · kW`, `son 12 saat · kW`)}</span></div><div id="dch"></div></div>
      <div class="card flat mt"><div class="card-h"><h3>${L(`Waste & by-products`, `Atık & yan ürün`)}</h3><span class="sub">${L(`generated today / in stock`, `bugün üretilen / stok`)}</span></div>
        ${Object.keys(f.atik_bugun).length ? `<table class="tbl"><tr><th>${L(`Type`, `Tür`)}</th><th class="r">${L(`Today`, `Bugün`)}</th><th class="r">${L(`Stock`, `Stok`)}</th></tr>${Object.entries(f.atik_bugun).map(([k, v]) => `<tr><td><span class="tag"><span class="sw" style="background:${W.atiklar[k].renk}"></span>${esc(W.atiklar[k].ad)}</span></td><td class="r num">${fmt.n(v, 2)} ${W.atiklar[k].birim}</td><td class="r num">${fmt.n(f.atik_stok[k], 2)}</td></tr>`).join("")}</table>` : `<div class="empty">${L(`This site produces no significant waste`, `Bu tesis kayda değer atık üretmiyor`)}</div>`}
        ${f.kabul.length ? `<div class="muted mt" style="font-size:12.5px">${L(`Accepts as raw material:`, `Hammadde olarak kabul eder:`)} ${f.kabul.map((k) => esc(W.atiklar[k].ad)).join(", ")}</div>` : ""}</div>
      <div class="card flat mt"><div class="card-h"><h3>${L(`Symbiosis`, `Simbiyoz`)}</h3></div>
        <div class="list">${f.simbiyoz.map((l) => `<div class="item"><div class="ttl">${l.aktif ? "🟢" : "⚪"} ${esc(l.atik_ad)} <span class="muted" style="font-weight:400">${esc(l.ureten_ad)} → ${esc(l.alan_ad)}</span></div><div class="txt">${fmt.n(l.aktarilan, 1)} ${l.birim} ${L(`transferred ·`, `aktarıldı ·`)} ${fmt.ktl(l.kazanc_tl)} ${L(`gained`, `kazanç`)}</div></div>`).join("") || ""}
        ${f.firsatlar.map((o) => `<div class="item"><div class="ttl">${sev("firsat")} ${esc(o.atik_ad)} <span class="muted" style="font-weight:400">${esc(o.ureten_ad)} → ${esc(o.alan_ad)}</span></div><div class="txt">≈ ${fmt.ktl(o.aylik_kazanc_tl)}/month · ${fmt.n(o.aylik_co2_t, 1)} tCO₂ · ${o.tasima}</div>
          <div class="row"><button class="btn sm pri" data-opp="${esc(o.id)}${L(`">Approve`, `">Onayla`)}</button></div></div>`).join("")}
        ${!f.simbiyoz.length && !f.firsatlar.length ? `<div class="empty">${L(`No links or opportunities`, `Bağlantı veya fırsat yok`)}</div>` : ""}</div></div>
      <div class="card flat mt"><div class="card-h"><h3>${L(`Recent incidents`, `Son olaylar`)}</h3></div><div class="list">${f.olaylar.map((i) => `<div class="item"><div class="ttl">${sev(i.seviye)} ${esc(i.baslik)}</div><div class="txt">${fmt.t(i.zaman)} · ${i.durum === "kapandi" ? L("closed", "kapandı") : i.durum === "mudahale" ? "in response" : "open"}</div></div>`).join("") || `<div class="empty">${L(`No recorded incidents`, `Kayıtlı olay yok`)}</div>`}</div></div>
      <div class="card flat mt"><div class="card-h"><h3>${L(`Connect live data`, `Canlı veri bağla`)}</h3><span class="sub">Fabrika OS / PLC / SCADA</span></div>
        <div class="code">curl -X POST http://localhost:8080/api/veri/${f.id} \\
  -H "content-type: application/json" \\
  -d '{"power_kw": 1250, "durum": "calisiyor", "oee": 0.82, "gecerlilik_dk": 15}'</div></div>`;
    d.scrollTop = keep;
    $("#dx").onclick = closeDrawer;
    $$("[data-opp]", d).forEach((b) => b.onclick = async () => { if (await runAction({ tip: "simbiyoz", id: b.dataset.opp })) render(); });
    const hist = (f.gecmis || []).map((p) => [p[0], p[1]]);
    lineChart($("#dch"), { height: 170, series: [{ label: L("Power", "Güç"), color: f.renk, data: hist, area: true, unit: "kW" }], legend: false, unit: "kW" });
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
