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
    // ilha flutuante: terra + grama
    const dirt = mesh(new T.CylinderGeometry(6.4, 5.2, 1.6, 8, 1), mat(0x8b5a3c), false);
    dirt.rotation.y = Math.PI / 8;
    dirt.position.y = -1.0;
    scene.add(dirt);
    const rock = mesh(new T.ConeGeometry(5.0, 3.2, 8), mat(0x6d4630), false);
    rock.rotation.set(Math.PI, Math.PI / 8, 0);
    rock.position.y = -3.4;
    scene.add(rock);
    const grass = mesh(new T.CylinderGeometry(6.5, 6.4, 0.35, 8, 1), mat(0x69c94b), false);
    grass.rotation.y = Math.PI / 8;
    grass.position.y = -0.18;
    grass.receiveShadow = true;
    scene.add(grass);

    // moldura de madeira + mapa ilustrado no centro
    const frame = mesh(new T.BoxGeometry(8.7, 0.24, 8.7), mat(0xb7793f), false);
    frame.position.y = -0.01;
    scene.add(frame);
    const rim = mesh(new T.BoxGeometry(8.36, 0.1, 8.36), mat(0x7a4a22), false);
    rim.position.y = 0.07;
    scene.add(rim);
    buildCenter();

    // mata em volta do tabuleiro
    for (let k = 0; k < 22; k++) {
      const a2 = (k / 22) * Math.PI * 2 + 0.2;
      const r = 5.6 + (k % 3) * 0.28;
      const tree = makeTree([0x2f9e44, 0x37b24d, 0x2b8a3e][k % 3], 0.9 + (k % 4) * 0.15);
      tree.position.set(Math.cos(a2) * r, -0.02, Math.sin(a2) * r);
      scene.add(tree);
    }

    // nuvens ao redor
    for (let k = 0; k < 5; k++) {
      const c = makeCloud();
      const a = (k / 5) * Math.PI * 2 + 0.4;
      c.position.set(Math.cos(a) * 7.2, -1.2 - (k % 2) * 0.8, Math.sin(a) * 7.2);
      scene.add(c);
      const y0 = c.position.y;
      spinners.push((t) => { c.position.y = y0 + Math.sin(t * 0.6 + k) * 0.12; });
    }
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
    if (document.fonts && document.fonts.load) document.fonts.load('700 120px Fredoka').then(redraw).catch(() => {});
    return tex;
  }
  function buildCenter() {
    // chão do centro: tons dos 4 biomas saindo do meio (cima = Sertão, baixo = Amazônia, esq. = Pantanal, dir. = Litoral)
    const floor = canvasTex(1024, 1024, (x, w) => {
      x.fillStyle = '#fdf1d2';
      x.fillRect(0, 0, w, w);
      const tri = (pts, col) => { x.beginPath(); x.moveTo(512, 512); pts.forEach(([a, b]) => x.lineTo(a, b)); x.closePath(); x.fillStyle = col; x.fill(); };
      tri([[0, 0], [1024, 0]], '#ffcf8a');
      tri([[0, 1024], [1024, 1024]], '#bfeaa0');
      tri([[0, 0], [0, 1024]], '#a8e6df');
      tri([[1024, 0], [1024, 1024]], '#aed4ff');
      // bolinhas suaves
      x.fillStyle = 'rgba(255,255,255,.35)';
      for (let yy = 32; yy < 1024; yy += 64) for (let xx = (yy / 64) % 2 ? 64 : 32; xx < 1024; xx += 64) { x.beginPath(); x.arc(xx, yy, 5, 0, Math.PI * 2); x.fill(); }
      // brilho no meio
      const g = x.createRadialGradient(512, 512, 40, 512, 512, 520);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.45, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
      // borda tracejada
      x.setLineDash([26, 18]); x.lineWidth = 10; x.strokeStyle = 'rgba(255,255,255,.9)';
      x.strokeRect(28, 28, 968, 968);
    });
    const plane = new T.Mesh(new T.PlaneGeometry(6.02, 6.02), new T.MeshLambertMaterial({ map: floor }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.19;
    plane.receiveShadow = true;
    scene.add(plane);

    // pista onde os dados caem
    const pad = mesh(new T.CylinderGeometry(1.0, 1.05, 0.08, 40), mat(0xffffff), false);
    pad.position.y = 0.2;
    scene.add(pad);
    const padRim = mesh(new T.TorusGeometry(1.0, 0.05, 8, 48), matStd(0xfbbf24, { metalness: 0.4, roughness: 0.35 }), false);
    padRim.rotation.x = Math.PI / 2;
    padRim.position.y = 0.24;
    scene.add(padRim);
    const padTop = mesh(new T.CircleGeometry(0.92, 40), mat(0x7c3aed), false);
    padTop.rotation.x = -Math.PI / 2;
    padTop.position.y = 0.245;
    scene.add(padTop);

    // logo de pé no fundo da praça, de frente para a câmera
    const logo = canvasTex(1024, 512, (x) => {
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
      const word = (txt, y, size) => {
        x.font = `700 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
        x.lineWidth = size * 0.34; x.strokeStyle = '#ffffff'; x.strokeText(txt, 512, y);
        x.lineWidth = size * 0.2; x.strokeStyle = '#5b21b6'; x.strokeText(txt, 512, y);
        const g = x.createLinearGradient(0, y - size / 2, 0, y + size / 2);
        g.addColorStop(0, '#fff7b0'); g.addColorStop(0.5, '#fcd34d'); g.addColorStop(1, '#f59e0b');
        x.fillStyle = g; x.fillText(txt, 512, y);
      };
      word('Reino', 150, 170);
      word('dos Dados', 345, 150);
    });
    const sign = new T.Mesh(new T.PlaneGeometry(3.5, 1.75), new T.MeshBasicMaterial({ map: logo, transparent: true, depthWrite: false }));
    sign.position.set(-1.45, 1.2, -1.45);
    sign.quaternion.copy(camera.quaternion);
    scene.add(sign);
    spinners.push((t) => { sign.position.y = 1.2 + Math.sin(t * 1.4) * 0.05; });

    // enfeites de cada bioma, encostados no anel
    const deco = (x0, z0, obj) => { obj.position.set(x0, 0.19, z0); scene.add(obj); };
    // Amazônia (baixo): mata e vitórias-régias
    [[-1.6, 2.35], [-0.9, 2.5], [1.4, 2.45], [2.1, 2.2]].forEach(([x0, z0], k) => deco(x0, z0, makeTree(k % 2 ? 0x2f9e44 : 0x37b24d, 0.75)));
    [[0.2, 2.45], [0.55, 2.2]].forEach(([x0, z0]) => { const l = mesh(new T.CylinderGeometry(0.18, 0.18, 0.02, 16), mat(0x4ade80), false); deco(x0, z0, l); });
    // Pantanal (esquerda): ipês amarelos
    [[-2.45, 0.3], [-2.3, 1.5]].forEach(([x0, z0]) => deco(x0, z0, makeIpe()));
    // Sertão (cima): mandacarus e pedras
    [[0.5, -2.4], [1.3, -2.3], [2.2, -2.35]].forEach(([x0, z0], k) => deco(x0, z0, makeCactus(0.7 + k * 0.1)));
    [[0.9, -2.15], [1.75, -2.5]].forEach(([x0, z0]) => { const r = mesh(new T.DodecahedronGeometry(0.14, 0), mat(0xd9864a)); r.scale.y = 0.7; deco(x0, z0, r); });
    // Litoral (direita): coqueiros
    [[2.45, -0.9], [2.35, 0.5], [2.45, 1.4]].forEach(([x0, z0]) => deco(x0, z0, makePalm()));
  }
  function makeIpe() {
    const g = new T.Group();
    const trunk = mesh(new T.CylinderGeometry(0.04, 0.06, 0.4, 6), mat(0x7a4a22)); trunk.position.y = 0.2; g.add(trunk);
    [[0, 0.5, 0, 0.24], [0.14, 0.42, 0.05, 0.16], [-0.12, 0.44, -0.04, 0.17]].forEach(([x0, y0, z0, r]) => {
      const b = mesh(new T.IcosahedronGeometry(r, 0), mat(0xfacc15)); b.position.set(x0, y0, z0); g.add(b);
    });
    return g;
  }
  function makeCactus(s = 1) {
    const g = new T.Group();
    const m = mat(0x4d9a3a);
    const body = mesh(new T.CylinderGeometry(0.07, 0.08, 0.6, 8), m); body.position.y = 0.3; g.add(body);
    [[-1, 0.28], [1, 0.36]].forEach(([d, y0]) => {
      const arm = mesh(new T.CylinderGeometry(0.045, 0.045, 0.14, 8), m); arm.rotation.z = Math.PI / 2; arm.position.set(d * 0.12, y0, 0); g.add(arm);
      const up = mesh(new T.CylinderGeometry(0.045, 0.045, 0.2, 8), m); up.position.set(d * 0.19, y0 + 0.1, 0); g.add(up);
    });
    g.scale.setScalar(s);
    return g;
  }
  function makePalm() {
    const g = new T.Group();
    const trunk = mesh(new T.CylinderGeometry(0.03, 0.05, 0.6, 6), mat(0x9a6b3c)); trunk.position.set(0.05, 0.3, 0); trunk.rotation.z = -0.2; g.add(trunk);
    for (let k = 0; k < 6; k++) {
      const piv = new T.Group(); piv.position.set(0.11, 0.6, 0); piv.rotation.y = (k / 6) * Math.PI * 2;
      const leaf = mesh(new T.ConeGeometry(0.05, 0.36, 4), mat(0x22a35a)); leaf.position.x = 0.16; leaf.rotation.z = -Math.PI / 2.3; piv.add(leaf); g.add(piv);
    }
    const coco = mesh(new T.SphereGeometry(0.04, 6, 4), mat(0x6b4423)); coco.position.set(0.1, 0.56, 0.04); g.add(coco);
    return g;
  }

  function makeTree(color, s = 1) {
    const g = new T.Group();
    const trunk = mesh(new T.CylinderGeometry(0.06, 0.08, 0.3, 6), mat(0x8a5a35));
    trunk.position.y = 0.15;
    g.add(trunk);
    const c1 = mesh(new T.ConeGeometry(0.32, 0.5, 7), mat(color));
    c1.position.y = 0.48;
    g.add(c1);
    const c2 = mesh(new T.ConeGeometry(0.24, 0.4, 7), mat(color));
    c2.position.y = 0.72;
    g.add(c2);
    g.scale.setScalar(s);
    return g;
  }
  function makeCloud() {
    const g = new T.Group();
    const m = mat(0xffffff, { transparent: true, opacity: 0.92 });
    [[0, 0, 0, 0.6], [0.6, 0.05, 0.1, 0.45], [-0.55, -0.05, 0, 0.42], [0.2, 0.3, 0, 0.4]].forEach(([x, y, z, r]) => {
      const s = new T.Mesh(new T.SphereGeometry(r, 10, 8), m);
      s.position.set(x, y, z);
      g.add(s);
    });
    return g;
  }

  /* ---------- casas do tabuleiro ---------- */
  function buildTiles(B) {
    B.forEach((b, i) => {
      const group = new T.Group();
      const p = tilePos(i);
      group.position.set(p.x, 0, p.z);
      const corner = i % 7 === 0;
      const base = mesh(new T.BoxGeometry(0.97, 0.18, 0.97), mat(new T.Color(tileColor(i)).multiplyScalar(0.72).getHex()), false);
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
    // fundo na cor da região, com brilho no alto
    ctx.fillStyle = d.bg;
    roundRect(ctx, 2, 2, 252, 252, 30);
    ctx.fill();
    const sh = ctx.createLinearGradient(0, 0, 0, 256);
    sh.addColorStop(0, 'rgba(255,255,255,.5)'); sh.addColorStop(0.55, 'rgba(255,255,255,.08)'); sh.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.fillStyle = sh;
    roundRect(ctx, 2, 2, 252, 252, 30);
    ctx.fill();
    if (d.owner) {
      ctx.lineWidth = 20;
      ctx.strokeStyle = d.owner;
      roundRect(ctx, 12, 12, 232, 232, 24);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (d.emoji) {
      ctx.fillStyle = d.owner ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.9)';
      roundRect(ctx, 34, 26, 188, 140, 30);
      ctx.fill();
      ctx.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.globalAlpha = d.dimEmoji ? 0.4 : 1;
      ctx.fillText(d.emoji, 128, 100);
      ctx.globalAlpha = 1;
    }
    if (d.text) {
      ctx.font = `700 ${d.big ? 52 : 62}px Fredoka, "Trebuchet MS", sans-serif`;
      const w = Math.min(244, ctx.measureText(d.text).width + 36);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      roundRect(ctx, 128 - w / 2, 178, w, 72, 34);
      ctx.fill();
      ctx.fillStyle = d.owner || '#ffffff';
      roundRect(ctx, 128 - w / 2, 172, w, 72, 34);
      ctx.fill();
      ctx.fillStyle = d.owner ? '#ffffff' : '#3b1f6b';
      ctx.fillText(d.text, 128, 210, 228);
    }
    if (d.badge) {
      ctx.font = '54px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(d.badge, 212, 60);
    }
    t.tex.needsUpdate = true;
  }

  /* ---------- modelos ---------- */
  function house(color, s = 1) {
    const g = new T.Group();
    const body = mesh(new T.BoxGeometry(0.26, 0.2, 0.26), mat(0xfff6e6));
    body.position.y = 0.1;
    g.add(body);
    const roof = mesh(new T.ConeGeometry(0.24, 0.18, 4), mat(color));
    roof.position.y = 0.29;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    const door = mesh(new T.BoxGeometry(0.07, 0.11, 0.01), mat(0x8a5a35), false);
    door.position.set(0, 0.06, 0.131);
    g.add(door);
    g.scale.setScalar(s);
    return g;
  }
  function tower(color, h, r) {
    const g = new T.Group();
    const body = mesh(new T.CylinderGeometry(r, r * 1.08, h, 10), mat(0xf4f1ff));
    body.position.y = h / 2;
    g.add(body);
    const roof = mesh(new T.ConeGeometry(r * 1.35, r * 2.4, 10), mat(color));
    roof.position.y = h + r * 1.2;
    g.add(roof);
    const win = mesh(new T.BoxGeometry(r * 0.6, r * 0.9, 0.01), mat(0x4b3b8f), false);
    win.position.set(0, h * 0.65, r * 1.0);
    g.add(win);
    return g;
  }
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

  function makeBuilding(kind, lvl, color) {
    const g = new T.Group();
    if (kind === 'attr') return g;
    if (lvl === 0) { const f = flag(color); f.position.set(0.05, 0, -0.05); g.add(f); }
    if (lvl === 1) g.add(house(color, 1.25));
    if (lvl === 2) {
      const a = house(color, 1.1); a.position.set(-0.13, 0, -0.1); g.add(a);
      const b = house(color, 0.95); b.position.set(0.15, 0, 0.05); g.add(b);
      const c = house(color, 0.75); c.position.set(-0.12, 0, 0.2); g.add(c);
    }
    if (lvl === 3) {
      const wall = mesh(new T.BoxGeometry(0.62, 0.18, 0.62), mat(0xe9e3ff));
      wall.position.y = 0.09;
      g.add(wall);
      [[-0.27, -0.27], [0.27, -0.27], [-0.27, 0.27], [0.27, 0.27]].forEach(([x, z]) => {
        const tw = tower(color, 0.32, 0.07); tw.position.set(x, 0, z); g.add(tw);
      });
      const keep = tower(color, 0.5, 0.13); keep.position.y = 0.1; g.add(keep);
    }
    if (lvl === 4) {
      const ped = mesh(new T.CylinderGeometry(0.3, 0.36, 0.14, 8), mat(0xfff3c4));
      ped.position.y = 0.07;
      g.add(ped);
      const keep = tower(color, 0.55, 0.12); keep.position.y = 0.14; g.add(keep);
      const crystal = mesh(new T.OctahedronGeometry(0.16), matStd(0xfde68a, { emissive: 0xf59e0b, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.2 }));
      crystal.position.y = 1.15;
      g.add(crystal);
      const halo = new T.Mesh(new T.TorusGeometry(0.24, 0.02, 6, 24), new T.MeshBasicMaterial({ color: 0xfff1a8 }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 1.15;
      g.add(halo);
      spinners.push((t) => { crystal.rotation.y = t * 1.6; crystal.position.y = 1.15 + Math.sin(t * 2) * 0.05; halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08); });
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
      const tent = mesh(new T.ConeGeometry(0.38, 0.55, 12), mat(0xf43f5e)); tent.position.y = 0.36; g.add(tent);
      const base = mesh(new T.CylinderGeometry(0.38, 0.38, 0.1, 12), mat(0xfff1f2)); base.position.y = 0.05; g.add(base);
      const f = flag(0xfacc15); f.position.y = 0.55; f.scale.setScalar(0.7); g.add(f);
    } else if (b.t === 'portal') {
      const ring = new T.Mesh(new T.TorusGeometry(0.3, 0.07, 10, 28), matStd(0x8b5cf6, { emissive: 0x6d28d9, emissiveIntensity: 0.6 }));
      ring.position.y = 0.45; ring.rotation.y = Math.PI / 4; ring.castShadow = true;
      const core = new T.Mesh(new T.CircleGeometry(0.26, 24), new T.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.75, side: T.DoubleSide }));
      core.position.y = 0.45; core.rotation.y = Math.PI / 4;
      g.add(ring, core);
      spinners.push((t) => { ring.rotation.z = t * 2; core.material.opacity = 0.5 + Math.sin(t * 4) * 0.25; });
    } else if (b.t === 'card') {
      const ped = mesh(new T.CylinderGeometry(0.1, 0.16, 0.12, 8), mat(0xc4b5fd)); ped.position.y = 0.06; g.add(ped);
      const ball = new T.Mesh(new T.SphereGeometry(0.17, 18, 14), matStd(0xa78bfa, { emissive: 0x7c3aed, emissiveIntensity: 0.5, transparent: true, opacity: 0.88, roughness: 0.1 }));
      ball.castShadow = true;
      g.add(ball);
      spinners.push((t) => { ball.position.y = 0.36 + Math.sin(t * 2 + i) * 0.05; ball.rotation.y = t; });
    } else if (b.t === 'tax') {
      const chest = mesh(new T.BoxGeometry(0.34, 0.2, 0.24), mat(0xa16207)); chest.position.y = 0.1; g.add(chest);
      const lid = mesh(new T.CylinderGeometry(0.12, 0.12, 0.34, 10, 1, false, 0, Math.PI), mat(0xca8a04)); lid.rotation.z = Math.PI / 2; lid.position.y = 0.2; g.add(lid);
      for (let k = 0; k < 4; k++) { const c = coinMesh(); c.position.set(-0.08 + k * 0.05, 0.3 + k * 0.02, 0); g.add(c); }
      g.rotation.y = Math.PI / 4;
    } else if (b.t === 'attr') {
      g.add(makeAttraction(i));
    } else return null;
    return g;
  }

  function makeAttraction(i) {
    const g = new T.Group();
    const name = i;
    if (name === 6) { // roda-gigante
      const legL = mesh(new T.BoxGeometry(0.04, 0.5, 0.04), mat(0xe5e7eb)); legL.position.set(-0.12, 0.25, 0); legL.rotation.z = -0.25;
      const legR = legL.clone(); legR.position.x = 0.12; legR.rotation.z = 0.25;
      const wheel = new T.Group(); wheel.position.y = 0.5;
      const rim = mesh(new T.TorusGeometry(0.3, 0.025, 6, 24), mat(0xf472b6)); wheel.add(rim);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const spoke = mesh(new T.BoxGeometry(0.01, 0.3, 0.01), mat(0xffffff), false); spoke.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0); spoke.rotation.z = a - Math.PI / 2; wheel.add(spoke);
        const cab = mesh(new T.BoxGeometry(0.07, 0.07, 0.07), mat([0xfacc15, 0x60a5fa, 0x34d399, 0xf87171][k % 4])); cab.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0); wheel.add(cab);
      }
      const holder = new T.Group(); holder.add(legL, legR, wheel); holder.rotation.y = -Math.PI / 4; g.add(holder);
      spinners.push((t) => { wheel.rotation.z = t * 0.8; });
    } else if (name === 13) { // fonte
      const b1 = mesh(new T.CylinderGeometry(0.34, 0.36, 0.1, 16), mat(0xe2e8f0)); b1.position.y = 0.05; g.add(b1);
      const w = mesh(new T.CylinderGeometry(0.3, 0.3, 0.02, 16), matStd(0x38bdf8, { roughness: 0.1 }), false); w.position.y = 0.1; g.add(w);
      const col = mesh(new T.CylinderGeometry(0.05, 0.07, 0.3, 8), mat(0xe2e8f0)); col.position.y = 0.25; g.add(col);
      const b2 = mesh(new T.CylinderGeometry(0.15, 0.1, 0.06, 12), mat(0xe2e8f0)); b2.position.y = 0.4; g.add(b2);
      const jet = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), new T.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.8 })); jet.position.y = 0.5; g.add(jet);
      spinners.push((t) => { jet.scale.y = 1 + Math.sin(t * 6) * 0.3; });
    } else if (name === 20) { // pedra encantada
      const r1 = mesh(new T.DodecahedronGeometry(0.3, 0), mat(0xc2703a)); r1.position.set(-0.05, 0.24, 0); r1.scale.y = 1.25; g.add(r1);
      const r2 = mesh(new T.DodecahedronGeometry(0.18, 0), mat(0xa85a2a)); r2.position.set(0.22, 0.14, 0.12); g.add(r2);
      const tip = mesh(new T.OctahedronGeometry(0.07), matStd(0x67e8f9, { emissive: 0x06b6d4, emissiveIntensity: 0.8 })); tip.position.set(-0.05, 0.78, 0); g.add(tip);
      spinners.push((t) => { tip.rotation.y = t * 2; tip.position.y = 0.78 + Math.sin(t * 2.5) * 0.04; });
    } else { // farol
      const rock = mesh(new T.CylinderGeometry(0.3, 0.36, 0.1, 10), mat(0x9ca3af)); rock.position.y = 0.05; g.add(rock);
      [0xffffff, 0xef4444, 0xffffff, 0xef4444].forEach((c, k) => {
        const seg = mesh(new T.CylinderGeometry(0.15 - k * 0.018, 0.168 - k * 0.018, 0.17, 12), mat(c)); seg.position.y = 0.185 + k * 0.17; g.add(seg);
      });
      const lamp = mesh(new T.CylinderGeometry(0.09, 0.09, 0.1, 10), matStd(0xfde047, { emissive: 0xfacc15, emissiveIntensity: 0.9 })); lamp.position.y = 0.83; g.add(lamp);
      const cap = mesh(new T.ConeGeometry(0.13, 0.12, 10), mat(0x1e3a8a)); cap.position.y = 0.94; g.add(cap);
      const beam = new T.Mesh(new T.ConeGeometry(0.16, 0.7, 12, 1, true), new T.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
      beam.rotation.z = Math.PI / 2; beam.position.set(0.38, 0, 0);
      const piv = new T.Group(); piv.position.y = 0.83; piv.add(beam); g.add(piv);
      spinners.push((t) => { piv.rotation.y = t * 1.5; });
    }
    return g;
  }

  /* ---------- personagens: figuras ilustradas em pé ---------- */
  function makeFigure(char, color) {
    const g = new T.Group();
    const base = mesh(new T.CylinderGeometry(0.2, 0.22, 0.06, 24), matStd(color, { metalness: 0.25, roughness: 0.4 }));
    base.position.y = 0.03;
    g.add(base);
    const top = mesh(new T.CylinderGeometry(0.16, 0.16, 0.02, 24), mat(0xffffff), false);
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
      const h = 1.05;
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
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = n === 1 ? '#e11d48' : '#4c1d95';
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
      const b = mesh(new T.SphereGeometry(0.07, 10, 8), mat([0xf43f5e, 0xfacc15, 0x22d3ee, 0xa855f7, 0x34d399, 0xfb923c][k]));
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

  function fit() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.updateMatrixWorld();
    const pts = [];
    [-4.3, 4.3].forEach((x) => [-4.3, 4.3].forEach((z) => { pts.push(new T.Vector3(x, 1.4, z), new T.Vector3(x, -0.2, z)); }));
    [[0, -4.8], [4.8, 0], [0, 4.8], [-4.8, 0]].forEach(([x, z]) => pts.push(new T.Vector3(x * 0.95, -1.4, z * 0.95)));
    let minx = Infinity; let maxx = -Infinity; let miny = Infinity; let maxy = -Infinity;
    pts.forEach((p) => {
      const v = p.applyMatrix4(camera.matrixWorldInverse);
      minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x); miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
    });
    let cw = maxx - minx;
    let chh = maxy - miny;
    const cx = (minx + maxx) / 2;
    const cy = (miny + maxy) / 2;
    const aspect = w / h;
    if (cw / chh > aspect) chh = cw / aspect; else cw = chh * aspect;
    cw *= 1.02; chh *= 1.02;
    camera.left = cx - cw / 2; camera.right = cx + cw / 2;
    camera.top = cy + chh / 2; camera.bottom = cy - chh / 2;
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    camera = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(12, 15.5, 12);
    camera.lookAt(0, -0.4, 0);

    scene.add(new T.HemisphereLight(0xfffbf0, 0x9a8ad8, 0.82));
    const sun = new T.DirectionalLight(0xfff1d6, 0.62);
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

  return { init, sync, placeAll, setCurrent, hop, teleport, roll, coins, sparkle, setPick, tilePos, tokenPos: (idx) => tokens[idx] && tokens[idx].group.position.clone() };
})();
