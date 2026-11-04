// NEXUS OSB — uygulama çekirdeği: yönlendirme, canlı bağlantı, üst çubuk, tesis çekmecesi
import { $, $$, h, esc, fmt, api, toast, icon, st, sectorTag, sev, lineChart, PERIOD, PERIOD_COLOR, scoreColor } from "./ui.js";

const PAGES = [
  ["Operasyon", [["komuta", "Komuta Merkezi", "komuta"], ["harita", "Canlı Harita", "harita"], ["ikiz3d", "3D Dijital İkiz", "kup"], ["tesisler", "Tesisler", "tesis"], ["kriz", "Kriz Merkezi", "kriz"], ["ustalar", "Usta Havuzu", "kisi"]]],
  ["Altyapı", [["enerji", "Enerji & Hidrojen", "enerji"], ["lojistik", "Lojistik & Filo", "lojistik"], ["su", "Su & Arıtma", "su"]]],
  ["Döngüsel Ekonomi", [["simbiyoz", "Endüstriyel Simbiyoz", "simbiyoz"], ["muzakere", "Müzakere Odası", "sohbet"], ["karbon", "Karbon Merkezi", "karbon"], ["pazaryeri", "Kapasite Pazaryeri", "pazar"]]],
  ["Zekâ", [["otopilot", "Otopilot", "otopilot"], ["beyin", "Bölge Beyni", "beyin"], ["tahmin", "Gelecek Tahmini", "tahmin"], ["evrenler", "Paralel Evrenler", "evren"], ["senaryolar", "Senaryo & Afet Lab", "senaryo"], ["raporlar", "Raporlar", "rapor"]]],
  ["Sistem", [["veri", "Gerçek Veri", "dunya"], ["tasarim", "Bölge Tasarımcısı", "cetvel"], ["entegrasyon", "Entegrasyon", "entegrasyon"]]],
];
const TITLES = Object.fromEntries(PAGES.flatMap(([, l]) => l.map(([k, t]) => [k, t])));
const SUBS = {
  komuta: "Bölgenin tamamı tek ekranda", harita: "30 tesis · 48 araç · ortak altyapı", tesisler: "Tesis bazında canlı performans",
  kriz: "Olay yönetimi ve müdahale", enerji: "GES · batarya · trafolar · tarife", lojistik: "Ortak filo ve kapı yönetimi",
  su: "Merkezi arıtma ve geri kazanım", simbiyoz: "Bir tesisin atığı, diğerinin hammaddesi", karbon: "Kapsam 1-2, lojistik, SKDM",
  pazaryeri: "Atıl kapasite paylaşımı", beyin: "Yerel yapay zekâ operasyon müdürü", senaryolar: "Ya olursa? Canlı stres testleri",
  raporlar: "Gün sonu bölge raporları", entegrasyon: "Gerçek tesisleri bağla",
  ikiz3d: "Bölgenin üç boyutlu canlı kopyası", ustalar: "Uzman bilgisi tesisler arasında paylaşılır", muzakere: "Tesis ajanları OSB Kredisi ile pazarlık ediyor",
  otopilot: "Bölge kendini yönetiyor — her karar gerekçesiyle", veri: "EPİAŞ fiyatı · hava durumu · geçmiş veri · Fabrika OS köprüsü",
  tasarim: "Kendi OSB'ni çiz, tesislerini yerleştir", tahmin: "Monte Carlo · önümüzdeki 24 saat", evrenler: "Aynı bölge, iki farklı gelecek",
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

// ---------------------------------------------------------- iskelet
function shell() {
  document.body.innerHTML = `<div class="app">
    <aside class="side" id="side"><div class="brand"><div class="brand-mark"><span>N</span></div><div><b>NEXUS OSB</b><small id="bname">Sanayi Bölgesi İşletim Sistemi</small></div></div>
      <nav class="nav">${PAGES.map(([g, l]) => `<div class="nav-group">${g}</div>` + l.map(([k, t, ic]) => `<a href="#/${k}" data-k="${k}">${icon(ic)}<span>${t}</span>${k === "kriz" ? `<span class="badge" id="nb-kriz" style="display:none"></span>` : ""}</a>`).join("")).join("")}</nav>
      <div class="side-foot"><span class="dot" id="conn"></span><span id="conn-t">Bağlanıyor…</span><div style="margin-top:4px">v2.1 · yerel · Docker</div></div></aside>
    <div class="main">
      <header class="top"><button class="hamb" id="hamb">☰</button><h1 id="ttl">—</h1>
        <span class="scn-banner" id="scn"></span>
        <button class="pill ap-pill" id="ap" title="Otopilot">✈ Otopilot <b>KAPALI</b></button>
        <button class="pill tour-pill" id="tourbtn" title="Rehberli sunum">▶ Sunum Modu</button>
        <span class="pill clock" title="Simülasyon saati"><span id="clk-d" class="muted">GÜN —</span><b id="clk">--:--</b></span>
        <span class="pill" id="tar" title="Elektrik tarife dilimi"><span class="sw"></span><span></span></span>
        <span class="pill" id="hl" title="Bölge sağlık skoru">Sağlık <b>—</b></span>
        <a class="pill" id="real" href="#/veri" style="display:none;color:inherit" title="Gerçek veri bağlı"></a>
        <span class="speed" id="spd">${[[0, "⏸"], ["rt", "⏱ Gerçek"], [1, "1×"], [5, "5×"], [20, "20×"], [60, "60×"]].map(([v, t]) => `<button data-v="${v}" ${v === "rt" ? 'title="Gerçek zaman: 1 sn = 1 sn (saat gerçek saate eşitlenir)"' : ""}>${t}</button>`).join("")}</span>
      </header>
      <main class="content" id="page"></main>
    </div></div>
    <div class="drawer-bg" id="dbg"></div><aside class="drawer" id="drw"></aside><div class="toasts" id="toasts"></div>`;
  $("#hamb").onclick = () => $("#side").classList.toggle("on");
  $$("#spd button").forEach((b) => b.onclick = async () => {
    if (b.dataset.v === "rt") { await api("/sim/esitle", {}); const r = await api("/sim", { tps: 1 / 60, paused: false }); S.tps = r.tps; S.paused = false; paintSpeed(); toast("⏱ Gerçek zaman: simülasyon saati gerçek saate eşitlendi", "ok"); return; }
    const v = +b.dataset.v;
    const r = await api("/sim", v === 0 ? { paused: true } : { tps: v, paused: false });
    S.tps = r.tps; S.paused = r.duraklatildi; paintSpeed();
  });
  $("#dbg").onclick = closeDrawer;
  $("#ap").onclick = async () => { const r = await api("/otopilot", { aktif: !(S.live && S.live.ap) }); toast(r.aktif ? "✈ Otopilot devrede — bölge kendini yönetiyor" : "Otopilot kapatıldı", r.aktif ? "ok" : ""); };
  $("#tourbtn").onclick = () => import("./tour.js").then((m) => m.default(ctx));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
}
function paintSpeed() {
  $$("#spd button").forEach((b) => b.classList.toggle("on", S.paused ? b.dataset.v === "0" : b.dataset.v === "rt" ? S.tps < 0.5 : +b.dataset.v === S.tps));
}

// ---------------------------------------------------------- canlı bağlantı
function connect() {
  const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws");
  S.ws = ws;
  ws.onopen = () => { S.connected = true; $("#conn").classList.add("on"); $("#conn-t").textContent = "Canlı bağlantı"; };
  ws.onclose = () => { S.connected = false; $("#conn").classList.remove("on"); $("#conn-t").textContent = "Yeniden bağlanıyor…"; setTimeout(connect, 1500); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.tip === "yeniden") { toast("Bölge yeniden kuruldu — sayfa yenileniyor…", "ok"); setTimeout(() => location.reload(), 900); return; }
    if (m.tip !== "canli") return;
    S.live = m.v; S.tps = m.tps;
    paintTop();
    if (S.page && S.page.update) { try { S.page.update(S.live, ctx); } catch (e) { console.error(e); } }
  };
}
function paintTop() {
  const l = S.live;
  $("#clk").textContent = l.saat;
  $("#clk-d").textContent = `GÜN ${l.gun}`;
  const tp = $("#tar");
  tp.querySelector(".sw").style.background = PERIOD_COLOR[l.k.tarife];
  tp.querySelector("span:last-child").innerHTML = `${PERIOD[l.k.tarife]} <b>${fmt.n(l.k.fiyat, 2)} ₺/kWh</b>`;
  $("#hl").innerHTML = `Sağlık <b style="color:${scoreColor(l.saglik)}">${l.saglik}</b>`;
  const rl = $("#real"), g = l.gercek || {};
  if (g.fiyat || g.hava || l.canli_tesis) {
    rl.style.display = "";
    rl.innerHTML = `🌐 ${[g.fiyat ? "PTF" : "", g.hava ? `${g.sicaklik ?? "—"}°C ☁${g.bulut ?? "—"}%` : "", l.canli_tesis ? `${l.canli_tesis} canlı tesis` : ""].filter(Boolean).join(" · ")}`;
  } else rl.style.display = "none";
  const ap = $("#ap");
  ap.classList.toggle("on", !!l.ap);
  ap.querySelector("b").textContent = l.ap ? "AÇIK" : "KAPALI";
  const nb = $("#nb-kriz");
  if (l.o.toplam) { nb.style.display = ""; nb.textContent = l.o.toplam; nb.className = "badge" + (l.o.kritik ? "" : " w"); } else nb.style.display = "none";
  const sc = $("#scn");
  if (l.sc) {
    sc.classList.add("on");
    sc.innerHTML = `⚠ ${esc(l.sc.ad)} · <b class="num">${fmt.dur(l.sc.kalan)}</b> <button id="scn-x">Durdur</button>`;
    $("#scn-x").onclick = () => api("/senaryolar/durdur", {}).then(() => toast("Senaryo durduruldu", "ok"));
  } else sc.classList.remove("on");
  paintSpeed();
  const ev = l.olay_son;
  if (ev && S.lastEvent && (ev.t !== S.lastEvent.t || ev.metin !== S.lastEvent.metin)) {
    if (["olay", "senaryo", "simbiyoz", "pazaryeri", "afet", "evren"].includes(ev.tur)) {
      const k = ev.metin.includes("[KRİTİK]") || ev.metin.includes("[KRITIK]") ? "kritik" : ev.metin.includes("[UYARI]") ? "uyari" : ev.tur === "olay" ? "" : "ok";
      if (!(ev.metin.includes("[BİLGİ]") || ev.metin.includes("[BILGI]"))) toast(`<b>${ev.saat}</b> · ${esc(ev.metin)}`, k);
    }
  }
  S.lastEvent = ev;
}

