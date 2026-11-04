import { $, $$, esc, fmt, STATUS, STATUS_COLOR } from "../ui.js";
import { createMap } from "../map.js";

let map, sel = null;

export default {
  mount(root, ctx) {
    const W = ctx.world;
    root.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1fr) 300px">
      <div class="card" style="padding:10px"><div id="hm"></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>${L(`Site status`, `Tesis durumları`)}</h3></div><div id="hs" class="bars"></div></div>
        <div class="card"><div class="card-h"><h3>${L(`Sectors`, `Sektörler`)}</h3><span class="sub">${L(`click to highlight`, `vurgulamak için tıkla`)}</span></div><div class="list" id="hsec"></div></div>
        <div class="card"><div class="card-h"><h3>${L(`Shared infrastructure`, `Ortak altyapı`)}</h3></div><div id="hinf" style="font-size:12.5px;display:grid;gap:6px"></div></div>
      </div></div>`;
    const h = Math.max(520, window.innerHeight - 140);
    map = createMap($("#hm"), ctx, { height: h, overlays: { trafo: true } });
    const secs = {};
    W.fabrikalar.forEach((f) => { (secs[f.sektor] = secs[f.sektor] || []).push(f); });
    $("#hsec").innerHTML = Object.entries(secs).map(([k, l]) => L(`<div class="item click" data-s="${k}" style="padding:8px 10px"><div class="ttl" style="font-size:13px">
      <span class="tag"><span class="sw" style="background:${W.sektorler[k].renk}"></span>${esc(W.sektorler[k].kisa)}</span>${esc(W.sektorler[k].ad)}<span class="muted" style="margin-left:auto;font-weight:400">${l.length} site${l.length > 1 ? "s" : ""}</span></div></div>`, `<div class="item click" data-s="${k}" style="padding:8px 10px"><div class="ttl" style="font-size:13px">
      <span class="tag"><span class="sw" style="background:${W.sektorler[k].renk}"></span>${esc(W.sektorler[k].kisa)}</span>${esc(W.sektorler[k].ad)}<span class="muted" style="margin-left:auto;font-weight:400">${l.length} tesis</span></div></div>`)).join("");
    $$("#hsec [data-s]").forEach((el) => el.onclick = () => {
      sel = sel === el.dataset.s ? null : el.dataset.s;
      $$("#hsec [data-s]").forEach((x) => x.style.borderColor = x.dataset.s === sel ? "var(--accent)" : "");
      map.setHighlight(sel ? secs[sel].map((f) => f.id) : []);
    });
    this.update(ctx.live(), ctx);
  },
  update(l, ctx) {
    if (!l) return;
    map && map.update(l);
    const cnt = {};
    l.f.forEach((f) => { cnt[f.d] = (cnt[f.d] || 0) + 1; });
    $("#hs").innerHTML = Object.keys(STATUS).map((k) => `<div class="b-row" style="grid-template-columns:110px 1fr 30px"><span>${STATUS[k]}</span><div class="b-track"><i style="width:${((cnt[k] || 0) / l.f.length) * 100}%;background:${STATUS_COLOR[k]}"></i></div><span class="b-val">${cnt[k] || 0}</span></div>`).join("");
    const e = l.e;
    $("#hinf").innerHTML = L(`<div>☀ Solar <b class="num">${fmt.mw(e.ges)} MW</b> <span class="muted">/ ${fmt.mw(ctx.world.ges_kwp, 0)} MWp</span></div>
      <div>🔋 Battery <b class="num">${Math.round(e.soc * 100)}%</b> <span class="muted">${e.bess > 50 ? "discharging " + fmt.mw(e.bess) + " MW" : e.bess < -50 ? "charging " + fmt.mw(-e.bess) + " MW" : "standby"}</span></div>
      <div>♻ Biogas <b class="num">${fmt.n(e.bio)} kW</b></div>
      <div>⚡ Substations ${e.tm.map((u, i) => `<b class="num" style="color:${u > 1 ? "#f87171" : u > 0.9 ? "#fbbf24" : "#34d399"}">TM${i + 1} ${Math.round(u * 100)}%</b>`).join(" ")}</div>
      <div>💧 Wastewater <b class="num">${Math.round(l.su.util * 100)}%</b> · COD <b class="num">${l.su.koi}</b> mg/L</div>
      <div>🚚 Fleet <b class="num">${l.l.aktif}/${ctx.world.filo || 48}</b> active · <b class="num">${l.l.bekleyen}</b> jobs waiting</div>`, `<div>☀ GES <b class="num">${fmt.mw(e.ges)} MW</b> <span class="muted">/ ${fmt.mw(ctx.world.ges_kwp, 0)} MWp</span></div>
      <div>🔋 Batarya <b class="num">%${Math.round(e.soc * 100)}</b> <span class="muted">${e.bess > 50 ? "deşarj " + fmt.mw(e.bess) + " MW" : e.bess < -50 ? "şarj " + fmt.mw(-e.bess) + " MW" : "beklemede"}</span></div>
      <div>♻ Biyogaz <b class="num">${fmt.n(e.bio)} kW</b></div>
      <div>⚡ Trafolar ${e.tm.map((u, i) => `<b class="num" style="color:${u > 1 ? "#f87171" : u > 0.9 ? "#fbbf24" : "#34d399"}">TM${i + 1} %${Math.round(u * 100)}</b>`).join(" ")}</div>
      <div>💧 Arıtma <b class="num">%${Math.round(l.su.util * 100)}</b> · KOİ <b class="num">${l.su.koi}</b> mg/L</div>
      <div>🚚 Filo <b class="num">${l.l.aktif}/48</b> aktif · <b class="num">${l.l.bekleyen}</b> bekleyen iş</div>`);
  },
  unmount() { map && map.destroy(); map = null; sel = null; },
};
