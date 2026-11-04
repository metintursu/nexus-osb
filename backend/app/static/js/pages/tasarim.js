import { $, $$, esc, fmt, api } from "../ui.js";

let Z = null, cfg = null, sel = null;
const SLOT = (c, r, s) => `${c}-${r}-${s}`;

function reserved() {
  const C = cfg.sutun, R = cfg.satir;
  const en = cfg.enerji_ada || [C - 1, R > 2 ? 1 : 0];
  let hz = cfg.hizmet_ada || [C - 1, R - 1];
  if (hz[0] === en[0] && hz[1] === en[1]) hz = [Math.max(0, en[0] - 1), en[1]];
  return { en, hz };
}
function capacity() {
  return (cfg.sutun * cfg.satir - 2) * 4 - 1;
}

export default {
  async mount(root, ctx) {
    Z = await api("/bolge");
    cfg = JSON.parse(JSON.stringify(Z.cfg));
    root.innerHTML = `<div class="note">Kendi organize sanayi bölgeni çiz: ada ızgarasını, ortak tesislerin yerini ve fabrikaları belirle. Bir fabrikayı tablodan seçip haritada bir parsele tıklayarak yerleştir. <b>Uygula</b> deyince bölge bu plana göre yeniden kurulur; tüm modüller (enerji, lojistik, simbiyoz, 3D…) yeni bölgeyle çalışır.</div>
      <div class="grid mt" style="grid-template-columns:340px minmax(0,1fr)">
        <div class="card" id="zset"></div>
        <div class="card" style="padding:10px"><canvas id="zc" style="width:100%;display:block;cursor:pointer"></canvas><div class="muted" style="font-size:12px;margin-top:6px" id="zhint"></div></div></div>
      <div class="card mt"><div class="card-h"><h3>Tesisler</h3><span class="sub" id="zcnt"></span><span class="act"><button class="btn sm" id="zadd">+ Tesis ekle</button><button class="btn sm" id="zauto">Konumları temizle (otomatik yerleşsin)</button></span></div>
        <div class="tbl-wrap"><table class="tbl" id="zt"></table></div></div>
      <div class="card mt" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn pri" id="zapply" style="font-size:15px;padding:11px 20px">✔ Uygula ve bölgeyi yeniden kur</button>
        <button class="btn" id="zexp">JSON indir</button><label class="btn">JSON yükle<input type="file" id="zimp" accept=".json" style="display:none"></label>
        <button class="btn danger" id="zdef" style="margin-left:auto">Varsayılan demo bölgeye dön</button><span class="muted" id="zst"></span></div>`;
    this.settings(ctx); this.table(ctx); this.draw();
    const cv = $("#zc");
    cv.addEventListener("click", (e) => this.click(e));
    new ResizeObserver(() => this.draw()).observe(cv);
    $("#zadd").onclick = () => { cfg.tesisler.push({ ad: `Yeni Tesis ${cfg.tesisler.length + 1}`, sektor: "otomotiv", calisan: 200, vardiya: 2 }); sel = cfg.tesisler.length - 1; this.table(ctx); this.draw(); };
    $("#zauto").onclick = () => { cfg.tesisler.forEach((t) => { delete t.ada; delete t.parsel; }); this.table(ctx); this.draw(); };
    $("#zexp").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 1)], { type: "application/json" })); a.download = `${(cfg.ad || "bolge").replace(/\s+/g, "-")}.json`; a.click(); };
    $("#zimp").onchange = async (e) => { try { cfg = JSON.parse(await e.target.files[0].text()); cfg.tesisler = cfg.tesisler || []; cfg.sutun = cfg.sutun || 4; cfg.satir = cfg.satir || 3; this.settings(ctx); this.table(ctx); this.draw(); ctx.toast("Plan yüklendi — uygulamayı unutma", "ok"); } catch (err) { ctx.toast("JSON okunamadı", "uyari"); } };
    $("#zapply").onclick = async () => {
      if (!cfg.tesisler.length) { ctx.toast("En az bir tesis ekle", "uyari"); return; }
      $("#zapply").disabled = true; $("#zst").textContent = "Bölge kuruluyor, 32 saatlik ön ısıtma yapılıyor…";
      try { await api("/bolge", cfg); $("#zst").textContent = "Kuruldu, sayfa yenileniyor…"; setTimeout(() => location.reload(), 1200); }
      catch (err) { $("#zst").textContent = err.message; $("#zapply").disabled = false; }
    };
    $("#zdef").onclick = async () => { $("#zst").textContent = "Demo bölge kuruluyor…"; await api("/bolge/varsayilan", {}); setTimeout(() => location.reload(), 1200); };
  },
  settings(ctx) {
    const R = reserved(), C = cfg.sutun, Rw = cfg.satir;
    const adas = []; for (let r = 0; r < Rw; r++) for (let c = 0; c < C; c++) adas.push([c, r]);
    const ao = (v) => adas.filter(([c, r]) => !(c === 0 && r === 0)).map(([c, r]) => `<option value="${c},${r}" ${v[0] === c && v[1] === r ? "selected" : ""}>Ada ${c + 1}-${r + 1}</option>`).join("");
    $("#zset").innerHTML = `<div class="card-h"><h3>Bölge ayarları</h3>${Z.ozel ? `<span class="tag t-acc">özel plan</span>` : `<span class="tag">demo</span>`}</div>
      <div style="display:grid;grid-template-columns:130px 1fr;gap:9px;align-items:center;font-size:13px">
        <span>Bölge adı</span><input class="inp" id="z-ad" value="${esc(cfg.ad || "")}">
        <span>Ada sütunu</span><input class="inp" id="z-c" type="number" min="2" max="8" value="${C}">
        <span>Ada satırı</span><input class="inp" id="z-r" type="number" min="2" max="6" value="${Rw}">
        <span>Enerji adası</span><select class="inp" id="z-en">${ao(R.en)}</select>
        <span>Hizmet adası</span><select class="inp" id="z-hz">${ao(R.hz)}</select>
        <span>GES (kWp)</span><input class="inp" id="z-ges" type="number" step="500" value="${cfg.ges_kwp || 18000}">
        <span>Batarya (kWh)</span><input class="inp" id="z-bess" type="number" step="1000" value="${cfg.bess_kwh || 28000}">
        <span>Hidrojen Vadisi</span><label class="switch ${cfg.hidrojen === false ? "" : "on"}" id="z-h2"><i></i><span>boş parsel varsa kur</span></label></div>
      <div class="muted mt" style="font-size:12px">Her ada 2×2 = 4 parsel. Enerji adası: GES + batarya + ana indirici. Hizmet adası: arıtma + lojistik merkezi. Ada 1-1'in ilk parseli OSB Yönetim ve itfaiyedir.</div>
      <div class="mt" style="font-size:13px">Kapasite: <b class="num" id="z-cap"></b> parsel</div>`;
    const upd = () => {
      cfg.ad = $("#z-ad").value; cfg.sutun = Math.max(2, Math.min(8, +$("#z-c").value || 4)); cfg.satir = Math.max(2, Math.min(6, +$("#z-r").value || 3));
      cfg.ges_kwp = +$("#z-ges").value; cfg.bess_kwh = +$("#z-bess").value; cfg.bess_kw = cfg.bess_kwh / 2;
      cfg.enerji_ada = $("#z-en").value.split(",").map(Number); cfg.hizmet_ada = $("#z-hz").value.split(",").map(Number);
      cfg.tesisler.forEach((t) => { if (t.ada && (t.ada[0] >= cfg.sutun || t.ada[1] >= cfg.satir)) { delete t.ada; delete t.parsel; } });
      this.draw(); this.table(ctx);
    };
    $$("#zset input, #zset select").forEach((el) => el.onchange = () => { const before = [cfg.sutun, cfg.satir]; upd(); if (before[0] !== cfg.sutun || before[1] !== cfg.satir) { delete cfg.enerji_ada; delete cfg.hizmet_ada; this.settings(ctx); } });
    $("#z-h2").onclick = () => { cfg.hidrojen = cfg.hidrojen === false; $("#z-h2").classList.toggle("on", cfg.hidrojen !== false); };
    $("#z-cap").textContent = capacity();
  },
  table(ctx) {
    const S = Z.sektorler;
    const cap = capacity(), n = cfg.tesisler.length;
    $("#zcnt").innerHTML = `${n} tesis · ${cap} parsel${n > cap ? ` <span class="t-crit">— ${n - cap} tesis sığmıyor</span>` : ""}`;
    $("#zt").innerHTML = `<tr><th></th><th>Tesis adı</th><th>Sektör</th><th class="r">Çalışan</th><th>Vardiya</th><th>Konum</th><th></th></tr>` + cfg.tesisler.map((t, i) => `<tr data-i="${i}" style="${sel === i ? "background:rgba(34,211,238,.08)" : ""}">
      <td><input type="radio" name="zsel" ${sel === i ? "checked" : ""} data-sel="${i}" title="Seç, sonra haritada parsele tıkla"></td>
      <td><input class="inp" data-k="ad" value="${esc(t.ad)}" style="width:200px"></td>
      <td><select class="inp" data-k="sektor">${Object.entries(S).map(([k, v]) => `<option value="${k}" ${t.sektor === k ? "selected" : ""}>${esc(v.ad)}</option>`).join("")}</select></td>
      <td class="r"><input class="inp" data-k="calisan" type="number" value="${t.calisan || ""}" placeholder="oto" style="width:90px"></td>
      <td><select class="inp" data-k="vardiya">${[1, 2, 3].map((v) => `<option ${+t.vardiya === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td>${t.ada ? `Ada ${t.ada[0] + 1}-${t.ada[1] + 1} · P${t.parsel + 1}` : `<span class="muted">otomatik</span>`}</td>
      <td><button class="btn sm danger" data-del="${i}">Sil</button></td></tr>`).join("");
    $$("#zt [data-k]").forEach((el) => el.onchange = () => {
      const t = cfg.tesisler[+el.closest("tr").dataset.i];
      t[el.dataset.k] = el.dataset.k === "calisan" || el.dataset.k === "vardiya" ? (+el.value || undefined) : el.value;
      this.draw();
    });
    $$("#zt [data-sel]").forEach((el) => el.onchange = () => { sel = +el.dataset.sel; $("#zhint").textContent = `Seçili: ${cfg.tesisler[sel].ad} — haritada bir parsele tıkla`; this.table(ctx); this.draw(); });
    $$("#zt [data-del]").forEach((b) => b.onclick = () => { cfg.tesisler.splice(+b.dataset.del, 1); sel = null; this.table(ctx); this.draw(); });
  },
  geom() {
    const cv = $("#zc"); const Wd = cv.clientWidth || 800;
    const C = cfg.sutun, R = cfg.satir, pad = 26;
    const bw = (Wd - pad * 2) / C, bh = bw * 0.82;
    return { cv, Wd, Hd: bh * R + pad * 2, C, R, pad, bw, bh };
  },
  draw() {
    if (!cfg || !$("#zc")) return;
    const G = this.geom(), cv = G.cv, dpr = window.devicePixelRatio || 1;
    cv.style.height = G.Hd + "px"; cv.width = G.Wd * dpr; cv.height = G.Hd * dpr;
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#070d18"; g.fillRect(0, 0, G.Wd, G.Hd);
    const res = reserved(), occ = {};
    cfg.tesisler.forEach((t, i) => { if (t.ada) occ[SLOT(t.ada[0], t.ada[1], t.parsel)] = i; });
    g.strokeStyle = "#1c2842"; g.lineWidth = 8;
    for (let c = 0; c <= G.C; c++) { g.beginPath(); g.moveTo(G.pad + c * G.bw, G.pad - 10); g.lineTo(G.pad + c * G.bw, G.Hd - G.pad + 10); g.stroke(); }
    for (let r = 0; r <= G.R; r++) { g.beginPath(); g.moveTo(G.pad - 10, G.pad + r * G.bh); g.lineTo(G.Wd - G.pad + 10, G.pad + r * G.bh); g.stroke(); }
    this.cells = [];
    for (let r = 0; r < G.R; r++) for (let c = 0; c < G.C; c++) {
      const x = G.pad + c * G.bw + 9, y = G.pad + r * G.bh + 9, w = G.bw - 18, h = G.bh - 18;
      const isEn = res.en[0] === c && res.en[1] === r, isHz = res.hz[0] === c && res.hz[1] === r;
      if (isEn || isHz) {
        g.fillStyle = isEn ? "#0b1a33" : "#0c1a2c"; g.fillRect(x, y, w, h);
        g.fillStyle = isEn ? "#93c5fd" : "#7dd3fc"; g.font = "600 12px Inter, sans-serif"; g.textAlign = "center";
        g.fillText(isEn ? "☀ ENERJİ ADASI" : "💧 HİZMET ADASI", x + w / 2, y + h / 2 - 4);
        g.fillStyle = "#64748b"; g.font = "10.5px Inter, sans-serif"; g.fillText(isEn ? "GES · batarya · ana indirici" : "arıtma · lojistik merkezi", x + w / 2, y + h / 2 + 12);
        continue;
      }
      g.fillStyle = "#64748b"; g.font = "10px Inter, sans-serif"; g.textAlign = "left"; g.fillText(`Ada ${c + 1}-${r + 1}`, x, y - 2);
      const pw = (w - 6) / 2, ph = (h - 6) / 2;
      for (let s = 0; s < 4; s++) {
        const px = x + (s % 2) * (pw + 6), py = y + Math.floor(s / 2) * (ph + 6);
        const hq = c === 0 && r === 0 && s === 0, idx = occ[SLOT(c, r, s)];
        let fill = "#0f182b", txt = "boş", tc = "#334155";
        if (hq) { fill = "#1d1745"; txt = "OSB Yönetim"; tc = "#c4b5fd"; }
        else if (idx != null) { const t = cfg.tesisler[idx], sc = Z.sektorler[t.sektor] || {}; fill = sc.renk || "#22d3ee"; txt = t.ad; tc = "#06101d"; }
        g.fillStyle = fill; g.globalAlpha = idx != null ? 0.85 : 1; g.fillRect(px, py, pw, ph); g.globalAlpha = 1;
        g.strokeStyle = idx != null && idx === sel ? "#fff" : "#26375a"; g.lineWidth = idx != null && idx === sel ? 2.5 : 1; g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
        g.fillStyle = tc; g.font = `${idx != null ? 600 : 400} ${Math.max(9, Math.min(11.5, pw / 9))}px Inter, sans-serif`; g.textAlign = "center";
        const words = txt.length > 16 ? [txt.slice(0, txt.lastIndexOf(" ", 16) > 0 ? txt.lastIndexOf(" ", 16) : 16), txt.slice(txt.lastIndexOf(" ", 16) > 0 ? txt.lastIndexOf(" ", 16) + 1 : 16)] : [txt];
        words.forEach((wd, k) => g.fillText(wd, px + pw / 2, py + ph / 2 + 4 + (k - (words.length - 1) / 2) * 13));
        if (!hq) this.cells.push({ x: px, y: py, w: pw, h: ph, c, r, s });
      }
    }
    const unplaced = cfg.tesisler.filter((t) => !t.ada).length;
    $("#zhint").textContent = sel != null ? `Seçili: ${cfg.tesisler[sel] ? cfg.tesisler[sel].ad : ""} — bir parsele tıkla (dolu parselde yer değiştirir)` : `${unplaced} tesis otomatik yerleşecek. Yerleştirmek için tablodan bir tesis seç, sonra parsele tıkla.`;
  },
  click(e) {
    if (sel == null || !this.cells) return;
    const r = $("#zc").getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const cell = this.cells.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (!cell) return;
    const t = cfg.tesisler[sel];
    const other = cfg.tesisler.findIndex((o, i) => i !== sel && o.ada && o.ada[0] === cell.c && o.ada[1] === cell.r && o.parsel === cell.s);
    if (other >= 0) { const o = cfg.tesisler[other]; if (t.ada) { o.ada = [...t.ada]; o.parsel = t.parsel; } else { delete o.ada; delete o.parsel; } }
    t.ada = [cell.c, cell.r]; t.parsel = cell.s;
    this.table(); this.draw();
  },
  unmount() { Z = cfg = null; sel = null; },
};
