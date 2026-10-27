// Buku di bagian intro: geser (swipe/drag), tombol, titik, atau panah keyboard untuk membalik halaman
const book = document.querySelector(".book");
const pages = [...book.querySelectorAll(".page")];
const dots = document.querySelector(".book-dots");
const prevBtn = document.querySelector(".book-prev");
const nextBtn = document.querySelector(".book-next");
const FLIP_MS = 1100; // durasi satu balikan penuh
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let current = 0;

pages.forEach((_, i) => {
  const dot = document.createElement("button");
  dot.setAttribute("aria-label", `Halaman ${i + 1}`);
  dot.addEventListener("click", () => goTo(i));
  dots.appendChild(dot);
});

// --lift: 0 saat halaman rata, 1 saat tegak di tengah balikan (untuk cahaya & bayangan)
function setAngle(page, angle) {
  page.angle = angle;
  page.style.setProperty("--angle", angle.toFixed(2));
  page.style.setProperty("--lift", Math.sin((-angle * Math.PI) / 180).toFixed(3));
}

// Pelan di awal dan akhir, seperti lembar kertas yang diangkat lalu jatuh
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function animate(page, to) {
  cancelAnimationFrame(page.raf);
  const from = page.angle ?? 0;
  const duration = reduceMotion ? 0 : FLIP_MS * Math.abs(to - from) / 180;
  page.classList.remove("turned");
  const start = performance.now();
  const step = (now) => {
    const t = duration ? Math.min((now - start) / duration, 1) : 1;
    setAngle(page, from + (to - from) * ease(t));
    if (t < 1) page.raf = requestAnimationFrame(step);
    else {
      page.classList.toggle("turned", to === -180); // sembunyikan halaman yang sudah terbalik
      page.style.zIndex = restingZ(page);
    }
  };
  page.raf = requestAnimationFrame(step);
}

// Halaman yang sudah dibalik di bawah; sisanya makin depan makin atas
function restingZ(page) {
  const i = pages.indexOf(page);
  return i < current ? i : pages.length * 2 - i;
}

function render() {
  pages.forEach((page, i) => {
    const target = i < current ? -180 : 0;
    if (page.angle !== target) animate(page, target);
    // Halaman yang sedang bergerak paling atas, lalu halaman aktif, lalu sisanya
    page.style.zIndex = page.angle !== target ? pages.length * 3 : restingZ(page);
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

// Drag: halaman mengikuti jari, lalu selesai membalik atau kembali saat dilepas
let startX = null, dx = 0, dir = 0, startTime = 0, dragging = false, moving = null;

book.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  startX = e.clientX; dx = 0; startTime = performance.now(); dragging = false;
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
    moving.classList.remove("turned");
    moving.style.zIndex = pages.length * 3; // halaman yang sedang dibalik selalu di atas
  }
  const progress = Math.max(0, Math.min(dx * dir / book.clientWidth, 1)) * 180;
  setAngle(moving, dir < 0 ? -progress : -180 + progress);
});

function endDrag() {
  if (dragging) {
    book.classList.remove("dragging");
    const dist = dx * dir;
    const fast = dist / (performance.now() - startTime) > 0.5;
    if (dist > book.clientWidth * 0.25 || (dist > 40 && fast)) current -= dir;
    render(); // lanjutkan dari posisi jari sampai selesai (atau kembali)
  }
  startX = null; dragging = false; moving = null;
}
book.addEventListener("pointerup", endDrag);
book.addEventListener("pointercancel", endDrag);

// Jangan ikuti link kalau pengguna baru saja menggeser
book.addEventListener("click", (e) => { if (Math.abs(dx) >= 8) e.preventDefault(); }, true);

pages.forEach((page) => setAngle(page, 0));
render();
