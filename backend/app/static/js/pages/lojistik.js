import { $, $$, esc, fmt, kpi, setKpi, bars, TRUCK, ORDER_TIP, lineChart } from "../ui.js";
import { createMap } from "../map.js";

let map, det = null;
const TCOL = { yuklu: "#22d3ee", gidiyor: "#94a3b8", donus: "#64748b", yukleniyor: "#fde68a", bosaltiyor: "#fde68a", kuyrukta: "#f97316", bos: "#334155" };

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g6">
      ${kpi("l-akt", "Aktif araç", "lojistik")}${kpi("l-bek", "Bekleyen iş", "rapor", "#fbbf24")}${kpi("l-bos", "Boş km oranı", "lojistik", "#f87171")}
      ${kpi("l-tes", "Bugün teslimat", "tesis", "#34d399")}${kpi("l-km", "Bugün km", "harita", "#a78bfa")}${kpi("l-co2", "Filo emisyonu", "karbon", "#fb923c")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 360px">
      <div class="card" style="padding:10px"><div id="lmap"></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>Ortak filo havuzu</h3></div>
          <label class="switch" id="pool"><i></i><span id="pool-t">Kapalı</span></label>
          <div class="muted mt" style="font-size:12.5px">Kapalıyken her kamyon teslimattan sonra Lojistik Merkezi'ne döner. Açıkken araç olduğu yerde kalır ve en yakın yeni işi alır — boş km, yakıt ve CO₂ düşer. Değişimi aşağıdaki boş km oranından izle.</div></div>
        <div class="card"><div class="card-h"><h3>Bölge kapıları</h3></div><div class="list" id="gates"></div></div>
        <div class="card"><div class="card-h"><h3>Filo durumu</h3></div><div id="fst"></div></div>
      </div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Bekleyen & aktif siparişler</h3><span class="sub" id="ocnt"></span></div><div class="tbl-wrap" style="max-height:360px"><table class="tbl" id="ord"></table></div></div>
      <div class="card"><div class="card-h"><h3>Son teslimatlar</h3><span class="sub" id="lt"></span></div><div class="tbl-wrap" style="max-height:360px"><table class="tbl" id="dlv"></table></div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Bugünkü iş türleri</h3></div><div id="typ"></div></div>
      <div class="card"><div class="card-h"><h3>Yoldaki araç sayısı</h3><span class="sub">son 24 saat</span></div><div id="tch"></div></div></div>`;
    map = createMap($("#lmap"), ctx, { height: 470, layer: "sektor", overlays: { lojistik: true, simbiyoz: true, olay: false } });
    $("#pool").onclick = async () => { await ctx.api("/lojistik/ayar", { havuz: !(det && det.havuz) }); det = await ctx.api("/lojistik"); this.paint(ctx); };
    ctx.poll(async () => { det = await ctx.api("/lojistik"); this.paint(ctx); }, 3000);
    ctx.poll(async () => {
      const hst = await ctx.api("/gecmis");
      lineChart($("#tch"), { height: 200, legend: false, series: [{ label: "Yoldaki kamyon", color: "#22d3ee", data: hst.map((p) => [p.t, p.kamyon]), area: true }] });
    }, 20000);
    this.update(ctx.live(), ctx);
  },
  paint(ctx) {
    const d = det, b = d.bugun;
    $("#pool").classList.toggle("on", d.havuz);
    $("#pool-t").textContent = d.havuz ? "Açık — araçlar en yakın işe geçiyor" : "Kapalı — araçlar depoya dönüyor";
    $("#gates").innerHTML = Object.entries(d.kapilar).map(([k, g]) => `<div class="item"><div class="ttl">${g.kapali ? "⛔" : "🟢"} ${esc(g.ad)}<span class="num" style="margin-left:auto">${g.kuyruk} kuyrukta</span></div>
      <div class="txt">${g.kapali ? "Kapalı — senaryo etkisi" : "Açık"}</div></div>`).join("");
    const states = Object.entries(d.durumlar).sort((a, b) => b[1] - a[1]);
    bars($("#fst"), states.map(([k, v]) => ({ label: TRUCK[k] || k, value: v, color: TCOL[k], text: v })), { max: d.filo });
    $("#ocnt").textContent = `${d.siparisler.length} kayıt`;
    $("#ord").innerHTML = `<tr><th>No</th><th>Tür</th><th>Kaynak → Hedef</th><th class="r">Yük</th><th>Durum</th><th class="r">Süre</th></tr>` +
      d.siparisler.map((o) => `<tr><td class="num dim">${o.id}</td><td>${ORDER_TIP[o.tip]}</td><td>${esc(o.kaynak)} <span class="dim">→</span> ${esc(o.hedef)}</td><td class="r num">${fmt.n(o.yuk_t, 1)} t</td>
        <td><span style="color:${o.durum === "bekliyor" ? "#fbbf24" : o.durum === "kuyrukta" ? "#f97316" : "#22d3ee"}">${o.durum}</span>${o.arac ? ` <span class="dim">${o.arac}</span>` : ""}</td><td class="r num">${o.bekleme_dk} dk</td></tr>`).join("");
    $("#lt").textContent = d.ort_teslim_dk ? `ort. ${fmt.n(d.ort_teslim_dk)} dk · medyan ${d.medyan_teslim_dk} dk` : "";
    $("#dlv").innerHTML = `<tr><th>No</th><th>Tür</th><th>Kaynak → Hedef</th><th class="r">Yük</th><th class="r">Toplam süre</th></tr>` +
      d.teslimler.map((o) => `<tr><td class="num dim">${o.id}</td><td>${ORDER_TIP[o.tip]}</td><td>${esc(o.kaynak)} <span class="dim">→</span> ${esc(o.hedef)}</td><td class="r num">${fmt.n(o.yuk_t, 1)} t</td><td class="r num">${o.bekleme_dk} dk</td></tr>`).join("");
    bars($("#typ"), [["giris", "#60a5fa"], ["sevkiyat", "#22d3ee"], ["ic_tedarik", "#a78bfa"], ["simbiyoz_sefer", "#a3e635"]].map(([k, c]) => ({ label: ORDER_TIP[k.replace("_sefer", "")] || k, value: b[k], color: c, text: fmt.n(b[k]) })));
    setKpi("l-tes", fmt.n(b.teslim), "", `${fmt.n(b.ton)} ton taşındı`);
    setKpi("l-km", fmt.n(b.km_yuklu + b.km_bos), "km", `yüklü ${fmt.n(b.km_yuklu)} · boş ${fmt.n(b.km_bos)}`);
    setKpi("l-co2", fmt.n(b.co2_kg / 1000, 2), "tCO₂", `yakıt ${fmt.ktl(b.yakit_tl)}`);
  },
  update(l) {
    if (!l) return;
    map && map.update(l);
    setKpi("l-akt", l.l.aktif, "/ 48", "", l.l.aktif / 48);
    setKpi("l-bek", l.l.bekleyen, "iş", l.l.bekleyen > 6 ? `<span class="t-warn">filo yetersiz</span>` : "akış normal");
    setKpi("l-bos", fmt.pct(l.l.bos_oran), "", l.l.havuz ? "ortak havuz açık" : "havuz kapalı", l.l.bos_oran);
  },
  unmount() { map && map.destroy(); map = null; det = null; },
};
