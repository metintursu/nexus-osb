import { $, $$, esc, fmt, kpi, setKpi, bars, TRUCK, ORDER_TIP, lineChart } from "../ui.js";
import { createMap } from "../map.js";

let map, det = null;
const TCOL = { yuklu: "#22d3ee", gidiyor: "#94a3b8", donus: "#64748b", yukleniyor: "#fde68a", bosaltiyor: "#fde68a", kuyrukta: "#f97316", bos: "#334155" };
const OST = { bekliyor: L("waiting", "bekliyor"), atandi: L("assigned", "atandı"), yukleniyor: L("loading", "yükleniyor"), yolda: L("en route", "yolda"), kuyrukta: L("queued", "kuyrukta"), bosaltiyor: L("unloading", "boşaltıyor"), teslim: L("delivered", "teslim edildi") };

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g6">
      ${kpi("l-akt", L("Active vehicles", "Aktif araç"), "lojistik")}${kpi("l-bek", L("Jobs waiting", "Bekleyen iş"), "rapor", "#fbbf24")}${kpi("l-bos", L("Empty-km share", "Boş km oranı"), "lojistik", "#f87171")}
      ${kpi("l-tes", L("Deliveries today", "Bugün teslimat"), "tesis", "#34d399")}${kpi("l-km", L("Km today", "Bugün km"), "harita", "#a78bfa")}${kpi("l-co2", L("Fleet emissions", "Filo emisyonu"), "karbon", "#fb923c")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 360px;align-items:start">
      <div class="card" style="padding:10px"><div id="lmap"></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>${L(`Shared fleet pool`, `Ortak filo havuzu`)}</h3></div>
          <label class="switch" id="pool"><i></i><span id="pool-t">${L(`Off`, `Kapalı`)}</span></label>
          <div class="muted mt" style="font-size:12.5px">${L(`When off, every truck drives back to the Logistics Hub after a delivery. When on, it stays where it is and takes the nearest next job — empty km, fuel and CO₂ drop. Watch the empty-km share below change.`, `Kapalıyken her kamyon teslimattan sonra Lojistik Merkezi'ne döner. Açıkken araç olduğu yerde kalır ve en yakın yeni işi alır — boş km, yakıt ve CO₂ düşer. Değişimi aşağıdaki boş km oranından izle.`)}</div></div>
        <div class="card"><div class="card-h"><h3>${L(`Zone gates`, `Bölge kapıları`)}</h3></div><div class="list" id="gates"></div></div>
        <div class="card"><div class="card-h"><h3>${L(`Fleet status`, `Filo durumu`)}</h3></div><div id="fst"></div></div>
      </div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>${L(`Waiting & active orders`, `Bekleyen & aktif siparişler`)}</h3><span class="sub" id="ocnt"></span></div><div class="tbl-wrap" style="max-height:360px"><table class="tbl" id="ord"></table></div></div>
      <div class="card"><div class="card-h"><h3>${L(`Recent deliveries`, `Son teslimatlar`)}</h3><span class="sub" id="lt"></span></div><div class="tbl-wrap" style="max-height:360px"><table class="tbl" id="dlv"></table></div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>${L(`Job types today`, `Bugünkü iş türleri`)}</h3></div><div id="typ"></div></div>
      <div class="card"><div class="card-h"><h3>${L(`Vehicles on the road`, `Yoldaki araç sayısı`)}</h3><span class="sub">${L(`last 24 hours`, `son 24 saat`)}</span></div><div id="tch"></div></div></div>`;
    map = createMap($("#lmap"), ctx, { height: 470, layer: "sektor", overlays: { lojistik: true, simbiyoz: true, olay: false } });
    $("#pool").onclick = async () => { await ctx.api("/lojistik/ayar", { havuz: !(det && det.havuz) }); det = await ctx.api("/lojistik"); this.paint(ctx); };
    ctx.poll(async () => { det = await ctx.api("/lojistik"); this.paint(ctx); }, 3000);
    ctx.poll(async () => {
      const hst = await ctx.api("/gecmis");
      if (!$("#tch")) return;
      lineChart($("#tch"), { height: 200, legend: false, series: [{ label: L("Trucks on the road", "Yoldaki kamyon"), color: "#22d3ee", data: hst.map((p) => [p.t, p.kamyon]), area: true }] });
    }, 20000);
    this.update(ctx.live(), ctx);
  },
  paint(ctx) {
    const d = det, b = d.bugun;
    if (!$("#pool")) return;
    $("#pool").classList.toggle("on", d.havuz);
    $("#pool-t").textContent = d.havuz ? L("On — trucks move straight to the nearest job", "Açık — araçlar en yakın işe geçiyor") : L("Off — trucks return to the depot", "Kapalı — araçlar depoya dönüyor");
    $("#gates").innerHTML = Object.entries(d.kapilar).map(([k, g]) => `<div class="item"><div class="ttl">${g.kapali ? "⛔" : "🟢"} ${esc(g.ad)}<span class="num" style="margin-left:auto">${g.kuyruk} ${L(`queued`, `kuyrukta`)}</span></div>
      <div class="txt">${g.kapali ? L("Closed — scenario effect", "Kapalı — senaryo etkisi") : L("Open", "Açık")}</div></div>`).join("");
    const states = Object.entries(d.durumlar).sort((a, b) => b[1] - a[1]);
    bars($("#fst"), states.map(([k, v]) => ({ label: TRUCK[k] || k, value: v, color: TCOL[k], text: v })), { max: d.filo });
    $("#ocnt").textContent = `${d.siparisler.length} ${L(`records`, `kayıt`)}`;
    $("#ord").innerHTML = `<tr><th>No</th><th>${L(`Type`, `Tür`)}</th><th>${L(`From → To`, `Kaynak → Hedef`)}</th><th class="r">${L(`Load`, `Yük`)}</th><th>${L(`Status`, `Durum`)}</th><th class="r">${L(`Age`, `Süre`)}</th></tr>` +
      d.siparisler.map((o) => `<tr><td class="num dim">${o.id}</td><td>${ORDER_TIP[o.tip]}</td><td>${esc(o.kaynak)} <span class="dim">→</span> ${esc(o.hedef)}</td><td class="r num">${fmt.n(o.yuk_t, 1)} t</td>
        <td><span style="color:${o.durum === "bekliyor" ? "#fbbf24" : o.durum === "kuyrukta" ? "#f97316" : "#22d3ee"}">${OST[o.durum] || o.durum}</span>${o.arac ? ` <span class="dim">${o.arac}</span>` : ""}</td><td class="r num">${o.bekleme_dk} ${L(`min`, `dk`)}</td></tr>`).join("");
    $("#lt").textContent = d.ort_teslim_dk ? `${L(`avg.`, `ort.`)} ${fmt.n(d.ort_teslim_dk)} ${L(`min · median`, `dk · medyan`)} ${d.medyan_teslim_dk} ${L(`min`, `dk`)}` : "";
    $("#dlv").innerHTML = `<tr><th>No</th><th>${L(`Type`, `Tür`)}</th><th>${L(`From → To`, `Kaynak → Hedef`)}</th><th class="r">${L(`Load`, `Yük`)}</th><th class="r">${L(`Total time`, `Toplam süre`)}</th></tr>` +
      d.teslimler.map((o) => `<tr><td class="num dim">${o.id}</td><td>${ORDER_TIP[o.tip]}</td><td>${esc(o.kaynak)} <span class="dim">→</span> ${esc(o.hedef)}</td><td class="r num">${fmt.n(o.yuk_t, 1)} t</td><td class="r num">${o.bekleme_dk} ${L(`min`, `dk`)}</td></tr>`).join("");
    bars($("#typ"), [["giris", "#60a5fa"], ["sevkiyat", "#22d3ee"], ["ic_tedarik", "#a78bfa"], ["simbiyoz_sefer", "#a3e635"]].map(([k, c]) => ({ label: ORDER_TIP[k.replace("_sefer", "")] || k, value: b[k], color: c, text: fmt.n(b[k]) })));
    setKpi("l-tes", fmt.n(b.teslim), "", `${fmt.n(b.ton)} ${L(`tonnes moved`, `ton taşındı`)}`);
    setKpi("l-km", fmt.n(b.km_yuklu + b.km_bos), "km", `${L(`loaded`, `yüklü`)} ${fmt.n(b.km_yuklu)} ${L(`· empty`, `· boş`)} ${fmt.n(b.km_bos)}`);
    setKpi("l-co2", fmt.n(b.co2_kg / 1000, 2), "tCO₂", `${L(`fuel`, `yakıt`)} ${fmt.ktl(b.yakit_tl)}`);
  },
  update(l, ctx) {
    if (!l) return;
    map && map.update(l);
    const fl = ctx.world.filo || 48;
    setKpi("l-akt", l.l.aktif, L(`/ ${fl}`, "/ 48"), "", l.l.aktif / fl);
    setKpi("l-bek", l.l.bekleyen, L("jobs", "iş"), l.l.bekleyen > 6 ? `<span class="t-warn">${L(`fleet stretched`, `filo yetersiz`)}</span>` : L("flow normal", "akış normal"));
    setKpi("l-bos", fmt.pct(l.l.bos_oran), "", l.l.havuz ? L("shared pool on", "ortak havuz açık") : L("pool off", "havuz kapalı"), l.l.bos_oran);
  },
  unmount() { map && map.destroy(); map = null; det = null; },
};
