import { $, $$, esc, fmt, sev, kpi, setKpi } from "../ui.js";
import { createMap } from "../map.js";

const TIP = { ariza: L("Fault", "Arıza"), bakim: L("Maintenance", "Bakım"), yangin: L("Fire", "Yangın"), isg: L("OHS", "İSG"), trafo: L("Substation", "Trafo"), enerji: L("Energy", "Enerji"), su: L("Water", "Su"), lojistik: "Logistics", deprem: "Earthquake", sizinti: L("Chemical leak", "Lojistik") };
let map, sel = null, filter = "acik", data = null;

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g4">${kpi("i-kr", L("Critical", "Kritik"), "kriz", "#f87171")}${kpi("i-uy", L("Warning", "Uyarı"), "kriz", "#fbbf24")}${kpi("i-bi", L("Info", "Bilgi"), "kriz", "#60a5fa")}${kpi("i-to", L("Logged incidents", "Kayıtlı olay"), "rapor", "#94a3b8")}</div>
    <div class="grid mt" style="grid-template-columns:400px minmax(0,1fr)">
      <div class="card"><div class="card-h"><h3>${L(`Incidents`, `Olaylar`)}</h3><span class="act"><div class="seg" id="if"><button data-f="acik" class="on">${L(`Open`, `Açık`)}</button><button data-f="hepsi">${L(`All`, `Tümü`)}</button></div></span></div>
        <div class="list" id="il" style="max-height:calc(100vh - 290px);overflow:auto"></div></div>
      <div class="grid" style="align-content:start">
        <div class="card" id="idt"><div class="empty">${L(`Select an incident on the left to see details`, `Ayrıntı için soldan bir olay seç`)}</div></div>
        <div class="card" style="padding:10px"><div id="imap"></div></div></div></div>`;
    map = createMap($("#imap"), ctx, { height: 380, layer: "durum", overlays: { lojistik: true, simbiyoz: false, olay: true }, tools: false });
    $$("#if button").forEach((b) => b.onclick = () => { filter = b.dataset.f; $$("#if button").forEach((x) => x.classList.toggle("on", x === b)); this.paint(ctx); });
    ctx.poll(async () => { data = await ctx.api("/olaylar"); this.paint(ctx); }, 2500);
  },
  paint(ctx) {
    if (!data) return;
    const c = data.sayilar;
    setKpi("i-kr", c.kritik, "", L("open", "açık")); setKpi("i-uy", c.uyari, "", L("open", "açık")); setKpi("i-bi", c.bilgi, "", L("open", "açık")); setKpi("i-to", data.olaylar.length, "", L("recent records", "son kayıtlar"));
    const list = data.olaylar.filter((i) => filter === "hepsi" || i.durum !== "kapandi");
    $("#il").innerHTML = list.map((i) => `<div class="item click" data-id="${i.id}" style="${sel === i.id ? "border-color:var(--accent)" : ""}${i.durum === "kapandi" ? ";opacity:.55" : ""}">
      <div class="ttl">${sev(i.seviye)} ${esc(i.baslik)}</div>
      <div class="txt">${TIP[i.tip] || i.tip} · ${i.fabrika_ad ? esc(i.fabrika_ad) + " · " : ""}${fmt.t(i.zaman)} · <b>${i.durum === "acik" ? L("open", "açık") : i.durum === "mudahale" ? L("in response", "müdahalede") : L("closed", "kapandı")}</b></div></div>`).join("") || `<div class="empty">${L(`No open incidents`, `Açık olay yok`)}</div>`;
    $$("#il [data-id]").forEach((el) => el.onclick = () => { sel = el.dataset.id; this.paint(ctx); });
    const i = data.olaylar.find((x) => x.id === sel);
    map.setHighlight(i && i.fabrika ? [i.fabrika] : []);
    if (!i) return;
    const now = ctx.live().t;
    $("#idt").innerHTML = `<div class="card-h"><h3>${sev(i.seviye)} ${esc(i.baslik)}</h3><span class="sub">${i.id} · ${TIP[i.tip] || i.tip}</span>
      <span class="act">${i.durum === "acik" ? `<button class="btn sm" data-a="mudahale">${L(`Start response`, `Müdahaleyi başlat`)}</button>` : ""}${i.durum !== "kapandi" ? `<button class="btn sm pri" data-a="kapat">${L(`Close`, `Kapat`)}</button>` : ""}</span></div>
      <div class="kv-grid"><div><span>${L(`Site`, `Tesis`)}</span><b style="font-family:var(--f-body);font-size:13.5px">${i.fabrika_ad ? `<a href="javascript:void 0" id="if-f">${esc(i.fabrika_ad)}</a>` : L("Zone-wide", "Bölge geneli")}</b></div>
        <div><span>${L(`Opened`, `Açılış`)}</span><b>${fmt.t(i.zaman)}</b></div><div><span>${L(`Duration`, `Süre`)}</span><b>${fmt.dur((i.kapanis || now) - i.zaman)}</b></div></div>
      <div class="mt">${esc(i.detay)}</div>
      ${i.aksiyonlar.length ? `<div class="mt"><div class="muted" style="font-size:12px;margin-bottom:6px">${L(`Recommended response steps`, `Önerilen müdahale adımları`)}</div>${i.aksiyonlar.map((a, n) => `<label style="display:flex;gap:8px;padding:5px 0"><input type="checkbox"> <span>${n + 1}. ${esc(a)}</span></label>`).join("")}</div>` : ""}
      <div class="hr"></div><div class="muted" style="font-size:12px;margin-bottom:4px">${L(`Incident log`, `Olay kaydı`)}</div>
      <div class="feed">${i.kayit.map((k) => `<div><span class="t">${fmt.t(k[0])}</span><span>${esc(k[1])}</span></div>`).join("")}</div>`;
    $$("#idt [data-a]").forEach((b) => b.onclick = async () => { await ctx.api("/olaylar/" + i.id, { aksiyon: b.dataset.a }); data = await ctx.api("/olaylar"); this.paint(ctx); });
    const fl = $("#if-f"); if (fl) fl.onclick = () => ctx.openFactory(i.fabrika);
  },
  update(l) { map && map.update(l); },
  unmount() { map && map.destroy(); map = null; data = null; },
};
