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

  // mesa de nogueira: tábuas na horizontal com veios
  x.fillStyle = '#3a2214';
  x.fillRect(0, 0, W, H);
  const plank = Math.max(90, Math.round(Math.min(W, H) / 6));
  for (let y0 = -plank / 2, row = 0; y0 < H; y0 += plank, row++) {
    const shade = 0.85 + R() * 0.3;
    const pg = x.createLinearGradient(0, y0, 0, y0 + plank);
    pg.addColorStop(0, `rgba(${Math.round(92 * shade)},${Math.round(56 * shade)},${Math.round(32 * shade)},1)`);
    pg.addColorStop(1, `rgba(${Math.round(70 * shade)},${Math.round(42 * shade)},${Math.round(24 * shade)},1)`);
    x.fillStyle = pg;
    x.fillRect(0, y0, W, plank);
    // veios
    for (let k = 0; k < 14; k++) {
      const yy = y0 + R() * plank;
      const amp = 2 + R() * 6;
      const fr = 0.004 + R() * 0.01;
      const ph = R() * 10;
      x.beginPath();
      for (let xx = 0; xx <= W; xx += 8) {
        const py = yy + Math.sin(xx * fr + ph) * amp + Math.sin(xx * fr * 3.1 + ph) * amp * 0.3;
        if (xx) x.lineTo(xx, py); else x.moveTo(xx, py);
      }
      x.strokeStyle = R() < 0.5 ? 'rgba(30,16,8,.28)' : 'rgba(150,100,60,.14)';
      x.lineWidth = 1 + R() * 2;
      x.stroke();
    }
    // nó da madeira de vez em quando
    if (R() < 0.5) {
      const kx = R() * W;
      const ky = y0 + plank * (0.3 + R() * 0.4);
      for (let r = 14; r > 2; r -= 3) {
        x.strokeStyle = 'rgba(30,16,8,.25)';
        x.lineWidth = 1.5;
        x.beginPath(); x.ellipse(kx, ky, r * 2.4, r, 0, 0, Math.PI * 2); x.stroke();
      }
    }
    // junta entre tábuas
    x.fillStyle = 'rgba(15,8,4,.75)';
    x.fillRect(0, y0 + plank - 2, W, 2);
    x.fillStyle = 'rgba(180,130,80,.12)';
    x.fillRect(0, y0 + plank, W, 1);
  }
  // luz de luminária no centro e cantos escuros
  const lamp = x.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.6);
  lamp.addColorStop(0, 'rgba(255,214,150,.22)');
  lamp.addColorStop(0.45, 'rgba(255,190,120,.06)');
  lamp.addColorStop(1, 'rgba(0,0,0,.72)');
  x.fillStyle = lamp;
  x.fillRect(0, 0, W, H);
}
