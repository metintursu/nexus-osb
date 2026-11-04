import { $, $$, esc, fmt, st, sectorTag, STATUS } from "../ui.js";

let data = [], sortK = "kw", sortDir = -1, filt = { q: "", s: "", d: "" };
const COLS = [
  ["ad", "Tesis"], ["sektor", "Sektör"], ["d", "Durum"], ["calisan", "Çalışan", 1], ["kw", "Güç (MW)", 1], ["oee", "OEE", 1],
  ["co2", "tCO₂/sa", 1], ["kwh", "Bugün MWh", 1], ["ciro", "Bugün ciro", 1], ["durus", "Duruş dk", 1],
];

function row(f) {
  return { ...f, kwh: f.bugun.kwh / 1000, ciro: f.bugun.ciro_tl, durus: f.bugun.durus_dk, co2: f.co2 / 1000 };
}

export default {
  mount(root, ctx) {
    const W = ctx.world;
    root.innerHTML = `<div class="grid g4" id="tsum"></div>
      <div class="card mt"><div class="card-h"><h3>Tüm tesisler</h3><span class="sub" id="tcnt"></span>
        <span class="act"><input class="inp" id="tq" placeholder="Tesis ara…" style="width:190px">
        <select class="inp" id="ts"><option value="">Tüm sektörler</option>${Object.entries(W.sektorler).map(([k, v]) => `<option value="${k}">${esc(v.ad)}</option>`).join("")}</select>
        <select class="inp" id="td"><option value="">Tüm durumlar</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></span></div>
        <div class="tbl-wrap"><table class="tbl" id="tt"></table></div></div>`;
    $("#tq").oninput = (e) => { filt.q = e.target.value.toLowerCase(); this.render(ctx); };
    $("#ts").onchange = (e) => { filt.s = e.target.value; this.render(ctx); };
    $("#td").onchange = (e) => { filt.d = e.target.value; this.render(ctx); };
    ctx.poll(async () => { data = (await ctx.api("/fabrikalar")).map(row); this.render(ctx); }, 3000);
  },
  render(ctx) {
    const W = ctx.world;
    let rows = data.filter((f) => (!filt.q || f.ad.toLowerCase().includes(filt.q) || f.id.toLowerCase().includes(filt.q)) && (!filt.s || f.sektor === filt.s) && (!filt.d || f.d === filt.d));
    rows.sort((a, b) => { const x = a[sortK], y = b[sortK]; return (typeof x === "string" ? x.localeCompare(y, "tr") : x - y) * sortDir; });
    $("#tcnt").textContent = `${rows.length} / ${data.length} tesis`;
    const maxkw = Math.max(...data.map((f) => f.kurulu_kw), 1);
    $("#tt").innerHTML = `<tr>${COLS.map(([k, t, r]) => `<th class="sort ${r ? "r" : ""}" data-k="${k}">${t}${sortK === k ? (sortDir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr>` +
      rows.map((f) => `<tr class="click" data-id="${f.id}"><td><b>${esc(f.ad)}</b> <span class="dim">${f.id}</span>${f.canli ? ` <span style="color:#fb7185">● canlı</span>` : ""}${f.dr ? ` <span class="t-acc" title="Talep kaydırma">⇄</span>` : ""}</td>
        <td>${sectorTag(W, f.sektor)}</td><td>${st(f.d)}</td><td class="r num">${fmt.n(f.calisan)}</td>
        <td class="r"><div style="display:flex;gap:8px;align-items:center;justify-content:flex-end"><span class="num">${fmt.mw(f.kw, 2)}</span><div class="mini-bar" style="width:70px"><i style="width:${(f.kw / maxkw) * 100}%;background:${f.renk}"></i></div></div></td>
        <td class="r num" style="color:${f.oee < 0.65 ? "#fbbf24" : ""}">${fmt.pct(f.oee)}</td><td class="r num">${fmt.n(f.co2, 2)}</td><td class="r num">${fmt.n(f.kwh, 1)}</td>
        <td class="r num">${fmt.ktl(f.ciro)}</td><td class="r num" style="color:${f.durus > 60 ? "#f87171" : ""}">${fmt.n(f.durus)}</td></tr>`).join("");
    $$("#tt th.sort").forEach((th) => th.onclick = () => { const k = th.dataset.k; sortDir = sortK === k ? -sortDir : -1; sortK = k; this.render(ctx); });
    $$("#tt tr.click").forEach((tr) => tr.onclick = () => ctx.openFactory(tr.dataset.id));
    // sektör özeti
    const agg = {};
    data.forEach((f) => { const a = (agg[f.sektor] = agg[f.sektor] || { n: 0, kw: 0, co2: 0, ciro: 0, oee: 0 }); a.n++; a.kw += f.kw; a.co2 += f.co2; a.ciro += f.ciro; a.oee += f.oee; });
    const top = Object.entries(agg).sort((a, b) => b[1].kw - a[1].kw).slice(0, 4);
    $("#tsum").innerHTML = top.map(([k, a]) => `<div class="card"><div style="display:flex;align-items:center;gap:8px">${sectorTag(W, k)}<span class="muted" style="margin-left:auto">${a.n} tesis</span></div>
      <div class="grid g3 mt" style="gap:6px;font-size:12px"><div><span class="muted">Güç</span><br><b class="num">${fmt.mw(a.kw, 1)} MW</b></div><div><span class="muted">Emisyon</span><br><b class="num">${fmt.n(a.co2, 1)} t/sa</b></div><div><span class="muted">Ort. OEE</span><br><b class="num">${fmt.pct(a.oee / a.n)}</b></div></div></div>`).join("");
  },
  unmount() { data = []; },
};