// ---------------------------------------------------------- yönlendirme
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
  root.innerHTML = `<div class="empty">Yükleniyor…</div>`;
  root.scrollTop = 0;
  try {
    if (!loaders[k]) loaders[k] = (await import(`./pages/${k}.js`)).default;
    S.page = loaders[k];
    S.pageKey = k;
    root.innerHTML = "";
    await S.page.mount(root, ctx);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card"><b>Sayfa yüklenemedi</b><div class="muted">${esc(e.message)}</div></div>`;
  }
}

// ---------------------------------------------------------- hızlı aksiyonlar (Bölge Beyni önerileri)
async function runAction(a) {
  try {
    if (a.tip === "dr") { const r = await api("/enerji/talep-kaydir", {}); toast(`Talep kaydırma: ${r.tesis} tesis 60 dk`, "ok"); }
    else if (a.tip === "bess") { await api("/enerji/ayar", { mod: "otomatik" }); toast("Batarya otomatik moda alındı", "ok"); }
    else if (a.tip === "havuz") { await api("/lojistik/ayar", { havuz: true }); toast("Ortak filo havuzu açıldı", "ok"); }
    else if (a.tip === "simbiyoz") { const l = await api("/simbiyoz/onayla/" + encodeURIComponent(a.id), {}); toast(`Simbiyoz bağlantısı kuruldu: ${esc(l.atik_ad)}`, "ok"); }
    else if (a.tip === "su") { await api("/su/ayar", { geri: 0.25 }); toast("Su geri kazanımı %25", "ok"); }
    else if (a.tip === "pazar") { const c = await api("/pazaryeri/eslestir", { teklif: a.teklif, talep: a.talep }); toast(`Sözleşme kuruldu: ${esc(c.kaynak)}`, "ok"); }
    return true;
  } catch (e) { toast("İşlem yapılamadı: " + esc(e.message), "uyari"); return false; }
}

