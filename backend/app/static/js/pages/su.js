import { $, esc, fmt, kpi, setKpi, lineChart, ring, bars } from "../ui.js";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g5">
      ${kpi("w-in", L("Plant inflow", "Arıtmaya giriş"), "su")}${kpi("w-koi", L("Outlet COD", "Çıkış KOİ"), "kriz", "#fbbf24")}${kpi("w-ver", L("Treatment efficiency", "Arıtma verimi"), "simbiyoz", "#34d399")}
      ${kpi("w-geri", L("Reused today", "Bugün geri kazanılan"), "su", "#22d3ee")}${kpi("w-tas", L("Water savings today", "Bugün su tasarrufu"), "para", "#c084fc")}</div>
    <div class="grid mt" style="grid-template-columns:320px minmax(0,1fr)">
      <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:12px"><div class="muted" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase">${L(`Capacity used`, `Kapasite kullanımı`)}</div><div id="wr"></div>
        <div style="width:100%"><div class="muted" style="font-size:12px;display:flex;justify-content:space-between"><span>${L(`Water reuse rate`, `Geri kazanım oranı`)}</span><b class="num" id="gv">—</b></div>
          <input type="range" min="0" max="45" step="5" id="gr"><div class="muted" style="font-size:11.5px">${L(`Treated water is used as cooling-tower make-up and for process rinsing; it costs 0.6 kWh of extra energy per m³.`, `Arıtılmış su soğutma kulesi takviyesi ve proses yıkamada kullanılır; m³ başına 0,6 kWh ek enerji harcar.`)}</div></div></div>
      <div class="card"><div class="card-h"><h3>${L(`Flow and outlet quality`, `Debi ve çıkış kalitesi`)}</h3><span class="sub">${L(`last 12 hours`, `son 12 saat`)}</span></div><div id="wch"></div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>${L(`Highest pollution load`, `En yüksek kirlilik yükü`)}</h3><span class="sub">${L(`kg COD / hour`, `kg KOİ / saat`)}</span></div><div id="pol"></div></div>
      <div class="card"><div class="card-h"><h3>${L(`Totals`, `Toplamlar`)}</h3><span class="sub">${L(`since start-up`, `çalışma başından beri`)}</span></div><div class="grid g2" id="wt" style="font-size:13px"></div></div></div>`;
    $("#gr").oninput = (e) => { $("#gv").textContent = e.target.value + "%"; };
    $("#gr").onchange = async (e) => { await ctx.api("/su/ayar", { geri: +e.target.value / 100 }); ctx.toast(L(`Water reuse ${e.target.value}%`, `Su geri kazanımı %${e.target.value}`), "ok"); };
    ctx.poll(async () => { this.paint(ctx, await ctx.api("/su")); }, 4000);
  },
  paint(ctx, d) {
    if (!$("#wr")) return;
    setKpi("w-in", fmt.n(d.giris), "m³/h", `${L(`capacity`, `kapasite`)} ${fmt.n(d.kapasite)} m³/h`, d.util);
    setKpi("w-koi", fmt.n(d.koi), "mg/L", d.koi > d.limit ? `<span class="t-crit">${L(`limit`, `sınır`)} ${d.limit} ${L(`exceeded`, `aşıldı`)}</span>` : `${L(`limit`, `sınır`)} ${d.limit} ${L(`· inlet`, `· giriş`)} ${fmt.n(d.koi_giris)}`, d.koi / d.limit);
    setKpi("w-ver", fmt.pct(d.verim, 1), "", `${L(`pumps + aeration`, `pompa+havalandırma`)} ${fmt.n(d.guc_kw)} kW`);
    setKpi("w-geri", fmt.n(d.bugun.geri_m3), "m³", `${L(`total inflow`, `toplam giriş`)} ${fmt.n(d.bugun.giris_m3)} m³`);
    setKpi("w-tas", fmt.ktl(d.bugun.tasarruf_tl), "", L("instead of mains water", "şebeke suyu yerine"));
    const c = d.util > 1 ? "#f87171" : d.util > 0.9 ? "#fbbf24" : "#38bdf8";
    $("#wr").innerHTML = ring(Math.min(1, d.util), 170, c, L("capacity", "kapasite"), Math.round(d.util * 100) + "%");
    if (document.activeElement !== $("#gr")) { $("#gr").value = Math.round(d.geri * 100); $("#gv").textContent = Math.round(d.geri * 100) + "%"; }
    const h = d.gecmis;
    lineChart($("#wch"), { height: 250, series: [
      { label: L("Inflow (m³/h)", "Giriş debisi (m³/sa)"), color: "#38bdf8", data: h.map((p) => [p[0], p[1]]), area: true },
      { label: L("Outlet COD (mg/L)", "Çıkış KOİ (mg/L)"), color: "#fbbf24", data: h.map((p) => [p[0], p[2]]) }],
      refs: [{ y: d.limit, label: L("COD limit", "KOİ sınırı"), color: "#f87171" }, { y: d.kapasite, label: L("Capacity", "Kapasite"), color: "#64748b" }] });
    bars($("#pol"), d.kirletenler.map((k) => ({ label: k.ad, value: k.yuk_kg_h, color: "#fbbf24", text: `${fmt.n(k.yuk_kg_h, 1)} kg` })));
    const T = d.toplam;
    $("#wt").innerHTML = [[L("Treated", "Arıtılan"), `${fmt.n(T.giris_m3)} m³`], [L("Reused", "Geri kazanılan"), `${fmt.n(T.geri_m3)} m³`], [L("Mains water drawn", "Şebeke suyu çekişi"), `${fmt.n(T.temiz_m3)} m³`],
      [L("COD to receiving water", "Alıcı ortama KOİ"), `${fmt.n(T.kirlilik_kg)} kg`], [L("Total savings", "Toplam tasarruf"), fmt.ktl(T.tasarruf_tl)], [L("Current efficiency", "Anlık verim"), fmt.pct(d.verim, 1)]]
      .map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b class="num">${v}</b></div>`).join("");
  },
};
