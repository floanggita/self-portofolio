// Bagian besar di kiri hanya berganti saat salah satu panel di kanan diklik.
// Panel yang diklik bertukar tempat dengan bagian yang sedang tampil besar.
// Efek kertas: halaman lama dipotong di garis lipatan, bagian yang terlipat dipantulkan sebagai sisi belakang,
// sehingga halaman tujuan di bawahnya terbuka.
const book = document.querySelector(".book");
const pages = [...book.querySelectorAll(".page")];
const intro = document.querySelector(".intro");
const slots = [...document.querySelectorAll(".slot")];
const FLIP_MS = 1200; // durasi satu lipatan
const LIFT = 0.18;    // seberapa tinggi sudut kertas terangkat saat dilipat (relatif tinggi halaman)
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let current = pages[0]; // halaman yang sedang tampil
let flipping = null;    // { page, raf } halaman lama yang sedang dilipat

pages.forEach((page) => {
  const shadow = document.createElement("div");
  shadow.className = "page-shadow";
  page.prepend(shadow);
  page.prog = 0; // 0 = rata, 1 = terlipat habis
  page.classList.toggle("hidden", page !== current);
  page.inert = page !== current;
});

// ---------- Geometri lipatan ----------

const dot2 = (a, b) => a.x * b.x + a.y * b.y;
const NONE = "polygon(0 0, 0 0, 0 0)";
const toPolygon = (poly) =>
  poly.length > 2 ? `polygon(${poly.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(", ")})` : NONE;

// Potong poligon dengan garis lipatan, simpan sisi yang searah n (sign = 1) atau sebaliknya (sign = -1)
function clip(poly, M, n, sign) {
  const out = [];
  const side = (p) => sign * ((p.x - M.x) * n.x + (p.y - M.y) * n.y);
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  });
  return out;
}

// Gradien yang dimulai tepat di garis lipatan dan bergerak searah n (offset dalam px)
function foldGradient(M, n, w, h, stops) {
  const ang = Math.atan2(n.x, -n.y);
  const len = Math.abs(w * Math.sin(ang)) + Math.abs(h * Math.cos(ang));
  const start = { x: w / 2 - (n.x * len) / 2, y: h / 2 - (n.y * len) / 2 };
  const s = (M.x - start.x) * n.x + (M.y - start.y) * n.y;
  return `linear-gradient(${ang.toFixed(4)}rad, ${stops.map(([o, c]) => `${c} ${(s + o).toFixed(1)}px`).join(", ")})`;
}

// Kertas tidak bisa sobek: sudut yang ditarik tidak boleh lebih jauh dari tepi jilid daripada aslinya
function constrain(P, C, h) {
  for (const S of [{ x: 0, y: h - C.y }, { x: 0, y: C.y }]) {
    const r = Math.hypot(C.x - S.x, C.y - S.y);
    const d = Math.hypot(P.x - S.x, P.y - S.y);
    if (d > r) P = { x: S.x + ((P.x - S.x) * r) / d, y: S.y + ((P.y - S.y) * r) / d };
  }
  return P;
}

function draw(page) {
  const [shadow, front, back] = [page.querySelector(".page-shadow"), page.querySelector(".page-front"), page.querySelector(".page-back")];
  const w = book.clientWidth, h = book.clientHeight, prog = page.prog;

  if (prog <= 0) {
    front.style.clipPath = "";
    back.style.clipPath = shadow.style.clipPath = NONE;
    return;
  }

  // C = sudut kanan bawah kertas, P = posisinya sekarang (melengkung naik di tengah lipatan)
  const C = { x: w, y: h };
  const P = constrain({ x: w - 2 * w * prog, y: h - Math.sin(prog * Math.PI) * LIFT * h }, C, h);
  const len = Math.hypot(C.x - P.x, C.y - P.y) || 1;
  const n = { x: (C.x - P.x) / len, y: (C.y - P.y) / len }; // normal lipatan, menunjuk ke arah sudut
  const M = { x: (C.x + P.x) / 2, y: (C.y + P.y) / 2 };     // titik di garis lipatan

  const rect = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const folded = clip(rect, M, n, 1);
  const depth = Math.max(1, ...folded.map((p) => dot2({ x: p.x - M.x, y: p.y - M.y }, n)));
  const curve = Math.sin(prog * Math.PI);

  // Bagian depan yang masih rata
  front.style.clipPath = toPolygon(clip(rect, M, n, -1));

  // Sisi belakang: area yang terlipat, dipantulkan terhadap garis lipatan, dengan kilau lengkung kertas
  const k = 2 * dot2(M, n);
  back.style.clipPath = toPolygon(folded);
  back.style.transform = `matrix(${1 - 2 * n.x * n.x}, ${-2 * n.x * n.y}, ${-2 * n.x * n.y}, ${1 - 2 * n.y * n.y}, ${k * n.x}, ${k * n.y})`;
  back.style.backgroundImage = foldGradient(M, n, w, h, [
    [0, "rgba(0,0,0,.35)"],
    [depth * 0.12, "rgba(0,0,0,.08)"],
    [depth * 0.35, "rgba(255,255,255,.12)"],
    [depth * 0.7, "rgba(255,255,255,0)"],
    [depth, "rgba(0,0,0,.15)"],
  ]);

  // Bayangan jatuh di halaman tujuan di bawahnya, paling tebal saat kertas tegak
  shadow.style.clipPath = toPolygon(folded);
  shadow.style.backgroundImage = foldGradient(M, n, w, h, [
    [0, `rgba(0,0,0,${(0.15 + 0.4 * curve).toFixed(2)})`],
    [20 + 70 * curve, "rgba(0,0,0,0)"],
  ]);
}

