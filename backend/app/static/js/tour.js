// NEXUS OSB — Sunum Modu: yatırımcıya / CTO'ya kendi kendini anlatan rehberli tur
import { h, $, esc } from "./ui.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (sel, tries = 15) => { for (let i = 0; i < tries; i++) { const el = $(sel); if (el) { el.click(); return el; } await wait(200); } };

const STEPS = [
  { p: "komuta", t: "NEXUS OSB · Sanayi Bölgesi İşletim Sistemi", s: 11,
    m: "Tek bir fabrikayı değil, 30 tesisli bütün bir organize sanayi bölgesini yöneten işletim sistemi. Enerji, lojistik, atık, karbon, su ve güvenlik tek ekranda. Soldaki halka bölgenin anlık sağlık skoru." },
  { p: "harita", t: "Bölge canlı", s: 10,
    m: "Her tesis, kamyon, usta ve trafo gerçek zamanlı. Kesikli çizgiler bir tesisin atığının diğerine hammadde olarak aktığı simbiyoz hatları; halkalar açık olaylar." },
  { p: "ikiz3d", t: "3D dijital ikiz", s: 13, a: async () => { await wait(900); await click("#b-drone"); },
    m: "Aynı bölge üç boyutta. Bina yüksekliği kurulu gücü, baca dumanı anlık emisyonu, çatı rengi tesisin durumunu gösteriyor. Gece olunca fabrika ışıkları yanıyor." },
  { p: "enerji", t: "Ortak enerji: GES, batarya, hidrojen", s: 11,
    m: "18 MWp güneş, 28 MWh batarya, biyogaz ve yeşil hidrojen vadisi. Batarya puant saatlerinde deşarj olur, trafo sıkışınca esnek yükler otomatik kaydırılır." },
  { p: "simbiyoz", t: "Endüstriyel simbiyoz", s: 10,
    m: "Fırsat motoru her saat 10 atık türünü tarar: mesafe, değer, taşıma ve boru hattı yatırımıyla puanlar. Bertarafa gidecek atık, komşu tesise hammadde olur." },
  { p: "muzakere", t: "Konuşan fabrikalar", s: 13,
    m: "Her tesisin kişilikli bir yazılım ajanı var. Ajanlar esneklik ihalesinde teklif veriyor, atık fiyatında pazarlık ediyor, yarı boş kamyonları birleştiriyor. Ödemeler OSB Kredisi ile." },
  { p: "otopilot", t: "Otopilot devrede", s: 11, a: async (ctx) => { await ctx.api("/otopilot", { aktif: true }); },
    m: "Şimdi otopilotu açıyoruz. Bölge Beyni her 10 dakikada bir tarıyor ve kararlarını gerekçesiyle buraya yazıyor. Yatırım gerektiren büyük kararlar insan onayına kalıyor." },
  { p: "evrenler", t: "Paralel evrenler: kanıt", s: 15, a: async () => { await wait(900); const g = $("#vg"); if (g) g.value = "1"; await click("#vrun"); },
    m: "Aynı bölgeyi ikiye ayırıyoruz: solda klasik OSB, sağda NEXUS otopilot. Aynı rastlantılarla bir gün ileri sarıyoruz. Aradaki fark, sistemin bölgeye kazandırdığı para ve karbon." },
  { p: "tahmin", t: "Geleceği görmek", s: 11,
    m: "Bölge 6 kez kopyalanıp 24 saat ileri koşturuluyor. Risk takvimi hangi saatte hangi trafonun, sözleşme gücünün veya arıtmanın zorlanacağını yüzde olarak gösteriyor." },
  { p: "senaryolar", t: "Stres testi: deprem", s: 9, a: async (ctx) => { await ctx.api("/senaryolar/deprem/baslat", {}); await ctx.api("/sim", { tps: 20, paused: false }); },
    m: "Şimdi en zor ânı canlandırıyoruz: büyüklüğü 6 ile 7 arasında bir deprem. Simülasyon 20 kat hızda." },
  { p: "komuta", t: "Kriz anı", s: 12,
    m: "Şebeke kesildi, bölge ada moduna geçti: batarya ve güneş yalnızca gıda, kimya ve arıtmayı besliyor. Doğalgaz vanaları kapandı, hasarlı tesislere ustalar ve itfaiye yönlendirildi." },
  { p: "kriz", t: "Kriz Merkezi", s: 10,
    m: "Her olayın önerilen müdahale adımları ve dakika dakika kaydı burada. Usta olay yerine varınca Dijital Usta reçetesiyle duruşu kısaltıyor." },
  { p: "karbon", t: "Karbon ve AB SKDM", s: 10,
    m: "Kapsam 1-2 ve lojistik emisyonu tesis bazında. AB Sınırda Karbon Düzenlemesi kapsamındaki ihracatçıların yıllık karbon bedeli riski önceden hesaplanıyor." },
  { p: "beyin", t: "Bölge Beyni", s: 11,
    m: "Yerel ve ücretsiz yapay zekâ. Sorulara canlı veriyle cevap veriyor, komutları uyguluyor. Mikrofon tuşuyla sesli de konuşulabilir: 'TM-3'ü rahatlat' demek yeterli." },
  { p: "komuta", t: "NEXUS OSB", s: 9, a: async (ctx) => { await ctx.api("/senaryolar/durdur", {}); await ctx.api("/sim", { tps: 1, paused: false }); },
    m: "Fabrika OS bir fabrikanın işletim sistemiyse, NEXUS OSB o fabrikaların yaşadığı şehrin işletim sistemi. Teşekkürler." },
];

