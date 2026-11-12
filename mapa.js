'use strict';
// ============================================================
// Mapa da vila: casinhas em volta da praça, na ordem da roda.
// Mostra o SEU caminho (nunca o dos outros).
// Se existirem img/mapa-dia.jpg e img/mapa-noite.jpg, viram o fundo.
// ============================================================

const MAPA = (() => {
  const W = 360, H = 440, C = { x: 180, y: 222 };
  const RX = 128, RY = 168;
  let anim = { key: '', raf: 0 };

  // ---------- imagem de fundo opcional (feita no Gemini, por exemplo) ----------
  const FUNDO = { dia: null, noite: null };
  const api = { onFundo: null };
  ['dia', 'noite'].forEach(k => {
    const src = `img/mapa-${k}.jpg`;
    const im = new Image();
    im.onload = () => { FUNDO[k] = src; if (api.onFundo) api.onFundo(); };
    im.src = src;
  });

  // ---------- geometria ----------
  function pos(i, n) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: C.x + RX * Math.cos(a), y: C.y + RY * Math.sin(a) };
  }
  // ponto entre a casa e a praça ("porta")
  function porta(i, n, dist = 46) {
    const p = pos(i, n), dx = C.x - p.x, dy = C.y - p.y, d = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / d) * dist, y: p.y + (dy / d) * dist };
  }

  // ---------- enfeites fixos (cantos e bordas, longe das casas) ----------
  const ENFEITES = [
    [24, 30, '🌳', 30], [60, 18, '🌲', 22], [300, 22, '🌳', 26], [18, 140, '🌲', 22], [344, 150, '🌲', 22],
    [16, 300, '🌳', 26], [346, 300, '🌳', 24], [26, 412, '🐴', 26], [62, 428, '🌾', 18], [96, 420, '🌾', 16],
    [334, 414, '🌳', 28], [296, 428, '🐄', 22], [262, 432, '🌾', 16],
  ];
  const TUFOS = Array.from({ length: 40 }, (_, k) => ({ x: (k * 97 + 13) % W, y: (k * 61 + 29) % H }));
  const ESTRELAS = Array.from({ length: 30 }, (_, k) => ({ x: (k * 137) % W, y: (k * 89) % H, r: k % 3 ? 0.9 : 1.6 }));

  const ini = nome => esc(String(nome).replace(/^Bot /, '').slice(0, 2));
  const curto = nome => esc(String(nome).length > 11 ? String(nome).slice(0, 10) + '…' : nome);

  // bolinha com foto (ou iniciais / 🤖)
  function bolinha(j, r, clip, extra = '') {
    if (j && j.foto) {
      return `<circle class="aro" r="${r + 2}"/><image href="${j.foto}" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>${extra}`;
    }
    const txt = j && j.bot ? '🤖' : ini(j ? j.nome : '?');
    return `<circle class="aro" r="${r + 2}"/><circle class="bg" r="${r}"/><text class="ini" y="${r * 0.36}" style="font-size:${r * 0.95}px">${txt}</text>${extra}`;
  }

  /**
   * o: { id, jogadores, meId, sel, clicavel(j), pronto, modo: 'anda'|'olha'|'parado', vistos:[ids], noite, chave }
   */
  function svg(o) {
    const id = o.id || 'mapa';
    const js = o.jogadores, n = js.length;
    const meIdx = js.findIndex(j => j.id === o.meId);
    const me = js[meIdx];
    const fundo = FUNDO[o.noite ? 'noite' : 'dia'];

    const estradas = fundo ? '' : `
      <ellipse class="anel" cx="${C.x}" cy="${C.y}" rx="${RX}" ry="${RY}"/>
      ${js.map((j, i) => { const p = pos(i, n); return `<line class="estrada" x1="${C.x}" y1="${C.y}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/>`; }).join('')}`;

    const cenario = fundo
      ? `<image href="${fundo}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id}-moldura)"/>`
      : `<rect class="chao" x="0" y="0" width="${W}" height="${H}" rx="22" fill="url(#${id}-grama)"/>
         <g class="tufos">${TUFOS.map(t => `<path d="M${t.x},${t.y} l2,-6 l2,6 m-1,0 l3,-4"/>`).join('')}</g>
         <g class="estrelas">${ESTRELAS.map(s => `<circle cx="${s.x}" cy="${s.y}" r="${s.r}"/>`).join('')}</g>
         ${estradas}
         <circle class="praca" cx="${C.x}" cy="${C.y}" r="34"/>
         <circle class="praca-in" cx="${C.x}" cy="${C.y}" r="24"/>
         <g class="enfeites">${ENFEITES.map(([x, y, e, f]) => `<text x="${x}" y="${y}" style="font-size:${f}px">${e}</text>`).join('')}</g>
         <text class="astro" x="${W - 30}" y="64">${o.noite ? '🌙' : '☀️'}</text>`;

    const casas = js.map((j, i) => {
      const p = pos(i, n);
      const mine = j.id === o.meId, on = o.sel === j.id;
      const pode = o.clicavel ? o.clicavel(j) : false;
      const ic = !j.vivo ? '🏚️' : mine ? '🏡' : '🏠';
      return `<g class="casa-m ${on ? 'on' : ''} ${pode ? 'pode' : 'off'} ${j.vivo ? '' : 'morta'}" data-id="${j.id}" transform="translate(${p.x.toFixed(1)},${p.y.toFixed(1)})">
        ${o.noite && j.vivo ? '<circle class="luz" r="34"/>' : ''}
        <circle class="hl" r="29"/>
        <text class="ic" y="11">${ic}</text>
        <g class="dono" transform="translate(-22,-19)">${bolinha(j, 10, id + '-c10')}</g>
        <text class="nm" y="42">${mine ? 'Sua casa' : curto(j.nome)}</text>
        ${o.pronto && j.vivo && j.pronto ? '<text class="ok" x="21" y="-14">✓</text>' : ''}
      </g>`;
    }).join('');

    const vistos = (o.vistos || []).map(v => js.findIndex(j => j.id === v)).filter(k => k >= 0);
    const vis = vistos.length ? `<g class="vistos">${vistos.map(k =>
      `<g class="vis" data-k="${k}">${bolinha(js[k], 12, id + '-c12')}<text class="vn" y="25">${curto(js[k].nome)}</text></g>`).join('')}</g>` : '';

    const eu = meIdx >= 0 ? (() => {
      const pt = porta(meIdx, n);
      const corpo = me.foto ? bolinha(me, 15, id + '-c15') : `<circle class="aro" r="17"/><circle class="bg" r="15"/><text class="anda" y="6">🚶</text>`;
      return `<g class="eu" id="${id}-eu" transform="translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})">${corpo}<text class="vn eu-n" y="29">Você</text></g>`;
    })() : '';

    return `<svg class="mapa ${o.noite ? 'noite' : 'dia'} ${fundo ? 'com-fundo' : ''}" id="${id}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa da vila">
      <defs>
        <radialGradient id="${id}-grama" cx="50%" cy="50%" r="70%">
          <stop offset="0" class="g0"/><stop offset="1" class="g1"/>
        </radialGradient>
        <clipPath id="${id}-moldura"><rect x="0" y="0" width="${W}" height="${H}" rx="22"/></clipPath>
        ${[10, 12, 15].map(r => `<clipPath id="${id}-c${r}"><circle r="${r}"/></clipPath>`).join('')}
      </defs>
      ${cenario}
      <text class="fogo" x="${C.x}" y="${C.y + 10}">🔥</text>
      <line class="olhar" id="${id}-olhar" x1="0" y1="0" x2="0" y2="0" style="display:none"/>
      ${casas}
      ${vis}
      ${eu}
    </svg>`;
  }

  // ---------- animação ----------
  function animar(o) {
    const id = o.id || 'mapa';
    const root = document.getElementById(id); if (!root) return;
    const js = o.jogadores, n = js.length;
    const meIdx = js.findIndex(j => j.id === o.meId);
    const alvoIdx = js.findIndex(j => j.id === o.sel);
    const eu = document.getElementById(id + '-eu');
    const olhar = document.getElementById(id + '-olhar');
    if (meIdx < 0 || !eu) return;
    const anda = eu.querySelector('.anda');
    const casa = porta(meIdx, n);
    const key = id + ':' + o.modo + ':' + o.sel + ':' + (o.chave || '');
    const jaFeito = anim.key === key;
    cancelAnimationFrame(anim.raf);
    anim.key = key;
    const place = (pt, direita) => {
      eu.setAttribute('transform', `translate(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
      if (anda) anda.setAttribute('transform', direita ? 'scale(-1,1)' : '');
    };
    // quem estava na casa aparece em roda, um pouco à frente da porta
    const mostrarVistos = idx => {
      const g = root.querySelector('.vistos'); if (!g) return;
      const c = porta(idx, n, 94);
      const vs = [...g.querySelectorAll('.vis')];
      const r = vs.length > 1 ? 20 + vs.length * 4 : 0;
      vs.forEach((v, k) => {
        const a = (2 * Math.PI * k) / vs.length - Math.PI / 2;
        v.setAttribute('transform', `translate(${(c.x + r * Math.cos(a)).toFixed(1)},${(c.y + r * Math.sin(a)).toFixed(1)})`);
      });
      g.classList.add('show');
    };

    if (alvoIdx < 0 || o.modo === 'parado' || alvoIdx === meIdx) { place(casa); mostrarVistos(meIdx); return; }

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
    if (jaFeito) { place(destino, destino.x > C.x); mostrarVistos(alvoIdx); return; }
    const pts = [casa, { x: C.x, y: C.y }, destino];
    const segs = [Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y)];
    const total = segs[0] + segs[1];
    const dur = Math.max(1000, total / 0.13); // ~130 px/s
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

  return Object.assign(api, { svg, bind, bolinha });
})();
