import { $, $$, esc, fmt, kpi, setKpi, bars, TRUCK, ORDER_TIP, lineChart } from "../ui.js";
import { createMap } from "../map.js";

let map, det = null;
const TCOL = { yuklu: "#22d3ee", gidiyor: "#94a3b8", donus: "#64748b", yukleniyor: "#fde68a", bosaltiyor: "#fde68a", kuyrukta: "#f97316", bos: "#334155" };
const OST = { bekliyor: "waiting", atandi: "assigned", yukleniyor: "loading", yolda: "en route", kuyrukta: "queued", bosaltiyor: "unloading", teslim: "delivered" };

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g6">
      ${kpi("l-akt", "Active vehicles", "lojistik")}${kpi("l-bek", "Jobs waiting", "rapor", "#fbbf24")}${kpi("l-bos", "Empty-km share", "lojistik", "#f87171")}
      ${kpi("l-tes", "Deliveries today", "tesis", "#34d399")}${kpi("l-km", "Km today", "harita", "#a78bfa")}${kpi("l-co2", "Fleet emissions", "karbon", "#fb923c")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 360px;align-items:start">
      <div class="card" style="padding:10px"><div id="lmap"></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>Shared fleet pool</h3></div>
          <label class="switch" id="pool"><i></i><span id="pool-t">Off</span></label>
          <div class="muted mt" style="font-size:12.5px">When off, every truck drives back to the Logistics Hub after a delivery. When on, it stays where it is and takes the nearest next job — empty km, fuel and CO₂ drop. Watch the empty-km share below change.</div></div>
        <div class="card"><div class="card-h"><h3>Zone gates</h3></div><div class="list" id="gates"></div></div>
        <div class="card"><div class="card-h"><h3>Fleet status</h3></div><div id="fst"></div></div>
      </div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Waiting & active orders</h3><span class="sub" id="ocnt"></span></div><div class="tbl-wrap" style="max-height:360px"><table class="tbl" id="ord"></table></div></div>
      <div class="card"><div class="card-h"><h3>Recent deliveries</h3><span class="sub" id="lt"></span></div><div class="tbl-wrap" style="max-height:360px"><table class="tbl" id="dlv"></table></div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Job types today</h3></div><div id="typ"></div></div>
      <div class="card"><div class="card-h"><h3>Vehicles on the road</h3><span class="sub">last 24 hours</span></div><div id="tch"></div></div></div>`;
    map = createMap($("#lmap"), ctx, { height: 470, layer: "sektor", overlays: { lojistik: true, simbiyoz: true, olay: false } });
    $("#pool").onclick = async () => { await ctx.api("/lojistik/ayar", { havuz: !(det && det.havuz) }); det = await ctx.api("/lojistik"); this.paint(ctx); };
    ctx.poll(async () => { det = await ctx.api("/lojistik"); this.paint(ctx); }, 3000);
    ctx.poll(async () => {
      const hst = await ctx.api("/gecmis");
      if (!$("#tch")) return;
      lineChart($("#tch"), { height: 200, legend: false, series: [{ label: "Trucks on the road", color: "#22d3ee", data: hst.map((p) => [p.t, p.kamyon]), area: true }] });
    }, 20000);
    this.update(ctx.live(), ctx);
  },
  paint(ctx) {
    const d = det, b = d.bugun;
    if (!$("#pool")) return;
    $("#pool").classList.toggle("on", d.havuz);
    $("#pool-t").textContent = d.havuz ? "On — trucks move straight to the nearest job" : "Off — trucks return to the depot";
    $("#gates").innerHTML = Object.entries(d.kapilar).map(([k, g]) => `<div class="item"><div class="ttl">${g.kapali ? "⛔" : "🟢"} ${esc(g.ad)}<span class="num" style="margin-left:auto">${g.kuyruk} queued</span></div>
      <div class="txt">${g.kapali ? "Closed — scenario effect" : "Open"}</div></div>`).join("");
    const states = Object.entries(d.durumlar).sort((a, b) => b[1] - a[1]);
    bars($("#fst"), states.map(([k, v]) => ({ label: TRUCK[k] || k, value: v, color: TCOL[k], text: v })), { max: d.filo });
    $("#ocnt").textContent = `${d.siparisler.length} records`;
    $("#ord").innerHTML = `<tr><th>No</th><th>Type</th><th>From → To</th><th class="r">Load</th><th>Status</th><th class="r">Age</th></tr>` +
      d.siparisler.map((o) => `<tr><td class="num dim">${o.id}</td><td>${ORDER_TIP[o.tip]}</td><td>${esc(o.kaynak)} <span class="dim">→</span> ${esc(o.hedef)}</td><td class="r num">${fmt.n(o.yuk_t, 1)} t</td>
        <td><span style="color:${o.durum === "bekliyor" ? "#fbbf24" : o.durum === "kuyrukta" ? "#f97316" : "#22d3ee"}">${OST[o.durum] || o.durum}</span>${o.arac ? ` <span class="dim">${o.arac}</span>` : ""}</td><td class="r num">${o.bekleme_dk} min</td></tr>`).join("");
    $("#lt").textContent = d.ort_teslim_dk ? `avg. ${fmt.n(d.ort_teslim_dk)} min · median ${d.medyan_teslim_dk} min` : "";
    $("#dlv").innerHTML = `<tr><th>No</th><th>Type</th><th>From → To</th><th class="r">Load</th><th class="r">Total time</th></tr>` +
      d.teslimler.map((o) => `<tr><td class="num dim">${o.id}</td><td>${ORDER_TIP[o.tip]}</td><td>${esc(o.kaynak)} <span class="dim">→</span> ${esc(o.hedef)}</td><td class="r num">${fmt.n(o.yuk_t, 1)} t</td><td class="r num">${o.bekleme_dk} min</td></tr>`).join("");
    bars($("#typ"), [["giris", "#60a5fa"], ["sevkiyat", "#22d3ee"], ["ic_tedarik", "#a78bfa"], ["simbiyoz_sefer", "#a3e635"]].map(([k, c]) => ({ label: ORDER_TIP[k.replace("_sefer", "")] || k, value: b[k], color: c, text: fmt.n(b[k]) })));
    setKpi("l-tes", fmt.n(b.teslim), "", `${fmt.n(b.ton)} tonnes moved`);
    setKpi("l-km", fmt.n(b.km_yuklu + b.km_bos), "km", `loaded ${fmt.n(b.km_yuklu)} · empty ${fmt.n(b.km_bos)}`);
    setKpi("l-co2", fmt.n(b.co2_kg / 1000, 2), "tCO₂", `fuel ${fmt.ktl(b.yakit_tl)}`);
  },
  update(l, ctx) {
    if (!l) return;
    map && map.update(l);
    const fl = ctx.world.filo || 48;
    setKpi("l-akt", l.l.aktif, `/ ${fl}`, "", l.l.aktif / fl);
    setKpi("l-bek", l.l.bekleyen, "jobs", l.l.bekleyen > 6 ? `<span class="t-warn">fleet stretched</span>` : "flow normal");
    setKpi("l-bos", fmt.pct(l.l.bos_oran), "", l.l.havuz ? "shared pool on" : "pool off", l.l.bos_oran);
  },
  unmount() { map && map.destroy(); map = null; det = null; },
};
