// NEXUS OSB — UI helpers: formatting, API, charts, icons
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------------------------------------------------------- language (EN / TR)
// The language lives on the server (/api/dil) so backend messages and the UI always match.
export const LANG = await fetch("/api/dil").then((r) => r.json()).then((d) => (d.dil === "tr" ? "tr" : "en")).catch(() => "en");
export const L = (en, tr) => (LANG === "tr" ? tr : en);
globalThis.L = L;
globalThis.LANG = LANG;
document.documentElement.lang = LANG;

const nf = (d) => new Intl.NumberFormat(L("en-US", "tr-TR"), { minimumFractionDigits: d, maximumFractionDigits: d });
const NF = [nf(0), nf(1), nf(2), nf(3)];
const TR = LANG === "tr";
export const fmt = {
  n: (x, d = 0) => (x == null || isNaN(x) ? "—" : NF[d].format(x)),
  tl: (x) => (x == null ? "—" : TR ? NF[0].format(Math.round(x)) + " ₺" : (x < 0 ? "-₺" : "₺") + NF[0].format(Math.abs(Math.round(x)))),
  ktl: (x) => {
    if (x == null) return "—";
    const a = Math.abs(x);
    if (TR) {
      if (a >= 1e9) return NF[2].format(x / 1e9) + " Mr ₺";
      if (a >= 1e6) return NF[2].format(x / 1e6) + " M ₺";
      if (a >= 1e3) return NF[1].format(x / 1e3) + " B ₺";
      return NF[0].format(x) + " ₺";
    }
    const s = x < 0 ? "-₺" : "₺";
    if (a >= 1e9) return s + NF[2].format(a / 1e9) + "B";
    if (a >= 1e6) return s + NF[2].format(a / 1e6) + "M";
    if (a >= 1e3) return s + NF[1].format(a / 1e3) + "k";
    return s + NF[0].format(a);
  },
  price: (x, d = 0) => (x == null ? "—" : TR ? NF[d].format(x) + " ₺" : (x < 0 ? "-₺" : "₺") + NF[d].format(Math.abs(x))),
  mw: (kw, d = 1) => (kw == null ? "—" : NF[d].format(kw / 1000)),
  pct: (x, d = 0) => (x == null ? "—" : TR ? "%" + NF[d].format(x * 100) : NF[d].format(x * 100) + "%"),
  t: (m) => { const d = Math.floor(m / 1440) + 1, mm = m % 1440; return `${L("D", "G")}${d} ${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`; },
  hm: (m) => { const mm = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`; },
  dur: (m) => (m >= 60 ? `${Math.floor(m / 60)} ${L("h", "sa")} ${m % 60} ${L("min", "dk")}` : `${m} ${L("min", "dk")}`),
};

export const STATUS = { calisiyor: L("Running", "Çalışıyor"), bosta: L("Off shift", "Vardiya dışı"), ariza: L("Fault", "Arıza"), bakim: L("Maintenance", "Bakım"), durdu: L("Stopped", "Durdu") };
export const STATUS_COLOR = { calisiyor: "#34d399", bosta: "#475569", ariza: "#fbbf24", bakim: "#60a5fa", durdu: "#f87171" };
export const TRUCK = { gidiyor: L("Heading to pickup", "Yüklemeye gidiyor"), yukleniyor: L("Loading", "Yükleniyor"), yuklu: L("Loaded, en route", "Yüklü yolda"), bosaltiyor: L("Unloading", "Boşaltıyor"), donus: L("Returning to depot", "Depoya dönüyor"), kuyrukta: L("Queued at gate", "Kapı kuyruğunda"), bos: L("Idle", "Boşta"), yolda: L("Heading to incident", "Olay yerine gidiyor"), mudahalede: L("On site", "Müdahalede"), mudahale: L("On site", "Müdahalede") };
export const ORDER_TIP = { giris: L("Inbound raw material", "Hammadde girişi"), sevkiyat: L("Outbound shipment", "Sevkiyat"), ic_tedarik: L("In-zone supply", "Bölge içi tedarik"), simbiyoz: L("Symbiosis transfer", "Simbiyoz transferi") };
export const PERIOD = { gece: L("Night", "Gece"), gunduz: L("Day", "Gündüz"), puant: L("Peak", "Puant") };
export const PERIOD_COLOR = { gece: "#6366f1", gunduz: "#22d3ee", puant: "#f97316" };

export async function api(path, body, method) {
  const opt = body !== undefined ? { method: method || "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {};
  const r = await fetch("/api" + path, opt);
  if (!r.ok) {
    let d = r.statusText;
    try { d = (await r.json()).detail || d; } catch (_) {}
    throw new Error(d);
  }
  return r.json();
}

export function toast(text, kind = "") {
  const box = $("#toasts");
  const t = h(`<div class="toast ${kind}">${text}</div>`);
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = ".3s"; }, 4800);
  setTimeout(() => t.remove(), 5200);
  while (box.children.length > 4) box.firstChild.remove();
}

// ---------------------------------------------------------- icons
const P = {
  komuta: "M3 12h4l3-8 4 16 3-8h4",
  harita: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  tesis: "M3 21V9l6 4V9l6 4V5h6v16H3zM7 17h2M12 17h2M17 17h2",
  kriz: "M12 3 2 20h20L12 3zM12 10v4M12 17.5v.5",
  enerji: "M13 2 4 14h7l-1 8 9-12h-7l1-8z",
  lojistik: "M2 7h11v9H2zM13 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-.1M17 19a2 2 0 1 0 0-.1",
  su: "M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z",
  simbiyoz: "M7 7a5 5 0 0 1 9 1M17 17a5 5 0 0 1-9-1M16 3v5h-5M8 21v-5h5",
  karbon: "M5 16a4 4 0 0 1 1-8 6 6 0 0 1 11 1 4 4 0 0 1 1 7H5zM9 20h6",
  pazar: "M4 7h16l-1.5 11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2L4 7zM9 7a3 3 0 0 1 6 0",
  beyin: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4.5A2.5 2.5 0 0 0 9 4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1",
  senaryo: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3",
  rapor: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
  entegrasyon: "M8 7 3 12l5 5M16 7l5 5-5 5M14 4l-4 16",
  kisi: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  para: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  gunes: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  pil: "M3 7h15v10H3zM21 10v4M6 10v4M9 10v4",
  kup: "M12 2 3 7v10l9 5 9-5V7l-9-5zM3 7l9 5 9-5M12 12v10",
  dunya: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  cetvel: "M3 17 17 3l4 4L7 21l-4-4zM7 13l2 2M10 10l2 2M13 7l2 2",
  sohbet: "M4 5h16v10H9l-5 4V5zM8 9h8M8 12h5",
  otopilot: "M2 16l20-8-7 13-3-6-10 1zM12 15l3-7",
  tahmin: "M3 3v18h18M7 15l4-4 3 3 6-7M17 7h3v3",
  evren: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
};
export const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${P[k] || P.komuta}"/></svg>`;

// ---------------------------------------------------------- KPI card
export function kpi(id, label, ic, color) {
  return `<div class="card kpi" id="${id}"><div class="lbl">${label}</div><div class="val">—</div><div class="foot">&nbsp;</div>
    ${ic ? `<div class="ic" style="${color ? `color:${color};background:${color}1a` : ""}">${icon(ic)}</div>` : ""}<div class="bar" style="width:0;${color ? `background:${color}` : ""}"></div></div>`;
}
export function setKpi(id, val, unit, foot, bar) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector(".val").innerHTML = `${val}${unit ? `<small>${unit}</small>` : ""}`;
  if (foot !== undefined) el.querySelector(".foot").innerHTML = foot || "&nbsp;";
  if (bar !== undefined) el.querySelector(".bar").style.width = Math.max(0, Math.min(100, bar * 100)) + "%";
}

// ---------------------------------------------------------- line chart (SVG)
export function lineChart(el, cfg) {
  const W = el.clientWidth || 600, H = cfg.height || 220, pl = 46, pr = 12, pt = 10, pb = 24;
  const series = cfg.series.filter((s) => s.data && s.data.length);
  if (!series.length) { el.innerHTML = `<div class="empty">${L(`Waiting for data…`, `Veri bekleniyor…`)}</div>`; return; }
  const xs = series[0].data.map((d) => d[0]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x1 === x0) x1 = x0 + 1;
  let ys = series.flatMap((s) => s.data.map((d) => d[1]));
  (cfg.refs || []).forEach((r) => ys.push(r.y));
  let y0 = cfg.min != null ? cfg.min : Math.min(0, ...ys), y1 = cfg.max != null ? cfg.max : Math.max(...ys);
  if (y1 === y0) y1 = y0 + 1;
  y1 += (y1 - y0) * 0.06;
  const X = (v) => pl + ((v - x0) / (x1 - x0)) * (W - pl - pr);
  const Y = (v) => pt + (1 - (v - y0) / (y1 - y0)) * (H - pt - pb);
  const yF = cfg.yFmt || ((v) => fmt.n(v, Math.abs(y1) < 10 ? 1 : 0));
  const xF = cfg.xFmt || fmt.hm;
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = y0 + ((y1 - y0) * i) / 4;
    g += `<line class="gl" x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${pl - 6}" y="${Y(v) + 3}" text-anchor="end">${yF(v)}</text>`;
  }
  const ticks = 6;
  for (let i = 0; i <= ticks; i++) {
    const v = x0 + ((x1 - x0) * i) / ticks;
    g += `<text class="ax" x="${X(v)}" y="${H - 6}" text-anchor="middle">${xF(Math.round(v))}</text>`;
  }
  (cfg.bands || []).forEach((b) => { g += `<rect x="${X(b.x0)}" y="${pt}" width="${Math.max(0, X(b.x1) - X(b.x0))}" height="${H - pt - pb}" fill="${b.color}" opacity=".07"/>`; });
  let paths = "";
  series.forEach((s, si) => {
    const pts = s.data.map((d) => `${X(d[0]).toFixed(1)},${Y(d[1]).toFixed(1)}`);
    if (s.area) {
      const gid = `g${Math.random().toString(36).slice(2, 8)}`;
      paths += `<defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".35"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`;
      paths += `<path d="M${X(s.data[0][0])},${Y(Math.max(y0, 0))}L${pts.join("L")}L${X(s.data[s.data.length - 1][0])},${Y(Math.max(y0, 0))}Z" fill="url(#${gid})"/>`;
    }
    paths += `<polyline points="${pts.join(" ")}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""} stroke-linejoin="round"/>`;
  });
  (cfg.refs || []).forEach((r) => {
    paths += `<line x1="${pl}" x2="${W - pr}" y1="${Y(r.y)}" y2="${Y(r.y)}" stroke="${r.color}" stroke-dasharray="5 5" stroke-width="1.3"/><text x="${W - pr - 4}" y="${Y(r.y) - 5}" text-anchor="end" fill="${r.color}" font-size="10.5" font-family="var(--f-mono)">${r.label}</text>`;
  });
  el.innerHTML = `<div class="chart"><svg viewBox="0 0 ${W} ${H}" height="${H}">${g}${paths}<line class="cx" y1="${pt}" y2="${H - pb}" stroke="#94a3b8" stroke-width="1" opacity="0"/></svg><div class="chart-tip"></div></div>
    ${cfg.legend !== false ? `<div class="chart-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>` : ""}`;
  const svg = el.querySelector("svg"), tip = el.querySelector(".chart-tip"), cx = el.querySelector(".cx");
  svg.addEventListener("mousemove", (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const xv = x0 + ((px - pl) / (W - pl - pr)) * (x1 - x0);
    let idx = 0, best = 1e18;
    series[0].data.forEach((d, i) => { const dd = Math.abs(d[0] - xv); if (dd < best) { best = dd; idx = i; } });
    const xx = series[0].data[idx][0];
    cx.setAttribute("x1", X(xx)); cx.setAttribute("x2", X(xx)); cx.setAttribute("opacity", ".5");
    tip.style.display = "block";
    tip.innerHTML = `<b>${fmt.t(xx)}</b>` + series.map((s) => `<div><span style="color:${s.color}">●</span> ${s.label}: <b>${yF(s.data[idx] ? s.data[idx][1] : 0)}</b> ${s.unit || cfg.unit || ""}</div>`).join("");
    const left = (X(xx) / W) * r.width;
    tip.style.left = Math.min(left + 12, r.width - tip.offsetWidth - 4) + "px";
    tip.style.top = "8px";
  });
  svg.addEventListener("mouseleave", () => { tip.style.display = "none"; cx.setAttribute("opacity", "0"); });
}

