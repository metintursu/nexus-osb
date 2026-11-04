import { $, $$, esc, fmt, kpi, setKpi, bars } from "../ui.js";
import { createMap } from "../map.js";

let map, det = null;

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g5">
      ${kpi("s-kaz", "Total symbiosis gains", "para", "#c084fc")}${kpi("s-geri", "Materials reused", "simbiyoz", "#34d399")}
      ${kpi("s-isi", "Waste heat transferred", "enerji", "#fb923c")}${kpi("s-co2", "CO₂ avoided", "karbon", "#4ade80")}${kpi("s-ber", "Sent to disposal", "kriz", "#f87171")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 380px;align-items:start">
      <div class="card" style="padding:10px"><div id="smap"></div></div>
      <div class="card"><div class="card-h"><h3>By-products generated today</h3><span class="sub">zone total</span></div><div id="gen"></div>
        <div class="hr"></div><div class="muted" style="font-size:12.5px">Stock without a link goes to licensed disposal at the end of the day (${fmt.tl(1150)}/t). Every approved link turns that cost into a gain.</div>
        <div class="mt"><div class="muted" style="font-size:12px">Reuse rate</div><div class="mini-bar mt" style="height:10px"><i id="rr" style="background:#34d399;width:0"></i></div><div class="num mt" id="rrt"></div></div></div></div>
    <div class="card mt"><div class="card-h"><h3>Active links</h3><span class="sub" id="lc"></span></div><div class="grid g3" id="links"></div></div>
    <div class="card mt"><div class="card-h"><h3>Opportunity engine</h3><span class="sub">scanned hourly · scored by distance, value, transport cost and pipeline investment</span></div>
      <div class="tbl-wrap"><table class="tbl" id="opp"></table></div></div>`;
    map = createMap($("#smap"), ctx, { height: 440, layer: "sektor", overlays: { lojistik: false, simbiyoz: true, olay: false } });
    ctx.poll(async () => { det = await ctx.api("/simbiyoz"); this.paint(ctx); }, 4000);
  },
  paint(ctx) {
    const d = det, W = ctx.world, T = d.toplam;
    if (!$("#gen")) return;
    setKpi("s-kaz", fmt.ktl(T.kazanc_tl), "", `today ${fmt.ktl(d.bugun.kazanc_tl)}`);
    setKpi("s-geri", fmt.n(T.geri_t, 1), "t", `today ${fmt.n(d.bugun.geri_t, 1)} t`);
    setKpi("s-isi", fmt.n(T.isi_mwh, 1), "MWh", `today ${fmt.n(d.bugun.isi_mwh, 1)} MWh · lost ${fmt.n(T.kayip_isi_mwh, 0)} MWh`);
    setKpi("s-co2", fmt.n(T.co2_t, 1), "t", "thanks to reuse");
    setKpi("s-ber", fmt.n(T.bertaraf_t, 0), "t", `cost ${fmt.ktl(T.bertaraf_tl)}`);
    const gen = Object.values(d.uretim_bugun).sort((a, b) => b.miktar - a.miktar);
    bars($("#gen"), gen.map((g) => ({ label: g.ad, value: g.miktar, color: g.renk, text: `${fmt.n(g.miktar, 1)} ${g.birim}` })));
    $("#rr").style.width = d.geri_kazanim_orani * 100 + "%";
    $("#rrt").textContent = `${fmt.pct(d.geri_kazanim_orani)} (solid waste, today)`;
    const act = d.baglantilar.filter((l) => l.aktif);
    $("#lc").textContent = `${act.length} active`;
    $("#links").innerHTML = act.map((l) => `<div class="item"><div class="ttl"><span class="tag"><span class="sw" style="background:${W.atiklar[l.atik].renk}"></span>${esc(l.atik_ad)}</span><span class="dim" style="margin-left:auto;font-weight:400">${l.lid}</span></div>
      <div style="margin-top:6px"><a href="javascript:void 0" data-f="${l.ureten}">${esc(l.ureten_ad)}</a> <span class="dim">→</span> <a href="javascript:void 0" data-f="${l.alan}">${esc(l.alan_ad)}</a></div>
      <div class="grid g3 mt" style="gap:6px;font-size:12px"><div><span class="muted">Transferred</span><br><b class="num">${fmt.n(l.aktarilan, 1)} ${l.birim}</b></div><div><span class="muted">Gain</span><br><b class="num">${fmt.ktl(l.kazanc_tl)}</b></div><div><span class="muted">CO₂</span><br><b class="num">${fmt.n(l.co2_t, 1)} t</b></div></div>
      <div class="row"><span class="muted" style="font-size:12px">${l.tasima} · ${fmt.n(l.mesafe_km, 2)} km${l.sefer ? ` · ${l.sefer} trips` : ""}${l.bekleyen ? " · truck en route" : ""}</span><button class="btn sm danger" data-stop="${l.lid}" style="margin-left:auto">Stop</button></div></div>`).join("") || `<div class="empty">No links yet — approve an opportunity below</div>`;
    $("#opp").innerHTML = `<tr><th>Waste</th><th>Producer → Receiver</th><th class="r">Distance</th><th>Transport</th><th class="r">Monthly amount</th><th class="r">Monthly gain</th><th class="r">Monthly CO₂</th><th class="r">Investment</th><th></th></tr>` +
      d.firsatlar.map((o) => `<tr><td><span class="tag"><span class="sw" style="background:${W.atiklar[o.atik].renk}"></span>${esc(o.atik_ad)}</span></td>
        <td><a href="javascript:void 0" data-f="${o.ureten}">${esc(o.ureten_ad)}</a> <span class="dim">→</span> <a href="javascript:void 0" data-f="${o.alan}">${esc(o.alan_ad)}</a></td>
        <td class="r num">${fmt.n(o.mesafe_km, 2)} km</td><td>${o.tasima}</td><td class="r num">${fmt.n(o.aylik_miktar, 1)} ${o.birim}</td>
        <td class="r num t-ok">${fmt.ktl(o.aylik_kazanc_tl)}</td><td class="r num">${fmt.n(o.aylik_co2_t, 1)} t</td>
        <td class="r num">${o.yatirim_tl ? `${fmt.ktl(o.yatirim_tl)}<br><span class="dim">${o.geri_odeme_ay}-month payback</span>` : "—"}</td>
        <td><button class="btn sm pri" data-opp="${esc(o.id)}">Approve</button></td></tr>`).join("");
    $$("[data-f]").forEach((a) => a.onclick = () => ctx.openFactory(a.dataset.f));
    $$("[data-opp]").forEach((b) => b.onclick = async () => { b.disabled = true; if (await ctx.runAction({ tip: "simbiyoz", id: b.dataset.opp })) { det = await ctx.api("/simbiyoz"); this.paint(ctx); } });
    $$("[data-stop]").forEach((b) => b.onclick = async () => { await ctx.api("/simbiyoz/durdur/" + b.dataset.stop, {}); ctx.toast("Link stopped"); det = await ctx.api("/simbiyoz"); this.paint(ctx); });
  },
  update(l) { map && map.update(l); },
  unmount() { map && map.destroy(); map = null; det = null; },
};
