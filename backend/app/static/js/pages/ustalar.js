import { $, $$, esc, fmt, kpi, setKpi } from "../ui.js";
import { createMap } from "../map.js";

let map;
const DUR = { musait: ["🟢", L("Available", "Müsait")], yolda: ["🟣", L("Heading to site", "Olay yerine gidiyor")], mudahalede: ["🔧", L("On site", "Müdahalede")] };

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g4">${kpi("u-m", L("Available technicians", "Müsait usta"), "kisi", "#34d399")}${kpi("u-g", L("Technicians on a job", "Görevdeki usta"), "kisi", "#c084fc")}${kpi("u-t", L("Total jobs", "Toplam görev"), "kriz", "#fbbf24")}${kpi("u-k", L("Downtime saved", "Kazanılan duruş"), "para", "#22d3ee")}</div>
    <div class="note mt">${L(`Know-how is no longer locked inside one plant. When a fault opens, the nearest and most senior available technician with the right skill is dispatched. On arrival, the Digital Master playbook cuts the remaining downtime by about 45%.`, `Usta bilgisi tek fabrikaya kilitli kalmaz. Arıza açıldığında doğru uzmanlıktaki en yakın ve en kıdemli müsait usta yönlendirilir. Usta olay yerine varınca Dijital Usta reçetesiyle kalan duruş yaklaşık %45 kısalır.`)}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 420px">
      <div class="card" style="padding:10px"><div id="umap"></div></div>
      <div class="card"><div class="card-h"><h3>${L(`Job log`, `Görev kaydı`)}</h3></div><div class="feed" id="ulog" style="max-height:440px;overflow:auto"></div></div></div>
    <div class="card mt"><div class="card-h"><h3>${L(`Technician roster`, `Usta kadrosu`)}</h3></div><div class="tbl-wrap"><table class="tbl" id="ut"></table></div></div>`;
    map = createMap($("#umap"), ctx, { height: 460, layer: "durum", overlays: { lojistik: true, simbiyoz: false, olay: true }, tools: false });
    ctx.poll(async () => this.paint(ctx, await ctx.api("/ustalar")), 3000);
  },
  paint(ctx, d) {
    const free = d.ustalar.filter((u) => u.durum === "musait").length;
    setKpi("u-m", free, `/ ${d.ustalar.length}`, "", free / d.ustalar.length);
    setKpi("u-g", d.ustalar.length - free, "", L("en route or on site", "yolda veya müdahalede"));
    setKpi("u-t", fmt.n(d.toplam.gorev), "", d.toplam.ulasilamayan ? `no technician available for ${d.toplam.ulasilamayan} ${L(`faults`, `arızada usta bulunamadı`)}` : L("every fault was reached", "tüm arızalara ulaşıldı"));
    setKpi("u-k", fmt.n(d.toplam.kazanilan_dk), L("min", "dk"), `≈ ${fmt.n(d.toplam.kazanilan_dk / 60, 1)} ${L(`hours of production`, `saat üretim`)}`);
    $("#ulog").innerHTML = d.kayit.map((k) => `<div><span class="t">${fmt.t(k.t)}</span><span>${esc(k.metin)}</span></div>`).join("") || `<div class="empty">${L(`No jobs yet`, `Henüz görev yok`)}</div>`;
    $("#ut").innerHTML = `<tr><th>${L(`Technician`, `Usta`)}</th><th>${L(`Skills`, `Uzmanlık`)}</th><th class="r">${L(`Experience`, `Kıdem`)}</th><th>${L(`Status`, `Durum`)}</th><th>${L(`Job`, `Görev`)}</th><th>${L(`Home site`, `Bağlı tesis`)}</th><th class="r">${L(`Jobs done`, `Müdahale`)}</th><th class="r">${L(`Downtime saved`, `Kazandırdığı`)}</th></tr>` +
      d.ustalar.map((u) => `<tr><td><b>${esc(u.ad)}</b></td><td>${u.uzmanlik.map((s) => `<span class="tag">${esc(d.beceriler[s])}</span>`).join(" ")}</td><td class="r num">${u.kidem} ${L(`yrs`, `yıl`)}</td>
        <td>${DUR[u.durum][0]} ${DUR[u.durum][1]}</td><td>${u.gorev_ad ? esc(u.gorev_ad) : "—"}</td><td class="muted">${esc(u.ev_ad)}</td><td class="r num">${u.mudahale}</td><td class="r num">${fmt.n(u.kazanilan_dk)} ${L(`min`, `dk`)}</td></tr>`).join("");
  },
  update(l) { map && map.update(l); },
  unmount() { map && map.destroy(); map = null; },
};
