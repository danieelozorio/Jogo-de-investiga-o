'use strict';
// ============================================================
// Mapa da vila: casinhas em volta da praça, na ordem da roda.
// Mostra o SEU caminho (nunca o dos outros).
// ============================================================

const MAPA = (() => {
  const W = 360, H = 440, C = { x: 180, y: 222 };
  const RX = 128, RY = 168;
  let anim = { key: '', raf: 0 };

  // posição de cada casa (índice na ordem da roda)
  function pos(i, n) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: C.x + RX * Math.cos(a), y: C.y + RY * Math.sin(a) };
  }
  // "porta": um pouco pra dentro, na direção da praça
  function porta(i, n, dist = 34) {
    const p = pos(i, n), dx = C.x - p.x, dy = C.y - p.y, d = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / d) * dist, y: p.y + (dy / d) * dist };
  }
  // estrelinhas fixas
  const ESTRELAS = Array.from({ length: 26 }, (_, k) => ({ x: (k * 137) % W, y: (k * 89) % H, r: k % 3 ? 0.9 : 1.6 }));

  const iniciais = nome => esc(String(nome).replace(/^Bot /, '').slice(0, 2));

  /**
   * opts: {
   *   jogadores, meId, sel (id da casa marcada), clicavel(j)->bool, pronto (mostrar ✓),
   *   modo: 'anda' | 'olha' | 'parado', vistos: [ids] (gente na casa de destino), id: string
   * }
   */
  function svg(o) {
    const js = o.jogadores, n = js.length;
    const meIdx = js.findIndex(j => j.id === o.meId);
    const estradas = js.map((j, i) => {
      const p = pos(i, n);
      const mx = (p.x + C.x) / 2 + (p.y - C.y) * 0.12, my = (p.y + C.y) / 2 - (p.x - C.x) * 0.12;
      return `<path class="estrada" d="M${C.x},${C.y} Q${mx.toFixed(1)},${my.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}"/>`;
    }).join('');
    const casas = js.map((j, i) => {
      const p = pos(i, n);
      const mine = j.id === o.meId, on = o.sel === j.id;
      const pode = o.clicavel ? o.clicavel(j) : false;
      const ic = !j.vivo ? '🏚️' : mine ? '🏡' : '🏠';
      return `<g class="casa-m ${on ? 'on' : ''} ${pode ? 'pode' : 'off'} ${j.vivo ? '' : 'morta'}" data-id="${j.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
        <circle class="hl" r="30"/>
        <text class="ic" y="10">${ic}</text>
        <text class="nm" y="40">${mine ? 'Sua casa' : esc(j.nome)}</text>
        ${o.pronto && j.vivo && j.pronto ? '<text class="ok" x="22" y="-16">✓</text>' : ''}
      </g>`;
    }).join('');
    const vistos = (o.vistos || []).map(id => js.findIndex(j => j.id === id)).filter(k => k >= 0);
    const vis = vistos.length ? `<g class="vistos" data-n="${vistos.length}">${vistos.map(k =>
      `<g class="vis" data-k="${k}"><circle r="12"/><text y="4">${iniciais(js[k].nome)}</text></g>`).join('')}</g>` : '';
    return `<svg class="mapa" id="${o.id || 'mapa'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa da vila">
      <rect class="chao" x="0" y="0" width="${W}" height="${H}" rx="22"/>
      <g class="estrelas">${ESTRELAS.map(s => `<circle cx="${s.x}" cy="${s.y}" r="${s.r}"/>`).join('')}</g>
      ${estradas}
      <circle class="praca" cx="${C.x}" cy="${C.y}" r="30"/>
      <text class="fogo" x="${C.x}" y="${C.y + 9}">🔥</text>
      <line class="olhar" id="${o.id || 'mapa'}-olhar" x1="0" y1="0" x2="0" y2="0" style="display:none"/>
      ${casas}
      ${vis}
      ${meIdx >= 0 ? `<g class="eu" id="${o.id || 'mapa'}-eu" transform="translate(${porta(meIdx, n).x},${porta(meIdx, n).y})"><circle r="14"/><text y="6">🚶</text></g>` : ''}
    </svg>`;
  }

  // anima o bonequinho (ou o olhar) até a casa escolhida
  function animar(o) {
    const id = o.id || 'mapa';
    const root = document.getElementById(id); if (!root) return;
    const js = o.jogadores, n = js.length;
    const meIdx = js.findIndex(j => j.id === o.meId);
    const alvoIdx = js.findIndex(j => j.id === o.sel);
    const eu = document.getElementById(id + '-eu');
    const olhar = document.getElementById(id + '-olhar');
    if (meIdx < 0 || !eu) return;
    const casa = porta(meIdx, n);
    const key = id + ':' + o.modo + ':' + o.sel + ':' + (o.chave || '');
    const jaFeito = anim.key === key;
    cancelAnimationFrame(anim.raf);
    anim.key = key;
    const place = (pt, flip) => eu.setAttribute('transform', `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})${flip ? ' scale(-1,1)' : ''}`);
    // quem estava na casa aparece em roda, um pouco à frente da porta
    const mostrarVistos = idx => {
      const g = root.querySelector('.vistos'); if (!g) return;
      const c = porta(idx, n, 70);
      const vs = [...g.querySelectorAll('.vis')];
      const r = vs.length > 1 ? 15 + vs.length * 3 : 0;
      vs.forEach((v, k) => {
        const a = (2 * Math.PI * k) / vs.length - Math.PI / 2;
        v.setAttribute('transform', `translate(${(c.x + r * Math.cos(a)).toFixed(1)},${(c.y + r * Math.sin(a)).toFixed(1)})`);
      });
      g.classList.add('show');
    };

    if (alvoIdx < 0 || o.modo === 'parado') { place(casa); mostrarVistos(meIdx); return; }

    if (o.modo === 'olha') {
      place(casa);
      const p = pos(alvoIdx, n);
      olhar.setAttribute('x1', casa.x); olhar.setAttribute('y1', casa.y);
      olhar.setAttribute('x2', p.x); olhar.setAttribute('y2', p.y);
      olhar.style.display = '';
      olhar.classList.toggle('anima', !jaFeito);
      mostrarVistos(alvoIdx);
      return;
    }

    // anda: casa -> praça -> casa escolhida
    const destino = porta(alvoIdx, n);
    if (alvoIdx === meIdx) { place(casa); mostrarVistos(meIdx); return; }
    const pts = [casa, { x: C.x, y: C.y + 4 }, destino];
    const segs = [Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y)];
    const total = segs[0] + segs[1];
    if (jaFeito) { place(destino, destino.x > C.x); mostrarVistos(alvoIdx); return; }
    const dur = Math.max(900, total / 0.13); // ~130 px/s
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      let d = e * total, a, b;
      if (d <= segs[0]) { a = pts[0]; b = pts[1]; d = d / (segs[0] || 1); }
      else { a = pts[1]; b = pts[2]; d = (d - segs[0]) / (segs[1] || 1); }
      const pt = { x: a.x + (b.x - a.x) * d, y: a.y + (b.y - a.y) * d - Math.abs(Math.sin(t * Math.PI * 10)) * 3 };
      place(pt, b.x > a.x);
      if (t < 1) anim.raf = requestAnimationFrame(step);
      else mostrarVistos(alvoIdx);
    };
    anim.raf = requestAnimationFrame(step);
  }

  function bind(o, onPick) {
    const root = document.getElementById(o.id || 'mapa'); if (!root) return;
    root.querySelectorAll('.casa-m.pode').forEach(g => g.addEventListener('click', () => onPick(+g.dataset.id)));
    animar(o);
  }

  return { svg, bind };
})();