// ---------- Ganti halaman ----------

// Pelan di awal dan akhir, seperti lembar kertas yang diangkat lalu jatuh
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Halaman lama dikembalikan rata lalu disembunyikan di bawah
function finishFlip() {
  if (!flipping) return;
  cancelAnimationFrame(flipping.raf);
  const old = flipping.page;
  old.prog = 0;
  draw(old);
  old.classList.add("hidden");
  flipping = null;
  intro.dataset.section = current.dataset.section; // warna logo ikut setelah kertas selesai dilipat
}

function show(section) {
  const target = pages.find((p) => p.dataset.section === section);
  if (!target || target === current) return;
  finishFlip(); // klik cepat: selesaikan lipatan sebelumnya dulu

  const old = current;
  current = target;
  swapPanel(old.dataset.section, section);

  // Halaman tujuan langsung di bawah halaman lama, lalu halaman lama dilipat
  target.classList.remove("hidden");
  target.style.zIndex = 1;
  old.style.zIndex = 2;
  pages.forEach((p) => (p.inert = p !== current));

  flipping = { page: old };
  if (reduceMotion) return finishFlip();
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / FLIP_MS, 1);
    old.prog = easeInOut(t);
    draw(old);
    if (t < 1) flipping.raf = requestAnimationFrame(step);
    else finishFlip();
  };
  flipping.raf = requestAnimationFrame(step);
}

addEventListener("resize", () => flipping && draw(flipping.page));

// ---------- Zoom: bagian besar memenuhi layar, klik lagi (atau Esc) untuk kembali ----------

const slide = document.querySelector(".slide");
const zoomBtn = document.querySelector(".zoom-toggle");
const panelsEl = document.querySelector(".panels");

function setZoom(on) {
  slide.classList.toggle("zoomed", on);
  zoomBtn.setAttribute("aria-pressed", on);
  zoomBtn.setAttribute("aria-label", on ? "Kembali ke tampilan awal" : "Perbesar tampilan");
  panelsEl.inert = on;
}
zoomBtn.addEventListener("click", () => setZoom(!slide.classList.contains("zoomed")));
document.addEventListener("keydown", (e) => e.key === "Escape" && setZoom(false));

// ---------- Panel kanan: bertukar tempat dengan halaman besar ----------

function fillSlot(slot, section, animateIn) {
  const panel = document.getElementById(`panel-${section}`).content.firstElementChild.cloneNode(true);
  panel.dataset.section = section;
  slot.dataset.section = section;
  panel.querySelector(".panel-open").addEventListener("click", () => show(section));
  if (animateIn && !reduceMotion) {
    // Panel baru menyapu masuk di atas panel lama, lalu panel lama dibuang
    const old = [...slot.children];
    const cleanup = () => old.forEach((o) => o.remove());
    panel.classList.add("swap-in");
    panel.addEventListener("animationend", cleanup, { once: true });
    setTimeout(cleanup, 700); // cadangan kalau animationend tidak terpanggil (mis. tab di latar belakang)
  } else slot.replaceChildren();
  slot.append(panel);
}

// Bagian yang tadinya tampil besar pindah ke slot panel yang diklik
function swapPanel(fromSection, toSection) {
  const slot = slots.find((s) => s.dataset.section === toSection);
  if (slot) fillSlot(slot, fromSection, true);
}

slots.forEach((slot) => fillSlot(slot, slot.dataset.section, false));
