import { $, esc, fmt, kpi, setKpi, lineChart, ring, bars } from "../ui.js";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g5">
      ${kpi("w-in", "Plant inflow", "su")}${kpi("w-koi", "Outlet COD", "kriz", "#fbbf24")}${kpi("w-ver", "Treatment efficiency", "simbiyoz", "#34d399")}
      ${kpi("w-geri", "Reused today", "su", "#22d3ee")}${kpi("w-tas", "Water savings today", "para", "#c084fc")}</div>
    <div class="grid mt" style="grid-template-columns:320px minmax(0,1fr)">
      <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:12px"><div class="muted" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase">Capacity used</div><div id="wr"></div>
        <div style="width:100%"><div class="muted" style="font-size:12px;display:flex;justify-content:space-between"><span>Water reuse rate</span><b class="num" id="gv">—</b></div>
          <input type="range" min="0" max="45" step="5" id="gr"><div class="muted" style="font-size:11.5px">Treated water is used as cooling-tower make-up and for process rinsing; it costs 0.6 kWh of extra energy per m³.</div></div></div>
      <div class="card"><div class="card-h"><h3>Flow and outlet quality</h3><span class="sub">last 12 hours</span></div><div id="wch"></div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Highest pollution load</h3><span class="sub">kg COD / hour</span></div><div id="pol"></div></div>
      <div class="card"><div class="card-h"><h3>Totals</h3><span class="sub">since start-up</span></div><div class="grid g2" id="wt" style="font-size:13px"></div></div></div>`;
    $("#gr").oninput = (e) => { $("#gv").textContent = e.target.value + "%"; };
    $("#gr").onchange = async (e) => { await ctx.api("/su/ayar", { geri: +e.target.value / 100 }); ctx.toast(`Water reuse ${e.target.value}%`, "ok"); };
    ctx.poll(async () => { this.paint(ctx, await ctx.api("/su")); }, 4000);
  },
  paint(ctx, d) {
    if (!$("#wr")) return;
    setKpi("w-in", fmt.n(d.giris), "m³/h", `capacity ${fmt.n(d.kapasite)} m³/h`, d.util);
    setKpi("w-koi", fmt.n(d.koi), "mg/L", d.koi > d.limit ? `<span class="t-crit">limit ${d.limit} exceeded</span>` : `limit ${d.limit} · inlet ${fmt.n(d.koi_giris)}`, d.koi / d.limit);
    setKpi("w-ver", fmt.pct(d.verim, 1), "", `pumps + aeration ${fmt.n(d.guc_kw)} kW`);
    setKpi("w-geri", fmt.n(d.bugun.geri_m3), "m³", `total inflow ${fmt.n(d.bugun.giris_m3)} m³`);
    setKpi("w-tas", fmt.ktl(d.bugun.tasarruf_tl), "", "instead of mains water");
    const c = d.util > 1 ? "#f87171" : d.util > 0.9 ? "#fbbf24" : "#38bdf8";
    $("#wr").innerHTML = ring(Math.min(1, d.util), 170, c, "capacity", Math.round(d.util * 100) + "%");
    if (document.activeElement !== $("#gr")) { $("#gr").value = Math.round(d.geri * 100); $("#gv").textContent = Math.round(d.geri * 100) + "%"; }
    const h = d.gecmis;
    lineChart($("#wch"), { height: 250, series: [
      { label: "Inflow (m³/h)", color: "#38bdf8", data: h.map((p) => [p[0], p[1]]), area: true },
      { label: "Outlet COD (mg/L)", color: "#fbbf24", data: h.map((p) => [p[0], p[2]]) }],
      refs: [{ y: d.limit, label: "COD limit", color: "#f87171" }, { y: d.kapasite, label: "Capacity", color: "#64748b" }] });
    bars($("#pol"), d.kirletenler.map((k) => ({ label: k.ad, value: k.yuk_kg_h, color: "#fbbf24", text: `${fmt.n(k.yuk_kg_h, 1)} kg` })));
    const T = d.toplam;
    $("#wt").innerHTML = [["Treated", `${fmt.n(T.giris_m3)} m³`], ["Reused", `${fmt.n(T.geri_m3)} m³`], ["Mains water drawn", `${fmt.n(T.temiz_m3)} m³`],
      ["COD to receiving water", `${fmt.n(T.kirlilik_kg)} kg`], ["Total savings", fmt.ktl(T.tasarruf_tl)], ["Current efficiency", fmt.pct(d.verim, 1)]]
      .map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b class="num">${v}</b></div>`).join("");
  },
};
