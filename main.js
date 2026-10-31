// 1nc0gn30.si — vanilla, no deps. braille packing after drawille (MIT), bayer ordered dither.
(() => {
'use strict';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) document.documentElement.classList.add('reduced');
const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v => (v + .5) / 16);
const BIT = [[0x01,0x08],[0x02,0x10],[0x04,0x20],[0x40,0x80]]; // [row][col]
const mouse = { x: .5, y: .5 };
addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; }, { passive: true });

// pack a dot buffer (w*2 x h*4) into braille text
function pack(buf, cols, rows) {
  let out = '';
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      let b = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++)
        if (buf[(r * 4 + dy) * cols * 2 + c * 2 + dx]) b |= BIT[dy][dx];
      line += b ? String.fromCharCode(0x2800 + b) : ' ';
    }
    out += line + '\n';
  }
  return out;
}
function cellSize(el) {
  const s = document.createElement('span'); s.textContent = '⣿'.repeat(20);
  el.appendChild(s); const r = s.getBoundingClientRect(); s.remove();
  return { w: r.width / 20 || 7, h: parseFloat(getComputedStyle(el).lineHeight) || 12 };
}

// ---- live 3d lattice ----
const lat = document.getElementById('lattice');
let L = null;
function setupLattice() {
  const cs = cellSize(lat), rect = lat.getBoundingClientRect();
  const cols = Math.ceil(rect.width / cs.w), rows = Math.ceil(rect.height / cs.h);
  L = { cols, rows, W: cols * 2, H: rows * 4, buf: new Uint8Array(cols * 2 * rows * 4) };
}
const P = [], E = [], N = 3;
for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) P.push([i / N * 2 - 1, j / N * 2 - 1, k / N * 2 - 1]);
const id = (i, j, k) => (i * (N + 1) + j) * (N + 1) + k;
for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) {
  if (i < N) E.push([id(i, j, k), id(i + 1, j, k)]);
  if (j < N) E.push([id(i, j, k), id(i, j + 1, k)]);
  if (k < N) E.push([id(i, j, k), id(i, j, k + 1)]);
}
function drawLattice(t) {
  if (!L) return;
  const { W, H, buf } = L; buf.fill(0);
  const ay = t * .00025 + (mouse.x - .5) * 1.2, ax = .5 + (mouse.y - .5) * .8 + Math.sin(t * .0002) * .2;
  const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
  const sc = Math.min(W, H * 1.0) * .42, ox = W * .68, oy = H * .5;
  const pr = P.map(([x, y, z]) => {
    let X = x * cy - z * sy, Z = x * sy + z * cy, Y = y * cx - Z * sx; Z = y * sx + Z * cx;
    const f = 2.6 / (3.2 + Z);
    return [ox + X * sc * f, oy + Y * sc * f * .5 * 2, (1.6 - Z) / 3.2]; // depth -> intensity
  });
  for (const [a, b] of E) {
    const A = pr[a], B = pr[b], n = Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]));
    for (let s = 0; s <= n; s++) {
      const u = s / (n || 1), x = A[0] + (B[0] - A[0]) * u | 0, y = A[1] + (B[1] - A[1]) * u | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const I = A[2] + (B[2] - A[2]) * u;
      if (I > BAYER[(y & 3) * 4 + (x & 3)] * .9) buf[y * W + x] = 1;
    }
  }
  lat.textContent = pack(buf, L.cols, L.rows);
}

