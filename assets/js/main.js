// Buku di bagian intro: geser (swipe/drag), tombol, titik, atau panah keyboard untuk membalik halaman
const book = document.querySelector(".book");
const pages = [...book.querySelectorAll(".page")];
const dots = document.querySelector(".book-dots");
const prevBtn = document.querySelector(".book-prev");
const nextBtn = document.querySelector(".book-next");
let current = 0;

pages.forEach((_, i) => {
  const dot = document.createElement("button");
  dot.setAttribute("aria-label", `Halaman ${i + 1}`);
  dot.addEventListener("click", () => goTo(i));
  dots.appendChild(dot);
});

function render() {
  pages.forEach((page, i) => {
    const flipped = i < current;
    page.style.setProperty("--angle", flipped ? -180 : 0);
    // Halaman yang sudah dibalik di bawah, sisanya: yang aktif paling atas
    page.style.zIndex = flipped ? i : pages.length * 2 - i;
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
    moving.style.zIndex = pages.length * 3; // halaman yang sedang dibalik selalu di atas
  }
  const progress = Math.max(0, Math.min(dx * dir / book.clientWidth, 1)) * 180;
  moving.style.setProperty("--angle", dir < 0 ? -progress : -180 + progress);
});

function endDrag() {
  if (dragging) {
    book.classList.remove("dragging");
    const dist = dx * dir;
    const fast = dist / (performance.now() - startTime) > 0.5;
    if (dist > book.clientWidth * 0.25 || (dist > 40 && fast)) current -= dir;
    render();
  }
  startX = null; dragging = false; moving = null;
}
book.addEventListener("pointerup", endDrag);
book.addEventListener("pointercancel", endDrag);

// Jangan ikuti link kalau pengguna baru saja menggeser
book.addEventListener("click", (e) => { if (Math.abs(dx) >= 8) e.preventDefault(); }, true);

render();
