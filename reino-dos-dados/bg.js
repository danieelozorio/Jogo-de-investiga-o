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

  let seed = 98765;
  const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const g = x.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, '#2a3a8c'); g.addColorStop(0.55, '#1c2766'); g.addColorStop(1, '#0d1238');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // trama do tecido
  for (let k = 0; k < (W * H) / 260; k++) {
    x.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,20,.08)';
    x.fillRect(R() * W, R() * H, 2, 2);
  }
  const star = (cx, cy, r, rot) => {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.45 : r;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      if (k) x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath(); x.fill(); x.restore();
  };
  const moon = (cx, cy, r, rot) => {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.beginPath(); x.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); x.ellipse(0, 0, r * 0.45, r, 0, Math.PI / 2, -Math.PI / 2, true); x.closePath(); x.fill();
    x.restore();
  };
  // estampa da toalha: estrelas e luas douradas espalhadas em grade irregular
  const step = Math.max(90, Math.min(W, H) / 5.5);
  for (let yy = step / 2; yy < H + step; yy += step) {
    for (let xx = ((yy / step) % 2) * step / 2; xx < W + step; xx += step) {
      const cx = xx + (R() - 0.5) * step * 0.5;
      const cy = yy + (R() - 0.5) * step * 0.5;
      const kind = R();
      x.fillStyle = `rgba(240,205,120,${0.35 + R() * 0.3})`;
      if (kind < 0.62) star(cx, cy, 8 + R() * 10, R() * 3);
      else if (kind < 0.85) moon(cx, cy, 10 + R() * 8, R() * 6);
      else { x.beginPath(); x.arc(cx, cy, 2 + R() * 2, 0, Math.PI * 2); x.fill(); }
    }
  }
  // brilho de luz em cima e cantos mais escuros
  const v = x.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.2, W / 2, H * 0.45, Math.hypot(W, H) * 0.65);
  v.addColorStop(0, 'rgba(120,140,255,.10)'); v.addColorStop(1, 'rgba(0,0,10,.6)');
  x.fillStyle = v;
  x.fillRect(0, 0, W, H);
}
