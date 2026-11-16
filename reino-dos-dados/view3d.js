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

  function coord(i) {
    if (i === 0) return [8, 8];
    if (i < 7) return [8, 8 - i];
    if (i === 7) return [8, 1];
    if (i < 14) return [8 - (i - 7), 1];
    if (i === 14) return [1, 1];
    if (i < 21) return [1, 1 + (i - 14)];
    if (i === 21) return [1, 8];
    return [1 + (i - 21), 8];
  }
  function tilePos(i) {
    const [r, c] = coord(i);
    return new T.Vector3((c - 4.5) * TILE, GROUND_Y, (r - 4.5) * TILE);
  }

  /* ---------- cena base ---------- */
  function buildWorld() {
    // tabuleiro de madeira grosso, apoiado no chão (o chão é o fundo desenhado atrás do 3D)
    const frame = mesh(new T.BoxGeometry(8.7, 0.5, 8.7), matStd(0x4a2a17, { roughness: 0.45, metalness: 0.05 }), true);
    frame.position.y = -0.14;
    scene.add(frame);
    const rim = mesh(new T.BoxGeometry(8.4, 0.1, 8.4), matStd(0xc9a24a, { metalness: 0.85, roughness: 0.3 }), false);
    rim.position.y = 0.07;
    scene.add(rim);
    // sombra suave do tabuleiro no chão
    const shTex = canvasTex(256, 256, (x) => {
      const g = x.createRadialGradient(128, 128, 60, 128, 128, 128);
      g.addColorStop(0, 'rgba(60,40,10,.42)'); g.addColorStop(1, 'rgba(60,40,10,0)');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    });
    const shadow = new T.Mesh(new T.PlaneGeometry(13, 13), new T.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.rotation.z = Math.PI / 4;
    shadow.position.set(0.5, -0.4, 0.5);
    shadow.scale.set(0.95, 0.95, 1);
    scene.add(shadow);
    buildCenter();
  }

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
    // feltro verde com filete dourado duplo e brasão discreto
    const floor = canvasTex(1024, 1024, (x, w) => {
      const g = x.createRadialGradient(512, 512, 60, 512, 512, 760);
      g.addColorStop(0, '#2a5a45'); g.addColorStop(1, '#14301f');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
      for (let k = 0; k < 26000; k++) { // trama do feltro
        x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)';
        x.fillRect(Math.random() * w, Math.random() * w, 2, 2);
      }
      x.strokeStyle = '#c9a24a'; x.lineWidth = 6; x.strokeRect(34, 34, 956, 956);
      x.lineWidth = 2; x.strokeRect(52, 52, 920, 920);
      // cantoneiras
      [[52, 52], [972, 52], [52, 972], [972, 972]].forEach(([cx, cy]) => {
        x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4);
        x.fillStyle = '#c9a24a'; x.fillRect(-12, -12, 24, 24);
        x.fillStyle = '#14301f'; x.fillRect(-6, -6, 12, 12);
        x.restore();
      });
      // rosa-dos-ventos tênue no meio
      x.save(); x.translate(512, 512); x.globalAlpha = 0.16; x.fillStyle = '#e6c77a';
      for (let k = 0; k < 8; k++) {
        x.rotate(Math.PI / 4);
        x.beginPath(); x.moveTo(0, -(k % 2 ? 210 : 330)); x.lineTo(26, 0); x.lineTo(-26, 0); x.closePath(); x.fill();
      }
      x.restore();
    });
    const plane = new T.Mesh(new T.PlaneGeometry(6.02, 6.02), new T.MeshStandardMaterial({ map: floor, roughness: 0.95 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.19;
    plane.receiveShadow = true;
    scene.add(plane);

    // pista dos dados: aro de latão com couro escuro dentro
    const padRim = mesh(new T.TorusGeometry(1.0, 0.045, 10, 64), matStd(0xc9a24a, { metalness: 0.9, roughness: 0.28 }), false);
    padRim.rotation.x = Math.PI / 2;
    padRim.position.y = 0.21;
    scene.add(padRim);
    const padTop = mesh(new T.CircleGeometry(0.97, 64), matStd(0x2a1a10, { roughness: 0.7 }), false);
    padTop.rotation.x = -Math.PI / 2;
    padTop.position.y = 0.2;
    scene.add(padTop);

    // logo gravado em dourado, de frente para a câmera
    const logo = canvasTex(1024, 512, (x) => {
      x.textAlign = 'center'; x.textBaseline = 'middle';
      const word = (txt, y, size, sp) => {
        x.font = `700 ${size}px Cinzel, "Trajan Pro", Georgia, serif`;
        if ('letterSpacing' in x) x.letterSpacing = sp + 'px';
        x.fillStyle = 'rgba(0,0,0,.55)'; x.fillText(txt, 515, y + 6);
        const g = x.createLinearGradient(0, y - size / 2, 0, y + size / 2);
        g.addColorStop(0, '#fff1c4'); g.addColorStop(0.45, '#e2bd6a'); g.addColorStop(0.55, '#b8893a'); g.addColorStop(1, '#f0d48c');
        x.fillStyle = g; x.fillText(txt, 512, y);
      };
      word('REINO', 170, 150, 18);
      x.strokeStyle = '#c9a24a'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(250, 268); x.lineTo(440, 268); x.moveTo(584, 268); x.lineTo(774, 268); x.stroke();
      x.fillStyle = '#c9a24a'; x.save(); x.translate(512, 268); x.rotate(Math.PI / 4); x.fillRect(-9, -9, 18, 18); x.restore();
      word('DOS DADOS', 360, 104, 12);
    });
    const sign = new T.Mesh(new T.PlaneGeometry(2.9, 1.45), new T.MeshBasicMaterial({ map: logo, transparent: true, depthWrite: false }));
    sign.position.set(-1.05, 0.95, -1.05);
    sign.quaternion.copy(camera.quaternion);
    scene.add(sign);
  }
  /* ---------- casas do tabuleiro ---------- */
  function buildTiles(B) {
    B.forEach((b, i) => {
      const group = new T.Group();
      const p = tilePos(i);
      group.position.set(p.x, 0, p.z);
      const corner = i % 7 === 0;
      const base = mesh(new T.BoxGeometry(0.97, 0.18, 0.97), matStd(0x2b1a0f, { roughness: 0.5 }), false);
      base.position.y = 0.11;
      base.receiveShadow = true;
      group.add(base);

      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const ctx = cv.getContext('2d');
      const tex = new T.CanvasTexture(cv);
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const label = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), new T.MeshLambertMaterial({ map: tex }));
      label.rotation.x = -Math.PI / 2;
      label.rotation.z = Math.PI / 4; // texto "em pé" para a câmera isométrica
      label.position.y = GROUND_Y + 0.002;
      label.receiveShadow = true;
      label.userData.tile = i;
      group.add(label);

      const slot = new T.Group();
      slot.position.y = GROUND_Y;
      group.add(slot);

      scene.add(group);
      tiles[i] = { group, label, cv, ctx, tex, slot, key: '', bkey: '' };

      // decoração fixa das casas especiais
      const deco = makeSpecial(b, i);
      if (deco) { deco.position.y = GROUND_Y; group.add(deco); }
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

  function drawTile(i, d) {
    const t = tiles[i];
    const key = JSON.stringify(d);
    if (key === t.key) return;
    t.key = key;
    const ctx = t.ctx;
    ctx.clearRect(0, 0, 256, 256);
    const corner = d.big;
    // papel marfim (cantos em feltro verde)
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    if (corner) { g.addColorStop(0, '#2c5c47'); g.addColorStop(1, '#173826'); } else { g.addColorStop(0, '#fbf3e0'); g.addColorStop(1, '#eadbb8'); }
    ctx.fillStyle = g;
    roundRect(ctx, 2, 2, 252, 252, 14);
    ctx.fill();
    // faixa da região no alto
    if (d.band) {
      ctx.save(); roundRect(ctx, 2, 2, 252, 252, 14); ctx.clip();
      ctx.fillStyle = d.band; ctx.fillRect(0, 0, 256, 52);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(0, 0, 256, 18);
      ctx.restore();
    }
    // filete dourado
    ctx.strokeStyle = '#b8893a'; ctx.lineWidth = 4;
    roundRect(ctx, 14, d.band ? 62 : 14, 228, d.band ? 180 : 228, 8); ctx.stroke();
    if (d.owner) {
      ctx.strokeStyle = d.owner; ctx.lineWidth = 16;
      roundRect(ctx, 10, 10, 236, 236, 12); ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (d.emoji) {
      ctx.save();
      if ('filter' in ctx) ctx.filter = 'sepia(0.85) saturate(0.8) contrast(1.05)';
      ctx.font = '78px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.globalAlpha = d.dimEmoji ? 0.35 : 0.95;
      ctx.fillText(d.emoji, 128, 128);
      ctx.restore();
    }
    if (d.text) {
      ctx.font = `700 ${corner ? 40 : 52}px Cinzel, "Trajan Pro", Georgia, serif`;
      ctx.fillStyle = corner ? '#e6c77a' : (d.owner || '#3a2414');
      ctx.fillText(d.text, 128, corner ? 128 : 206, 220);
    }
    if (d.badge) {
      ctx.font = '50px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(d.badge, 210, 96);
    }
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
  const LEVEL_W = [0, 0.82, 0.98, 1.08, 1.12];
  function makeBuilding(kind, lvl, color) {
    const g = new T.Group();
    if (kind === 'attr') return g;
    if (lvl === 0) { const f = flag(color); f.position.set(0.05, 0, -0.05); g.add(f); return g; }
    g.add(spriteImg('predio' + lvl, LEVEL_W[lvl], 0.12));
    // bandeirinha do dono atrás da construção
    const f = flag(color); f.position.set(-0.34, 0, -0.34); f.scale.setScalar(0.75); g.add(f);
    if (lvl === 4) { // brilho dourado do marco máximo
      const glow = new T.Mesh(new T.RingGeometry(0.34, 0.46, 40), new T.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false }));
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
    } else if (b.t === 'card') {
      const ped = mesh(new T.CylinderGeometry(0.1, 0.16, 0.12, 8), matStd(0xc9a24a, { metalness: 0.85, roughness: 0.3 })); ped.position.y = 0.06; g.add(ped);
      const ball = new T.Mesh(new T.SphereGeometry(0.17, 18, 14), matStd(0xe0a24a, { emissive: 0x8a4a10, emissiveIntensity: 0.5, transparent: true, opacity: 0.9, roughness: 0.08, metalness: 0.1 }));
      ball.castShadow = true;
      g.add(ball);
      spinners.push((t) => { ball.position.y = 0.36 + Math.sin(t * 2 + i) * 0.05; ball.rotation.y = t; });
    } else if (b.t === 'tax') {
      const chest = mesh(new T.BoxGeometry(0.34, 0.2, 0.24), mat(0xa16207)); chest.position.y = 0.1; g.add(chest);
      const lid = mesh(new T.CylinderGeometry(0.12, 0.12, 0.34, 10, 1, false, 0, Math.PI), mat(0xca8a04)); lid.rotation.z = Math.PI / 2; lid.position.y = 0.2; g.add(lid);
      for (let k = 0; k < 4; k++) { const c = coinMesh(); c.position.set(-0.08 + k * 0.05, 0.3 + k * 0.02, 0); g.add(c); }
      g.rotation.y = Math.PI / 4;
    } else if (b.t === 'attr') {
      g.add(spriteImg('atracao' + ({ 6: 1, 13: 2, 20: 3, 27: 4 }[i]), 0.95, 0.1));
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

  const OFF = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
  function tokenTarget(idx, pos) {
    const p = tilePos(pos);
    return new T.Vector3(p.x + OFF[idx][0], GROUND_Y, p.z + OFF[idx][1]);
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
    const geo = new T.BoxGeometry(0.55, 0.55, 0.55);
    dice = [0, 1].map((k) => {
      const d = new T.Mesh(geo, mats);
      d.castShadow = true;
      d.position.set(-0.45 + k * 0.9, 0.53, 0.45 - k * 0.9);
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
    const rest = [new T.Vector3(-0.45, 0.53, 0.45), new T.Vector3(0.45, 0.53, -0.45)];
    if (fast()) { dice.forEach((d, k) => { d.quaternion.copy(targets[k]); d.position.copy(rest[k]); }); return; }
    const spin = dice.map(() => new T.Vector3(Math.random() * 14 + 8, Math.random() * 10, Math.random() * 14 + 8));
    const start = dice.map((d) => d.quaternion.clone());
    let lastTick = 0;
    await animate(0.75, (k) => {
      dice.forEach((d, j) => {
        const h = Math.sin(k * Math.PI) * 1.6 + Math.abs(Math.sin(k * Math.PI * 3)) * 0.2 * (1 - k);
        d.position.set(rest[j].x * (0.6 + k * 0.4), 0.53 + h, rest[j].z * (0.6 + k * 0.4));
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
    [-4.35, 4.35].forEach((x) => [-4.35, 4.35].forEach((z) => { pts.push(new T.Vector3(x, 0.9, z), new T.Vector3(x, -0.4, z)); }));
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
