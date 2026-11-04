import { $, $$, esc, fmt, kpi, setKpi } from "../ui.js";
import { createMap } from "../map.js";

let map;
const DUR = { musait: ["🟢", "Available"], yolda: ["🟣", "Heading to site"], mudahalede: ["🔧", "On site"] };

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g4">${kpi("u-m", "Available technicians", "kisi", "#34d399")}${kpi("u-g", "Technicians on a job", "kisi", "#c084fc")}${kpi("u-t", "Total jobs", "kriz", "#fbbf24")}${kpi("u-k", "Downtime saved", "para", "#22d3ee")}</div>
    <div class="note mt">Know-how is no longer locked inside one plant. When a fault opens, the nearest and most senior available technician with the right skill is dispatched. On arrival, the Digital Master playbook cuts the remaining downtime by about 45%.</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 420px">
      <div class="card" style="padding:10px"><div id="umap"></div></div>
      <div class="card"><div class="card-h"><h3>Job log</h3></div><div class="feed" id="ulog" style="max-height:440px;overflow:auto"></div></div></div>
    <div class="card mt"><div class="card-h"><h3>Technician roster</h3></div><div class="tbl-wrap"><table class="tbl" id="ut"></table></div></div>`;
    map = createMap($("#umap"), ctx, { height: 460, layer: "durum", overlays: { lojistik: true, simbiyoz: false, olay: true }, tools: false });
    ctx.poll(async () => this.paint(ctx, await ctx.api("/ustalar")), 3000);
  },
  paint(ctx, d) {
    const free = d.ustalar.filter((u) => u.durum === "musait").length;
    setKpi("u-m", free, `/ ${d.ustalar.length}`, "", free / d.ustalar.length);
    setKpi("u-g", d.ustalar.length - free, "", "en route or on site");
    setKpi("u-t", fmt.n(d.toplam.gorev), "", d.toplam.ulasilamayan ? `no technician available for ${d.toplam.ulasilamayan} faults` : "every fault was reached");
    setKpi("u-k", fmt.n(d.toplam.kazanilan_dk), "min", `≈ ${fmt.n(d.toplam.kazanilan_dk / 60, 1)} hours of production`);
    $("#ulog").innerHTML = d.kayit.map((k) => `<div><span class="t">${fmt.t(k.t)}</span><span>${esc(k.metin)}</span></div>`).join("") || `<div class="empty">No jobs yet</div>`;
    $("#ut").innerHTML = `<tr><th>Technician</th><th>Skills</th><th class="r">Experience</th><th>Status</th><th>Job</th><th>Home site</th><th class="r">Jobs done</th><th class="r">Downtime saved</th></tr>` +
      d.ustalar.map((u) => `<tr><td><b>${esc(u.ad)}</b></td><td>${u.uzmanlik.map((s) => `<span class="tag">${esc(d.beceriler[s])}</span>`).join(" ")}</td><td class="r num">${u.kidem} yrs</td>
        <td>${DUR[u.durum][0]} ${DUR[u.durum][1]}</td><td>${u.gorev_ad ? esc(u.gorev_ad) : "—"}</td><td class="muted">${esc(u.ev_ad)}</td><td class="r num">${u.mudahale}</td><td class="r num">${fmt.n(u.kazanilan_dk)} min</td></tr>`).join("");
  },
  update(l) { map && map.update(l); },
  unmount() { map && map.destroy(); map = null; },
};
