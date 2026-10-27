// Bagian besar di kiri berisi slide. Slide di dalam satu bagian (mis. Intro) bisa digeser, lewat tombol,
// titik, atau panah keyboard, tapi tidak nyambung ke bagian lain: bagian lain hanya terbuka saat panelnya diklik.
// Panel yang diklik bertukar tempat dengan bagian yang sedang tampil besar.
// Efek kertas: halaman dipotong di garis lipatan, bagian yang terlipat dipantulkan sebagai sisi belakang.
const book = document.querySelector(".book");
const pages = [...book.querySelectorAll(".page")];
const intro = document.querySelector(".intro");
const slots = [...document.querySelectorAll(".slot")];
const nav = document.querySelector(".book-nav");
const dots = document.querySelector(".book-dots");
const prevBtn = document.querySelector(".book-prev");
const nextBtn = document.querySelector(".book-next");
const FLIP_MS = 1200; // durasi satu lipatan penuh
const LIFT = 0.18;    // seberapa tinggi sudut kertas terangkat saat dilipat (relatif tinggi halaman)
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let current = pages[0]; // slide yang sedang tampil
let flip = null;        // lipatan yang sedang berjalan: { moving, under, next, raf }

pages.forEach((page) => {
  const shadow = document.createElement("div");
  shadow.className = "page-shadow";
  page.prepend(shadow);
  page.prog = 0;   // 0 = rata, 1 = terlipat habis
  page.dy = 0;     // geseran vertikal jari
  page.corner = 1; // 1 = sudut bawah, 0 = sudut atas
  page.classList.toggle("hidden", page !== current);
});

const sectionPages = (section) => pages.filter((p) => p.dataset.section === section);
const shown = () => (flip ? flip.next : current); // slide yang sedang/akan tampil

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

  // C = sudut kertas yang ditarik, P = posisinya sekarang (melengkung naik di tengah lipatan)
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

// ---------- Lipatan ----------

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // seperti kertas diangkat lalu jatuh
const easeOut = (t) => 1 - Math.pow(1 - t, 3); // setelah dilepas jari: lanjut dengan momentum

// Hanya dua halaman yang terlihat selama lipatan: yang dilipat (atas) dan yang terbuka di bawahnya
function layer(top, bottom) {
  pages.forEach((p) => p.classList.toggle("hidden", p !== top && p !== bottom));
  top.style.zIndex = 2;
  bottom.style.zIndex = 1;
}

// Lipat `moving` sampai prog = `to`; setelah selesai yang tampil adalah `next`
function startFlip(moving, under, to, next, fromDrag = false) {
  const from = moving.prog, fromDy = moving.dy;
  const duration = reduceMotion ? 0 : Math.max(250, FLIP_MS * Math.abs(to - from));
  const ease = fromDrag ? easeOut : easeInOut;
  if (!fromDrag) moving.corner = 1;
  flip = { moving, under, next };
  const begin = performance.now();
  const step = (now) => {
    const t = duration ? Math.min((now - begin) / duration, 1) : 1;
    moving.prog = from + (to - from) * ease(t);
    moving.dy = fromDy * (1 - ease(t));
    draw(moving);
    if (t < 1) flip.raf = requestAnimationFrame(step);
    else finishFlip();
  };
  flip.raf = requestAnimationFrame(step);
  updateUI();
}

// Selesaikan lipatan (juga dipakai saat diklik cepat): halaman kembali rata, hanya `next` yang terlihat
function finishFlip() {
  if (!flip) return;
  cancelAnimationFrame(flip.raf);
  const { moving, under, next } = flip;
  flip = null;
  moving.prog = moving.dy = 0;
  draw(moving);
  [moving, under].forEach((p) => p.classList.toggle("hidden", p !== next));
  next.style.zIndex = 1;
  current = next;
  updateUI();
}

// Tampilkan slide `target`: maju = slide sekarang dilipat; mundur = slide tujuan turun menutupi
function go(target) {
  finishFlip();
  if (!target || target === current) return;
  const list = sectionPages(current.dataset.section);
  if (list.indexOf(target) !== -1 && list.indexOf(target) < list.indexOf(current)) {
    layer(target, current);
    target.prog = 1;
    draw(target);
    startFlip(target, current, 0, target);
  } else {
    if (target.dataset.section !== current.dataset.section) swapPanel(current.dataset.section, target.dataset.section);
    layer(current, target);
    startFlip(current, target, 1, target);
  }
}

const stepBy = (delta) => {
  if (zoomed()) return; // saat zoom, lembaran di-scroll biasa
  const list = sectionPages(shown().dataset.section);
  go(list[list.indexOf(shown()) + delta]);
};

// ---------- Navigasi slide di dalam bagian ----------

