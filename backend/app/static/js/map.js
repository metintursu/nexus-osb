// NEXUS OSB — live zone map (canvas)
import { h, esc, fmt, STATUS, STATUS_COLOR, TRUCK, ORDER_TIP } from "./ui.js";

const LAYERS = { durum: L("Status", "Durum"), sektor: L("Sector", "Sektör"), enerji: L("Energy", "Enerji"), karbon: L("Carbon", "Karbon") };
const OVERLAYS = { lojistik: L("Vehicles", "Araçlar"), simbiyoz: L("Symbiosis", "Simbiyoz"), trafo: L("Substation feeds", "Trafo hatları"), olay: L("Incidents", "Olaylar") };

function lerpColor(stops, t) {
  t = Math.max(0, Math.min(1, t));
  const n = stops.length - 1, i = Math.min(n - 1, Math.floor(t * n)), f = t * n - i;
  const a = stops[i], b = stops[i + 1];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const HEAT = [[14, 42, 58], [34, 211, 238], [251, 191, 36], [248, 113, 113]];
const CARB = [[22, 101, 52], [52, 211, 153], [251, 191, 36], [239, 68, 68]];
const TRUCK_COL = { yuklu: "#22d3ee", gidiyor: "#94a3b8", donus: "#64748b", yukleniyor: "#fde68a", bosaltiyor: "#fde68a", kuyrukta: "#f97316", bos: "#475569" };

export function createMap(container, ctx, opts = {}) {
  const W0 = ctx.world.harita.w, H0 = ctx.world.harita.h;
  const state = { layer: opts.layer || "durum", ov: { lojistik: true, simbiyoz: true, trafo: false, olay: true, ...(opts.overlays || {}) } };
  const wrap = h(`<div class="map-wrap" style="height:${opts.height || 520}px"><canvas></canvas>
    ${opts.tools === false ? "" : `<div class="map-tools"><div class="seg lay">${Object.entries(LAYERS).map(([k, v]) => `<button data-k="${k}" class="${k === state.layer ? "on" : ""}">${v}</button>`).join("")}</div>
    <div class="seg ovl">${Object.entries(OVERLAYS).map(([k, v]) => `<button data-k="${k}" class="${state.ov[k] ? "on" : ""}">${v}</button>`).join("")}</div></div>`}
    <div class="map-zoom"><button data-z="1">+</button><button data-z="-1">−</button><button data-z="0" title="${L(`Fit`, `Sığdır`)}">⤢</button></div>
    <div class="map-legend"></div><div class="map-tip"></div></div>`);
  container.innerHTML = "";
  container.appendChild(wrap);
  const cv = wrap.querySelector("canvas"), g = cv.getContext("2d"), tip = wrap.querySelector(".map-tip"), legend = wrap.querySelector(".map-legend");
  const fs = ctx.world.fabrikalar, fsMap = Object.fromEntries(fs.map((f) => [f.id, f]));
  const view = { s: 1, ox: 0, oy: 0, fit: true };
  let live = ctx.live(), trucks = {}, mouse = null, raf = 0, alive = true, highlight = new Set(opts.highlight || []);
  let dpr = 1;

  function fit() {
    const r = wrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    if (view.fit) {
      view.s = Math.min(r.width / W0, r.height / H0) * 0.98;
      view.ox = (r.width - W0 * view.s) / 2; view.oy = (r.height - H0 * view.s) / 2;
    }
  }
  const ro = new ResizeObserver(fit); ro.observe(wrap); fit();
  const toW = (px, py) => [(px - view.ox) / view.s, (py - view.oy) / view.s];

  // ---------- interaction
  wrap.querySelectorAll(".lay button").forEach((b) => b.onclick = () => { state.layer = b.dataset.k; wrap.querySelectorAll(".lay button").forEach((x) => x.classList.toggle("on", x === b)); drawLegend(); });
  wrap.querySelectorAll(".ovl button").forEach((b) => b.onclick = () => { state.ov[b.dataset.k] = !state.ov[b.dataset.k]; b.classList.toggle("on", state.ov[b.dataset.k]); });
  wrap.querySelectorAll(".map-zoom button").forEach((b) => b.onclick = () => {
    const z = +b.dataset.z; const r = wrap.getBoundingClientRect();
    if (!z) { view.fit = true; fit(); return; }
    zoomAt(r.width / 2, r.height / 2, z > 0 ? 1.3 : 1 / 1.3);
  });
  function zoomAt(px, py, k) {
    const [wx, wy] = toW(px, py);
    view.fit = false;
    view.s = Math.max(0.3, Math.min(6, view.s * k));
    view.ox = px - wx * view.s; view.oy = py - wy * view.s;
  }
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  let drag = null;
  cv.addEventListener("mousedown", (e) => { drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false }; });
  window.addEventListener("mouseup", onUp);
  function onUp(e) {
    if (drag && !drag.moved && e.target === cv) {
      const hit = hitTest(mouse);
      if (hit && hit.kind === "f") ctx.openFactory(hit.id);
    }
    drag = null;
  }
  cv.addEventListener("mousemove", (e) => {
    const r = cv.getBoundingClientRect();
    mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; view.fit = false; view.ox = drag.ox + dx; view.oy = drag.oy + dy; }
    }
    showTip();
  });
  cv.addEventListener("mouseleave", () => { mouse = null; tip.style.display = "none"; });

  function hitTest(m) {
    if (!m) return null;
    const [wx, wy] = toW(m.x, m.y);
    if (state.ov.lojistik) {
      for (const [id, t] of Object.entries(trucks)) {
        const p = tpos(t);
        if (Math.hypot(p[0] - wx, p[1] - wy) < 7 / Math.min(view.s, 1.5) + 2) return { kind: "t", id, t };
      }
    }
    for (const f of fs) if (wx >= f.x && wx <= f.x + f.w && wy >= f.y && wy <= f.y + f.h) return { kind: "f", id: f.id };
    for (const tm of ctx.world.trafolar) if (Math.abs(wx - tm.x) < 9 && Math.abs(wy - tm.y) < 9) return { kind: "tm", tm };
    return null;
  }
  function showTip() {
    const hit = hitTest(mouse);
    if (!hit) { tip.style.display = "none"; cv.style.cursor = "grab"; return; }
    let html = "";
    if (hit.kind === "f") {
      const f = fsMap[hit.id], lf = (live.f || []).find((x) => x.id === hit.id) || {};
      html = `<b>${esc(f.ad)}</b><div class="muted" style="font-size:11.5px">${esc(f.sektor_ad)} · ${f.calisan} ${L(`employees ·`, `çalışan ·`)} ${f.tm}</div>
        <div class="kv"><span>${L(`Status`, `Durum`)}</span><span style="color:${STATUS_COLOR[lf.d]}">${STATUS[lf.d] || "—"}${lf.canli ? L(" · LIVE", " · CANLI") : ""}</span>
        <span>${L(`Power`, `Güç`)}</span><span class="num">${fmt.mw(lf.kw, 2)} / ${fmt.mw(f.kurulu_kw, 1)} MW</span>
        <span>OEE</span><span class="num">${fmt.pct(lf.oee)}</span><span>${L(`Emissions`, `Emisyon`)}</span><span class="num">${fmt.n(lf.co2 / 1000, 2)} ${L(`tCO₂/h`, `tCO₂/sa`)}</span>
        ${lf.dr ? `<span>${L(`Load shift`, `Talep kaydırma`)}</span><span class="t-acc">${L(`active`, `aktif`)}</span>` : ""}</div><div class="dim" style="margin-top:5px;font-size:11px">${L(`Click for details`, `Ayrıntı için tıkla`)}</div>`;
      cv.style.cursor = "pointer";
    } else if (hit.kind === "t") {
      const a = hit.t.a;
      html = `<b>${a[5] === "usta" ? (ctx.world.ustalar.find((u) => u.id === a[0]) || {}).ad || a[0] : a[0]}</b> <span class="muted">${a[5] === "itfaiye" ? L("Zone Fire Brigade", "OSB İtfaiye") : a[5] === "usta" ? L("Technician Pool", "Usta Havuzu") : L("Shared fleet", "Ortak filo")}</span><div class="kv"><span>${L(`Status`, `Durum`)}</span><span>${TRUCK[a[3]] || a[3]}</span>
        <span>${L(`Job`, `İş`)}</span><span>${ORDER_TIP[a[5]] || (a[5] === "itfaiye" ? L("Emergency response", "Acil müdahale") : a[5] === "usta" ? L("Fault response", "Arıza müdahalesi") : "—")}</span><span>${L(`Fill`, `Doluluk`)}</span><span class="num">${fmt.pct(a[4])}</span></div>`;
    } else {
      const i = ctx.world.trafolar.indexOf(hit.tm), u = (live.e && live.e.tm[i]) || 0;
      html = `<b>${hit.tm.id} ${L(`substation`, `trafo merkezi`)}</b><div class="kv"><span>${L(`Load`, `Yüklenme`)}</span><span class="num" style="color:${u > 1 ? "#f87171" : u > 0.9 ? "#fbbf24" : "#34d399"}">${fmt.pct(u)}</span></div>`;
    }
    tip.innerHTML = html;
    tip.style.display = "block";
    const r = wrap.getBoundingClientRect();
    tip.style.left = Math.min(mouse.x + 14, r.width - tip.offsetWidth - 8) + "px";
    tip.style.top = Math.min(mouse.y + 14, r.height - tip.offsetHeight - 8) + "px";
  }

  function drawLegend() {
    let html = "";
    if (state.layer === "durum") html = Object.entries(STATUS).map(([k, v]) => `<span><i style="background:${STATUS_COLOR[k]}"></i>${v}</span>`).join("");
    else if (state.layer === "sektor") html = Object.entries(ctx.world.sektorler).map(([k, v]) => `<span><i style="background:${v.renk}"></i>${v.kisa}</span>`).join("");
    else if (state.layer === "enerji") html = `<span><i style="background:rgb(14,42,58)"></i>${L(`Low load`, `Düşük yük`)}</span><span><i style="background:#22d3ee"></i>${L(`Medium`, `Orta`)}</span><span><i style="background:#fbbf24"></i>${L(`High`, `Yüksek`)}</span><span><i style="background:#f87171"></i>${L(`Full load`, `Tam yük`)}</span>`;
    else html = `<span><i style="background:rgb(22,101,52)"></i>${L(`Low emissions`, `Düşük emisyon`)}</span><span><i style="background:#fbbf24"></i>${L(`Medium`, `Orta`)}</span><span><i style="background:#ef4444"></i>${L(`High`, `Yüksek`)}</span>`;
    html += `<span><i style="background:#22d3ee;border-radius:50%"></i>${L(`Loaded truck`, `Yüklü kamyon`)}</span><span><i style="background:#94a3b8;border-radius:50%"></i>${L(`Empty truck`, `Boş kamyon`)}</span><span><i style="background:#c084fc;transform:rotate(45deg)"></i>${L(`Technician`, `Usta`)}</span>`;
    legend.innerHTML = html;
  }
  drawLegend();

  // ---------- data
  const tickMs = () => Math.max(90, Math.min(1000, 1000 / (ctx.tps() || 1)));
  function tpos(t) {
    const k = Math.min(1, (performance.now() - t.t) / t.d);
    return [t.px + (t.x - t.px) * k, t.py + (t.y - t.py) * k];
  }
  function update(l) {
    live = l;
    const now = performance.now(), seen = new Set();
    for (const a of (l.l && l.l.araclar) || []) {
      const id = a[0]; seen.add(id);
      const t = trucks[id];
      if (t) { const p = tpos(t); Object.assign(t, { px: p[0], py: p[1], x: a[1], y: a[2], t: now, d: tickMs(), a }); }
      else trucks[id] = { px: a[1], py: a[2], x: a[1], y: a[2], t: now, d: 1, a };
    }
    for (const id of Object.keys(trucks)) if (!seen.has(id)) delete trucks[id];
  }
  update(live);

  // ---------- drawing
  function factoryFill(f, lf) {
    if (!lf) return "#1e293b";
    if (state.layer === "sektor") return f.renk;
    if (state.layer === "enerji") return lerpColor(HEAT, lf.kw / Math.max(1, f.kurulu_kw));
    if (state.layer === "karbon") { const mx = Math.max(...live.f.map((x) => x.co2), 1); return lerpColor(CARB, lf.co2 / mx); }
    return STATUS_COLOR[lf.d] || "#334155";
  }
  function rr(x, y, w, hh, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh); }

  function draw() {
    if (!alive) return;
    raf = requestAnimationFrame(draw);
    const t = performance.now() / 1000;
    const Wc = cv.width / dpr, Hc = cv.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#060b15"; g.fillRect(0, 0, Wc, Hc);
    g.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
    const s = view.s, W = ctx.world.harita;
    // ground
    g.fillStyle = "#0a1221"; rr(0, 0, W0, H0, 14); g.fill();
    g.strokeStyle = "rgba(34,211,238,.05)"; g.lineWidth = 1 / s;
    for (let x = 0; x <= W0; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H0); g.stroke(); }
    for (let y = 0; y <= H0; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W0, y); g.stroke(); }
    // blocks
    for (let c = 0; c < W.xs.length - 1; c++) for (let r = 0; r < W.ys.length - 1; r++) {
      g.fillStyle = "#0d1729"; rr(W.xs[c] + 8, W.ys[r] + 8, W.xs[c + 1] - W.xs[c] - 16, W.ys[r + 1] - W.ys[r] - 16, 6); g.fill();
    }
    // roads
    g.lineCap = "round";
    for (const sg of W.yollar) { g.strokeStyle = "#17233a"; g.lineWidth = 13; g.beginPath(); g.moveTo(sg[0], sg[1]); g.lineTo(sg[2], sg[3]); g.stroke(); }
    g.setLineDash([6, 8]);
    for (const sg of W.yollar) { g.strokeStyle = "#2b3a58"; g.lineWidth = 1; g.beginPath(); g.moveTo(sg[0], sg[1]); g.lineTo(sg[2], sg[3]); g.stroke(); }
    g.setLineDash([]);
    // gates
    for (const [k, gt] of Object.entries(ctx.world.kapilar)) {
      g.fillStyle = "#0e2a3a"; g.strokeStyle = "#22d3ee"; g.lineWidth = 1.2; rr(gt.x - 11, gt.y - 11, 22, 22, 5); g.fill(); g.stroke();
      g.fillStyle = "#a5f3fc"; g.font = "600 9px Inter, sans-serif"; g.textAlign = "center"; g.fillText({ dogu: "E", bati: "W", kuzey: "N", guney: "S" }[k] || "G", gt.x, gt.y + 3);
      g.fillStyle = "#6b7fa3"; g.font = "9px Inter, sans-serif"; g.fillText(gt.ad, gt.x + (k === "dogu" ? -40 : 40), gt.y - 16);
    }
    // shared facilities
    const T = ctx.world.tesisler, e = live.e || {};
    const ges = T.ges, solar = (e.ges || 0) / (ctx.world.ges_kwp || 18000);
    g.fillStyle = "#0b1a33"; rr(ges.x, ges.y, ges.w, ges.h, 6); g.fill();
    for (let y = ges.y + 6; y < ges.y + ges.h - 6; y += 9) for (let x = ges.x + 6; x < ges.x + ges.w - 10; x += 16) {
      g.fillStyle = `rgba(${60 + 120 * solar},${120 + 90 * solar},${200 + 50 * solar},${0.45 + 0.5 * solar})`; g.fillRect(x, y, 13, 6);
    }
    label(ges.x + ges.w / 2, ges.y + ges.h / 2 + 3, `${L(`Solar ·`, `GES ·`)} ${fmt.mw(e.ges, 1)} MW`, "#e0f2fe", 10, true);
    const b = T.bess, soc = e.soc || 0;
    g.fillStyle = "#0f1b2f"; rr(b.x, b.y, b.w, b.h, 5); g.fill();
    g.fillStyle = e.bess > 0 ? "#fb923c" : e.bess < 0 ? "#34d399" : "#22d3ee"; rr(b.x + 3, b.y + b.h - 6, (b.w - 6) * soc, 3, 2); g.fill();
    label(b.x + b.w / 2, b.y + b.h / 2, `BESS ${fmt.pct(soc)}`, "#cbd5e1", 9, true);
    label(b.x + b.w / 2, b.y + b.h / 2 + 11, e.bess > 50 ? L("▼ discharging", "▼ deşarj") : e.bess < -50 ? L("▲ charging", "▲ şarj") : L("standby", "beklemede"), e.bess > 50 ? "#fb923c" : e.bess < -50 ? "#34d399" : "#64748b", 8);
    const a = T.aim;
    g.fillStyle = live.kesinti ? "#3b0d0d" : "#101c30"; rr(a.x, a.y, a.w, a.h, 5); g.fill();
    label(a.x + a.w / 2, a.y + a.h / 2 + 3, live.kesinti ? L("SUBSTATION · DOWN", "AİM · KESİK") : L("Main substation", "Ana İndirici"), live.kesinti ? "#fca5a5" : "#94a3b8", 9, true);
    const ar = T.aritma, util = (live.su && live.su.util) || 0;
    g.fillStyle = "#0c1a2c"; rr(ar.x, ar.y, ar.w, ar.h, 6); g.fill();
    for (let i = 0; i < 3; i++) {
      const cx = ar.x + ar.w / 2, cy = ar.y + 24 + i * 38;
      g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fillStyle = util > 1 ? "#7c2d12" : "#0e3a52"; g.fill();
      g.beginPath(); g.arc(cx, cy, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, util)); g.strokeStyle = util > 1 ? "#f87171" : "#38bdf8"; g.lineWidth = 2.5; g.stroke();
    }
    label(ar.x + ar.w / 2, ar.y + ar.h - 6, `${L("Wastewater", "Arıtma")} ${fmt.pct(util)}`, "#bae6fd", 9, true);
    const lj = T.lojistik, parked = ((live.l && (ctx.world.filo || 48) - live.l.aktif) || 0);
    g.fillStyle = "#0e1a2e"; rr(lj.x, lj.y, lj.w, lj.h, 6); g.fill();
    for (let i = 0; i < Math.min(parked, 30); i++) { g.fillStyle = "#334155"; g.fillRect(lj.x + 8 + (i % 5) * 15, lj.y + 22 + Math.floor(i / 5) * 14, 11, 7); }
    label(lj.x + lj.w / 2, lj.y + 13, L("Logistics Hub", "Lojistik Merkezi"), "#94a3b8", 9, true);
    label(lj.x + lj.w / 2, lj.y + lj.h - 8, `${parked} ${L(`vehicles parked`, `araç parkta`)}`, "#64748b", 8.5);
    const hq = ctx.world.yonetim;
    g.fillStyle = "#16132e"; g.strokeStyle = "#a78bfa"; g.lineWidth = 1; rr(hq.x, hq.y, hq.w, hq.h, 6); g.fill(); g.stroke();
    label(hq.x + hq.w / 2, hq.y + hq.h / 2 - 2, L("Zone Management", "OSB Yönetim"), "#ddd6fe", 9.5, true);
    label(hq.x + hq.w / 2, hq.y + hq.h / 2 + 10, L("Fire · Emergency", "İtfaiye · Acil Durum"), "#a78bfa", 8);
    // hydrogen valley
    const H2 = ctx.world.hidrojen, hl2 = live.h2 || {};
    if (H2) {
      g.fillStyle = "#081a24"; g.strokeStyle = "#5eead4"; g.lineWidth = 1.1; rr(H2.x, H2.y, H2.w, H2.h, 6); g.fill(); g.stroke();
      const pvk = (hl2.pv || 0) / 12000;
      for (let yy = H2.y + 5; yy < H2.y + H2.h * 0.5; yy += 7) for (let xx = H2.x + 5; xx < H2.x + H2.w - 8; xx += 12) {
        g.fillStyle = `rgba(${60 + 100 * pvk},${150 + 80 * pvk},${200 + 40 * pvk},${0.4 + 0.5 * pvk})`; g.fillRect(xx, yy, 10, 4);
      }
      for (let i = 0; i < 3; i++) {
        const cx = H2.x + 14 + i * ((H2.w - 28) / 2), cy = H2.y + H2.h * 0.72;
        g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fillStyle = "#0f3b3a"; g.fill();
        g.beginPath(); g.arc(cx, cy, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (hl2.doluluk || 0)); g.strokeStyle = "#5eead4"; g.lineWidth = 2; g.stroke();
      }
      label(H2.x + H2.w / 2, H2.y + H2.h - 4, `H₂ ${Math.round(hl2.stok || 0)} kg · ${L(`${Math.round((hl2.oran || 0) * 100)}% blend`, `%${Math.round((hl2.oran || 0) * 100)} karışım`)}`, "#99f6e4", 8, true);
      if (state.ov.simbiyoz && (hl2.kullanim || 0) > 0) {
        for (const f of fs) if (f.sektor === "dokum" || f.sektor === "metal") {
          g.strokeStyle = "rgba(94,234,212,.55)"; g.lineWidth = 1.6; g.setLineDash([2, 6]); g.lineDashOffset = -t * 18;
          g.beginPath(); g.moveTo(H2.x + H2.w / 2, H2.y + H2.h / 2); g.lineTo(f.cx, f.cy); g.stroke(); g.setLineDash([]);
        }
      }
    }
    // empty plots
    g.setLineDash([4, 4]); g.strokeStyle = "#24314d"; g.lineWidth = 1;
    for (const p of ctx.world.bos_parseller) { rr(p.x, p.y, p.w, p.h, 5); g.stroke(); }
    g.setLineDash([]);
    for (const p of ctx.world.bos_parseller) label(p.x + p.w / 2, p.y + p.h / 2 + 3, L("vacant parcel", "boş parsel"), "#334155", 8.5);
    // substation feeds
    const lmap = Object.fromEntries((live.f || []).map((x) => [x.id, x]));
    if (state.ov.trafo || state.layer === "enerji") {
      ctx.world.trafolar.forEach((tm, i) => {
        const u = (e.tm && e.tm[i]) || 0;
        g.strokeStyle = u > 1 ? "rgba(248,113,113,.45)" : u > 0.9 ? "rgba(251,191,36,.35)" : "rgba(34,211,238,.18)"; g.lineWidth = 1;
        for (const f of fs) if (f.tm === tm.id) { g.beginPath(); g.moveTo(tm.x, tm.y); g.lineTo(f.cx, f.cy); g.stroke(); }
      });
    }
    // factories
    for (const f of fs) {
      const lf = lmap[f.id];
      const col = factoryFill(f, lf);
      const hl = highlight.has(f.id);
      g.fillStyle = "#0f182b"; rr(f.x, f.y, f.w, f.h, 6); g.fill();
      g.globalAlpha = state.layer === "durum" && lf && lf.d === "bosta" ? 0.5 : 0.88;
      g.fillStyle = col; rr(f.x + 2, f.y + 2, f.w - 4, f.h - 4, 5); g.fill();
      g.globalAlpha = 1;
      // roof pattern
      g.fillStyle = "rgba(0,0,0,.22)";
      for (let i = 0; i < 4; i++) g.fillRect(f.x + 6 + i * ((f.w - 12) / 4), f.y + 6, (f.w - 12) / 4 - 3, 8);
      g.strokeStyle = hl ? "#ffffff" : f.renk; g.lineWidth = hl ? 2.2 : 1.1; rr(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1, 6); g.stroke();
      if (lf && lf.dr) { g.strokeStyle = "#22d3ee"; g.setLineDash([3, 3]); g.lineWidth = 1.5; rr(f.x - 3, f.y - 3, f.w + 6, f.h + 6, 8); g.stroke(); g.setLineDash([]); }
      const dark = state.layer === "durum" ? lf && lf.d !== "bosta" : true;
      label(f.x + f.w / 2, f.y + f.h / 2 + 3, s > 1.25 ? f.ad : `${ctx.world.sektorler[f.sektor].kisa} ${f.id}`, dark ? "#06101d" : "#cbd5e1", s > 1.25 ? 8.5 : 9.5, true);
      if (s > 1.25 && lf) label(f.x + f.w / 2, f.y + f.h / 2 + 15, `${fmt.mw(lf.kw, 2)} MW · %${Math.round(lf.oee * 100)}`, dark ? "rgba(6,16,29,.8)" : "#94a3b8", 7.5);
      if (lf && lf.canli) { g.fillStyle = "#f43f5e"; g.beginPath(); g.arc(f.x + f.w - 7, f.y + 7, 3 + Math.sin(t * 5), 0, 7); g.fill(); }
    }
    // substations
    ctx.world.trafolar.forEach((tm, i) => {
      const u = (e.tm && e.tm[i]) || 0, col = live.kesinti ? "#64748b" : u > 1 ? "#f87171" : u > 0.9 ? "#fbbf24" : "#34d399";
      g.fillStyle = "#0b1322"; rr(tm.x - 9, tm.y - 9, 18, 18, 4); g.fill();
      g.beginPath(); g.arc(tm.x, tm.y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, u)); g.strokeStyle = col; g.lineWidth = 2.5; g.stroke();
      if (u > 1) { g.beginPath(); g.arc(tm.x, tm.y, 15 + 3 * Math.sin(t * 6), 0, 7); g.strokeStyle = "rgba(248,113,113,.5)"; g.lineWidth = 1.5; g.stroke(); }
      label(tm.x, tm.y + 3, "⚡", col, 9, true);
      label(tm.x, tm.y - 17, tm.id, "#94a3b8", 8.5, true);
    });
    // symbiosis flows
    if (state.ov.simbiyoz) {
      for (const [p, c, w] of live.s || []) {
        const A = fsMap[p], B = fsMap[c]; if (!A || !B) continue;
        const col = (ctx.world.atiklar[w] || {}).renk || "#84cc16";
        const mx = (A.cx + B.cx) / 2, my = (A.cy + B.cy) / 2 - Math.max(30, Math.hypot(A.cx - B.cx, A.cy - B.cy) * 0.25);
        g.strokeStyle = col; g.lineWidth = 2.2; g.setLineDash([5, 7]); g.lineDashOffset = -t * 24;
        g.beginPath(); g.moveTo(A.cx, A.cy); g.quadraticCurveTo(mx, my, B.cx, B.cy); g.stroke(); g.setLineDash([]);
        g.fillStyle = col; g.beginPath(); g.arc(B.cx, B.cy, 3.5, 0, 7); g.fill();
      }
    }
    // incidents
    if (state.ov.olay) {
      for (const [fid, sv] of live.oa || []) {
        const f = fsMap[fid]; if (!f) continue;
        const col = sv === "kritik" ? "248,113,113" : sv === "uyari" ? "251,191,36" : "96,165,250";
        const ph = (t * 1.2) % 1;
        g.beginPath(); g.arc(f.cx, f.cy, 10 + ph * 34, 0, 7); g.strokeStyle = `rgba(${col},${1 - ph})`; g.lineWidth = 2; g.stroke();
      }
    }
    // disaster layer
    const af = live.afet;
    if (af && af.tip === "deprem") {
      const age = (live.t - af.t0);
      for (let i = 0; i < 4; i++) {
        const ph = ((t * 0.45 + i / 4) % 1);
        g.beginPath(); g.arc(af.x, af.y, 30 + ph * 700, 0, 7); g.strokeStyle = `rgba(248,113,113,${(1 - ph) * (age < 120 ? 0.55 : 0.2)})`; g.lineWidth = 2.5; g.stroke();
      }
      g.fillStyle = "#ef4444"; g.beginPath(); g.arc(af.x, af.y, 7, 0, 7); g.fill();
      label(af.x, af.y - 12, `M${af.M} ${L(`· epicentre`, `· merkez üssü`)}`, "#fecaca", 11, true);
      for (const [fid, lv] of af.hasar) {
        const f = fsMap[fid]; if (!f) continue;
        const c = lv === "agir" ? "#ef4444" : lv === "orta" ? "#f97316" : "#facc15";
        g.strokeStyle = c; g.lineWidth = 2.5; g.beginPath(); g.moveTo(f.x + 6, f.y + 6); g.lineTo(f.x + f.w - 6, f.y + f.h - 6); g.moveTo(f.x + f.w - 6, f.y + 6); g.lineTo(f.x + 6, f.y + f.h - 6); g.stroke();
      }
    } else if (af && af.tip === "sizinti" && af.uzunluk > 1) {
      g.save(); g.translate(af.x, af.y); g.rotate(af.yon);
      const LEN = af.uzunluk, Wd = af.genislik;
      const grd = g.createLinearGradient(0, 0, LEN, 0); grd.addColorStop(0, "rgba(190,242,100,.55)"); grd.addColorStop(1, "rgba(190,242,100,0)");
      g.fillStyle = grd; g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(LEN * 0.6, -Wd * 1.1, LEN, -Wd * 0.4); g.lineTo(LEN, Wd * 0.4); g.quadraticCurveTo(LEN * 0.6, Wd * 1.1, 0, 8); g.closePath(); g.fill();
      for (let i = 0; i < 14; i++) { const k = ((t * 0.12 + i / 14) % 1); g.beginPath(); g.arc(k * LEN, Math.sin(i * 7.3 + t) * Wd * k * 0.7, 6 + k * 14, 0, 7); g.fillStyle = `rgba(217,249,157,${0.18 * (1 - k)})`; g.fill(); }
      g.restore();
      label(af.x, af.y - 14, L("☣ LEAK", "☣ SIZINTI"), "#d9f99d", 11, true);
      for (const fid of af.altinda || []) { const f = fsMap[fid]; if (!f) continue; g.strokeStyle = "#bef264"; g.lineWidth = 2; g.setLineDash([4, 3]); rr(f.x - 4, f.y - 4, f.w + 8, f.h + 8, 8); g.stroke(); g.setLineDash([]); }
    }
    // vehicles
    if (state.ov.lojistik) {
      for (const tr of Object.values(trucks)) {
        const [x, y] = tpos(tr), st = tr.a[3], kind = tr.a[5];
        if (kind === "usta") {
          g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = st === "mudahalede" ? "#e879f9" : "#c084fc";
          g.fillRect(-4, -4, 8, 8); g.strokeStyle = "#fff"; g.lineWidth = 1; g.strokeRect(-4, -4, 8, 8); g.restore();
          if (st === "mudahalede") { g.beginPath(); g.arc(x, y, 9 + 2 * Math.sin(t * 5), 0, 7); g.strokeStyle = "rgba(232,121,249,.6)"; g.lineWidth = 1.2; g.stroke(); }
          continue;
        }
        if (kind === "itfaiye") {
          g.fillStyle = Math.floor(t * 4) % 2 ? "#ef4444" : "#3b82f6"; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
          g.strokeStyle = "#fff"; g.lineWidth = 1.2; g.stroke(); continue;
        }
        const col = kind === "simbiyoz" && st === "yuklu" ? "#a3e635" : TRUCK_COL[st] || "#94a3b8";
        g.fillStyle = col; g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill();
        if (st === "yuklu") { g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 0.8; g.stroke(); }
      }
    }
    // night & outage overlay
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hr = live.t != null ? (live.t % 1440) / 60 : 12;
    const night = hr < 6 || hr > 20 ? 0.22 : hr < 7.5 ? 0.22 * (7.5 - hr) / 1.5 : hr > 18.5 ? 0.22 * (hr - 18.5) / 1.5 : 0;
    if (night > 0) { g.fillStyle = `rgba(2,4,12,${night})`; g.fillRect(0, 0, Wc, Hc); }
    if (live.ruzgar) {
      const rx = Wc - 46, ry = Hc - 46, a = live.ruzgar.aci;
      g.fillStyle = "rgba(7,12,22,.85)"; g.beginPath(); g.arc(rx, ry, 24, 0, 7); g.fill(); g.strokeStyle = "#26375a"; g.lineWidth = 1; g.stroke();
      g.save(); g.translate(rx, ry); g.rotate(a); g.strokeStyle = "#a5f3fc"; g.lineWidth = 2; g.beginPath(); g.moveTo(-13, 0); g.lineTo(13, 0); g.lineTo(7, -5); g.moveTo(13, 0); g.lineTo(7, 5); g.stroke(); g.restore();
      g.fillStyle = "#94a3b8"; g.font = "600 9px Inter, sans-serif"; g.textAlign = "center"; g.fillText(`${L(`wind`, `rüzgâr`)} ${live.ruzgar.hiz} m/s`, rx, ry + 36);
    }
    if (live.kesinti) {
      g.fillStyle = `rgba(80,10,10,${0.12 + 0.06 * Math.sin(t * 3)})`; g.fillRect(0, 0, Wc, Hc);
      g.fillStyle = "#fecaca"; g.font = "700 13px 'Space Grotesk', sans-serif"; g.textAlign = "right";
      g.fillText(L("ISLAND MODE · GRID DOWN", "ADA MODU · ŞEBEKE KESİK"), Wc - 52, 26);
    }
  }
  function label(x, y, text, color, size, bold) {
    g.fillStyle = color; g.font = `${bold ? 600 : 400} ${size}px Inter, sans-serif`; g.textAlign = "center"; g.fillText(text, x, y);
  }
  draw();

  return {
    update,
    setHighlight(ids) { highlight = new Set(ids || []); },
    setLayer(l) { state.layer = l; drawLegend(); },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("mouseup", onUp); },
  };
}
