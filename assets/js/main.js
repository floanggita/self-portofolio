// Buku di bagian intro: geser (swipe/drag), tombol, titik, atau panah keyboard untuk membalik halaman.
// Efek kertas: halaman dipotong di garis lipatan, bagian yang terlipat dipantulkan sebagai sisi belakang.
const book = document.querySelector(".book");
const pages = [...book.querySelectorAll(".page")];
const dots = document.querySelector(".book-dots");
const prevBtn = document.querySelector(".book-prev");
const nextBtn = document.querySelector(".book-next");
const FLIP_MS = 1200; // durasi satu balikan penuh
const LIFT = 0.18;    // seberapa tinggi sudut kertas terangkat saat dibalik (relatif tinggi halaman)
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let current = 0;

pages.forEach((page, i) => {
  const shadow = document.createElement("div");
  shadow.className = "page-shadow";
  page.prepend(shadow);
  page.prog = 0;   // 0 = rata, 1 = sudah terbalik
  page.dy = 0;     // geseran vertikal jari
  page.corner = 1; // 1 = sudut bawah, 0 = sudut atas

  const dot = document.createElement("button");
  dot.setAttribute("aria-label", `Halaman ${i + 1}`);
  dot.addEventListener("click", () => goTo(i));
  dots.appendChild(dot);
});

// ---------- Geometri lipatan ----------

const dot2 = (a, b) => a.x * b.x + a.y * b.y;
const hidden = "polygon(0 0, 0 0, 0 0)";
const toPolygon = (poly) =>
  poly.length > 2 ? `polygon(${poly.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(", ")})` : hidden;

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
  page.classList.toggle("turned", prog >= 1);

  if (prog <= 0) {
    front.style.clipPath = "";
    back.style.clipPath = shadow.style.clipPath = hidden;
    return;
  }

  // C = sudut kertas yang ditarik, P = posisinya sekarang (melengkung naik di tengah balikan)
  const C = { x: w, y: page.corner * h };
  const lift = Math.sin(prog * Math.PI) * LIFT * h * (page.corner ? -1 : 1);
  const P = constrain({ x: w - 2 * w * prog, y: C.y + lift + page.dy }, C, h);
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

  // Bayangan jatuh di halaman di bawahnya, paling tebal saat kertas tegak
  shadow.style.clipPath = toPolygon(folded);
  shadow.style.backgroundImage = foldGradient(M, n, w, h, [
    [0, `rgba(0,0,0,${(0.15 + 0.4 * curve).toFixed(2)})`],
    [20 + 70 * curve, "rgba(0,0,0,0)"],
  ]);
}

// ---------- Animasi ----------

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function animate(page, to, { delay = 0, fromDrag = false } = {}) {
  cancelAnimationFrame(page.raf);
  const from = page.prog, fromDy = page.dy;
  const duration = reduceMotion ? 0 : Math.max(250, FLIP_MS * Math.abs(to - from));
  const ease = fromDrag ? easeOut : easeInOut; // setelah dilepas jari: lanjut dengan momentum
  if (!fromDrag) page.corner = 1;
  let start = null;
  const step = (now) => {
    start ??= now + delay;
    const t = duration ? Math.min(Math.max(now - start, 0) / duration, 1) : 1;
    page.prog = from + (to - from) * ease(t);
    page.dy = fromDy * (1 - ease(t));
    draw(page);
    if (t < 1) page.raf = requestAnimationFrame(step);
    else page.style.zIndex = restingZ(page);
  };
  page.raf = requestAnimationFrame(step);
}

// Halaman yang sudah dibalik di bawah; sisanya makin depan makin atas
function restingZ(page) {
  const i = pages.indexOf(page);
  return i < current ? i : pages.length * 2 - i;
}

function render(opts = {}) {
  const forward = pages.filter((p, i) => i < current && p.prog < 1);
  const back = pages.filter((p, i) => i >= current && p.prog > 0);
  pages.forEach((page, i) => {
    const target = i < current ? 1 : 0;
    if (page.prog !== target) {
      // Beberapa halaman sekaligus (klik titik): dibalik bergantian seperti membuka buku cepat
      const order = target ? forward.indexOf(page) : back.length - 1 - back.indexOf(page);
      page.style.zIndex = pages.length * 4 - i; // halaman bergerak di atas; indeks kecil paling atas
      animate(page, target, { ...opts, delay: opts.fromDrag ? 0 : order * 140 });
    } else page.style.zIndex = restingZ(page);
    page.inert = i !== current;
  });
  [...dots.children].forEach((d, i) => d.setAttribute("aria-current", i === current));
  prevBtn.disabled = current === 0;
  nextBtn.disabled = current === pages.length - 1;
}

function goTo(i) {
  current = Math.max(0, Math.min(pages.length - 1, i));
  render();
}

prevBtn.addEventListener("click", () => goTo(current - 1));
nextBtn.addEventListener("click", () => goTo(current + 1));
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") goTo(current + 1);
  if (e.key === "ArrowLeft") goTo(current - 1);
});
addEventListener("resize", () => pages.forEach(draw));

// ---------- Drag: sudut kertas mengikuti jari ----------

let startX = null, startY = 0, dx = 0, dir = 0, startTime = 0, dragging = false, moving = null;

book.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  startX = e.clientX; startY = e.clientY; dx = 0; startTime = performance.now(); dragging = false;
});

book.addEventListener("pointermove", (e) => {
  if (startX === null) return;
  dx = e.clientX - startX;
  if (!dragging) {
    if (Math.abs(dx) < 8) return;
    dir = Math.sign(dx); // -1 = ke halaman berikutnya, 1 = ke halaman sebelumnya
    moving = dir < 0 ? pages[current + 1] && pages[current] : pages[current - 1];
    if (!moving) return;
    dragging = true;
    book.classList.add("dragging");
    book.setPointerCapture(e.pointerId);
    cancelAnimationFrame(moving.raf);
    const r = book.getBoundingClientRect();
    moving.corner = startY - r.top < r.height / 2 ? 0 : 1; // pegang dekat atas = sudut atas
    moving.style.zIndex = pages.length * 3; // halaman yang sedang dibalik selalu di atas
  }
  const progress = Math.max(0, Math.min((dx * dir) / book.clientWidth, 1));
  moving.prog = dir < 0 ? progress : 1 - progress;
  moving.dy = e.clientY - startY;
  draw(moving);
});

function endDrag() {
  if (dragging) {
    book.classList.remove("dragging");
    const dist = dx * dir;
    const fast = dist / (performance.now() - startTime) > 0.5;
    if (dist > book.clientWidth * 0.25 || (dist > 40 && fast)) current -= dir;
    render({ fromDrag: true }); // lanjutkan dari posisi jari sampai selesai (atau kembali)
  }
  startX = null; dragging = false; moving = null;
}
book.addEventListener("pointerup", endDrag);
book.addEventListener("pointercancel", endDrag);

// Jangan ikuti link kalau pengguna baru saja menggeser
book.addEventListener("click", (e) => { if (Math.abs(dx) >= 8) e.preventDefault(); }, true);

pages.forEach(draw);
render();
