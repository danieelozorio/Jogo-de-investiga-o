'use strict';
/* Reino dos Dados — tabuleiro 3D (Three.js r128), câmera fixa isométrica. */
/* global THREE */

const View = (() => {
  const T = THREE;
  let renderer, scene, camera, canvas, clock;
  let fast = () => false;
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
    const grass = mesh(new T.CylinderGeometry(6.5, 6.4, 0.35, 8, 1), mat(0x7ccf5a), false);
    grass.rotation.y = Math.PI / 8;
    grass.position.y = -0.18;
    grass.receiveShadow = true;
    scene.add(grass);

    // moldura do tabuleiro
    const frame = mesh(new T.BoxGeometry(8.5, 0.22, 8.5), mat(0xf3d08a), false);
    frame.position.y = 0.0;
    scene.add(frame);
    const inner = mesh(new T.BoxGeometry(5.9, 0.26, 5.9), mat(0x9be07a), false);
    inner.position.y = 0.02;
    scene.add(inner);

    // lago no meio
    const lake = mesh(new T.CylinderGeometry(1.15, 1.15, 0.05, 32), matStd(0x5cc8f0, { roughness: 0.2, metalness: 0.1 }), false);
    lake.position.set(0, 0.16, 0);
    lake.scale.z = 0.8;
    scene.add(lake);
    const sand = mesh(new T.CylinderGeometry(1.35, 1.35, 0.04, 32), mat(0xf6e2a8), false);
    sand.position.set(0, 0.15, 0);
    sand.scale.z = 0.8;
    scene.add(sand);

    // árvores e flores dentro do anel
    const spots = [[-2.2, -2.2], [-2.3, 0.4], [-1.6, 2.1], [2.2, -2.3], [0.3, -2.4], [2.3, 0.2], [1.8, 2.2], [-0.6, 2.4], [-2.4, -1.0], [2.4, -1.2], [1.0, -1.7], [-1.2, -1.6]];
    spots.forEach(([x, z], k) => {
      const tree = makeTree(k % 3 === 0 ? 0x3fa34d : k % 3 === 1 ? 0x58b947 : 0x2f8f5b, 0.7 + (k % 4) * 0.12);
      tree.position.set(x, 0.15, z);
      scene.add(tree);
    });
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 1.2;
      const f = mesh(new T.SphereGeometry(0.05, 6, 4), mat([0xff7eb6, 0xffe066, 0xffffff, 0xb983ff][k % 4]), false);
      f.position.set(Math.cos(a) * r, 0.18, Math.sin(a) * r * 0.9);
      scene.add(f);
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
      const base = mesh(new T.BoxGeometry(0.94, 0.16, 0.94), mat(corner ? 0xffd66b : 0xfff3dd), false);
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
    ctx.fillStyle = d.bg;
    roundRect(ctx, 4, 4, 248, 248, 30);
    ctx.fill();
    if (d.owner) {
      ctx.lineWidth = 16;
      ctx.strokeStyle = d.owner;
      roundRect(ctx, 12, 12, 232, 232, 24);
      ctx.stroke();
    }
    if (d.band) {
      ctx.save();
      roundRect(ctx, 4, 4, 248, 248, 30);
      ctx.clip();
      ctx.fillStyle = d.band;
      ctx.fillRect(0, 0, 256, 44);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (d.emoji) {
      ctx.font = `${d.big ? 120 : 92}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.globalAlpha = d.dimEmoji ? 0.35 : 1;
      ctx.fillText(d.emoji, 128, d.big ? 110 : 104);
      ctx.globalAlpha = 1;
    }
    if (d.text) {
      ctx.font = `700 ${d.big ? 50 : 64}px Fredoka, "Trebuchet MS", sans-serif`;
      const w = Math.min(240, ctx.measureText(d.text).width + 34);
      ctx.fillStyle = d.owner || '#3b2a6b';
      roundRect(ctx, 128 - w / 2, 172, w, 76, 34);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(d.text, 128, 212, 224);
    }
    if (d.badge) {
      ctx.font = '54px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.fillText(d.badge, 210, 76);
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
    } else if (name === 20) { // pirâmide
      const p = mesh(new T.ConeGeometry(0.4, 0.55, 4), mat(0xfbbf24)); p.position.y = 0.28; p.rotation.y = Math.PI / 4; g.add(p);
      const tip = mesh(new T.OctahedronGeometry(0.06), matStd(0x67e8f9, { emissive: 0x06b6d4, emissiveIntensity: 0.7 })); tip.position.y = 0.66; g.add(tip);
      spinners.push((t) => { tip.rotation.y = t * 2; });
    } else { // torre do relógio
      const tw = mesh(new T.BoxGeometry(0.24, 0.62, 0.24), mat(0xfde4cf)); tw.position.y = 0.31; g.add(tw);
      const roof = mesh(new T.ConeGeometry(0.22, 0.24, 4), mat(0x2563eb)); roof.position.y = 0.74; roof.rotation.y = Math.PI / 4; g.add(roof);
      const face = mesh(new T.CircleGeometry(0.08, 16), mat(0xffffff), false); face.position.set(0, 0.5, 0.122); g.add(face);
      const hand = mesh(new T.BoxGeometry(0.01, 0.06, 0.005), mat(0x111111), false); hand.position.set(0, 0.5, 0.126); g.add(hand);
      const face2 = face.clone(); face2.position.set(0.122, 0.5, 0); face2.rotation.y = Math.PI / 2; g.add(face2);
      const hand2 = hand.clone(); hand2.position.set(0.126, 0.5, 0); hand2.rotation.y = Math.PI / 2; g.add(hand2);
      spinners.push((t) => { hand.rotation.z = -t; hand2.rotation.x = t; });
    }
    return g;
  }

  /* ---------- personagens (miniaturas) ---------- */
  const CHAR_LOOK = {
    lua: { body: 0x7c3aed, skin: 0xffe0c7 },
    bento: { body: 0x334155, skin: 0xf5c9a0 },
    faisca: { body: 0x22c55e, skin: 0x4ade80 },
    mel: { body: 0xf472b6, skin: 0xffe4d6 },
    tonho: { body: 0x94a3b8, skin: 0xf5d0b0 },
    coruja: { body: 0x92400e, skin: 0xd6a36b },
  };
  function makeFigure(char, color) {
    const look = CHAR_LOOK[char] || CHAR_LOOK.lua;
    const g = new T.Group();
    const base = mesh(new T.CylinderGeometry(0.17, 0.19, 0.06, 20), matStd(color, { metalness: 0.2 }));
    base.position.y = 0.03;
    g.add(base);
    const body = mesh(new T.CylinderGeometry(0.08, 0.14, 0.24, 12), mat(look.body));
    body.position.y = 0.18;
    g.add(body);
    const head = mesh(new T.SphereGeometry(0.13, 16, 12), mat(look.skin));
    head.position.y = 0.4;
    g.add(head);
    const eyeM = mat(0x1f1235);
    const eyeG = new T.SphereGeometry(char === 'coruja' ? 0.035 : 0.022, 8, 6);
    [-0.045, 0.045].forEach((x) => {
      if (char === 'coruja') { const w = mesh(new T.SphereGeometry(0.05, 10, 8), mat(0xffffff), false); w.position.set(x * 1.3, 0.42, 0.1); g.add(w); }
      const e = mesh(eyeG, eyeM, false);
      e.position.set(char === 'coruja' ? x * 1.3 : x, 0.42, char === 'coruja' ? 0.14 : 0.12);
      g.add(e);
    });
    const blush = mat(0xff9db5);
    [-0.08, 0.08].forEach((x) => { const b = mesh(new T.SphereGeometry(0.02, 6, 4), blush, false); b.position.set(x, 0.37, 0.105); b.scale.z = 0.4; g.add(b); });

    if (char === 'lua') {
      const brim = mesh(new T.CylinderGeometry(0.2, 0.2, 0.02, 20), mat(0x4c1d95)); brim.position.y = 0.5; g.add(brim);
      const hat = mesh(new T.ConeGeometry(0.12, 0.32, 14), mat(0x5b21b6)); hat.position.set(0, 0.67, -0.02); hat.rotation.x = -0.25; g.add(hat);
      const star = mesh(new T.OctahedronGeometry(0.03), mat(0xfde047), false); star.position.set(0, 0.6, 0.09); g.add(star);
    } else if (char === 'bento') {
      const hat = mesh(new T.CylinderGeometry(0.16, 0.18, 0.08, 3), mat(0x111827)); hat.position.y = 0.52; hat.rotation.y = Math.PI / 6 + Math.PI; g.add(hat);
      const skull = mesh(new T.SphereGeometry(0.025, 6, 4), mat(0xffffff), false); skull.position.set(0, 0.53, 0.1); g.add(skull);
      const patch = mesh(new T.BoxGeometry(0.05, 0.04, 0.01), mat(0x111827), false); patch.position.set(0.045, 0.42, 0.125); g.add(patch);
    } else if (char === 'faisca') {
      [-0.07, 0.07].forEach((x) => { const h = mesh(new T.ConeGeometry(0.03, 0.1, 6), mat(0xfde047)); h.position.set(x, 0.54, 0); h.rotation.z = -x * 3; g.add(h); });
      [-1, 1].forEach((s) => { const w = mesh(new T.ConeGeometry(0.08, 0.2, 3), mat(0x16a34a)); w.position.set(s * 0.14, 0.25, -0.06); w.rotation.z = s * 1.1; g.add(w); });
      const tail = mesh(new T.ConeGeometry(0.04, 0.18, 6), mat(0x16a34a)); tail.position.set(0, 0.1, -0.15); tail.rotation.x = -1.2; g.add(tail);
    } else if (char === 'mel') {
      const wm = new T.MeshLambertMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.75, side: T.DoubleSide });
      [-1, 1].forEach((s) => { const w = new T.Mesh(new T.CircleGeometry(0.12, 12), wm); w.position.set(s * 0.11, 0.3, -0.08); w.rotation.y = s * 0.6; w.scale.y = 1.4; g.add(w); spinners.push((t) => { w.rotation.y = s * (0.6 + Math.sin(t * 12) * 0.3); }); });
      const hair = mesh(new T.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfbbf24)); hair.position.y = 0.41; hair.rotation.x = -0.3; g.add(hair);
    } else if (char === 'tonho') {
      const helm = mesh(new T.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), matStd(0xcbd5e1, { metalness: 0.6, roughness: 0.3 })); helm.position.y = 0.42; helm.rotation.x = -0.25; g.add(helm);
      const plume = mesh(new T.ConeGeometry(0.04, 0.16, 6), mat(0xef4444)); plume.position.set(0, 0.6, -0.03); g.add(plume);
      const shield = mesh(new T.CylinderGeometry(0.08, 0.08, 0.02, 12), mat(0x2563eb)); shield.rotation.z = Math.PI / 2; shield.position.set(0.15, 0.2, 0.02); g.add(shield);
    } else if (char === 'coruja') {
      [-0.07, 0.07].forEach((x) => { const e = mesh(new T.ConeGeometry(0.04, 0.1, 4), mat(0x78350f)); e.position.set(x, 0.54, 0); g.add(e); });
      const beak = mesh(new T.ConeGeometry(0.02, 0.05, 4), mat(0xf59e0b), false); beak.position.set(0, 0.38, 0.13); beak.rotation.x = Math.PI / 2 + 0.6; g.add(beak);
    }
    g.rotation.y = Math.PI / 4; // olha para a câmera
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
      d.position.set(-0.45 + k * 0.9, 0.5, 0.45 - k * 0.9);
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
    const rest = [new T.Vector3(-0.45, 0.5, 0.45), new T.Vector3(0.45, 0.5, -0.45)];
    if (fast()) { dice.forEach((d, k) => { d.quaternion.copy(targets[k]); d.position.copy(rest[k]); }); return; }
    const spin = dice.map(() => new T.Vector3(Math.random() * 14 + 8, Math.random() * 10, Math.random() * 14 + 8));
    const start = dice.map((d) => d.quaternion.clone());
    let lastTick = 0;
    await animate(0.75, (k) => {
      dice.forEach((d, j) => {
        const h = Math.sin(k * Math.PI) * 1.6 + Math.abs(Math.sin(k * Math.PI * 3)) * 0.2 * (1 - k);
        d.position.set(rest[j].x * (0.6 + k * 0.4), 0.5 + h, rest[j].z * (0.6 + k * 0.4));
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

    scene.add(new T.HemisphereLight(0xfff7e8, 0x8b7bd8, 0.75));
    const sun = new T.DirectionalLight(0xffffff, 0.75);
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
      fig.scale.setScalar(1.3);
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
