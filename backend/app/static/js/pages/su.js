import { $, esc, fmt, kpi, setKpi, lineChart, ring, bars } from "../ui.js";

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g5">
      ${kpi("w-in", "Arıtmaya giriş", "su")}${kpi("w-koi", "Çıkış KOİ", "kriz", "#fbbf24")}${kpi("w-ver", "Arıtma verimi", "simbiyoz", "#34d399")}
      ${kpi("w-geri", "Bugün geri kazanılan", "su", "#22d3ee")}${kpi("w-tas", "Bugün su tasarrufu", "para", "#c084fc")}</div>
    <div class="grid mt" style="grid-template-columns:320px minmax(0,1fr)">
      <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:12px"><div class="muted" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase">Kapasite kullanımı</div><div id="wr"></div>
        <div style="width:100%"><div class="muted" style="font-size:12px;display:flex;justify-content:space-between"><span>Geri kazanım oranı</span><b class="num" id="gv">—</b></div>
          <input type="range" min="0" max="45" step="5" id="gr"><div class="muted" style="font-size:11.5px">Arıtılmış su soğutma kulesi takviyesi ve proses yıkamada kullanılır; m³ başına 0,6 kWh ek enerji harcar.</div></div></div>
      <div class="card"><div class="card-h"><h3>Debi ve çıkış kalitesi</h3><span class="sub">son 12 saat</span></div><div id="wch"></div></div></div>
    <div class="grid mt g2">
      <div class="card"><div class="card-h"><h3>En yüksek kirlilik yükü</h3><span class="sub">kg KOİ / saat</span></div><div id="pol"></div></div>
      <div class="card"><div class="card-h"><h3>Toplamlar</h3><span class="sub">çalışma başından beri</span></div><div class="grid g2" id="wt" style="font-size:13px"></div></div></div>`;
    $("#gr").oninput = (e) => { $("#gv").textContent = "%" + e.target.value; };
    $("#gr").onchange = async (e) => { await ctx.api("/su/ayar", { geri: +e.target.value / 100 }); ctx.toast(`Geri kazanım %${e.target.value}`, "ok"); };
    ctx.poll(async () => { this.paint(ctx, await ctx.api("/su")); }, 4000);
  },
  paint(ctx, d) {
    setKpi("w-in", fmt.n(d.giris), "m³/sa", `kapasite ${fmt.n(d.kapasite)} m³/sa`, d.util);
    setKpi("w-koi", fmt.n(d.koi), "mg/L", d.koi > d.limit ? `<span class="t-crit">sınır ${d.limit} aşıldı</span>` : `sınır ${d.limit} · giriş ${fmt.n(d.koi_giris)}`, d.koi / d.limit);
    setKpi("w-ver", fmt.pct(d.verim, 1), "", `pompa+havalandırma ${fmt.n(d.guc_kw)} kW`);
    setKpi("w-geri", fmt.n(d.bugun.geri_m3), "m³", `toplam giriş ${fmt.n(d.bugun.giris_m3)} m³`);
    setKpi("w-tas", fmt.ktl(d.bugun.tasarruf_tl), "", "şebeke suyu yerine");
    const c = d.util > 1 ? "#f87171" : d.util > 0.9 ? "#fbbf24" : "#38bdf8";
    $("#wr").innerHTML = ring(Math.min(1, d.util), 170, c, "kapasite", "%" + Math.round(d.util * 100));
    if (document.activeElement !== $("#gr")) { $("#gr").value = Math.round(d.geri * 100); $("#gv").textContent = "%" + Math.round(d.geri * 100); }
    const h = d.gecmis;
    lineChart($("#wch"), { height: 250, series: [
      { label: "Giriş debisi (m³/sa)", color: "#38bdf8", data: h.map((p) => [p[0], p[1]]), area: true },
      { label: "Çıkış KOİ (mg/L)", color: "#fbbf24", data: h.map((p) => [p[0], p[2]]) }],
      refs: [{ y: d.limit, label: "KOİ sınırı", color: "#f87171" }, { y: d.kapasite, label: "Kapasite", color: "#64748b" }] });
    bars($("#pol"), d.kirletenler.map((k) => ({ label: k.ad, value: k.yuk_kg_h, color: "#fbbf24", text: `${fmt.n(k.yuk_kg_h, 1)} kg` })));
    const T = d.toplam;
    $("#wt").innerHTML = [["Arıtılan", `${fmt.n(T.giris_m3)} m³`], ["Geri kazanılan", `${fmt.n(T.geri_m3)} m³`], ["Şebeke suyu çekişi", `${fmt.n(T.temiz_m3)} m³`],
      ["Alıcı ortama KOİ", `${fmt.n(T.kirlilik_kg)} kg`], ["Toplam tasarruf", fmt.ktl(T.tasarruf_tl)], ["Anlık verim", fmt.pct(d.verim, 1)]]
      .map(([k, v]) => `<div class="item"><div class="muted">${k}</div><b class="num">${v}</b></div>`).join("");
  },
};
