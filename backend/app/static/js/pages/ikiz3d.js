// NEXUS OSB — 3D Digital Twin (three.js, local copy: /static/vendor)
import * as THREE from "../../vendor/three.module.min.js";
import { $, $$, esc, fmt, STATUS, STATUS_COLOR } from "../ui.js";

const SMOKY = new Set(["dokum", "metal", "tekstil", "gida", "kimya", "yapi"]);
let R = null;

function col(hex) { return new THREE.Color(hex); }

export default {
  mount(root, ctx) {
    const W = ctx.world;
    root.innerHTML = `<div class="three-wrap" id="tw" style="height:${Math.max(560, window.innerHeight - 130)}px">
      <div class="three-hud"><div class="seg"><button id="b-drone">${L(`🚁 Drone tour`, `🚁 Drone turu`)}</button><button id="b-smoke" class="on">${L(`Smoke`, `Duman`)}</button><button id="b-flow" class="on">${L(`Flows`, `Akışlar`)}</button><button id="b-reset">${L(`Reset camera`, `Kamerayı sıfırla`)}</button></div></div>
      <div class="three-info" id="tinfo"></div><div class="map-tip" id="ttip"></div></div>
      <div class="muted" style="font-size:12px;margin-top:8px">${L(`Drag: rotate · Right-click / Shift + drag: pan · Wheel: zoom · Click a building: site details. Building height follows installed power, stack smoke follows current emissions, roof colour shows status.`, `Sürükle: döndür · Sağ tık / Shift + sürükle: kaydır · Tekerlek: yakınlaş · Binaya tıkla: tesis ayrıntısı. Bina yüksekliği kurulu güçle, baca dumanı anlık emisyonla, çatı rengi durumla orantılıdır.`)}</div>`;
    const wrap = $("#tw");
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    wrap.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x02050b, 1400, 2600);
    const cam = new THREE.PerspectiveCamera(42, 1, 1, 6000);
    const CX = W.harita.w / 2, CZ = W.harita.h / 2, R0 = Math.max(W.harita.w, W.harita.h) * 1.18;
    const orbit = { r: R0, th: -0.75, ph: 0.92, tx: CX, ty: 0, tz: CZ };
    const hemi = new THREE.HemisphereLight(0x8fb6ff, 0x0a0f1a, 0.6); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(900, 900, 200); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -800, right: 800, top: 800, bottom: -800, near: 10, far: 3000 });
    sun.target.position.set(CX, 0, CZ); scene.add(sun, sun.target);
    // ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W.harita.w + 500, W.harita.h + 460), new THREE.MeshStandardMaterial({ color: 0x0a1221, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(CX, -0.5, CZ); ground.receiveShadow = true; scene.add(ground);
    const M = W.harita;
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x101b30, roughness: 0.95 });
    for (let c = 0; c < M.xs.length - 1; c++) for (let r = 0; r < M.ys.length - 1; r++) {
      const w = M.xs[c + 1] - M.xs[c] - 16, d = M.ys[r + 1] - M.ys[r] - 16;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1, d), blockMat); b.position.set(M.xs[c] + 8 + w / 2, 0.5, M.ys[r] + 8 + d / 2); b.receiveShadow = true; scene.add(b);
    }
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x1a2438, roughness: 0.8 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x3b4d70 });
    for (const [x1, y1, x2, y2] of M.yollar) {
      const len = Math.hypot(x2 - x1, y2 - y1), horiz = y1 === y2;
      const rd = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len + 13 : 13, 0.6, horiz ? 13 : len + 13), roadMat);
      rd.position.set((x1 + x2) / 2, 0.3, (y1 + y2) / 2); rd.receiveShadow = true; scene.add(rd);
      const ln = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.8, 0.2, horiz ? 0.8 : len), lineMat); ln.position.set((x1 + x2) / 2, 0.7, (y1 + y2) / 2); scene.add(ln);
    }
    // factories
    const fobj = {}, pick = [];
    const chimneys = [];
    for (const f of W.fabrikalar) {
      const H = 12 + f.kurulu_kw / 260;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(f.w - 8, H, f.h - 8), new THREE.MeshStandardMaterial({ color: col(f.renk).multiplyScalar(0.35), roughness: 0.7, metalness: 0.2, emissive: col(f.renk), emissiveIntensity: 0.05 }));
      body.position.y = H / 2 + 1; body.castShadow = body.receiveShadow = true; body.userData.fid = f.id;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(f.w - 8, 1.6, f.h - 8), new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x34d399, emissiveIntensity: 0.4 }));
      roof.position.y = H + 1.8; roof.userData.fid = f.id;
      // sheds (saw-tooth roof)
      for (let i = 0; i < 4; i++) {
        const sh = new THREE.Mesh(new THREE.BoxGeometry((f.w - 14) / 4 - 2, 3, f.h - 14), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 }));
        sh.position.set(-(f.w - 14) / 2 + (i + 0.5) * ((f.w - 14) / 4), H + 3.6, 0); g.add(sh);
      }
      g.add(body, roof);
      g.position.set(f.cx, 0, f.cy);
      scene.add(g);
      fobj[f.id] = { g, body, roof, H, f };
      pick.push(body, roof);
      if (SMOKY.has(f.sektor)) {
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, H + 24, 10), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 }));
        ch.position.set(f.w / 2 - 12, (H + 24) / 2, -f.h / 2 + 12); ch.castShadow = true; g.add(ch);
        chimneys.push({ id: f.id, x: f.cx + f.w / 2 - 12, y: H + 25, z: f.cy - f.h / 2 + 12 });
      }
    }
    // smoke particles
    const PER = 40, NP = chimneys.length * PER;
    const sp = new Float32Array(NP * 3), sa = new Float32Array(NP);
    const seeds = Array.from({ length: NP }, () => Math.random());
    const smokeGeo = new THREE.BufferGeometry(); smokeGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const smokeTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(220,225,235,.9)"); gr.addColorStop(1, "rgba(220,225,235,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ size: 18, map: smokeTex, transparent: true, opacity: 0.35, depthWrite: false, color: 0xcbd5e1 }));
    scene.add(smoke);
    // shared facilities
    const T = W.tesisler;
    const ges = new THREE.Group(); const panelMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.6, roughness: 0.3, emissive: 0x1e3a8a, emissiveIntensity: 0.2 });
    for (let z = T.ges.y + 6; z < T.ges.y + T.ges.h - 6; z += 10) for (let x = T.ges.x + 6; x < T.ges.x + T.ges.w - 8; x += 15) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 7), panelMat); p.position.set(x + 6.5, 4, z + 3); p.rotation.x = -0.35; ges.add(p);
    }
    scene.add(ges);
    const bess = new THREE.Mesh(new THREE.BoxGeometry(T.bess.w - 6, 12, T.bess.h - 6), new THREE.MeshStandardMaterial({ color: 0x0f766e, emissive: 0x14b8a6, emissiveIntensity: 0.3 }));
    bess.position.set(T.bess.x + T.bess.w / 2, 7, T.bess.y + T.bess.h / 2); bess.castShadow = true; scene.add(bess);
    const aim = new THREE.Mesh(new THREE.BoxGeometry(T.aim.w - 6, 16, T.aim.h - 6), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    aim.position.set(T.aim.x + T.aim.w / 2, 9, T.aim.y + T.aim.h / 2); scene.add(aim);
    const tanks = [];
    for (let i = 0; i < 3; i++) {
      const tk = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 10, 28), new THREE.MeshStandardMaterial({ color: 0x0e3a52, emissive: 0x0ea5e9, emissiveIntensity: 0.25 }));
      tk.position.set(T.aritma.x + T.aritma.w / 2, 6, T.aritma.y + 24 + i * 38); scene.add(tk); tanks.push(tk);
    }
    const lj = new THREE.Mesh(new THREE.BoxGeometry(T.lojistik.w - 8, 8, T.lojistik.h - 8), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
    lj.position.set(T.lojistik.x + T.lojistik.w / 2, 5, T.lojistik.y + T.lojistik.h / 2); scene.add(lj);
    const hq = W.yonetim;
    const hqm = new THREE.Mesh(new THREE.BoxGeometry(hq.w - 10, 46, hq.h - 10), new THREE.MeshStandardMaterial({ color: 0x312e81, emissive: 0x7c3aed, emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.3 }));
    hqm.position.set(hq.x + hq.w / 2, 24, hq.y + hq.h / 2); hqm.castShadow = true; scene.add(hqm);
    let h2tanks = [];
    if (W.hidrojen) {
      const H2 = W.hidrojen;
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), new THREE.MeshStandardMaterial({ color: 0xccfbf1, metalness: 0.7, roughness: 0.25, emissive: 0x2dd4bf, emissiveIntensity: 0.1 }));
        s.position.set(H2.x + 16 + i * ((H2.w - 32) / 2), 11, H2.y + H2.h * 0.7); s.castShadow = true; scene.add(s); h2tanks.push(s);
      }
      for (let z = H2.y + 5; z < H2.y + H2.h * 0.45; z += 8) for (let x = H2.x + 5; x < H2.x + H2.w - 10; x += 13) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 5), panelMat); p.position.set(x + 5, 3, z + 2); p.rotation.x = -0.35; scene.add(p);
      }
    }
    // substations
    const tms = W.trafolar.map((tm) => {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 34, 6), new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6 }));
      tw.position.set(tm.x, 17, tm.y); scene.add(tw);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(11, 1.6, 8, 40), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(tm.x, 36, tm.y); scene.add(ring);
      return ring;
    });
    // vehicles (instanced)
    const MAXV = 80;
    const veh = new THREE.InstancedMesh(new THREE.BoxGeometry(9, 5, 5), new THREE.MeshStandardMaterial({ roughness: 0.5 }), MAXV);
    veh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); veh.castShadow = true; scene.add(veh);
    const vstate = {};
    // flows + disaster
    const flows = new THREE.Group(); scene.add(flows);
    const disasterG = new THREE.Group(); scene.add(disasterG);
    let flowKey = "", afKey = "";

    const st = { drone: false, smoke: true, flow: true, hover: null, shake: 0 };
    $("#b-drone").onclick = (e) => { st.drone = !st.drone; e.target.classList.toggle("on", st.drone); };
    $("#b-smoke").onclick = (e) => { st.smoke = !st.smoke; e.target.classList.toggle("on", st.smoke); smoke.visible = st.smoke; };
    $("#b-flow").onclick = (e) => { st.flow = !st.flow; e.target.classList.toggle("on", st.flow); flows.visible = st.flow; };
    $("#b-reset").onclick = () => Object.assign(orbit, { r: R0, th: -0.75, ph: 0.92, tx: CX, tz: CZ });

    // camera control
    const el = renderer.domElement;
    let drag = null;
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey, moved: false }; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointerup", (e) => { if (drag && !drag.moved) click(e); drag = null; });
    el.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        drag.x = e.clientX; drag.y = e.clientY;
        if (drag.pan) {
          const k = orbit.r / 900;
          orbit.tx -= (Math.cos(orbit.th) * dx + Math.sin(orbit.th) * dy) * k;
          orbit.tz -= (-Math.sin(orbit.th) * dx + Math.cos(orbit.th) * dy) * k;
        } else { orbit.th -= dx * 0.005; orbit.ph = Math.max(0.15, Math.min(1.45, orbit.ph - dy * 0.004)); }
      } else hover(e);
    });
    el.addEventListener("wheel", (e) => { e.preventDefault(); orbit.r = Math.max(180, Math.min(2200, orbit.r * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });
    const ray = new THREE.Raycaster(), mv = new THREE.Vector2();
    function hit(e) {
      const r = el.getBoundingClientRect();
      mv.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mv, cam);
      const h = ray.intersectObjects(pick, false)[0];
      return h ? h.object.userData.fid : null;
    }
    function click(e) { const id = hit(e); if (id) ctx.openFactory(id); }
    function hover(e) {
      const id = hit(e), tip = $("#ttip");
      st.hover = id;
      if (!id) { tip.style.display = "none"; el.style.cursor = "grab"; return; }
      el.style.cursor = "pointer";
      const f = fobj[id].f, lf = (ctx.live().f || []).find((x) => x.id === id) || {};
      tip.innerHTML = `<b>${esc(f.ad)}</b><div class="muted" style="font-size:11.5px">${esc(f.sektor_ad)} · ${f.calisan} ${L(`employees`, `çalışan`)}</div>
        <div class="kv"><span>${L(`Status`, `Durum`)}</span><span style="color:${STATUS_COLOR[lf.d]}">${STATUS[lf.d] || "—"}</span><span>${L(`Power`, `Güç`)}</span><span class="num">${fmt.mw(lf.kw, 2)} MW</span>
        <span>OEE</span><span class="num">${fmt.pct(lf.oee)}</span><span>${L(`Emissions`, `Emisyon`)}</span><span class="num">${fmt.n((lf.co2 || 0) / 1000, 2)} t/h</span></div>`;
      const r = wrap.getBoundingClientRect();
      tip.style.display = "block";
      tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 230) + "px";
      tip.style.top = Math.min(e.clientY - r.top + 14, r.height - 140) + "px";
    }
    function resize() { const r = wrap.getBoundingClientRect(); renderer.setSize(r.width, r.height); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); }
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();

    const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const VCOL = { yuklu: 0x22d3ee, gidiyor: 0x94a3b8, donus: 0x64748b, yukleniyor: 0xfde68a, bosaltiyor: 0xfde68a, kuyrukta: 0xf97316, yolda: 0xc084fc, mudahalede: 0xe879f9, mudahale: 0xef4444 };
    let alive = true, last = performance.now();
    function frame() {
      if (!alive) return;
      requestAnimationFrame(frame);
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      const l = ctx.live(); if (!l) return;
      const hr = (l.t % 1440) / 60;
      const day = Math.max(0, Math.sin(Math.PI * (hr - 6) / 13.5));
      scene.background = new THREE.Color().lerpColors(col(0x02040a), col(0x0d2240), day);
      scene.fog.color.copy(scene.background);
      sun.intensity = 0.15 + day * 1.15;
      const ang = Math.PI * (hr - 6) / 13.5;
      sun.position.set(CX + Math.cos(ang) * 900, 120 + Math.max(0, Math.sin(ang)) * 900, CZ - 400);
      hemi.intensity = 0.35 + day * 0.5;
      if (st.drone) orbit.th += dt * 0.12;
      let sx = 0, sz = 0;
      if (l.afet && l.afet.tip === "deprem" && l.t - l.afet.t0 < 30) { sx = (Math.random() - 0.5) * 9; sz = (Math.random() - 0.5) * 9; }
      cam.position.set(orbit.tx + orbit.r * Math.sin(orbit.ph) * Math.sin(orbit.th) + sx, orbit.r * Math.cos(orbit.ph), orbit.tz + orbit.r * Math.sin(orbit.ph) * Math.cos(orbit.th) + sz);
      cam.lookAt(orbit.tx, 0, orbit.tz);
      // site states
      const lmap = {}; for (const x of l.f) lmap[x.id] = x;
      const night = 1 - day;
      const dmg = {}; if (l.afet && l.afet.tip === "deprem") for (const [id, lv] of l.afet.hasar) dmg[id] = lv;
      for (const [id, o] of Object.entries(fobj)) {
        const lf = lmap[id]; if (!lf) continue;
        const c = col(STATUS_COLOR[lf.d] || "#334155");
        o.roof.material.color.copy(c); o.roof.material.emissive.copy(c); o.roof.material.emissiveIntensity = lf.d === "bosta" ? 0.1 : 0.55;
        o.body.material.emissiveIntensity = (lf.d === "calisiyor" ? 0.12 + night * 0.5 : 0.03) * (st.hover === id ? 2.2 : 1);
        o.g.rotation.z = dmg[id] === "agir" ? 0.05 : dmg[id] === "orta" ? 0.02 : 0;
      }
      // smoke
      smoke.visible = st.smoke;
      if (st.smoke) {
        const mx = Math.max(1, ...l.f.map((x) => x.co2));
        const wa = l.ruzgar ? l.ruzgar.aci : 0, wv = l.ruzgar ? l.ruzgar.hiz : 3;
        chimneys.forEach((c, ci) => {
          const lf = lmap[c.id], k = lf && lf.d === "calisiyor" ? lf.co2 / mx : 0.05;
          for (let i = 0; i < PER; i++) {
            const j = ci * PER + i;
            const life = (seeds[j] + now / 1000 * (0.12 + 0.05 * seeds[j])) % 1;
            const vis = seeds[(j * 7) % NP] < k;
            const rise = life * 90 * (0.5 + k);
            sp[j * 3] = c.x + Math.cos(wa) * life * wv * 9 + Math.sin(j) * life * 6;
            sp[j * 3 + 1] = vis ? c.y + rise : -50;
            sp[j * 3 + 2] = c.z + Math.sin(wa) * life * wv * 9 + Math.cos(j) * life * 6;
          }
        });
        smokeGeo.attributes.position.needsUpdate = true;
      }
      // facilities: solar, BESS, wastewater, H2, substation
      panelMat.emissiveIntensity = 0.1 + (l.e.ges / (W.ges_kwp || 18000)) * 0.6;
      bess.material.emissive.set(l.e.bess > 50 ? 0xfb923c : l.e.bess < -50 ? 0x34d399 : 0x14b8a6);
      bess.material.emissiveIntensity = 0.2 + 0.3 * Math.abs(Math.sin(now / 400));
      tanks.forEach((t) => { t.material.emissive.set(l.su.util > 1 ? 0xef4444 : 0x0ea5e9); });
      h2tanks.forEach((t) => { t.material.emissiveIntensity = 0.05 + (l.h2 ? l.h2.doluluk : 0) * 0.8; });
      tms.forEach((r, i) => { const u = l.e.tm[i]; r.material.color.set(l.kesinti ? 0x475569 : u > 1 ? 0xf87171 : u > 0.9 ? 0xfbbf24 : 0x34d399); r.rotation.z += dt * (0.5 + u * 2); });
      // vehicles
      const list = (l.l && l.l.araclar) || [];
      const seen = new Set();
      let n = 0;
      for (const a of list) {
        if (n >= MAXV) break;
        const id = a[0]; seen.add(id);
        let v = vstate[id];
        if (!v) v = vstate[id] = { x: a[1], z: a[2], tx: a[1], tz: a[2], rot: 0 };
        v.tx = a[1]; v.tz = a[2];
        const dx = v.tx - v.x, dz = v.tz - v.z;
        if (Math.hypot(dx, dz) > 0.5) v.rot = Math.atan2(-dz, dx);
        v.x += dx * Math.min(1, dt * 6); v.z += dz * Math.min(1, dt * 6);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), v.rot);
        sc.set(a[5] === "usta" ? 0.55 : a[5] === "itfaiye" ? 1.4 : 1, a[5] === "usta" ? 1.6 : 1, a[5] === "usta" ? 0.9 : 1);
        tmpM.compose(new THREE.Vector3(v.x, 4, v.z), q, sc);
        veh.setMatrixAt(n, tmpM);
        const cc = a[5] === "itfaiye" ? (Math.floor(now / 250) % 2 ? 0xef4444 : 0x3b82f6) : a[5] === "simbiyoz" && a[3] === "yuklu" ? 0xa3e635 : (VCOL[a[3]] || 0x94a3b8);
        veh.setColorAt(n, tmpC.set(cc));
        n++;
      }
      for (const id of Object.keys(vstate)) if (!seen.has(id)) delete vstate[id];
      veh.count = n; veh.instanceMatrix.needsUpdate = true; if (veh.instanceColor) veh.instanceColor.needsUpdate = true;
      // symbiosis flows
      const fk = JSON.stringify(l.s);
      if (fk !== flowKey) {
        flowKey = fk;
        flows.clear();
        for (const [p, c, wt] of l.s || []) {
          const A = fobj[p], B = fobj[c]; if (!A || !B) continue;
          const a = new THREE.Vector3(A.f.cx, A.H + 4, A.f.cy), b = new THREE.Vector3(B.f.cx, B.H + 4, B.f.cy);
          const m = a.clone().lerp(b, 0.5); m.y += 40 + a.distanceTo(b) * 0.25;
          const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 40, 1.3, 6, false),
            new THREE.MeshBasicMaterial({ color: (W.atiklar[wt] || {}).renk || "#84cc16", transparent: true, opacity: 0.85 }));
          flows.add(tube);
        }
      }
      flows.children.forEach((t, i) => { t.material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(now / 600 + i)); });
      // disaster
      const ak = l.afet ? l.afet.tip + l.afet.t0 : "";
      if (ak !== afKey) {
        afKey = ak; disasterG.clear();
        if (l.afet && l.afet.tip === "deprem") {
          for (let i = 0; i < 4; i++) { const ring = new THREE.Mesh(new THREE.RingGeometry(1, 4, 64), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(l.afet.x, 2, l.afet.y); ring.userData.k = i / 4; disasterG.add(ring); }
        } else if (l.afet && l.afet.tip === "sizinti") {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xbef264, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
          cone.userData.cone = true; disasterG.add(cone);
        }
      }
      if (l.afet) disasterG.children.forEach((m) => {
        if (m.userData.cone) {
          const LEN = Math.max(1, l.afet.uzunluk), Wd = Math.max(1, l.afet.genislik);
          m.scale.set(18, LEN, Wd); m.rotation.set(0, 0, 0);
          m.rotation.z = Math.PI / 2; m.rotation.y = -l.afet.yon;
          m.position.set(l.afet.x + Math.cos(l.afet.yon) * LEN / 2, 14, l.afet.y + Math.sin(l.afet.yon) * LEN / 2);
        } else {
          const ph = (now / 2200 + m.userData.k) % 1; const s = 20 + ph * 700; m.scale.set(s, s, 1); m.material.opacity = (1 - ph) * 0.6;
        }
      });
      renderer.render(scene, cam);
    }
    frame();
    R = { renderer, ro, stop: () => { alive = false; } };
    this.info(ctx.live());
  },
  info(l) {
    const el = $("#tinfo"); if (!el || !l) return;
    el.innerHTML = `<div style="font-family:var(--f-head);font-weight:600;margin-bottom:4px">${L(`Day`, `Gün`)} ${l.gun} · ${l.saat}</div>
      <div>${L(`⚡ Load`, `⚡ Yük`)} <b class="num">${fmt.mw(l.e.yuk, 1)} MW</b> ${L(`· Solar`, `· GES`)} <b class="num">${fmt.mw(l.e.ges, 1)}</b></div>
      <div>${L(`🔋 Battery`, `🔋 Batarya`)} <b class="num">${Math.round(l.e.soc * 100)}%</b> · H₂ <b class="num">${l.h2 ? l.h2.stok : 0} kg</b></div>
      <div>🚚 <b class="num">${l.l.aktif}</b> ${L(`vehicles on the road · 🧰`, `araç yolda · 🧰`)} <b class="num">${(l.l.araclar || []).filter((a) => a[5] === "usta").length}</b> ${L(`technicians on a job`, `usta görevde`)}</div>
      <div>🌫 <b class="num">${fmt.n(l.k.co2_anlik, 1)}</b> ${L(`tCO₂/h · wind`, `tCO₂/sa · rüzgâr`)} ${l.ruzgar ? l.ruzgar.hiz : "—"} m/s</div>
      ${l.afet ? `<div class="t-crit" style="margin-top:4px;font-weight:600">${l.afet.tip === "deprem" ? `🌍 M${l.afet.M} ${L(`earthquake`, `deprem`)}` : L("☣ Chemical leak", "☣ Kimyasal sızıntı")} ${L(`active`, `aktif`)}</div>` : ""}
      ${l.ap ? `<div class="t-ok" style="margin-top:4px">${L(`✈ Autopilot active`, `✈ Otopilot devrede`)}</div>` : ""}`;
  },
  update(l) { this.info(l); },
  unmount() { if (R) { R.stop(); R.ro.disconnect(); R.renderer.dispose(); R = null; } },
};