let box = null;
export default async function tour(ctx) {
  if (box) return;
  let i = 0, paused = false, stop = false, voice = false, started = performance.now(), elapsed = 0;
  box = h(`<div class="tour-box"><h3><span>🎬</span><span id="tt"></span></h3><p id="tm"></p>
    <div class="tour-prog"><i id="tp" style="width:0"></i></div>
    <div class="tb"><div class="dots">${STEPS.map(() => "<i></i>").join("")}</div>
      <button class="btn sm" id="tv" title="Sesli anlatım">🔇 Ses</button><button class="btn sm" id="tb">◀</button><button class="btn sm" id="tpz">⏸</button><button class="btn sm" id="tn">▶</button><button class="btn sm danger" id="tx">Bitir</button></div></div>`);
  document.body.appendChild(box);
  const speak = (txt) => {
    if (!voice || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt); u.lang = "tr-TR"; u.rate = 1.02;
    const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.startsWith("tr")); if (v) u.voice = v;
    speechSynthesis.speak(u);
  };
  const show = async (k) => {
    i = Math.max(0, Math.min(STEPS.length - 1, k));
    const s = STEPS[i];
    box.querySelector("#tt").textContent = `${i + 1}/${STEPS.length} · ${s.t}`;
    box.querySelector("#tm").textContent = s.m;
    box.querySelectorAll(".dots i").forEach((d, j) => d.classList.toggle("on", j <= i));
    started = performance.now(); elapsed = 0;
    ctx.go(s.p);
    speak(s.m);
    if (s.a) { await wait(700); try { await s.a(ctx); } catch (e) { console.warn(e); } }
  };
  box.querySelector("#tn").onclick = () => show(i + 1);
  box.querySelector("#tb").onclick = () => show(i - 1);
  box.querySelector("#tpz").onclick = (e) => { paused = !paused; e.target.textContent = paused ? "▶ Devam" : "⏸"; if (!paused) started = performance.now() - elapsed; };
  box.querySelector("#tv").onclick = (e) => { voice = !voice; e.target.textContent = voice ? "🔊 Ses" : "🔇 Ses"; if (voice) speak(STEPS[i].m); else speechSynthesis && speechSynthesis.cancel(); };
  box.querySelector("#tx").onclick = () => { stop = true; };
  await show(0);
  while (!stop) {
    await wait(100);
    if (paused) continue;
    elapsed = performance.now() - started;
    const dur = STEPS[i].s * 1000;
    box.querySelector("#tp").style.width = Math.min(100, (elapsed / dur) * 100) + "%";
    if (elapsed >= dur) { if (i === STEPS.length - 1) break; await show(i + 1); }
  }
  if (window.speechSynthesis) speechSynthesis.cancel();
  if (stop) { try { await ctx.api("/sim", { tps: 1, paused: false }); } catch (_) {} }
  box.remove(); box = null;
}
