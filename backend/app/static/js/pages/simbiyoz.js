import { $, $$, esc, fmt, kpi, setKpi, bars } from "../ui.js";
import { createMap } from "../map.js";

let map, det = null;

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g5">
      ${kpi("s-kaz", "Toplam simbiyoz kazancı", "para", "#c084fc")}${kpi("s-geri", "Yeniden kullanılan malzeme", "simbiyoz", "#34d399")}
      ${kpi("s-isi", "Aktarılan atık ısı", "enerji", "#fb923c")}${kpi("s-co2", "Kaçınılan CO₂", "karbon", "#4ade80")}${kpi("s-ber", "Bertarafa giden", "kriz", "#f87171")}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 380px">
      <div class="card" style="padding:10px"><div id="smap"></div></div>
      <div class="card"><div class="card-h"><h3>Bugün üretilen yan ürünler</h3><span class="sub">bölge toplamı</span></div><div id="gen"></div>
        <div class="hr"></div><div class="muted" style="font-size:12.5px">Bağlantısı olmayan stoklar gün sonunda lisanslı bertarafa gider (${fmt.tl(1150)}/t). Her onaylanan bağlantı bu maliyeti kazanca çevirir.</div>
        <div class="mt"><div class="muted" style="font-size:12px">Geri kazanım oranı</div><div class="mini-bar mt" style="height:10px"><i id="rr" style="background:#34d399;width:0"></i></div><div class="num mt" id="rrt"></div></div></div></div>
    <div class="card mt"><div class="card-h"><h3>Aktif bağlantılar</h3><span class="sub" id="lc"></span></div><div class="grid g3" id="links"></div></div>
    <div class="card mt"><div class="card-h"><h3>Fırsat motoru</h3><span class="sub">saatlik taranır · mesafe, değer, taşıma maliyeti ve boru hattı yatırımıyla puanlanır</span></div>
      <div class="tbl-wrap"><table class="tbl" id="opp"></table></div></div>`;
    map = createMap($("#smap"), ctx, { height: 440, layer: "sektor", overlays: { lojistik: false, simbiyoz: true, olay: false } });
    ctx.poll(async () => { det = await ctx.api("/simbiyoz"); this.paint(ctx); }, 4000);
  },
  paint(ctx) {
    const d = det, W = ctx.world, T = d.toplam;
    setKpi("s-kaz", fmt.ktl(T.kazanc_tl), "", `bugün ${fmt.ktl(d.bugun.kazanc_tl)}`);
    setKpi("s-geri", fmt.n(T.geri_t, 1), "t", `bugün ${fmt.n(d.bugun.geri_t, 1)} t`);
    setKpi("s-isi", fmt.n(T.isi_mwh, 1), "MWh", `bugün ${fmt.n(d.bugun.isi_mwh, 1)} MWh · kayıp ${fmt.n(T.kayip_isi_mwh, 0)} MWh`);
    setKpi("s-co2", fmt.n(T.co2_t, 1), "t", "yeniden kullanım sayesinde");
    setKpi("s-ber", fmt.n(T.bertaraf_t, 0), "t", `maliyet ${fmt.ktl(T.bertaraf_tl)}`);
    const gen = Object.values(d.uretim_bugun).sort((a, b) => b.miktar - a.miktar);
    bars($("#gen"), gen.map((g) => ({ label: g.ad, value: g.miktar, color: g.renk, text: `${fmt.n(g.miktar, 1)} ${g.birim}` })));
    $("#rr").style.width = d.geri_kazanim_orani * 100 + "%";
    $("#rrt").textContent = `${fmt.pct(d.geri_kazanim_orani)} (katı atık, bugün)`;
    const act = d.baglantilar.filter((l) => l.aktif);
    $("#lc").textContent = `${act.length} aktif`;
    $("#links").innerHTML = act.map((l) => `<div class="item"><div class="ttl"><span class="tag"><span class="sw" style="background:${W.atiklar[l.atik].renk}"></span>${esc(l.atik_ad)}</span><span class="dim" style="margin-left:auto;font-weight:400">${l.lid}</span></div>
      <div style="margin-top:6px"><a href="javascript:void 0" data-f="${l.ureten}">${esc(l.ureten_ad)}</a> <span class="dim">→</span> <a href="javascript:void 0" data-f="${l.alan}">${esc(l.alan_ad)}</a></div>
      <div class="grid g3 mt" style="gap:6px;font-size:12px"><div><span class="muted">Aktarılan</span><br><b class="num">${fmt.n(l.aktarilan, 1)} ${l.birim}</b></div><div><span class="muted">Kazanç</span><br><b class="num">${fmt.ktl(l.kazanc_tl)}</b></div><div><span class="muted">CO₂</span><br><b class="num">${fmt.n(l.co2_t, 1)} t</b></div></div>
      <div class="row"><span class="muted" style="font-size:12px">${l.tasima} · ${fmt.n(l.mesafe_km, 2)} km${l.sefer ? ` · ${l.sefer} sefer` : ""}${l.bekleyen ? " · kamyon yolda" : ""}</span><button class="btn sm danger" data-stop="${l.lid}" style="margin-left:auto">Durdur</button></div></div>`).join("") || `<div class="empty">Henüz bağlantı yok — aşağıdan bir fırsatı onayla</div>`;
    $("#opp").innerHTML = `<tr><th>Atık</th><th>Üreten → Alan</th><th class="r">Mesafe</th><th>Taşıma</th><th class="r">Aylık miktar</th><th class="r">Aylık kazanç</th><th class="r">Aylık CO₂</th><th class="r">Yatırım</th><th></th></tr>` +
      d.firsatlar.map((o) => `<tr><td><span class="tag"><span class="sw" style="background:${W.atiklar[o.atik].renk}"></span>${esc(o.atik_ad)}</span></td>
        <td><a href="javascript:void 0" data-f="${o.ureten}">${esc(o.ureten_ad)}</a> <span class="dim">→</span> <a href="javascript:void 0" data-f="${o.alan}">${esc(o.alan_ad)}</a></td>
        <td class="r num">${fmt.n(o.mesafe_km, 2)} km</td><td>${o.tasima}</td><td class="r num">${fmt.n(o.aylik_miktar, 1)} ${o.birim}</td>
        <td class="r num t-ok">${fmt.ktl(o.aylik_kazanc_tl)}</td><td class="r num">${fmt.n(o.aylik_co2_t, 1)} t</td>
        <td class="r num">${o.yatirim_tl ? `${fmt.ktl(o.yatirim_tl)}<br><span class="dim">${o.geri_odeme_ay} ay geri ödeme</span>` : "—"}</td>
        <td><button class="btn sm pri" data-opp="${esc(o.id)}">Onayla</button></td></tr>`).join("");
    $$("[data-f]").forEach((a) => a.onclick = () => ctx.openFactory(a.dataset.f));
    $$("[data-opp]").forEach((b) => b.onclick = async () => { b.disabled = true; if (await ctx.runAction({ tip: "simbiyoz", id: b.dataset.opp })) { det = await ctx.api("/simbiyoz"); this.paint(ctx); } });
    $$("[data-stop]").forEach((b) => b.onclick = async () => { await ctx.api("/simbiyoz/durdur/" + b.dataset.stop, {}); ctx.toast("Bağlantı durduruldu"); det = await ctx.api("/simbiyoz"); this.paint(ctx); });
  },
  update(l) { map && map.update(l); },
  unmount() { map && map.destroy(); map = null; det = null; },
};