let navSection = null;

function updateUI() {
  const page = shown();
  const list = sectionPages(page.dataset.section);
  if (navSection !== page.dataset.section) {
    navSection = page.dataset.section;
    dots.replaceChildren(
      ...list.map((p, i) => {
        const dot = document.createElement("button");
        dot.setAttribute("aria-label", `Slide ${i + 1}`);
        dot.addEventListener("click", () => go(p));
        return dot;
      })
    );
  }
  const i = list.indexOf(page);
  nav.hidden = list.length < 2;
  book.classList.toggle("swipeable", list.length > 1);
  [...dots.children].forEach((d, j) => d.setAttribute("aria-current", j === i));
  prevBtn.disabled = i === 0;
  nextBtn.disabled = i === list.length - 1;
  pages.forEach((p) => (p.inert = p !== page));
  if (!flip) intro.dataset.section = current.dataset.section; // warna logo & navigasi ikut setelah lipatan selesai
}

prevBtn.addEventListener("click", () => stepBy(-1));
nextBtn.addEventListener("click", () => stepBy(1));
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") stepBy(1);
  if (e.key === "ArrowLeft") stepBy(-1);
});
addEventListener("resize", () => flip && draw(flip.moving));

// ---------- Geser: sudut kertas mengikuti jari ----------

let drag = null; // { x, y, dx, t0, dir, moving, under, target }
let lastDx = 0;  // jarak geser terakhir, untuk membedakan geser dari klik

book.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !book.classList.contains("swipeable") || zoomed()) return;
  drag = { x: e.clientX, y: e.clientY, dx: 0, t0: performance.now(), dir: 0 };
});

book.addEventListener("pointermove", (e) => {
  if (!drag) return;
  drag.dx = e.clientX - drag.x;
  if (!drag.dir) {
    if (Math.abs(drag.dx) < 8) return;
    finishFlip();
    const list = sectionPages(current.dataset.section);
    const dir = Math.sign(drag.dx); // -1 = ke slide berikutnya, 1 = ke slide sebelumnya
    const target = list[list.indexOf(current) - dir];
    if (!target) { drag = null; return; } // sudah di ujung bagian: tidak nyambung ke bagian lain
    Object.assign(drag, dir < 0
      ? { dir, moving: current, under: target, target }
      : { dir, moving: target, under: current, target });
    layer(drag.moving, drag.under);
    const r = book.getBoundingClientRect();
    drag.moving.corner = drag.y - r.top < r.height / 2 ? 0 : 1; // pegang dekat atas = sudut atas
    book.classList.add("dragging");
    book.setPointerCapture(e.pointerId);
  }
  const progress = Math.max(0, Math.min((drag.dx * drag.dir) / book.clientWidth, 1));
  drag.moving.prog = drag.dir < 0 ? progress : 1 - progress;
  drag.moving.dy = e.clientY - drag.y;
  draw(drag.moving);
});

function endDrag() {
  if (drag?.dir) {
    book.classList.remove("dragging");
    const dist = drag.dx * drag.dir;
    const commit = dist > book.clientWidth * 0.25 || (dist > 40 && dist / (performance.now() - drag.t0) > 0.5);
    const { dir, moving, under, target } = drag;
    // Lanjutkan dari posisi jari sampai selesai, atau kembali kalau geserannya kurang
    if (dir < 0) startFlip(moving, under, commit ? 1 : 0, commit ? target : current, true);
    else startFlip(moving, under, commit ? 0 : 1, commit ? target : current, true);
  }
  lastDx = drag?.dx ?? 0;
  drag = null;
}
book.addEventListener("pointerup", endDrag);
book.addEventListener("pointercancel", endDrag);
// Jangan ikuti link kalau pengguna baru saja menggeser
book.addEventListener("click", (e) => { if (Math.abs(lastDx) >= 8) e.preventDefault(); }, true);

// ---------- Panel kanan: bertukar tempat dengan bagian yang tampil besar ----------

