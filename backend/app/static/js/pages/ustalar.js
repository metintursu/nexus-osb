import { $, $$, esc, fmt, kpi, setKpi } from "../ui.js";
import { createMap } from "../map.js";

let map;
const DUR = { musait: ["🟢", "Müsait"], yolda: ["🟣", "Olay yerine gidiyor"], mudahalede: ["🔧", "Müdahalede"] };

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid g4">${kpi("u-m", "Müsait usta", "kisi", "#34d399")}${kpi("u-g", "Görevdeki usta", "kisi", "#c084fc")}${kpi("u-t", "Toplam görev", "kriz", "#fbbf24")}${kpi("u-k", "Kazanılan duruş", "para", "#22d3ee")}</div>
    <div class="note mt">Usta bilgisi tek fabrikaya kilitli kalmaz. Arıza açıldığında doğru uzmanlıktaki en yakın ve en kıdemli müsait usta yönlendirilir. Usta olay yerine varınca Dijital Usta reçetesiyle kalan duruş yaklaşık %45 kısalır.</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,1fr) 420px">
      <div class="card" style="padding:10px"><div id="umap"></div></div>
      <div class="card"><div class="card-h"><h3>Görev kaydı</h3></div><div class="feed" id="ulog" style="max-height:440px;overflow:auto"></div></div></div>
    <div class="card mt"><div class="card-h"><h3>Usta kadrosu</h3></div><div class="tbl-wrap"><table class="tbl" id="ut"></table></div></div>`;
    map = createMap($("#umap"), ctx, { height: 460, layer: "durum", overlays: { lojistik: true, simbiyoz: false, olay: true }, tools: false });
    ctx.poll(async () => this.paint(ctx, await ctx.api("/ustalar")), 3000);
  },
  paint(ctx, d) {
    const free = d.ustalar.filter((u) => u.durum === "musait").length;
    setKpi("u-m", free, `/ ${d.ustalar.length}`, "", free / d.ustalar.length);
    setKpi("u-g", d.ustalar.length - free, "", "yolda veya müdahalede");
    setKpi("u-t", fmt.n(d.toplam.gorev), "", d.toplam.ulasilamayan ? `${d.toplam.ulasilamayan} arızada usta bulunamadı` : "tüm arızalara ulaşıldı");
    setKpi("u-k", fmt.n(d.toplam.kazanilan_dk), "dk", `≈ ${fmt.n(d.toplam.kazanilan_dk / 60, 1)} saat üretim`);
    $("#ulog").innerHTML = d.kayit.map((k) => `<div><span class="t">${fmt.t(k.t)}</span><span>${esc(k.metin)}</span></div>`).join("") || `<div class="empty">Henüz görev yok</div>`;
    $("#ut").innerHTML = `<tr><th>Usta</th><th>Uzmanlık</th><th class="r">Kıdem</th><th>Durum</th><th>Görev</th><th>Bağlı tesis</th><th class="r">Müdahale</th><th class="r">Kazandırdığı</th></tr>` +
      d.ustalar.map((u) => `<tr><td><b>${esc(u.ad)}</b></td><td>${u.uzmanlik.map((s) => `<span class="tag">${esc(d.beceriler[s])}</span>`).join(" ")}</td><td class="r num">${u.kidem} yıl</td>
        <td>${DUR[u.durum][0]} ${DUR[u.durum][1]}</td><td>${u.gorev_ad ? esc(u.gorev_ad) : "—"}</td><td class="muted">${esc(u.ev_ad)}</td><td class="r num">${u.mudahale}</td><td class="r num">${fmt.n(u.kazanilan_dk)} dk</td></tr>`).join("");
  },
  update(l) { map && map.update(l); },
  unmount() { map && map.destroy(); map = null; },
};