// ---------------------------------------------------------- horizontal bars
export function bars(el, items, opt = {}) {
  if (!items.length) { el.innerHTML = `<div class="empty">${opt.empty || L("No data", "Veri yok")}</div>`; return; }
  const mx = opt.max || Math.max(...items.map((i) => i.value), 1e-9);
  el.innerHTML = `<div class="bars">${items.map((i) => `<div class="b-row ${i.click ? "click" : ""}" ${i.id ? `data-id="${i.id}"` : ""} style="${i.click ? "cursor:pointer" : ""}">
      <div class="b-lbl" title="${esc(i.label)}">${i.html || esc(i.label)}</div>
      <div class="b-track"><i style="width:${(Math.max(0, i.value) / mx) * 100}%;background:${i.color || "var(--accent)"}"></i></div>
      <div class="b-val">${i.text ?? fmt.n(i.value, 1)}</div></div>`).join("")}</div>`;
}

// ---------------------------------------------------------- ring gauge
export function ring(value, size = 150, color = "var(--accent)", label = "", text) {
  const r = size / 2 - 10, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#18233b" stroke-width="10" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" style="transition:stroke-dashoffset .8s"/></svg>
    <div class="rv"><b>${text ?? Math.round(v * 100)}</b><span>${label}</span></div></div>`;
}
export const scoreColor = (s) => (s >= 80 ? "#34d399" : s >= 60 ? "#fbbf24" : "#f87171");

export function sparkline(values, w = 120, hgt = 30, color = "#22d3ee") {
  if (!values || values.length < 2) return "";
  const mn = Math.min(...values), mx = Math.max(...values) || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(hgt - 2 - ((v - mn) / (mx - mn || 1)) * (hgt - 4)).toFixed(1)}`);
  return `<svg width="${w}" height="${hgt}" style="display:block"><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
}

export function sectorTag(world, s) {
  const x = world.sektorler[s] || { ad: s, renk: "#888" };
  return `<span class="tag"><span class="sw" style="background:${x.renk}"></span>${esc(x.ad)}</span>`;
}
export const st = (d) => `<span class="st st-${d}">${STATUS[d] || d}</span>`;
export const sev = (s) => `<span class="sev sev-${s}">${{ kritik: L("Critical", "Kritik"), uyari: L("Warning", "Uyarı"), bilgi: L("Info", "Bilgi"), firsat: L("Opportunity", "Fırsat") }[s] || s}</span>`;

export function md(text) {
  // tiny markdown: **bold**, _italic_, leading "- "
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<i class='muted'>$2</i>")
    .replace(/^- /gm, "• ");
}