// ---------------------------------------------------------- tesis çekmecesi
let drawerTimer = null;
async function openFactory(id) {
  const d = $("#drw");
  $("#dbg").classList.add("on"); d.classList.add("on");
  d.innerHTML = `<div class="empty">Yükleniyor…</div>`;
  clearInterval(drawerTimer);
  const render = async () => {
    let f;
    try { f = await api("/fabrikalar/" + id); } catch (e) { d.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const W = S.world, b = f.bugun;
    const keep = d.scrollTop;
    d.innerHTML = `<button class="btn sm x" id="dx">Kapat ✕</button>
      <div class="muted" style="font-size:12px">${f.id} · ${esc(f.tm)} · ${f.vardiya} vardiya · ${fmt.n(f.calisan)} çalışan</div>
      <h2 style="font-size:22px;margin:4px 0 8px">${esc(f.ad)}</h2>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${sectorTag(W, f.sektor)} ${st(f.d)} ${f.canli ? `<span class="tag" style="color:#fda4af">● CANLI VERİ</span>` : ""}
        ${f.dr ? `<span class="tag t-acc">Talep kaydırma aktif</span>` : ""} ${f.kritik ? `<span class="tag">Kritik yük</span>` : ""} ${f.skdm ? `<span class="tag t-warn">SKDM kapsamı</span>` : ""}</div>
      ${f.neden ? `<div class="muted" style="margin-top:6px">${esc(f.neden)}</div>` : ""}
      <div class="kv-grid mt">
        <div><span>Anlık güç</span><b>${fmt.mw(f.kw, 2)} MW</b></div><div><span>Kurulu güç</span><b>${fmt.mw(f.kurulu_kw, 1)} MW</b></div><div><span>OEE</span><b>${fmt.pct(f.oee)}</b></div>
        <div><span>Üretim / saat</span><b>${fmt.n(f.uretim_saat)} ${esc(f.birim)}</b></div><div><span>Gaz</span><b>${fmt.n(f.gaz_m3h)} m³/sa</b></div><div><span>Su</span><b>${fmt.n(f.su_m3h, 1)} m³/sa</b></div>
        <div><span>Bugün enerji</span><b>${fmt.n(b.kwh / 1000, 1)} MWh</b></div><div><span>Bugün CO₂</span><b>${fmt.n(b.co2_kg / 1000, 1)} t</b></div><div><span>Bugün ciro</span><b>${fmt.ktl(b.ciro_tl)}</b></div>
        <div><span>Bugün maliyet</span><b>${fmt.ktl(b.maliyet_tl)}</b></div><div><span>Duruş</span><b>${fmt.n(b.durus_dk)} dk</b></div><div><span>CO₂ yoğunluğu</span><b>${f.co2_yogunluk != null ? fmt.n(f.co2_yogunluk, 1) : "—"}</b></div>
      </div>
      <div class="card flat mt"><div class="card-h"><h3>Güç profili</h3><span class="sub">son 12 saat · kW</span></div><div id="dch"></div></div>
      <div class="card flat mt"><div class="card-h"><h3>Atık & yan ürün</h3><span class="sub">bugün üretilen / stok</span></div>
        ${Object.keys(f.atik_bugun).length ? `<table class="tbl"><tr><th>Tür</th><th class="r">Bugün</th><th class="r">Stok</th></tr>${Object.entries(f.atik_bugun).map(([k, v]) => `<tr><td><span class="tag"><span class="sw" style="background:${W.atiklar[k].renk}"></span>${esc(W.atiklar[k].ad)}</span></td><td class="r num">${fmt.n(v, 2)} ${W.atiklar[k].birim}</td><td class="r num">${fmt.n(f.atik_stok[k], 2)}</td></tr>`).join("")}</table>` : `<div class="empty">Bu tesis kayda değer atık üretmiyor</div>`}
        ${f.kabul.length ? `<div class="muted mt" style="font-size:12.5px">Hammadde olarak kabul eder: ${f.kabul.map((k) => esc(W.atiklar[k].ad)).join(", ")}</div>` : ""}</div>
      <div class="card flat mt"><div class="card-h"><h3>Simbiyoz</h3></div>
        <div class="list">${f.simbiyoz.map((l) => `<div class="item"><div class="ttl">${l.aktif ? "🟢" : "⚪"} ${esc(l.atik_ad)} <span class="muted" style="font-weight:400">${esc(l.ureten_ad)} → ${esc(l.alan_ad)}</span></div><div class="txt">${fmt.n(l.aktarilan, 1)} ${l.birim} aktarıldı · ${fmt.ktl(l.kazanc_tl)} kazanç</div></div>`).join("") || ""}
        ${f.firsatlar.map((o) => `<div class="item"><div class="ttl">${sev("firsat")} ${esc(o.atik_ad)} <span class="muted" style="font-weight:400">${esc(o.ureten_ad)} → ${esc(o.alan_ad)}</span></div><div class="txt">Ayda ≈ ${fmt.ktl(o.aylik_kazanc_tl)} · ${fmt.n(o.aylik_co2_t, 1)} tCO₂ · ${o.tasima}</div>
          <div class="row"><button class="btn sm pri" data-opp="${esc(o.id)}">Onayla</button></div></div>`).join("")}
        ${!f.simbiyoz.length && !f.firsatlar.length ? `<div class="empty">Bağlantı veya fırsat yok</div>` : ""}</div></div>
      <div class="card flat mt"><div class="card-h"><h3>Son olaylar</h3></div><div class="list">${f.olaylar.map((i) => `<div class="item"><div class="ttl">${sev(i.seviye)} ${esc(i.baslik)}</div><div class="txt">${fmt.t(i.zaman)} · ${i.durum === "kapandi" ? "kapandı" : i.durum}</div></div>`).join("") || `<div class="empty">Kayıtlı olay yok</div>`}</div></div>
      <div class="card flat mt"><div class="card-h"><h3>Canlı veri bağla</h3><span class="sub">Fabrika OS / PLC / SCADA</span></div>
        <div class="code">curl -X POST http://localhost:8080/api/veri/${f.id} \\
  -H "content-type: application/json" \\
  -d '{"power_kw": 1250, "durum": "calisiyor", "oee": 0.82, "gecerlilik_dk": 15}'</div></div>`;
    d.scrollTop = keep;
    $("#dx").onclick = closeDrawer;
    $$("[data-opp]", d).forEach((b) => b.onclick = async () => { if (await runAction({ tip: "simbiyoz", id: b.dataset.opp })) render(); });
    const hist = (f.gecmis || []).map((p) => [p[0], p[1]]);
    lineChart($("#dch"), { height: 170, series: [{ label: "Güç", color: f.renk, data: hist, area: true, unit: "kW" }], legend: false, unit: "kW" });
  };
  await render();
  drawerTimer = setInterval(() => { if ($("#drw").classList.contains("on")) render(); }, 4000);
}
function closeDrawer() { clearInterval(drawerTimer); $("#dbg").classList.remove("on"); $("#drw").classList.remove("on"); }

// ---------------------------------------------------------- başlat
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
