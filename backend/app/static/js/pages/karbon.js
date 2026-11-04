import { $, $$, esc, fmt, kpi, setKpi, bars, lineChart, sectorTag } from "../ui.js";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g6">
      ${kpi("c-top", "Total today", "karbon", "#fb923c")}${kpi("c-k1", "Scope 1 · fuel", "enerji", "#f97316")}${kpi("c-k2", "Scope 2 · electricity", "enerji", "#a78bfa")}
      ${kpi("c-lj", "Logistics", "lojistik", "#fbbf24")}${kpi("c-kac", "Avoided", "simbiyoz", "#34d399")}${kpi("c-skdm", "CBAM annual cost", "para", "#f87171")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
      <div class="card"><div class="card-h"><h3>Current emission rate</h3><span class="sub">tCO₂/hour · last 24 hours</span></div><div id="cch"></div></div>
      <div class="card"><div class="card-h"><h3>Grid carbon intensity</h3></div>
        <div style="display:flex;gap:18px;align-items:flex-end"><div><div class="num" style="font-size:34px;font-weight:700" id="gi">—</div><div class="muted">kgCO₂/kWh right now</div></div>
        <div class="muted" style="font-size:12.5px">Night 0.47 · day 0.40 · peak 0.50 (simulated). Shifting flexible loads to low-intensity hours cuts Scope 2; solar and biogas output count directly as avoided emissions.</div></div>
        <div class="hr"></div>
        <div class="card-h"><h3>Daily trend</h3><span class="sub">target: 30% below the base day</span></div><div id="dly"></div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Site ranking</h3><span class="sub">tCO₂ today</span></div><div id="lead"></div></div>
      <div class="card"><div class="card-h"><h3>EU Carbon Border Adjustment Mechanism (CBAM)</h3></div>
        <div class="note" style="margin-bottom:10px">Exporters in covered sectors such as iron & steel, aluminium and cement pay for certificates covering the embedded emissions of their products. Estimate: daily emissions × 365 × export share × €<b id="eua"></b>/t.</div>
        <div class="tbl-wrap"><table class="tbl" id="skdm"></table></div></div></div>
    <div class="card mt"><div class="card-h"><h3>Carbon intensity</h3><span class="sub">kgCO₂ per ₺1,000 revenue — a fair cross-sector comparison</span></div><div id="int"></div></div>`;
    ctx.poll(async () => { this.paint(ctx, await ctx.api("/karbon")); }, 5000);
    ctx.poll(async () => {
      const hst = await ctx.api("/gecmis");
      lineChart($("#cch"), { height: 240, legend: false, series: [{ label: "Emissions", color: "#fb923c", data: hst.map((p) => [p.t, p.co2]), area: true, unit: "t/h" }] });
    }, 15000);
  },
  paint(ctx, c) {
    setKpi("c-top", fmt.n(c.bugun_t, 1), "t", `now ${fmt.n(c.anlik_th, 1)} t/h`);
    setKpi("c-k1", fmt.n(c.kapsam1_t, 1), "t", `${fmt.pct(c.kapsam1_t / Math.max(c.bugun_t, 1))} share`);
    setKpi("c-k2", fmt.n(c.kapsam2_t, 1), "t", `${fmt.pct(c.kapsam2_t / Math.max(c.bugun_t, 1))} share`);
    setKpi("c-lj", fmt.n(c.lojistik_t, 2), "t", "fleet diesel");
    setKpi("c-kac", fmt.n(c.kacinilan_t, 1), "t", "solar + biogas + symbiosis");
    setKpi("c-skdm", fmt.n(c.skdm_toplam_eur / 1e6, 2), "M€", `≈ ${fmt.ktl(c.skdm_toplam_tl)}`);
    $("#gi").textContent = fmt.n(c.sebeke_yogunluk, 2);
    $("#eua").textContent = fmt.n(c.ab_fiyat);
    const W = ctx.world;
    bars($("#lead"), c.fabrikalar.slice(0, 14).map((r) => ({ id: r.id, click: true, html: `${esc(r.ad)}`, label: r.ad, value: r.co2_t, color: r.renk, text: `${fmt.n(r.co2_t, 1)} t` })));
    $$("#lead [data-id]").forEach((x) => x.onclick = () => ctx.openFactory(x.dataset.id));
    const sk = c.fabrikalar.filter((r) => r.skdm).sort((a, b) => b.skdm_eur_yil - a.skdm_eur_yil);
    $("#skdm").innerHTML = `<tr><th>Site</th><th>Sector</th><th class="r">tCO₂ today</th><th class="r">Est. € / year</th><th class="r">≈ ₺</th></tr>` +
      sk.map((r) => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.ad)}</b></td><td>${esc(r.sektor)}</td><td class="r num">${fmt.n(r.co2_t, 1)}</td><td class="r num t-warn">€${fmt.n(r.skdm_eur_yil)}</td><td class="r num">${fmt.ktl(r.skdm_eur_yil * 49)}</td></tr>`).join("");
    $$("#skdm tr.click").forEach((x) => x.onclick = () => ctx.openFactory(x.dataset.id));
    const it = c.fabrikalar.filter((r) => r.yogunluk != null).sort((a, b) => b.yogunluk - a.yogunluk).slice(0, 14);
    bars($("#int"), it.map((r) => ({ label: r.ad, value: r.yogunluk, color: r.renk, text: `${fmt.n(r.yogunluk, 1)} kg` })));
    const g = c.gunluk;
    if (g.length) {
      const base = c.baz_gun_t || g[0].co2_t;
      bars($("#dly"), [...g.map((d) => ({ label: `Day ${d.gun}`, value: d.co2_t, color: d.co2_t <= base * 0.7 ? "#34d399" : "#fb923c", text: `${fmt.n(d.co2_t)} t` })),
        { label: "2030 target", value: base * 0.7, color: "#22d3ee", text: `${fmt.n(base * 0.7)} t` }]);
    } else $("#dly").innerHTML = `<div class="empty">The trend starts once the first day closes</div>`;
  },
};
