import { $, $$, esc, fmt, kpi, setKpi, bars, lineChart, sectorTag } from "../ui.js";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g6">
      ${kpi("c-top", L("Total today", "Bugün toplam"), "karbon", "#fb923c")}${kpi("c-k1", L("Scope 1 · fuel", "Kapsam 1 · yakıt"), "enerji", "#f97316")}${kpi("c-k2", L("Scope 2 · electricity", "Kapsam 2 · elektrik"), "enerji", "#a78bfa")}
      ${kpi("c-lj", L("Logistics", "Lojistik"), "lojistik", "#fbbf24")}${kpi("c-kac", L("Avoided", "Kaçınılan"), "simbiyoz", "#34d399")}${kpi("c-skdm", L("CBAM annual cost", "SKDM yıllık yükü"), "para", "#f87171")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
      <div class="card"><div class="card-h"><h3>${L(`Current emission rate`, `Anlık emisyon hızı`)}</h3><span class="sub">${L(`tCO₂/hour · last 24 hours`, `tCO₂/saat · son 24 saat`)}</span></div><div id="cch"></div></div>
      <div class="card"><div class="card-h"><h3>${L(`Grid carbon intensity`, `Şebeke karbon yoğunluğu`)}</h3></div>
        <div style="display:flex;gap:18px;align-items:flex-end"><div><div class="num" style="font-size:34px;font-weight:700" id="gi">—</div><div class="muted">${L(`kgCO₂/kWh right now`, `kgCO₂/kWh şu an`)}</div></div>
        <div class="muted" style="font-size:12.5px">${L(`Night 0.47 · day 0.40 · peak 0.50 (simulated). Shifting flexible loads to low-intensity hours cuts Scope 2; solar and biogas output count directly as avoided emissions.`, `Gece 0,47 · gündüz 0,40 · puant 0,50 (simüle). Esnek yükleri düşük yoğunluklu saatlere kaydırmak kapsam 2'yi azaltır; GES ve biyogaz üretimi doğrudan kaçınım sayılır.`)}</div></div>
        <div class="hr"></div>
        <div class="card-h"><h3>${L(`Daily trend`, `Günlük seyir`)}</h3><span class="sub">${L(`target: 30% below the base day`, `baz güne göre hedef: %30 azaltım`)}</span></div><div id="dly"></div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>${L(`Site ranking`, `Tesis sıralaması`)}</h3><span class="sub">${L(`tCO₂ today`, `bugün tCO₂`)}</span></div><div id="lead"></div></div>
      <div class="card"><div class="card-h"><h3>${L(`EU Carbon Border Adjustment Mechanism (CBAM)`, `AB Sınırda Karbon Düzenlemesi (SKDM / CBAM)`)}</h3></div>
        <div class="note" style="margin-bottom:10px">${L(`Exporters in covered sectors such as iron & steel, aluminium and cement pay for certificates covering the embedded emissions of their products. Estimate: daily emissions × 365 × export share × €`, `Demir-çelik, alüminyum, çimento gibi kapsamdaki ihracatçılar ürünlerinin gömülü emisyonu için sertifika bedeli öder. Tahmin: günlük emisyon × 365 × ihracat payı ×`)}<b id="eua"></b>/t.</div>
        <div class="tbl-wrap"><table class="tbl" id="skdm"></table></div></div></div>
    <div class="card mt"><div class="card-h"><h3>${L(`Carbon intensity`, `Karbon yoğunluğu`)}</h3><span class="sub">${L(`kgCO₂ per ₺1,000 revenue — a fair cross-sector comparison`, `kgCO₂ / 1.000 ₺ ciro — sektörler arası adil karşılaştırma`)}</span></div><div id="int"></div></div>`;
    ctx.poll(async () => { this.paint(ctx, await ctx.api("/karbon")); }, 5000);
    ctx.poll(async () => {
      const hst = await ctx.api("/gecmis");
      lineChart($("#cch"), { height: 240, legend: false, series: [{ label: L("Emissions", "Emisyon"), color: "#fb923c", data: hst.map((p) => [p.t, p.co2]), area: true, unit: "t/h" }] });
    }, 15000);
  },
  paint(ctx, c) {
    setKpi("c-top", fmt.n(c.bugun_t, 1), "t", `${L(`now`, `anlık`)} ${fmt.n(c.anlik_th, 1)} t/h`);
    setKpi("c-k1", fmt.n(c.kapsam1_t, 1), "t", `${fmt.pct(c.kapsam1_t / Math.max(c.bugun_t, 1))} ${L(`share`, `pay`)}`);
    setKpi("c-k2", fmt.n(c.kapsam2_t, 1), "t", `${fmt.pct(c.kapsam2_t / Math.max(c.bugun_t, 1))} ${L(`share`, `pay`)}`);
    setKpi("c-lj", fmt.n(c.lojistik_t, 2), "t", L("fleet diesel", "filo dizel"));
    setKpi("c-kac", fmt.n(c.kacinilan_t, 1), "t", L("solar + biogas + symbiosis", "GES + biyogaz + simbiyoz"));
    setKpi("c-skdm", fmt.n(c.skdm_toplam_eur / 1e6, 2), "M€", `≈ ${fmt.ktl(c.skdm_toplam_tl)}`);
    $("#gi").textContent = fmt.n(c.sebeke_yogunluk, 2);
    $("#eua").textContent = fmt.n(c.ab_fiyat);
    const W = ctx.world;
    bars($("#lead"), c.fabrikalar.slice(0, 14).map((r) => ({ id: r.id, click: true, html: `${esc(r.ad)}`, label: r.ad, value: r.co2_t, color: r.renk, text: `${fmt.n(r.co2_t, 1)} t` })));
    $$("#lead [data-id]").forEach((x) => x.onclick = () => ctx.openFactory(x.dataset.id));
    const sk = c.fabrikalar.filter((r) => r.skdm).sort((a, b) => b.skdm_eur_yil - a.skdm_eur_yil);
    $("#skdm").innerHTML = `<tr><th>${L(`Site`, `Tesis`)}</th><th>${L(`Sector`, `Sektör`)}</th><th class="r">${L(`tCO₂ today`, `Bugün tCO₂`)}</th><th class="r">${L(`Est. € / year`, `Yıllık tahmini €`)}</th><th class="r">≈ ₺</th></tr>` +
      sk.map((r) => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.ad)}</b></td><td>${esc(r.sektor)}</td><td class="r num">${fmt.n(r.co2_t, 1)}</td><td class="r num t-warn">€${fmt.n(r.skdm_eur_yil)}</td><td class="r num">${fmt.ktl(r.skdm_eur_yil * 49)}</td></tr>`).join("");
    $$("#skdm tr.click").forEach((x) => x.onclick = () => ctx.openFactory(x.dataset.id));
    const it = c.fabrikalar.filter((r) => r.yogunluk != null).sort((a, b) => b.yogunluk - a.yogunluk).slice(0, 14);
    bars($("#int"), it.map((r) => ({ label: r.ad, value: r.yogunluk, color: r.renk, text: `${fmt.n(r.yogunluk, 1)} kg` })));
    const g = c.gunluk;
    if (g.length) {
      const base = c.baz_gun_t || g[0].co2_t;
      bars($("#dly"), [...g.map((d) => ({ label: `${L(`Day`, `Gün`)} ${d.gun}`, value: d.co2_t, color: d.co2_t <= base * 0.7 ? "#34d399" : "#fb923c", text: `${fmt.n(d.co2_t)} t` })),
        { label: L("2030 target", "2030 hedefi"), value: base * 0.7, color: "#22d3ee", text: `${fmt.n(base * 0.7)} t` }]);
    } else $("#dly").innerHTML = `<div class="empty">${L(`The trend starts once the first day closes`, `İlk gün kapanınca seyir başlar`)}</div>`;
  },
};