function fillSlot(slot, section, animateIn) {
  const panel = document.getElementById(`panel-${section}`).content.firstElementChild.cloneNode(true);
  panel.dataset.section = section;
  slot.dataset.section = section;
  panel.querySelector(".panel-open").addEventListener("click", () => go(sectionPages(section)[0]));
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

// ---------- Zoom: semua slide jadi lembaran yang di-scroll ke bawah; klik lagi (atau Esc) untuk kembali ----------

const slide = document.querySelector(".slide");
const zoomBtn = document.querySelector(".zoom-toggle");
const panelsEl = document.querySelector(".panels");
const zoomed = () => slide.classList.contains("zoomed");
let zoomBusy = false;

// Animasi dengan batas waktu cadangan, supaya alur zoom tidak macet kalau animasi tidak berjalan
function play(keyframes, ms) {
  if (reduceMotion) return Promise.resolve();
  const anim = book.animate(keyframes, { duration: ms, easing: "cubic-bezier(.2, .7, .2, 1)" });
  return Promise.race([anim.finished, new Promise((r) => setTimeout(r, ms + 100))]).then(() => anim.cancel());
}

function enterSheets() {
  finishFlip();
  drag = null;
  slide.classList.add("zoomed");
  pages.forEach((p) => { p.classList.remove("hidden"); p.inert = false; });
  book.scrollTop = current.offsetTop; // mulai dari slide yang sedang dibuka
  startTyping();
}

function leaveSheets() {
  stopTyping();
  slide.classList.remove("zoomed");
  pages.forEach((p) => p.classList.toggle("hidden", p !== current));
  book.scrollTop = 0;
  updateUI();
}

async function setZoom(on) {
  if (on === zoomed() || zoomBusy) return;
  zoomBusy = true;
  zoomBtn.setAttribute("aria-pressed", on);
  zoomBtn.setAttribute("aria-label", on ? "Kembali ke tampilan awal" : "Perbesar tampilan");
  panelsEl.inert = on;
  try {
    if (on) {
      // Zoom in: lembaran membesar dari kecil ke penuh
      enterSheets();
      await play([{ transform: "scale(.6)", opacity: 0, borderRadius: "28px" }, { transform: "scale(1)", opacity: 1, borderRadius: "0" }], 650);
    } else {
      // Zoom out: lembaran mengecil & menghilang, lalu tampilan slide muncul kembali
      await play([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.6)", opacity: 0, borderRadius: "28px" }], 380);
      leaveSheets();
      await play([{ transform: "scale(1.12)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], 480);
    }
  } finally {
    zoomBusy = false; // jangan sampai tombol zoom macet
  }
}
zoomBtn.addEventListener("click", () => setZoom(!zoomed()));
document.addEventListener("keydown", (e) => e.key === "Escape" && setZoom(false));

// ---------- Efek mengetik: teks tiap lembar muncul huruf demi huruf saat lembar itu terlihat ----------

const TYPE_MS = 14;    // jeda per huruf untuk teks biasa
const TITLE_MS = 45;   // jeda per huruf untuk judul besar
const PAUSE_MS = 140;  // jeda antar paragraf
let typedNodes = [];   // { wrap, node } untuk dikembalikan saat keluar zoom

// Ganti tiap potongan teks dengan [sudah diketik][sisa tersembunyi]
function prepareTyping(page) {
  const walker = document.createTreeWalker(page.querySelector(".page-front"), NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes.map((node) => {
    const delay = node.parentElement.closest("h1") ? TITLE_MS : TYPE_MS; // baca sebelum node dilepas
    const wrap = document.createElement("span");
    const done = document.createElement("span");
    const rest = document.createElement("span");
    done.className = "tw-done";
    rest.className = "tw-rest";
    rest.textContent = node.textContent;
    wrap.append(done, rest);
    node.replaceWith(wrap);
    typedNodes.push({ wrap, node });
    return { done, rest, text: node.textContent, delay };
  });
}

function typePage(page) {
  let i = 0, c = 0;
  const tick = () => {
    const part = page.parts[i];
    if (!part || !zoomed()) return;
    part.done.classList.add("typing");
    c++;
    part.done.textContent = part.text.slice(0, c);
    part.rest.textContent = part.text.slice(c);
    if (c < part.text.length) return (page.typeTimer = setTimeout(tick, part.delay));
    part.done.classList.remove("typing");
    i++; c = 0;
    page.typeTimer = setTimeout(tick, PAUSE_MS);
  };
  tick();
}

// Mulai mengetik lembar yang minimal 35% terlihat (dicek setiap kali di-scroll)
function typeVisibleSheets() {
  if (!zoomed() || reduceMotion) return;
  const view = book.getBoundingClientRect();
  pages.forEach((p) => {
    const r = p.getBoundingClientRect();
    const visible = Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top);
    if (!p.typed && visible > Math.min(r.height, view.height) * 0.35) {
      p.typed = true;
      typePage(p);
    }
  });
}
book.addEventListener("scroll", typeVisibleSheets, { passive: true });

function startTyping() {
  if (reduceMotion) return;
  pages.forEach((p) => { p.parts = prepareTyping(p); p.typed = false; });
  typeVisibleSheets();
}

function stopTyping() {
  pages.forEach((p) => clearTimeout(p.typeTimer));
  typedNodes.forEach(({ wrap, node }) => wrap.replaceWith(node)); // kembalikan teks asli
  typedNodes = [];
}

updateUI();
