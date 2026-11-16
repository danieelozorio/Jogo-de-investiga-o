'use strict';
/* Reino dos Dados — tabuleiro 3D (Three.js r128), câmera fixa isométrica. */
/* global THREE */

const View = (() => {
  const T = THREE;
  let renderer, scene, camera, canvas, clock;
  let fast = () => false;
  let imgUrl = (n) => `img/${n}.webp`;
  let tileColor = () => '#f4e3c1';
  let onTile = () => {};
  const tiles = []; // { group, top, label, canvas, ctx, tex, slot, key, building, bkey }
  const tokens = []; // { group, ring, base: Vector3, hop }
  const anims = []; // funções (dt, t) => boolean (true = continua)
  const spinners = []; // objetos que giram/flutuam sempre
  let dice = [];
  let pickFilter = null;
  let current = -1;

  const TILE = 1;
  const GROUND_Y = 0.2; // topo das casas

  /* ---------- utilidades ---------- */
  const mat = (color, opts = {}) => new T.MeshLambertMaterial({ color, ...opts });
  const matStd = (color, opts = {}) => new T.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts });
  function mesh(geo, m, shadow = true) {
    const o = new T.Mesh(geo, m);
    o.castShadow = shadow;
    o.receiveShadow = true;
    return o;
  }
  const easeOutBack = (x) => { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  function animate(dur, fn) {
    return new Promise((res) => {
      if (fast()) { fn(1); res(); return; }
      let t = 0;
      anims.push((dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        fn(k);
        if (k >= 1) { res(); return false; }
        return true;
      });
    });
  }

  // casas compridas (para fora) em volta de uma praça 6x6, cantos em hexágono
  const DEPTH = 1.7;
  const HALF = 3;
  const EDGE = HALF + DEPTH / 2;
  function tileGeo(i) {
    if (i % 7 === 0) {
      const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]][i / 7];
      return { x: c[0] * EDGE, z: c[1] * EDGE, out: new T.Vector3(c[0], 0, c[1]).normalize(), side: -1, corner: true };
    }
    const side = Math.floor(i / 7);
    const t = HALF - 0.5 - ((i % 7) - 1);
    if (side === 0) return { x: t, z: EDGE, out: new T.Vector3(0, 0, 1), side };
    if (side === 1) return { x: -EDGE, z: t, out: new T.Vector3(-1, 0, 0), side };
    if (side === 2) return { x: -t, z: -EDGE, out: new T.Vector3(0, 0, -1), side };
    return { x: EDGE, z: -t, out: new T.Vector3(1, 0, 0), side };
  }
  function tilePos(i) {
    const g = tileGeo(i);
    return new T.Vector3(g.x, GROUND_Y, g.z);
  }

  /* ---------- cena base ---------- */
  function buildWorld() {
    const W = 2 * (HALF + DEPTH) + 0.5;
    const frame = mesh(new T.BoxGeometry(W, 0.5, W), matStd(0x241a4d, { roughness: 0.5 }), true);
    frame.position.y = -0.14;
    scene.add(frame);
    const rim = mesh(new T.BoxGeometry(W - 0.2, 0.08, W - 0.2), matStd(0xd9a93a, { metalness: 0.8, roughness: 0.3 }), false);
    rim.position.y = 0.08;
    scene.add(rim);
    const top = mesh(new T.BoxGeometry(W - 0.4, 0.06, W - 0.4), matStd(0x33276b, { roughness: 0.55 }), false);
    top.position.y = 0.1;
    scene.add(top);
    // sombra suave do tabuleiro na toalha
    const shTex = canvasTex(256, 256, (x) => {
      const g = x.createRadialGradient(128, 128, 70, 128, 128, 128);
      g.addColorStop(0, 'rgba(5,8,30,.55)'); g.addColorStop(1, 'rgba(5,8,30,0)');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    });
    const shadow = new T.Mesh(new T.PlaneGeometry(W * 1.45, W * 1.45), new T.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.6, -0.4, 0.6);
    scene.add(shadow);
    // pilhas de moedas na mesa, como no fim de uma rodada
    [[-6.3, -1.4], [1.4, 6.3]].forEach(([x0, z0], n) => {
      [[0, 0, 9], [0.42, 0.1, 6], [0.1, 0.42, 12], [-0.35, 0.3, 4], [0.5, -0.38, 7]].forEach(([dx, dz, hgt], k) => {
        for (let c = 0; c < hgt; c++) {
          const coin = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.055, 24), coinStackMat);
          coin.position.set(x0 + dx + (Math.random() - 0.5) * 0.02, -0.36 + c * 0.058, z0 + dz + (Math.random() - 0.5) * 0.02);
          coin.castShadow = true;
          scene.add(coin);
        }
      });
    });
    buildCenter();
  }
  const coinStackMat = new T.MeshStandardMaterial({ color: 0xe9c25a, metalness: 0.75, roughness: 0.32 });

  /* ---------- centro: praça limpa com logo e pista dos dados ---------- */
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new T.CanvasTexture(c);
    tex.encoding = T.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const redraw = () => { const x = c.getContext('2d'); x.clearRect(0, 0, w, h); draw(x, w, h); tex.needsUpdate = true; };
    redraw();
    if (document.fonts && document.fonts.load) document.fonts.load('700 120px Cinzel').then(redraw).catch(() => {});
    return tex;
  }
  function buildCenter() {
    const floor = canvasTex(1024, 1024, (x, w) => {
      const g = x.createRadialGradient(512, 512, 80, 512, 512, 760);
      g.addColorStop(0, '#6b5fa8'); g.addColorStop(1, '#3f3577');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
      for (let k = 0; k < 18000; k++) {
        x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(20,10,60,.06)';
        x.fillRect(Math.random() * w, Math.random() * w, 2, 2);
      }
      x.strokeStyle = 'rgba(240,210,140,.8)'; x.lineWidth = 6; x.strokeRect(26, 26, 972, 972);
      x.strokeStyle = 'rgba(240,210,140,.35)'; x.lineWidth = 2; x.strokeRect(46, 46, 932, 932);
      // nome gravado no chão, em diagonal para ficar de frente para a câmera
      x.save(); x.translate(512, 512); x.rotate(-Math.PI / 4);
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '700 118px Cinzel, "Trajan Pro", Georgia, serif';
      if ('letterSpacing' in x) x.letterSpacing = '10px';
      x.fillStyle = 'rgba(30,20,70,.35)'; x.fillText('REINO', 3, -78 + 4);
      x.fillStyle = 'rgba(255,240,200,.30)'; x.fillText('REINO', 0, -78);
      x.font = '700 78px Cinzel, "Trajan Pro", Georgia, serif';
      x.fillStyle = 'rgba(30,20,70,.35)'; x.fillText('DOS DADOS', 3, 50 + 4);
      x.fillStyle = 'rgba(255,240,200,.30)'; x.fillText('DOS DADOS', 0, 50);
      x.restore();
    });
    const plane = new T.Mesh(new T.PlaneGeometry(2 * HALF - 0.05, 2 * HALF - 0.05), new T.MeshStandardMaterial({ map: floor, roughness: 0.85 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.135;
    plane.receiveShadow = true;
    scene.add(plane);
  }
  /* ---------- casas do tabuleiro ---------- */
  function buildTiles(B) {
    B.forEach((b, i) => {
      const geo = tileGeo(i);
      const group = new T.Group();
      group.position.set(geo.x, 0, geo.z);
      let label;
      const cv = document.createElement('canvas');
      if (geo.corner) {
        // pedestal hexagonal dourado
        const plinth = mesh(new T.CylinderGeometry(1.02, 1.08, 0.34, 6), matStd(0xd9a93a, { metalness: 0.75, roughness: 0.3 }), true);
        plinth.position.y = 0.1;
        group.add(plinth);
        cv.width = cv.height = 512;
        label = new T.Mesh(new T.PlaneGeometry(2.04, 2.04), new T.MeshLambertMaterial({ transparent: true }));
        label.position.y = 0.272;
      } else {
        const along = geo.side === 0 || geo.side === 2;
        const col = new T.Color(tileColor(i));
        const base = mesh(along ? new T.BoxGeometry(0.95, 0.2, DEPTH * 0.97) : new T.BoxGeometry(DEPTH * 0.97, 0.2, 0.95), matStd(col.clone().multiplyScalar(0.62).getHex(), { roughness: 0.4 }), true);
        base.position.y = 0.1;
        group.add(base);
        cv.width = 448; cv.height = 256;
        label = new T.Mesh(new T.PlaneGeometry(DEPTH * 0.95, 0.93), new T.MeshLambertMaterial({}));
        label.rotation.z = along ? Math.PI / 2 : 0; // texto sempre legível pela câmera
        label.position.y = GROUND_Y + 0.002;
      }
      label.rotation.x = -Math.PI / 2;
      label.receiveShadow = true;
      label.userData.tile = i;
      const ctx = cv.getContext('2d');
      const tex = new T.CanvasTexture(cv);
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      label.material.map = tex;
      group.add(label);

      // onde fica a construção: na ponta de fora da casa
      const slot = new T.Group();
      slot.position.y = geo.corner ? 0.27 : GROUND_Y;
      if (!geo.corner) slot.position.addScaledVector(geo.out, 0.42);
      group.add(slot);

      scene.add(group);
      tiles[i] = { group, label, cv, ctx, tex, slot, geo, key: '', bkey: '' };

      const deco = makeSpecial(b, i);
      if (deco) { deco.position.y = geo.corner ? 0.27 : GROUND_Y; if (b.t === 'attr') deco.position.addScaledVector(geo.out, 0.25); group.add(deco); }
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrap2(ctx, text, maxW) {
    const words = text.split(' ');
    let best = [text];
    if (ctx.measureText(text).width > maxW && words.length > 1) {
      let bestW = Infinity;
      for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(' ');
        const b = words.slice(k).join(' ');
        const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (w < bestW) { bestW = w; best = [a, b]; }
      }
    }
    return best;
  }
  function drawTile(i, d) {
    const t = tiles[i];
    const key = JSON.stringify(d);
    if (key === t.key) return;
    t.key = key;
    const ctx = t.ctx;
    const W = t.cv.width;
    const H = t.cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (t.geo.corner) {
      // hexágono dourado com o nome
      const R = 236;
      const hex = (r) => {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const px = 256 + Math.sin(a) * r;
          const py = 256 + Math.cos(a) * r;
          if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath();
      };
      const g = ctx.createRadialGradient(256, 200, 20, 256, 256, 280);
      g.addColorStop(0, '#fff0c2'); g.addColorStop(0.6, '#f0c862'); g.addColorStop(1, '#c08a2a');
      hex(R); ctx.fillStyle = g; ctx.fill();
      hex(R - 22); ctx.strokeStyle = 'rgba(120,70,10,.55)'; ctx.lineWidth = 5; ctx.stroke();
      hex(R - 34); ctx.strokeStyle = 'rgba(255,250,220,.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(256, 256); ctx.rotate(-Math.PI / 4);
      ctx.font = '800 56px Inter, "Trebuchet MS", sans-serif';
      const lines = wrap2(ctx, d.name, 300);
      lines.forEach((ln, k) => {
        const y = 150 + (k - (lines.length - 1) / 2) * 60;
        ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,248,225,.9)'; ctx.strokeText(ln, 0, y);
        ctx.fillStyle = '#3a2a6a'; ctx.fillText(ln, 0, y);
      });
      ctx.restore();
      if (d.badge) { ctx.font = '70px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.fillText(d.badge, 256, 120); }
      t.tex.needsUpdate = true;
      return;
    }
    // casa comprida: cor viva com brilho
    const special = d.kind === 'card' || d.kind === 'tax';
    ctx.fillStyle = special ? '#f6f1e6' : d.bg;
    roundRect(ctx, 3, 3, W - 6, H - 6, 26);
    ctx.fill();
    const sh = ctx.createLinearGradient(0, 0, 0, H);
    sh.addColorStop(0, 'rgba(255,255,255,.45)'); sh.addColorStop(0.5, 'rgba(255,255,255,.1)'); sh.addColorStop(1, 'rgba(0,0,30,.12)');
    ctx.fillStyle = sh;
    roundRect(ctx, 3, 3, W - 6, H - 6, 26);
    ctx.fill();
    if (special) { // moldura rebuscada, como as cartas
      ctx.strokeStyle = '#8a7fb8'; ctx.lineWidth = 6; roundRect(ctx, 18, 18, W - 36, H - 36, 16); ctx.stroke();
      ctx.lineWidth = 2; roundRect(ctx, 30, 30, W - 60, H - 60, 10); ctx.stroke();
    }
    if (d.owner) { ctx.strokeStyle = d.owner; ctx.lineWidth = 18; roundRect(ctx, 12, 12, W - 24, H - 24, 20); ctx.stroke(); }
    // ponta de dentro (perto da praça): preço; resto: nome
    const outerRight = t.geo.side >= 2;
    const priceX = outerRight ? 70 : W - 70;
    const nameX = outerRight ? W / 2 + 40 : W / 2 - 40;
    ctx.font = '800 50px Inter, "Trebuchet MS", sans-serif';
    let size = 50;
    let lines = wrap2(ctx, d.name, 300);
    while (size > 34 && lines.some((ln) => ctx.measureText(ln).width > 300)) { size -= 2; ctx.font = `800 ${size}px Inter, "Trebuchet MS", sans-serif`; lines = wrap2(ctx, d.name, 300); }
    ctx.fillStyle = special ? '#4b3a86' : '#24204a';
    lines.forEach((ln, k) => ctx.fillText(ln, nameX, H / 2 + (k - (lines.length - 1) / 2) * (size * 1.08), 310));
    if (d.text) {
      ctx.save(); ctx.translate(priceX, H / 2); ctx.rotate(outerRight ? -Math.PI / 2 : Math.PI / 2);
      ctx.font = '800 40px Inter, "Trebuchet MS", sans-serif';
      const pw = ctx.measureText(d.text).width + 30;
      ctx.fillStyle = d.owner || 'rgba(36,32,74,.85)';
      roundRect(ctx, -pw / 2, -27, pw, 54, 27); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(d.text, 0, 2);
      ctx.restore();
    }
    if (d.badge) { ctx.font = '56px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; ctx.fillText(d.badge, outerRight ? W - 50 : 50, 60); }
    t.tex.needsUpdate = true;
  }

  /* ---------- modelos ---------- */
  function flag(color) {
    const g = new T.Group();
    const pole = mesh(new T.CylinderGeometry(0.012, 0.012, 0.42, 6), mat(0xdddddd));
    pole.position.y = 0.21;
    g.add(pole);
    const shape = new T.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.2, -0.06); shape.lineTo(0, -0.12);
    const fl = mesh(new T.ShapeGeometry(shape), new T.MeshLambertMaterial({ color, side: T.DoubleSide }));
    fl.position.set(0.01, 0.41, 0);
    g.add(fl);
    spinners.push((t) => { fl.rotation.y = Math.sin(t * 3 + color) * 0.35; });
    return g;
  }

  /* miniatura ilustrada em pé (sprite virado para a câmera fixa) */
  const texCache = {};
  function spriteImg(name, width, centerY = 0.1) {
    const m = new T.SpriteMaterial({ transparent: true, alphaTest: 0.3, depthWrite: true });
    const sp = new T.Sprite(m);
    sp.center.set(0.5, centerY);
    sp.scale.set(width, width, 1);
    const apply = (tex) => {
      m.map = tex;
      m.needsUpdate = true;
      sp.scale.set(width, width * tex.image.height / tex.image.width, 1);
    };
    if (texCache[name] && texCache[name].image) apply(texCache[name]);
    else {
      texCache[name] = new T.TextureLoader().load(imgUrl(name), (tex) => { tex.encoding = T.sRGBEncoding; apply(tex); });
    }
    return sp;
  }

  // largura de cada nível: cada construção parece maior que a anterior
  const LEVEL_W = [0, 0.66, 0.78, 0.86, 0.9];
  function makeBuilding(kind, lvl, color) {
    const g = new T.Group();
    if (kind === 'attr') return g;
    if (lvl === 0) { const f = flag(color); f.position.set(0.05, 0, -0.05); g.add(f); return g; }
    g.add(spriteImg('predio' + lvl, LEVEL_W[lvl], 0.12));
    // bandeirinha do dono atrás da construção
    const f = flag(color); f.position.set(-0.3, 0, -0.3); f.scale.setScalar(0.65); g.add(f);
    if (lvl === 4) { // brilho dourado do marco máximo
      const glow = new T.Mesh(new T.RingGeometry(0.28, 0.38, 40), new T.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.01; g.add(glow);
      spinners.push((t) => { glow.material.opacity = 0.3 + Math.sin(t * 3) * 0.2; glow.scale.setScalar(1 + Math.sin(t * 3) * 0.06); });
    }
    return g;
  }

  function makeSpecial(b, i) {
    const g = new T.Group();
    if (b.t === 'start') {
      const archL = mesh(new T.CylinderGeometry(0.05, 0.05, 0.6, 8), mat(0xffffff)); archL.position.set(-0.3, 0.3, 0.0);
      const archR = archL.clone(); archR.position.x = 0.3;
      const top = mesh(new T.BoxGeometry(0.74, 0.12, 0.08), mat(0xef4444)); top.position.y = 0.62;
      const arch = new T.Group(); arch.add(archL, archR, top); arch.rotation.y = -Math.PI / 4;
      g.add(arch);
    } else if (b.t === 'island') {
      const water = mesh(new T.CylinderGeometry(0.42, 0.42, 0.03, 20), matStd(0x38bdf8, { roughness: 0.2 }), false); water.position.y = 0.015; g.add(water);
      const sand = mesh(new T.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfde68a)); g.add(sand);
      const trunk = mesh(new T.CylinderGeometry(0.025, 0.035, 0.45, 6), mat(0x8a5a35)); trunk.position.set(0.02, 0.4, 0); trunk.rotation.z = -0.25; g.add(trunk);
      for (let k = 0; k < 5; k++) {
        const leaf = mesh(new T.ConeGeometry(0.06, 0.32, 4), mat(0x22a35a));
        leaf.position.set(0.08, 0.62, 0); leaf.rotation.set(0, (k / 5) * Math.PI * 2, Math.PI / 2.4);
        const piv = new T.Group(); piv.position.set(0.08, 0.62, 0); leaf.position.set(0.14, 0, 0); piv.rotation.y = (k / 5) * Math.PI * 2; leaf.rotation.set(0, 0, -Math.PI / 2.2); piv.add(leaf); g.add(piv);
      }
    } else if (b.t === 'festival') {
      const tent = mesh(new T.ConeGeometry(0.38, 0.55, 12), mat(0x8f2f2a)); tent.position.y = 0.36; g.add(tent);
      const base = mesh(new T.CylinderGeometry(0.38, 0.38, 0.1, 12), mat(0xf1e6cc)); base.position.y = 0.05; g.add(base);
      const f = flag(0xfacc15); f.position.y = 0.55; f.scale.setScalar(0.7); g.add(f);
    } else if (b.t === 'portal') {
      const ring = new T.Mesh(new T.TorusGeometry(0.3, 0.07, 10, 28), matStd(0xc9a24a, { metalness: 0.9, roughness: 0.25, emissive: 0x3a2a0a, emissiveIntensity: 0.4 }));
      ring.position.y = 0.45; ring.rotation.y = Math.PI / 4; ring.castShadow = true;
      const core = new T.Mesh(new T.CircleGeometry(0.26, 24), new T.MeshBasicMaterial({ color: 0x3fa7a0, transparent: true, opacity: 0.75, side: T.DoubleSide }));
      core.position.y = 0.45; core.rotation.y = Math.PI / 4;
      g.add(ring, core);
      spinners.push((t) => { ring.rotation.z = t * 2; core.material.opacity = 0.5 + Math.sin(t * 4) * 0.25; });
    } else if (b.t === 'attr') {
      g.add(spriteImg('atracao' + ({ 6: 1, 13: 2, 20: 3, 27: 4 }[i]), 0.78, 0.1));
    } else return null;
    return g;
  }

  /* ---------- personagens: figuras ilustradas em pé ---------- */
  function makeFigure(char, color) {
    const g = new T.Group();
    const base = mesh(new T.CylinderGeometry(0.2, 0.23, 0.07, 32), matStd(0xc9a24a, { metalness: 0.9, roughness: 0.3 }));
    base.position.y = 0.03;
    g.add(base);
    const top = mesh(new T.CylinderGeometry(0.17, 0.17, 0.02, 32), matStd(color, { roughness: 0.4 }), false);
    top.position.y = 0.065;
    g.add(top);
    const m = new T.SpriteMaterial({ transparent: true, alphaTest: 0.35, depthWrite: true });
    const sp = new T.Sprite(m);
    sp.center.set(0.5, 0.04);
    sp.position.y = 0.06;
    sp.scale.set(0.9, 0.9, 1);
    new T.TextureLoader().load(imgUrl(char), (tex) => {
      tex.encoding = T.sRGBEncoding;
      m.map = tex;
      m.needsUpdate = true;
      const h = 1.2;
      sp.scale.set(h * tex.image.width / tex.image.height, h, 1);
    });
    g.add(sp);
    return g;
  }

  const OFF = [[-0.24, -0.5], [0.24, -0.5], [-0.24, -0.1], [0.24, -0.1]]; // [lateral, radial]
  function tokenTarget(idx, pos) {
    const g = tileGeo(pos);
    const p = new T.Vector3(g.x, g.corner ? 0.27 : GROUND_Y, g.z);
    if (g.corner) return p.add(new T.Vector3([-0.32, 0.32, -0.32, 0.32][idx], 0, [-0.32, -0.32, 0.32, 0.32][idx]));
    const lat = new T.Vector3(-g.out.z, 0, g.out.x);
    return p.addScaledVector(lat, OFF[idx][0]).addScaledVector(g.out, OFF[idx][1]);
  }

  /* ---------- dados ---------- */
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieFace(n) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#f4ead3'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = n === 1 ? '#9b1c1c' : '#1c140a';
    PIPS[n].forEach((j) => { x.beginPath(); x.arc(28 + (j % 3) * 36, 28 + Math.floor(j / 3) * 36, n === 1 ? 17 : 12, 0, Math.PI * 2); x.fill(); });
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return new T.MeshStandardMaterial({ map: t, roughness: 0.35 });
  }
  // ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z
  const FACE_ORDER = [3, 4, 1, 6, 2, 5];
  const FACE_UP = {
    1: new T.Euler(0, 0, 0), 6: new T.Euler(Math.PI, 0, 0), 2: new T.Euler(-Math.PI / 2, 0, 0),
    5: new T.Euler(Math.PI / 2, 0, 0), 3: new T.Euler(0, 0, Math.PI / 2), 4: new T.Euler(0, 0, -Math.PI / 2),
  };
  function buildDice() {
    const mats = FACE_ORDER.map(dieFace);
    const geo = new T.BoxGeometry(0.62, 0.62, 0.62);
    dice = [0, 1].map((k) => {
      const d = new T.Mesh(geo, mats);
      d.castShadow = true;
      d.position.set(-0.5 + k, 0.45, 0.5 - k);
      d.quaternion.setFromEuler(FACE_UP[k ? 3 : 5]);
      scene.add(d);
      return d;
    });
  }
  function finalQuat(n) {
    const q = new T.Quaternion().setFromEuler(FACE_UP[n]);
    const yaw = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 4 + (Math.random() - 0.5) * 0.5);
    return yaw.multiply(q);
  }
  async function roll(a, b, shuffle) {
    const targets = [finalQuat(a), finalQuat(b)];
    const rest = [new T.Vector3(-0.5, 0.45, 0.5), new T.Vector3(0.5, 0.45, -0.5)];
    if (fast()) { dice.forEach((d, k) => { d.quaternion.copy(targets[k]); d.position.copy(rest[k]); }); return; }
    const spin = dice.map(() => new T.Vector3(Math.random() * 14 + 8, Math.random() * 10, Math.random() * 14 + 8));
    const start = dice.map((d) => d.quaternion.clone());
    let lastTick = 0;
    await animate(0.75, (k) => {
      dice.forEach((d, j) => {
        const h = Math.sin(k * Math.PI) * 1.6 + Math.abs(Math.sin(k * Math.PI * 3)) * 0.2 * (1 - k);
        d.position.set(rest[j].x * (0.6 + k * 0.4), 0.45 + h, rest[j].z * (0.6 + k * 0.4));
        if (k < 0.7) {
          d.quaternion.copy(start[j]);
          d.rotateX(spin[j].x * k); d.rotateY(spin[j].y * k); d.rotateZ(spin[j].z * k);
        } else {
          const free = new T.Quaternion().copy(start[j]);
          const tmp = new T.Object3D(); tmp.quaternion.copy(free); tmp.rotateX(spin[j].x * 0.7); tmp.rotateY(spin[j].y * 0.7); tmp.rotateZ(spin[j].z * 0.7);
          d.quaternion.copy(tmp.quaternion).slerp(targets[j], easeInOut((k - 0.7) / 0.3));
        }
      });
      if (shuffle && k - lastTick > 0.12) { lastTick = k; shuffle(); }
    });
    dice.forEach((d, k) => { d.quaternion.copy(targets[k]); d.position.copy(rest[k]); });
    if (a === b) await pulseDice();
  }
  async function pulseDice() {
    await animate(0.4, (k) => { const s = 1 + Math.sin(k * Math.PI) * 0.25; dice.forEach((d) => d.scale.setScalar(s)); });
  }

  /* ---------- moedas / efeitos ---------- */
  const coinGeo = new T.CylinderGeometry(0.07, 0.07, 0.02, 14);
  const coinMat = matStd(0xfbbf24, { metalness: 0.7, roughness: 0.3, emissive: 0x6b4500, emissiveIntensity: 0.4 });
  function coinMesh() { const c = new T.Mesh(coinGeo, coinMat); c.rotation.x = Math.PI / 2; c.castShadow = true; return c; }
  function coins(from, to, n = 8) {
    if (fast()) return;
    const a = typeof from === 'number' ? tilePos(from) : from;
    const b = to === undefined || to === null ? null : (typeof to === 'number' ? tilePos(to) : to);
    for (let k = 0; k < n; k++) {
      const c = coinMesh();
      scene.add(c);
      const delay = k * 0.05;
      const jitter = new T.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4);
      const vx = (Math.random() - 0.5) * 1.2;
      const vz = (Math.random() - 0.5) * 1.2;
      let t = -delay;
      c.visible = false;
      anims.push((dt) => {
        t += dt;
        if (t < 0) return true;
        c.visible = true;
        const k2 = Math.min(1, t / 0.9);
        if (b) {
          const p = new T.Vector3().lerpVectors(a, b, easeInOut(k2)).add(jitter.clone().multiplyScalar(1 - k2));
          p.y = GROUND_Y + 0.3 + Math.sin(k2 * Math.PI) * 1.4;
          c.position.copy(p);
        } else {
          c.position.set(a.x + vx * t, GROUND_Y + 0.3 + 3 * t - 4 * t * t, a.z + vz * t);
        }
        c.rotation.z += dt * 12;
        c.scale.setScalar(k2 > 0.8 ? (1 - k2) * 5 : 1);
        if (k2 >= 1) { scene.remove(c); return false; }
        return true;
      });
    }
  }
  function sparkle(pos, color = 0xfde68a, n = 14) {
    if (fast()) return;
    const p0 = typeof pos === 'number' ? tilePos(pos) : pos;
    for (let k = 0; k < n; k++) {
      const s = new T.Mesh(new T.OctahedronGeometry(0.04), new T.MeshBasicMaterial({ color, transparent: true }));
      const a = (k / n) * Math.PI * 2;
      const v = new T.Vector3(Math.cos(a), 1.5 + Math.random(), Math.sin(a)).multiplyScalar(0.9);
      s.position.set(p0.x, GROUND_Y + 0.2, p0.z);
      scene.add(s);
      let t = 0;
      anims.push((dt) => {
        t += dt;
        s.position.addScaledVector(v, dt);
        v.y -= dt * 2.5;
        s.rotation.y += dt * 8;
        s.material.opacity = Math.max(0, 1 - t / 0.9);
        if (t > 0.9) { scene.remove(s); return false; }
        return true;
      });
    }
  }

  // confete do festival
  let festivalFx = null;
  function setFestival(i) {
    if (festivalFx && festivalFx.tile === i) return;
    if (festivalFx) { scene.remove(festivalFx.g); festivalFx = null; }
    if (i < 0) return;
    const g = new T.Group();
    const p = tilePos(i);
    g.position.set(p.x, GROUND_Y, p.z);
    const balls = [];
    for (let k = 0; k < 6; k++) {
      const b = mesh(new T.SphereGeometry(0.07, 10, 8), mat([0x8f2f2a, 0xfacc15, 0x22d3ee, 0xa855f7, 0x34d399, 0xfb923c][k]));
      g.add(b);
      balls.push(b);
    }
    scene.add(g);
    festivalFx = { tile: i, g };
    spinners.push((t) => {
      if (!festivalFx || festivalFx.g !== g) return;
      balls.forEach((b, k) => { const a = t * 1.5 + (k / 6) * Math.PI * 2; b.position.set(Math.cos(a) * 0.38, 0.85 + Math.sin(t * 3 + k) * 0.08, Math.sin(a) * 0.38); });
    });
  }

  /* ---------- API ---------- */
  function sync(S, B, info) {
    B.forEach((b, i) => {
      const t = S.tiles[i];
      const owner = t.owner >= 0 ? S.players[t.owner] : null;
      const d = info(i);
      drawTile(i, d);
      const bkey = owner ? `${b.t}:${t.owner}:${t.lvl}` : '';
      const tt = tiles[i];
      if (bkey !== tt.bkey) {
        const grew = tt.bkey === '' || (owner && tt.bkey.split(':')[2] !== String(t.lvl));
        tt.bkey = bkey;
        while (tt.slot.children.length) tt.slot.remove(tt.slot.children[0]);
        if (owner) {
          const col = new T.Color(owner.color).getHex();
          if (b.t === 'attr') {
            const ring = new T.Mesh(new T.TorusGeometry(0.4, 0.035, 6, 32), new T.MeshBasicMaterial({ color: col }));
            ring.rotation.x = Math.PI / 2;
            ring.position.y = 0.02;
            tt.slot.add(ring);
            const f = flag(col); f.position.set(0.3, 0, -0.3); f.scale.setScalar(0.8); tt.slot.add(f);
          } else tt.slot.add(makeBuilding(b.t, t.lvl, col));
          if (grew && !fast()) {
            tt.slot.scale.setScalar(0.01);
            sparkle(i, col);
            animate(0.55, (k) => tt.slot.scale.setScalar(Math.max(0.01, easeOutBack(k))));
          } else tt.slot.scale.setScalar(1);
        }
      }
      // escolha de casa
      const lm = tt.label.material;
      if (pickFilter) {
        const ok = pickFilter(i);
        lm.color.setHex(ok ? 0xffffff : 0x555566);
        lm.emissive.setHex(0x000000);
        tt.pickable = ok;
      } else {
        lm.color.setHex(0xffffff);
        lm.emissive.setHex(0x000000);
        tt.pickable = false;
      }
    });
    setFestival(S.festival);
    S.players.forEach((p) => {
      const tk = tokens[p.idx];
      if (!tk) return;
      tk.group.visible = !p.out;
    });
  }

  function placeAll(S) {
    S.players.forEach((p) => {
      const tk = tokens[p.idx];
      if (!tk || tk.moving) return;
      tk.group.position.copy(tokenTarget(p.idx, p.pos));
    });
  }
  function setCurrent(idx) {
    current = idx;
    tokens.forEach((tk, k) => { tk.ring.visible = k === idx; });
  }

  async function hop(idx, pos, dur = 0.2) {
    const tk = tokens[idx];
    const to = tokenTarget(idx, pos);
    if (fast()) { tk.group.position.copy(to); return; }
    const from = tk.group.position.clone();
    tk.moving = true;
    await animate(dur, (k) => {
      tk.group.position.lerpVectors(from, to, k);
      tk.group.position.y = GROUND_Y + Math.sin(k * Math.PI) * 0.35;
      const sq = k > 0.85 ? 1 - (1 - k) * 2 : 1;
      tk.fig.scale.set(1, sq, 1);
    });
    tk.fig.scale.set(1, 1, 1);
    tk.moving = false;
  }
  async function teleport(idx, pos) {
    const tk = tokens[idx];
    const to = tokenTarget(idx, pos);
    if (fast()) { tk.group.position.copy(to); return; }
    tk.moving = true;
    sparkle(tk.group.position.clone(), 0xc4b5fd);
    await animate(0.35, (k) => { tk.fig.scale.setScalar(Math.max(0.01, 1 - k)); tk.fig.rotation.y = k * 6; });
    tk.group.position.copy(to);
    sparkle(to, 0xc4b5fd);
    await animate(0.4, (k) => { tk.fig.scale.setScalar(Math.max(0.01, easeOutBack(k))); tk.fig.rotation.y = (1 - k) * 6; });
    tk.fig.rotation.y = 0;
    tk.moving = false;
  }

  function setPick(filter) { pickFilter = filter; }

  let insets = { top: 0, bottom: 0 };
  function setInsets(v) { insets = v; fit(); }
  function screenPos(x, y, z) {
    const v = new T.Vector3(x, y, z).project(camera);
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  }
  function fit() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.updateMatrixWorld();
    const pts = [];
    const E = HALF + DEPTH + 0.25;
    [-E, E].forEach((x) => [-E, E].forEach((z) => { pts.push(new T.Vector3(x, 0.9, z), new T.Vector3(x, -0.4, z)); }));
    let minx = Infinity; let maxx = -Infinity; let miny = Infinity; let maxy = -Infinity;
    pts.forEach((p) => {
      const v = p.applyMatrix4(camera.matrixWorldInverse);
      minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x); miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
    });
    const top = Math.min(insets.top, h * 0.3);
    const bot = Math.min(insets.bottom, h * 0.4);
    const ah = Math.max(80, h - top - bot);
    const aw = Math.max(80, w - 16);
    const s2 = Math.max((maxx - minx) / aw, (maxy - miny) / ah) * 0.99; // unidades por pixel
    const cx = (minx + maxx) / 2;
    const cy = (miny + maxy) / 2;
    camera.left = cx - (w / 2) * s2; camera.right = cx + (w / 2) * s2;
    camera.top = cy + (top + ah / 2) * s2; camera.bottom = camera.top - h * s2;
    camera.updateProjectionMatrix();
  }

  function init(opts) {
    canvas = opts.canvas;
    fast = opts.fast || fast;
    imgUrl = opts.img || imgUrl;
    tileColor = opts.tileColor || tileColor;
    onTile = opts.onTile || onTile;
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(12, 15.5, 12);
    camera.lookAt(0, -0.4, 0);

    scene.add(new T.HemisphereLight(0xfff2dc, 0x3a2a1a, 0.7));
    const sun = new T.DirectionalLight(0xffdfb0, 1.05);
    sun.position.set(-5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -7; sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
    sun.shadow.bias = -0.0008;
    sun.shadow.radius = 3;
    scene.add(sun);

    buildWorld();
    buildTiles(opts.board);
    buildDice();
    opts.players.forEach((p) => {
      const group = new T.Group();
      const fig = makeFigure(p.char, new T.Color(p.color).getHex());
      const figWrap = new T.Group();
      figWrap.add(fig);
      group.add(figWrap);
      const ring = new T.Mesh(new T.RingGeometry(0.2, 0.26, 28), new T.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.9, side: T.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      ring.visible = false;
      group.add(ring);
      scene.add(group);
      tokens[p.idx] = { group, fig: figWrap, ring, moving: false };
    });

    // toque nas casas
    const ray = new T.Raycaster();
    const ndc = new T.Vector2();
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 10) return;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(tiles.map((t) => t.label), false)[0];
      if (hit) onTile(hit.object.userData.tile);
    });

    clock = new T.Clock();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    fit();
    const loop = () => {
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      for (let k = anims.length - 1; k >= 0; k--) if (!anims[k](dt, t)) anims.splice(k, 1);
      spinners.forEach((f) => f(t));
      tokens.forEach((tk, k) => {
        if (k === current && !tk.moving) tk.fig.position.y = Math.abs(Math.sin(t * 3.2)) * 0.12;
        else if (!tk.moving) tk.fig.position.y = 0;
        tk.ring.material.opacity = 0.55 + Math.sin(t * 4) * 0.35;
      });
      if (pickFilter) {
        const e = (Math.sin(t * 5) + 1) * 0.18;
        tiles.forEach((tt) => { if (tt.pickable) tt.label.material.emissive.setRGB(e, e * 0.85, 0); });
      }
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  return { init, setInsets, screenPos, fit, sync, placeAll, setCurrent, hop, teleport, roll, coins, sparkle, setPick, tilePos, tokenPos: (idx) => tokens[idx] && tokens[idx].group.position.clone() };
})();
