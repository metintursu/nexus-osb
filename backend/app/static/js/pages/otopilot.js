import { $, $$, esc, fmt, kpi, setKpi } from "../ui.js";

const MOD = { enerji: "⚡", lojistik: "🚚", simbiyoz: "♻", pazaryeri: "🤝", su: "💧", kriz: "🚨" };

export default {
  mount(root, ctx) {
    root.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)">
      <div class="card" style="display:flex;gap:22px;align-items:center">
        <div><div class="muted" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase">${L(`Zone autopilot`, `Bölge otopilotu`)}</div>
          <div class="big-num" id="apst">—</div>
          <div class="muted" style="font-size:13px;max-width:440px">${L(`When on, the Zone Brain scans the zone every 10 simulated minutes and applies the rules. The reason for every decision lands in the log below. Big decisions that need investment are left for human approval.`, `Açıkken Bölge Beyni her 10 simülasyon dakikasında bölgeyi tarar ve kuralları uygular. Her kararın gerekçesi aşağıdaki günlüğe düşer. Yatırım gerektiren büyük kararlar insan onayına bırakılır.`)}</div></div>
        <button class="btn pri" id="aptg" style="margin-left:auto;font-size:15px;padding:12px 20px">—</button></div>
      <div class="grid g2">${kpi("ap-k", L("Decisions applied", "Uygulanan karar"), "otopilot", "#34d399")}${kpi("ap-t", L("Estimated gain", "Tahmini kazanç"), "para", "#c084fc")}</div></div>
    <div class="grid mt" style="grid-template-columns:380px minmax(0,1fr)">
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>${L(`Rules`, `Kurallar`)}</h3><span class="sub">${L(`toggle each one on or off`, `tek tek açılıp kapatılabilir`)}</span></div><div class="list" id="rules"></div></div>
        <div class="card"><div class="card-h"><h3>${L(`Waiting for human approval`, `İnsan onayı bekleyen`)}</h3></div><div class="list" id="pend"></div></div></div>
      <div class="card"><div class="card-h"><h3>${L(`Decision log`, `Karar günlüğü`)}</h3><span class="sub">${L(`newest first`, `en yeni üstte`)}</span></div><div class="feed" id="alog" style="max-height:calc(100vh - 330px);overflow:auto"></div></div></div>`;
    $("#aptg").onclick = async () => { const d = await ctx.api("/otopilot", { aktif: !this.d.aktif }); this.paint(ctx, d); };
    ctx.poll(async () => this.paint(ctx, await ctx.api("/otopilot")), 3000);
  },
  paint(ctx, d) {
    this.d = d;
    $("#apst").innerHTML = d.aktif ? `<span class="t-ok">${L(`ACTIVE`, `DEVREDE`)}</span>` : `<span class="muted">${L(`OFF`, `KAPALI`)}</span>`;
    $("#aptg").textContent = d.aktif ? L("Turn autopilot off", "Otopilotu kapat") : L("✈ Turn autopilot on", "✈ Otopilotu devreye al");
    $("#aptg").className = d.aktif ? "btn danger" : "btn pri";
    $("#aptg").style.cssText = "margin-left:auto;font-size:15px;padding:12px 20px";
    setKpi("ap-k", fmt.n(d.istatistik.karar), "", L("this session", "bu oturumda"));
    setKpi("ap-t", fmt.ktl(d.istatistik.tahmini_kazanc_tl), "", L("estimated impact of decisions", "kararların tahmini etkisi"));
    $("#rules").innerHTML = d.kurallar.map((r) => `<div class="item" style="padding:8px 10px"><label class="switch ${r.acik ? "on" : ""}" data-k="${r.k}"><i></i><span style="font-size:12.5px">${esc(r.metin)}</span></label></div>`).join("");
    $$("#rules [data-k]").forEach((el) => el.onclick = async (e) => { e.preventDefault(); this.paint(ctx, await ctx.api("/otopilot/kural", { kural: el.dataset.k, acik: !el.classList.contains("on") })); });
    $("#pend").innerHTML = d.bekleyen.map((p) => `<div class="item"><div class="ttl">♻ ${esc(p.atik_ad)} <span class="muted" style="font-weight:400">${esc(p.ureten_ad)} → ${esc(p.alan_ad)}</span></div>
      <div class="txt">${esc(p.neden)} · ≈${fmt.ktl(p.aylik_kazanc_tl)}/month</div><div class="row"><button class="btn sm pri" data-o="${esc(p.id)}${L(`">Approve`, `">Onayla`)}</button></div></div>`).join("") || `<div class="empty">${L(`No pending decisions`, `Bekleyen karar yok`)}</div>`;
    $$("#pend [data-o]").forEach((b) => b.onclick = async () => { b.disabled = true; try { await ctx.api("/otopilot/onayla/" + encodeURIComponent(b.dataset.o), {}); ctx.toast(L("Investment approved, link built", "Yatırım onaylandı, bağlantı kuruldu"), "ok"); } catch (e) { ctx.toast(esc(e.message), "uyari"); } });
    $("#alog").innerHTML = d.kayit.map((k) => `<div><span class="t">${fmt.t(k.t)}</span><span>${MOD[k.modul] || "•"} <b>${esc(k.karar)}</b><br><span class="muted">${esc(k.gerekce)}${k.kazanc ? ` · ≈${fmt.ktl(k.kazanc)}` : ""}</span></span></div>`).join("")
      || `<div class="empty">${d.aktif ? L("First scan in a few minutes…", "İlk tarama birkaç dakika içinde…") : L("Autopilot is off — decisions appear here once it is on", "Otopilot kapalı — devreye alınca kararlar burada görünür")}</div>`;
  },
};
