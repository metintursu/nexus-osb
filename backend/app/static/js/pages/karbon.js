import { $, $$, esc, fmt, kpi, setKpi, bars, lineChart, sectorTag } from "../ui.js";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g6">
      ${kpi("c-top", "Bugün toplam", "karbon", "#fb923c")}${kpi("c-k1", "Kapsam 1 · yakıt", "enerji", "#f97316")}${kpi("c-k2", "Kapsam 2 · elektrik", "enerji", "#a78bfa")}
      ${kpi("c-lj", "Lojistik", "lojistik", "#fbbf24")}${kpi("c-kac", "Kaçınılan", "simbiyoz", "#34d399")}${kpi("c-skdm", "SKDM yıllık yükü", "para", "#f87171")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">
      <div class="card"><div class="card-h"><h3>Anlık emisyon hızı</h3><span class="sub">tCO₂/saat · son 24 saat</span></div><div id="cch"></div></div>
      <div class="card"><div class="card-h"><h3>Şebeke karbon yoğunluğu</h3></div>
        <div style="display:flex;gap:18px;align-items:flex-end"><div><div class="num" style="font-size:34px;font-weight:700" id="gi">—</div><div class="muted">kgCO₂/kWh şu an</div></div>
        <div class="muted" style="font-size:12.5px">Gece 0,47 · gündüz 0,40 · puant 0,50 (simüle). Esnek yükleri düşük yoğunluklu saatlere kaydırmak kapsam 2'yi azaltır; GES ve biyogaz üretimi doğrudan kaçınım sayılır.</div></div>
        <div class="hr"></div>
        <div class="card-h"><h3>Günlük seyir</h3><span class="sub">baz güne göre hedef: %30 azaltım</span></div><div id="dly"></div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>Tesis sıralaması</h3><span class="sub">bugün tCO₂</span></div><div id="lead"></div></div>
      <div class="card"><div class="card-h"><h3>AB Sınırda Karbon Düzenlemesi (SKDM / CBAM)</h3></div>
        <div class="note" style="margin-bottom:10px">Demir-çelik, alüminyum, çimento gibi kapsamdaki ihracatçılar ürünlerinin gömülü emisyonu için sertifika bedeli öder. Tahmin: günlük emisyon × 365 × ihracat payı × <b id="eua"></b> €/t.</div>
        <div class="tbl-wrap"><table class="tbl" id="skdm"></table></div></div></div>
    <div class="card mt"><div class="card-h"><h3>Karbon yoğunluğu</h3><span class="sub">kgCO₂ / 1.000 ₺ ciro — sektörler arası adil karşılaştırma</span></div><div id="int"></div></div>`;
    ctx.poll(async () => { this.paint(ctx, await ctx.api("/karbon")); }, 5000);
    ctx.poll(async () => {
      const hst = await ctx.api("/gecmis");
      lineChart($("#cch"), { height: 240, legend: false, series: [{ label: "Emisyon", color: "#fb923c", data: hst.map((p) => [p.t, p.co2]), area: true, unit: "t/sa" }] });
    }, 15000);
  },
  paint(ctx, c) {
    setKpi("c-top", fmt.n(c.bugun_t, 1), "t", `anlık ${fmt.n(c.anlik_th, 1)} t/sa`);
    setKpi("c-k1", fmt.n(c.kapsam1_t, 1), "t", `${fmt.pct(c.kapsam1_t / Math.max(c.bugun_t, 1))} pay`);
    setKpi("c-k2", fmt.n(c.kapsam2_t, 1), "t", `${fmt.pct(c.kapsam2_t / Math.max(c.bugun_t, 1))} pay`);
    setKpi("c-lj", fmt.n(c.lojistik_t, 2), "t", "filo dizel");
    setKpi("c-kac", fmt.n(c.kacinilan_t, 1), "t", "GES + biyogaz + simbiyoz");
    setKpi("c-skdm", fmt.n(c.skdm_toplam_eur / 1e6, 2), "M €", `≈ ${fmt.ktl(c.skdm_toplam_tl)}`);
    $("#gi").textContent = fmt.n(c.sebeke_yogunluk, 2);
    $("#eua").textContent = fmt.n(c.ab_fiyat);
    const W = ctx.world;
    bars($("#lead"), c.fabrikalar.slice(0, 14).map((r) => ({ id: r.id, click: true, html: `${esc(r.ad)}`, label: r.ad, value: r.co2_t, color: r.renk, text: `${fmt.n(r.co2_t, 1)} t` })));
    $$("#lead [data-id]").forEach((x) => x.onclick = () => ctx.openFactory(x.dataset.id));
    const sk = c.fabrikalar.filter((r) => r.skdm).sort((a, b) => b.skdm_eur_yil - a.skdm_eur_yil);
    $("#skdm").innerHTML = `<tr><th>Tesis</th><th>Sektör</th><th class="r">Bugün tCO₂</th><th class="r">Yıllık tahmini €</th><th class="r">≈ ₺</th></tr>` +
      sk.map((r) => `<tr class="click" data-id="${r.id}"><td><b>${esc(r.ad)}</b></td><td>${esc(r.sektor)}</td><td class="r num">${fmt.n(r.co2_t, 1)}</td><td class="r num t-warn">${fmt.n(r.skdm_eur_yil)} €</td><td class="r num">${fmt.ktl(r.skdm_eur_yil * 49)}</td></tr>`).join("");
    $$("#skdm tr.click").forEach((x) => x.onclick = () => ctx.openFactory(x.dataset.id));
    const it = c.fabrikalar.filter((r) => r.yogunluk != null).sort((a, b) => b.yogunluk - a.yogunluk).slice(0, 14);
    bars($("#int"), it.map((r) => ({ label: r.ad, value: r.yogunluk, color: r.renk, text: `${fmt.n(r.yogunluk, 1)} kg` })));
    const g = c.gunluk;
    if (g.length) {
      const base = c.baz_gun_t || g[0].co2_t;
      bars($("#dly"), [...g.map((d) => ({ label: `Gün ${d.gun}`, value: d.co2_t, color: d.co2_t <= base * 0.7 ? "#34d399" : "#fb923c", text: `${fmt.n(d.co2_t)} t` })),
        { label: "2030 hedefi", value: base * 0.7, color: "#22d3ee", text: `${fmt.n(base * 0.7)} t` }]);
    } else $("#dly").innerHTML = `<div class="empty">İlk gün kapanınca seyir başlar</div>`;
  },
};