// ---- sprite dissolving into braille trails ----
const ghost = document.getElementById('ghost'), img = document.getElementById('spriteImg');
let G = null;
function setupGhost() {
  if (!img.complete || !img.naturalWidth) return;
  const fig = img.parentElement.getBoundingClientRect(), cs = cellSize(ghost);
  const cols = Math.floor(fig.width / cs.w), rows = Math.floor(fig.height / cs.h);
  const w = cols * 2, h = rows * 4, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, dots = [];
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) {
    const i = (y * w + X) * 4, lum = (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) / 255;
    if (Math.min(1, lum * 3.2) > BAYER[(y & 3) * 4 + (X & 3)] + .12) dots.push([X, y, Math.random()]);
  }
  const TRAIL = 46; // extra columns to the right for trails
  G = { cols: cols + TRAIL, rows, W: (cols + TRAIL) * 2, H: h, w, dots, buf: new Uint8Array((cols + TRAIL) * 2 * h) };
}
function drawGhost(t) {
  if (!G) return;
  const { W, H, w, buf, dots } = G; buf.fill(0);
  const fig = img.parentElement.getBoundingClientRect();
  const hover = Math.max(0, Math.min(1, (mouse.x * innerWidth - fig.left) / fig.width));
  const scroll = Math.min(1, scrollY / (innerHeight * .8));
  // front: column after which dots dissolve. breathes slowly, pulled left by mouse + scroll
  const front = w * (1 - .55 * Math.max(scroll, 1 - hover * .9) * .9 - .12 * (1 + Math.sin(t * .0011)) / 2);
  for (const [x, y, r] of dots) {
    let X = x, Y = y;
    if (x > front) {
      const k = (x - front) / w;
      if (r < k * .55) continue; // thin out
      X = x + k * (40 + r * 90) + Math.sin(t * .003 + y * .2 + r * 6) * 2;
      Y = y + Math.sin(t * .002 + r * 9) * k * 6;
    }
    X |= 0; Y |= 0;
    if (X >= 0 && X < W && Y >= 0 && Y < H) buf[Y * W + X] = 1;
  }
  ghost.textContent = pack(buf, G.cols, G.rows);
}

// ---- loop: ~30fps, paused when hidden ----
let visible = true, last = 0; const PERF = location.search.includes('perf') ? { n: 0, ms: 0 } : null;
document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
function frame(t) {
  if (visible && t - last > 33) { last = t; const t0 = performance.now(); drawLattice(t); if (scrollY < innerHeight * 1.2) drawGhost(t); if (PERF) { PERF.n++; PERF.ms += performance.now() - t0; if (PERF.n === 60) console.log('perf: avg draw ms', (PERF.ms / 60).toFixed(2)); } }
  requestAnimationFrame(frame);
}
function init() {
  setupLattice(); setupGhost();
  if (reduced) { drawLattice(0); return; }
  if (!G) img.style.opacity = 1;
  requestAnimationFrame(frame);
}
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { setupLattice(); setupGhost(); if (reduced) drawLattice(0); }, 150); });
if (img.complete) init(); else { img.addEventListener('load', init); img.addEventListener('error', () => { img.style.opacity = 1; setupLattice(); reduced ? drawLattice(0) : requestAnimationFrame(frame); }); }

// ---- terminal easter egg ----
const dlg = document.getElementById('term'), out = document.getElementById('termOut'), inp = document.getElementById('termIn');
const say = s => { out.textContent += s + '\n'; out.scrollTop = out.scrollHeight; };
const CMD = {
  help: () => 'cmds: whoami ls zoth zothos hermes nullai links tip clear exit',
  whoami: () => '1nc0gn30. hooded builder @ nullai.',
  ls: () => 'zoth-studio/  zothos/  hermes-zoth/  nullai/',
  zoth: () => 'zoth studio: 71 tools. 54 in-browser, 17 cli. → zoth.nullai.tech',
  zothos: () => 'zothos: 43 workstations, 23 loopback daemons. → zothos.nullai.tech',
  hermes: () => 'hermes-zoth: community plugin for hermes agent. not affiliated.',
  nullai: () => 'nullai.tech. everything free.',
  links: () => 'x.com/1nc0gn30 · github.com/1nc0gn30 · github.com/NullAITech',
  tip: () => 'tips optional. use the tools, that\'s the tip.',
  sudo: () => 'nice try.',
  clear: () => { out.textContent = ''; return null; },
  exit: () => { dlg.close(); return null; },
};
function openTerm() { if (dlg.open) return; out.textContent = '1nc0gn30 shell · type help\n'; dlg.showModal(); inp.focus(); }
document.getElementById('termBtn').addEventListener('click', openTerm);
addEventListener('keydown', e => { if (e.key === '`' && document.activeElement !== inp) { e.preventDefault(); openTerm(); } });
document.getElementById('termForm').addEventListener('submit', e => {
  e.preventDefault(); const v = inp.value.trim().toLowerCase(); inp.value = ''; if (!v) return;
  say('$ ' + v); const f = CMD[v.split(/\s+/)[0]]; const r = f ? f() : 'command not found: ' + v + ' (try help)'; if (r) say(r);
});
})();
