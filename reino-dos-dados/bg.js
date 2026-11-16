'use strict';
/* Reino dos Dados — fundo da tela de jogo: centro limpo, areia em dois cantos e grama nos outros dois. */

/* se existir img/fundo.webp (arte gerada no Gemini), ela é usada no lugar do desenho */
let BG_IMG = null;
function loadBackgroundImage(url, done) {
  const im = new Image();
  im.onload = () => { BG_IMG = im; done(); };
  im.onerror = () => {};
  im.src = url;
}

function drawBackground(cv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || window.innerWidth;
  const H = cv.clientHeight || window.innerHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (BG_IMG) { // cobre a tela toda, centralizada
    const k = Math.max(W / BG_IMG.width, H / BG_IMG.height);
    const w = BG_IMG.width * k;
    const h = BG_IMG.height * k;
    x.drawImage(BG_IMG, (W - w) / 2, (H - h) / 2, w, h);
    return;
  }

  let seed = 1234567;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // chão do centro: areia clarinha e lisa
  const g = x.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, '#fcf3dc');
  g.addColorStop(1, '#f2deb0');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  for (let k = 0; k < (W * H) / 700; k++) {
    x.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(170,120,50,.06)';
    x.fillRect(R() * W, R() * H, 2, 2);
  }

  const portrait = W < H;
  const rx = W * (portrait ? 0.66 : 0.42);
  const ry = H * (portrait ? 0.27 : 0.46);
  const corners = [
    [0, 0, 'sand', 0.0], [W, 0, 'grass', 1.3], [0, H, 'grass', 2.1], [W, H, 'sand', 3.7],
  ];

  // contorno ondulado da mancha de cada canto
  const blobPath = (cx, cy, k, ph) => {
    x.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const r = k * (1 + 0.07 * Math.sin(4 * a + ph) + 0.04 * Math.sin(9 * a + ph * 2) + 0.02 * Math.sin(17 * a + ph * 3));
      const px = cx + Math.cos(a) * rx * r;
      const py = cy + Math.sin(a) * ry * r;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
  };
  // ponto aleatório dentro da mancha (só a parte visível na tela)
  const inside = (cx, cy, maxR) => {
    const sx = cx === 0 ? 1 : -1;
    const sy = cy === 0 ? 1 : -1;
    const a = R() * Math.PI / 2;
    const r = Math.sqrt(R()) * maxR;
    return [cx + sx * Math.cos(a) * rx * r, cy + sy * Math.sin(a) * ry * r];
  };

  corners.forEach(([cx, cy, kind, ph]) => {
    if (kind === 'sand') {
      blobPath(cx, cy, 1.04, ph);
      x.fillStyle = '#e2a650';
      x.fill();
      blobPath(cx, cy, 1, ph);
      const sg = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      sg.addColorStop(0, '#eaa548');
      sg.addColorStop(1, '#f8d28a');
      x.fillStyle = sg;
      x.fill();
      x.save();
      blobPath(cx, cy, 1, ph);
      x.clip();
      // dunas: faixas curvas claras e escuras
      for (let k = 0.18; k < 1; k += 0.13) {
        blobPath(cx, cy, k, ph + k * 3);
        x.lineWidth = 10;
        x.strokeStyle = 'rgba(205,130,45,.28)';
        x.stroke();
        x.save();
        x.translate(-3, -4);
        blobPath(cx, cy, k, ph + k * 3);
        x.lineWidth = 6;
        x.strokeStyle = 'rgba(255,240,205,.6)';
        x.stroke();
        x.restore();
      }
      for (let k = 0; k < 26; k++) {
        const [px, py] = inside(cx, cy, 0.95);
        x.fillStyle = R() < 0.5 ? '#c99a6a' : '#e6d2b5';
        x.beginPath();
        x.ellipse(px, py, 3 + R() * 5, 2 + R() * 3, R() * 3, 0, Math.PI * 2);
        x.fill();
      }
      x.restore();
    } else {
      blobPath(cx, cy, 1.05, ph);
      x.fillStyle = '#4c9a32';
      x.fill();
      blobPath(cx, cy, 1, ph);
      const gg = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      gg.addColorStop(0, '#46ad3a');
      gg.addColorStop(1, '#8bd85a');
      x.fillStyle = gg;
      x.fill();
      x.save();
      blobPath(cx, cy, 1, ph);
      x.clip();
      // laguinho no cantinho
      const pr = Math.min(rx, ry) * 0.32;
      x.fillStyle = '#2bb6c9';
      x.beginPath();
      x.ellipse(cx, cy, pr * 1.3, pr, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#5fdcea';
      x.beginPath();
      x.ellipse(cx, cy, pr * 1.1, pr * 0.82, 0, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,.7)';
      x.lineWidth = 3;
      for (let k = 0; k < 4; k++) {
        const [px, py] = inside(cx, cy, 0.22);
        x.beginPath();
        x.arc(px, py, 6 + R() * 8, Math.PI * 1.1, Math.PI * 1.9);
        x.stroke();
      }
      // tufos de capim
      for (let k = 0; k < 140; k++) {
        const [px, py] = inside(cx, cy, 0.97);
        if (Math.hypot((px - cx) / (pr * 1.4), (py - cy) / (pr * 1.1)) < 1) continue;
        x.strokeStyle = R() < 0.5 ? 'rgba(40,110,30,.55)' : 'rgba(200,255,160,.55)';
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(px - 4, py); x.lineTo(px - 1, py - 8); x.lineTo(px + 1, py);
        x.moveTo(px + 1, py); x.lineTo(px + 5, py - 6);
        x.stroke();
      }
      // florzinhas
      const cols = ['#ffffff', '#ffb3d1', '#ffe066', '#c8a6ff'];
      for (let k = 0; k < 34; k++) {
        const [px, py] = inside(cx, cy, 0.9);
        if (Math.hypot((px - cx) / (pr * 1.4), (py - cy) / (pr * 1.1)) < 1) continue;
        x.fillStyle = cols[k % 4];
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          x.beginPath();
          x.arc(px + Math.cos(a) * 3.2, py + Math.sin(a) * 3.2, 2.6, 0, Math.PI * 2);
          x.fill();
        }
        x.fillStyle = '#f59e0b';
        x.beginPath();
        x.arc(px, py, 2, 0, Math.PI * 2);
        x.fill();
      }
      // pedrinhas
      for (let k = 0; k < 10; k++) {
        const [px, py] = inside(cx, cy, 0.95);
        x.fillStyle = '#b7b2a8';
        x.beginPath();
        x.ellipse(px, py, 4 + R() * 4, 3 + R() * 2, R() * 3, 0, Math.PI * 2);
        x.fill();
      }
      x.restore();
    }
    // brilho na borda
    blobPath(cx, cy, 1, ph);
    x.lineWidth = 3;
    x.strokeStyle = 'rgba(255,255,255,.35)';
    x.stroke();
  });
}
