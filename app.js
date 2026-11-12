'use strict';
// ============================================================
// Mistério no CTG — jogo de dedução em roda, cada um no celular.
// Sem servidor: a partida é gerada a partir de uma "semente" que
// vai no link. Todo celular monta exatamente a mesma partida.
// ============================================================

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- aleatório com semente ----------
function hash(str) { // cyrb53
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function makeRng(seed) {
  let a = hash(seed) % 4294967296;
  const next = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: n => Math.floor(next() * n),
    shuffle: arr => {
      const b = arr.slice();
      for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
      return b;
    },
  };
}

// ---------- código da partida (vai no link) ----------
const MIN_P = 6, MAX_P = 8;
function encodeCfg(cfg) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(cfg)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeCfg(code) {
  try {
    let s = String(code || '').trim();
    const m = s.match(/[#&?]j=([A-Za-z0-9_-]+)/);
    if (m) s = m[1];
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const cfg = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!cfg || !cfg.s || !Array.isArray(cfg.p) || cfg.p.length < MIN_P || cfg.p.length > MAX_P) return null;
    return cfg;
  } catch (e) { return null; }
}
const shareLink = cfg => location.origin + location.pathname + '#j=' + encodeCfg(cfg);

// ---------- geração da partida ----------
function generate(cfg) {
  const r = makeRng(cfg.s + '|partida');
  const n = cfg.p.length;
  const P = cfg.p.map((name, i) => ({ i, name }));
  const sus = P.map(p => ({ id: 's' + p.i, tipo: 's', nome: p.name, icon: '🕵️' }));
  const arm = ARMAS.map(a => ({ ...a, id: 'a:' + a.id, tipo: 'a' }));
  const loc = LOCAIS.map(l => ({ ...l, id: 'l:' + l.id, tipo: 'l' }));
  const cards = [...sus, ...arm, ...loc];
  const sol = { s: sus[r.int(sus.length)].id, a: arm[r.int(arm.length)].id, l: loc[r.int(loc.length)].id };
  const solSet = new Set(Object.values(sol));
  const deck = r.shuffle(cards.filter(c => !solSet.has(c.id)));
  const hand = P.map(() => []);
  const start = r.int(n);
  deck.forEach((c, k) => hand[(start + k) % n].push(c.id));
  return { P, n, cards, byId: Object.fromEntries(cards.map(c => [c.id, c])), sus, arm, loc, sol, hand, ctg: cfg.c || 'CTG', vitima: cfg.vt || 'o Patrão' };
}
const owner = cid => G.hand.findIndex(h => h.includes(cid));
const cardName = cid => { const c = G.byId[cid]; return c ? `${c.icon} ${c.nome}` : '?'; };

// ---------- estado salvo no celular ----------
let CFG = null, G = null, ST = null, D = null;
const KEY = () => 'ctg2:' + CFG.s;
function load() {
  try { ST = JSON.parse(localStorage.getItem(KEY())) || null; } catch (e) { ST = null; }
  ST = Object.assign({ me: null, grid: {}, hist: [], notes: '', acc: null }, ST || {});
}
function save() { try { localStorage.setItem(KEY(), JSON.stringify(ST)); localStorage.setItem('ctg2:last', encodeCfg(CFG)); } catch (e) {} }

// ---------- navegação ----------
const app = () => $('#app');
let tab = 'cartas';
function go(view) { window.scrollTo(0, 0); VIEWS[view](); }
function startFromCfg(cfg) {
  CFG = cfg; G = generate(cfg); load(); D = null;
  if (ST.me === null) go('pick'); else { tab = 'cartas'; go('game'); }
}
function boot() {
  const cfg = location.hash.includes('j=') ? decodeCfg(location.hash) : null;
  cfg ? startFromCfg(cfg) : go('home');
}

const VIEWS = {
  home() {
    const last = decodeCfg(safeGet('ctg2:last'));
    app().innerHTML = `
      <div class="hero">
        <div class="hero-icon">🔍</div>
        <h1>Mistério no CTG</h1>
        <p class="sub">Quem foi? Com o quê? Onde?</p>
      </div>
      <div class="card paper">
        <p>Um crime aconteceu no CTG, e os suspeitos são vocês. Sentados em roda, cada um com seu celular, descubram <b>quem</b> foi, <b>com qual arma</b> e <b>em que lugar</b>.</p>
        <p class="muted">De ${MIN_P} a ${MAX_P} jogadores.</p>
      </div>
      <button class="btn big" data-go="create">➕ Criar partida</button>
      <button class="btn big alt" data-go="join">🎟️ Entrar com link ou código</button>
      ${last ? `<button class="btn big ghost" id="resume">↩️ Voltar pra última partida</button>` : ''}
      <button class="btn ghost" data-go="rules">📖 Como jogar</button>`;
    $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    if (last) $('#resume').onclick = () => { history.replaceState(null, '', '#j=' + encodeCfg(last)); startFromCfg(last); };
  },

  rules() {
    app().innerHTML = `<button class="btn ghost small" id="back">← Voltar</button>${RULES_HTML}`;
    $('#back').onclick = () => (G && ST && ST.me !== null) ? go('game') : go('home');
  },

  create() {
    const rows = VIEWS._rows = VIEWS._rows || Array(MIN_P).fill('');
    const render = () => {
      app().innerHTML = `
        <button class="btn ghost small" id="back">← Voltar</button>
        <h2>Nova partida</h2>
        <label class="lbl">Nome do CTG</label>
        <input id="ctg" class="inp" placeholder="Ex.: CTG Sentinela da Querência" value="${esc(VIEWS._ctg || '')}">
        <label class="lbl">Quem é a vítima?</label>
        <input id="vt" class="inp" placeholder="Ex.: o Patrão" value="${esc(VIEWS._vt || '')}">
        <label class="lbl">Jogadores (${MIN_P} a ${MAX_P})</label>
        <p class="muted small">Coloque <b>na ordem em que estão sentados</b>, seguindo a roda para a esquerda.</p>
        ${rows.map((n, i) => `
          <div class="row">
            <span class="seat">${i + 1}</span>
            <input class="inp nm" data-i="${i}" placeholder="Jogador ${i + 1}" value="${esc(n)}">
            ${rows.length > MIN_P ? `<button class="x" data-i="${i}" aria-label="Remover">✕</button>` : ''}
          </div>`).join('')}
        ${rows.length < MAX_P ? '<button class="btn ghost small" id="add">+ Adicionar jogador</button>' : ''}
        <p class="err" id="err"></p>
        <button class="btn big" id="gen">🎲 Sortear partida</button>`;
      $('#back').onclick = () => go('home');
      $('#ctg').oninput = e => VIEWS._ctg = e.target.value;
      $('#vt').oninput = e => VIEWS._vt = e.target.value;
      $$('.nm').forEach(el => el.oninput = () => rows[el.dataset.i] = el.value);
      $$('.x').forEach(el => el.onclick = () => { rows.splice(+el.dataset.i, 1); render(); });
      if ($('#add')) $('#add').onclick = () => { rows.push(''); render(); };
      $('#gen').onclick = () => {
        const p = rows.map(n => n.trim());
        if (p.some(n => !n)) return $('#err').textContent = 'Preencha o nome de todos os jogadores.';
        if (new Set(p.map(n => n.toLowerCase())).size !== p.length) return $('#err').textContent = 'Tem nome repetido. Use apelidos diferentes.';
        CFG = { s: Math.random().toString(36).slice(2, 10), c: $('#ctg').value.trim() || 'CTG', vt: $('#vt').value.trim() || 'o Patrão', p };
        go('share');
      };
    };
    render();
  },

  share() {
    const link = shareLink(CFG), code = encodeCfg(CFG);
    app().innerHTML = `
      <h2>Partida pronta!</h2>
      <div class="card paper">
        <p><b>1.</b> Mande o link no grupo.</p>
        <p><b>2.</b> Cada um abre no próprio celular e escolhe o seu nome.</p>
        <p><b>3.</b> Você também entra e escolhe o seu.</p>
      </div>
      ${navigator.share ? '<button class="btn big" id="sh">📤 Compartilhar link</button>' : ''}
      <button class="btn big alt" id="cp">📋 Copiar link</button>
      <details class="card"><summary>O link não abriu? Use o código</summary>
        <p class="muted">Cole em "Entrar com link ou código":</p>
        <textarea class="inp code" readonly>${esc(code)}</textarea>
      </details>
      <button class="btn big" id="enter">➡️ Entrar na partida</button>`;
    if ($('#sh')) $('#sh').onclick = () => navigator.share({ title: 'Mistério no CTG', text: 'Partida de Mistério no CTG. Abre e escolhe teu nome:', url: link }).catch(() => {});
    $('#cp').onclick = () => copy(link, $('#cp'));
    $('#enter').onclick = () => { history.replaceState(null, '', '#j=' + code); startFromCfg(CFG); };
  },

  join() {
    app().innerHTML = `
      <button class="btn ghost small" id="back">← Voltar</button>
      <h2>Entrar na partida</h2>
      <p>Cole o link ou o código que o anfitrião mandou:</p>
      <textarea id="code" class="inp code" placeholder="https://...#j=..."></textarea>
      <p class="err" id="err"></p>
      <button class="btn big" id="go">Entrar</button>`;
    $('#back').onclick = () => go('home');
    $('#go').onclick = () => {
      const cfg = decodeCfg($('#code').value);
      if (!cfg) return $('#err').textContent = 'Código inválido. Confere se copiou inteiro.';
      history.replaceState(null, '', '#j=' + encodeCfg(cfg));
      startFromCfg(cfg);
    };
  },

  pick() {
    app().innerHTML = `
      <h2>Quem é você?</h2>
      <p class="muted">Escolha <b>só o seu nome</b>. Suas cartas são secretas.</p>
      ${G.P.map(p => `<button class="btn big ghost pickme" data-i="${p.i}"><span class="seat">${p.i + 1}</span> ${esc(p.name)}</button>`).join('')}`;
    $$('.pickme').forEach(b => b.onclick = () => {
      if (!confirm(`Confirma: você é ${G.P[b.dataset.i].name}?`)) return;
      ST.me = +b.dataset.i; save(); tab = 'cartas'; go('game');
    });
  },

  game() {
    const me = G.P[ST.me];
    const tabs = [['cartas', '🃏', 'Cartas'], ['palpite', '💬', 'Palpite'], ['responder', '🙋', 'Responder'], ['caderneta', '📒', 'Caderneta'], ['acusar', '⚖️', 'Acusar']];
    app().innerHTML = `
      <header class="top">
        <div><div class="ctg">${esc(G.ctg)}</div><div class="who">${esc(me.name)}</div></div>
        <button class="btn ghost small" id="menu">☰</button>
      </header>
      <main id="tab"></main>
      <nav class="tabs">${tabs.map(([id, ic, nm]) => `<button data-t="${id}" class="${tab === id ? 'on' : ''}"><span>${ic}</span>${nm}</button>`).join('')}</nav>`;
    $$('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; go('game'); });
    $('#menu').onclick = menu;
    TABS[tab]($('#tab'), me);
    keepAwake();
  },
};

function menu() {
  const ch = prompt('Menu:\n1 = Como jogar\n2 = Copiar link da partida\n3 = Trocar de jogador neste celular\n4 = Sair', '1');
  if (ch === '1') go('rules');
  else if (ch === '2') copy(shareLink(CFG));
  else if (ch === '3') { if (confirm('Trocar de jogador? As anotações ficam salvas.')) { ST.me = null; save(); go('pick'); } }
  else if (ch === '4') { history.replaceState(null, '', location.pathname); G = null; go('home'); }
}

// ---------- abas ----------
const TABS = {
  cartas(el, me) {
    const mine = G.hand[me.i];
    el.innerHTML = `
      <div class="card paper story">
        <p><b>${esc(capital(G.vitima))}</b> foi encontrado(a) desacordado(a) no <b>${esc(G.ctg)}</b>.</p>
        <p>Os suspeitos são vocês. Descubram <b>quem</b>, <b>com o quê</b> e <b>onde</b>.</p>
      </div>
      <div id="cover" class="cover">
        <div class="hero-icon">🤫</div>
        <p><b>Suas cartas</b><br>Esconda a tela antes de abrir.</p>
        <button class="btn big" id="open">Ver minhas cartas</button>
      </div>
      <div id="secret" hidden>
        <p class="muted small">Estas cartas <b>não</b> são a resposta. Você tem ${mine.length}.</p>
        <div class="grid-cards">${mine.map(cid => bigCard(cid)).join('')}</div>
        <button class="btn ghost" id="close">🙈 Esconder</button>
      </div>
      <h3 class="sec">🪑 A roda</h3>
      <div class="card">${G.P.map(p => `<div class="loc-row"><span class="seat">${p.i + 1}</span> ${esc(p.name)} <span class="muted small">· ${G.hand[p.i].length} cartas</span>${p.i === me.i ? ' <span class="tag">você</span>' : ''}</div>`).join('')}</div>`;
    $('#open').onclick = () => { $('#cover').hidden = true; $('#secret').hidden = false; };
    $('#close').onclick = () => { $('#cover').hidden = false; $('#secret').hidden = true; };
  },

  palpite(el, me) {
    if (!D) D = { asker: me.i, s: '', a: '', l: '', resp: {} };
    const order = respOrder(D.asker);
    const ready = D.s && D.a && D.l;
    let ended = false;
    const rows = order.map(p => {
      if (ended) return `<div class="resp off"><span class="seat">${p + 1}</span> ${esc(G.P[p].name)} <span class="muted small">— não precisa responder</span></div>`;
      const r = D.resp[p] || {};
      if (r.r === 'yes') ended = true;
      const pick = r.r === 'yes' && D.asker === me.i
        ? `<select class="inp rc" data-p="${p}"><option value="">Qual carta te mostrou?</option>${[D.s, D.a, D.l].map(c => `<option value="${c}" ${r.card === c ? 'selected' : ''}>${esc(cardName(c))}</option>`).join('')}</select>` : '';
      const isMe = p === me.i;
      return `<div class="resp">
        <div><span class="seat">${p + 1}</span> <b>${esc(G.P[p].name)}</b>${isMe ? ' <span class="tag">você</span>' : ''}</div>
        <div class="row">
          <button class="btn small ${r.r === 'no' ? '' : 'ghost'} rb" data-p="${p}" data-r="no">Não tem</button>
          <button class="btn small ${r.r === 'yes' ? 'alt' : 'ghost'} rb" data-p="${p}" data-r="yes">Mostrou carta</button>
        </div>${pick}
      </div>`;
    }).join('');
    el.innerHTML = `
      <p class="muted small">Use aqui para <b>anotar qualquer palpite</b> feito na roda, seu ou dos outros. A caderneta é preenchida sozinha.</p>
      <div class="card">
        <label class="lbl">Quem palpitou?</label>
        <select class="inp" id="asker">${G.P.map(p => `<option value="${p.i}" ${p.i === D.asker ? 'selected' : ''}>${esc(p.name)}${p.i === me.i ? ' (você)' : ''}</option>`).join('')}</select>
        <label class="lbl">Suspeito</label>${sel('s', G.sus)}
        <label class="lbl">Arma</label>${sel('a', G.arm)}
        <label class="lbl">Local</label>${sel('l', G.loc)}
      </div>
      ${ready ? `
        <div class="card paper says">“Acho que foi <b>${esc(G.byId[D.s].nome)}</b>, com ${G.byId[D.a].art} <b>${esc(G.byId[D.a].nome)}</b>, ${G.byId[D.l].em} <b>${esc(G.byId[D.l].nome)}</b>.”</div>
        <h3 class="sec">Respostas, seguindo a roda</h3>
        ${rows}
        <button class="btn big" id="savep">💾 Salvar na caderneta</button>
        <button class="btn ghost small" id="clr">Limpar</button>` : '<p class="muted center">Escolha suspeito, arma e local.</p>'}
      ${ST.hist.length ? `<h3 class="sec">📜 Histórico</h3>${ST.hist.slice().reverse().map(histRow).join('')}` : ''}`;
    $('#asker').onchange = e => { D.asker = +e.target.value; D.resp = {}; go('game'); };
    $$('.ps').forEach(s => s.onchange = () => { D[s.dataset.k] = s.value; D.resp = {}; go('game'); });
    $$('.rb').forEach(b => b.onclick = () => {
      const p = +b.dataset.p;
      // se alguém mostrou, quem vem depois não responde; ao mudar, limpa os seguintes
      const idx = order.indexOf(p);
      order.slice(idx + 1).forEach(q => delete D.resp[q]);
      D.resp[p] = { r: b.dataset.r }; go('game');
    });
    $$('.rc').forEach(s => s.onchange = () => { D.resp[s.dataset.p].card = s.value; });
    if ($('#clr')) $('#clr').onclick = () => { D = null; go('game'); };
    if ($('#savep')) $('#savep').onclick = () => {
      const resp = [];
      for (const p of order) { const r = D.resp[p]; if (!r) break; resp.push({ p, ...r }); if (r.r === 'yes') break; }
      if (!resp.length) return alert('Marque pelo menos uma resposta.');
      const cs = [D.s, D.a, D.l];
      for (const r of resp) {
        if (r.r === 'no') cs.forEach(c => setCell(c, r.p, 2));
        else if (r.card) setCell(r.card, r.p, 1);
      }
      ST.hist.push({ asker: D.asker, cs, resp });
      save(); D = null; tab = 'caderneta'; go('game');
    };
  },

  responder(el, me) {
    const R = TABS._r = TABS._r || { s: '', a: '', l: '' };
    const mine = G.hand[me.i];
    const ready = R.s && R.a && R.l;
    const match = ready ? [R.s, R.a, R.l].filter(c => mine.includes(c)) : [];
    el.innerHTML = `
      <p class="muted small">Alguém fez um palpite e é a sua vez de responder? Marque o que a pessoa disse:</p>
      <div class="card">
        <label class="lbl">Suspeito</label>${sel('s', G.sus, R)}
        <label class="lbl">Arma</label>${sel('a', G.arm, R)}
        <label class="lbl">Local</label>${sel('l', G.loc, R)}
      </div>
      ${!ready ? '' : match.length ? `
        <div class="card paper"><p>Você tem <b>${match.length}</b> ${match.length > 1 ? 'dessas cartas. Escolha <b>uma</b>' : 'dessas cartas. Toque nela'} e mostre a tela <b>só para quem perguntou</b>.</p></div>
        <div class="grid-cards">${match.map(c => `<button class="cardbtn" data-c="${c}">${bigCard(c)}</button>`).join('')}</div>` : `
        <div class="card innocent"><h3>Você não tem nenhuma.</h3><p>Diga "não tenho". A vez passa para o próximo da roda.</p></div>`}
      ${ready ? '<button class="btn ghost" id="clr">Limpar</button>' : ''}`;
    $$('.ps').forEach(s => s.onchange = () => { R[s.dataset.k] = s.value; go('game'); });
    $$('.cardbtn').forEach(b => b.onclick = () => showCard(b.dataset.c));
    if ($('#clr')) $('#clr').onclick = () => { TABS._r = null; go('game'); };
  },

  caderneta(el, me) {
    const groups = [['🕵️ Suspeitos', G.sus], ['🗡️ Armas', G.arm], ['📍 Locais', G.loc]];
    const ini = p => esc(G.P[p].name.slice(0, 2));
    el.innerHTML = `
      <p class="muted small">Toque numa casa: ✔ tem · ✖ não tem · ? talvez. As linhas riscadas já foram descartadas. 🎯 = ninguém tem (é a resposta!).</p>
      <div class="sheet-wrap"><table class="sheet">
        <thead><tr><th></th>${G.P.map(p => `<th class="${p.i === me.i ? 'meh' : ''}">${ini(p.i)}</th>`).join('')}</tr></thead>
        ${groups.map(([t, list]) => `<tbody><tr class="gh"><td colspan="${G.n + 1}">${t}</td></tr>
          ${list.map(c => {
            const vals = G.P.map(p => cell(c.id, p.i));
            const out = vals.some(v => v === 1), sol = vals.every(v => v === 2);
            return `<tr class="${out ? 'out' : ''} ${sol ? 'sol' : ''}"><td class="cn">${sol ? '🎯 ' : ''}${c.icon} ${esc(c.nome)}</td>
              ${G.P.map(p => { const v = vals[p.i], auto = autoCell(c.id, p.i) !== null;
                return `<td class="cl v${v} ${auto ? 'auto' : ''}" data-c="${c.id}" data-p="${p.i}">${['', '✔', '✖', '?'][v]}</td>`; }).join('')}</tr>`;
          }).join('')}</tbody>`).join('')}
      </table></div>
      <h3 class="sec">✍️ Anotações</h3>
      <textarea id="notes" class="inp" rows="5" placeholder="Desconfianças, quem mostrou carta pra quem…">${esc(ST.notes)}</textarea>
      <button class="btn ghost small" id="wipe">Apagar marcações da tabela</button>`;
    $$('.cl').forEach(td => td.onclick = () => {
      if (td.classList.contains('auto')) return;
      const { c, p } = td.dataset; setCell(c, +p, (cell(c, +p) + 1) % 4); save(); go('game');
    });
    $('#notes').oninput = e => { ST.notes = e.target.value; save(); };
    $('#wipe').onclick = () => { if (confirm('Apagar todas as marcações manuais?')) { ST.grid = {}; save(); go('game'); } };
  },

  acusar(el, me) {
    if (ST.acc === 'ok') return el.innerHTML = winHtml(me);
    if (ST.acc === 'wrong') {
      el.innerHTML = `<div class="card guilty center"><div class="hero-icon">❌</div><h2>Você errou a acusação</h2>
        <p>Você continua no jogo <b>mostrando cartas</b> quando for sua vez de responder, mas não pode mais fazer palpites nem acusar.</p>
        <p class="muted">Mostre esta tela pra roda.</p></div>`;
      return;
    }
    const A = TABS._a = TABS._a || { s: '', a: '', l: '' };
    el.innerHTML = `
      <div class="card paper">
        <h3>⚖️ Acusação</h3>
        <p>Só na <b>sua vez</b>. Anuncie para a roda que vai acusar, escolha as três cartas e confirme.</p>
        <p><b>Só dá pra acusar uma vez.</b> Se errar, você está fora dos palpites.</p>
      </div>
      <div class="card">
        <label class="lbl">Quem?</label>${sel('s', G.sus, A)}
        <label class="lbl">Com o quê?</label>${sel('a', G.arm, A)}
        <label class="lbl">Onde?</label>${sel('l', G.loc, A)}
      </div>
      <button class="btn big danger" id="acc">Acusar!</button>`;
    $$('.ps').forEach(s => s.onchange = () => { A[s.dataset.k] = s.value; });
    $('#acc').onclick = () => {
      if (!A.s || !A.a || !A.l) return alert('Escolha as três cartas.');
      if (!confirm(`Acusar ${G.byId[A.s].nome}, com ${G.byId[A.a].art} ${G.byId[A.a].nome}, ${G.byId[A.l].em} ${G.byId[A.l].nome}?`)) return;
      ST.acc = (A.s === G.sol.s && A.a === G.sol.a && A.l === G.sol.l) ? 'ok' : 'wrong';
      save(); go('game');
    };
  },
};

// ---------- caderneta: células ----------
function autoCell(c, p) {
  // o que eu sei com certeza: minhas próprias cartas
  const mine = G.hand[ST.me];
  if (p === ST.me) return mine.includes(c) ? 1 : 2;
  if (mine.includes(c)) return 2;
  return null;
}
function cell(c, p) { const a = autoCell(c, p); return a !== null ? a : ((ST.grid[c] || {})[p] || 0); }
function setCell(c, p, v) { if (autoCell(c, p) !== null) return; (ST.grid[c] = ST.grid[c] || {})[p] = v; if (v === 1) G.P.forEach(q => { if (q.i !== p && autoCell(c, q.i) === null) ST.grid[c][q.i] = 2; }); }

// ---------- pedaços de tela ----------
function respOrder(asker) { const o = []; for (let k = 1; k < G.n; k++) o.push((asker + k) % G.n); return o; }
function sel(k, list, src = D) {
  return `<select class="inp ps" data-k="${k}"><option value="">Escolha…</option>${list.map(c => `<option value="${c.id}" ${src[k] === c.id ? 'selected' : ''}>${c.icon} ${esc(c.nome)}</option>`).join('')}</select>`;
}
const TIPO = { s: 'Suspeito', a: 'Arma', l: 'Local' };
function bigCard(cid) { const c = G.byId[cid]; return `<div class="bigcard t-${c.tipo}"><div class="bc-t">${TIPO[c.tipo]}</div><div class="bc-i">${c.icon}</div><div class="bc-n">${esc(c.nome)}</div></div>`; }
function showCard(cid) {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<p>Mostre só para quem perguntou</p>${bigCard(cid)}<button class="btn big">Pronto, esconder</button>`;
  o.querySelector('button').onclick = () => o.remove();
  document.body.appendChild(o);
}
function histRow(h) {
  const nm = p => esc(G.P[p].name);
  const r = h.resp.map(x => x.r === 'no' ? `${nm(x.p)} ✖` : `${nm(x.p)} mostrou ${x.card ? '<b>' + esc(cardName(x.card)) + '</b>' : 'uma carta'}`).join(' · ');
  return `<div class="card hist"><b>${nm(h.asker)}</b>: ${h.cs.map(c => esc(cardName(c))).join(', ')}<div class="small muted">${r}</div></div>`;
}
function winHtml() {
  return `<div class="card innocent center">
    <div class="hero-icon">🏆</div><h2>Acertou!</h2><p>Mostre pra todo mundo:</p>
    <div class="grid-cards">${[G.sol.s, G.sol.a, G.sol.l].map(bigCard).join('')}</div>
  </div>`;
}
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- utilidades ----------
function safeGet(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function copy(text, btn) {
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = '✅ Copiado!'; setTimeout(() => btn.textContent = o, 1500); } else alert('Link copiado!'); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt('Copie o link:', text));
  else prompt('Copie o link:', text);
}
let wake = null;
async function keepAwake() { try { if (!wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.onrelease = () => wake = null; } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && G && ST && ST.me !== null) keepAwake(); });

const RULES_HTML = `
  <h2>📖 Como jogar</h2>
  <div class="card paper">
    <h3>Objetivo</h3>
    <p>Três cartas estão escondidas: <b>um suspeito</b> (um de vocês), <b>uma arma</b> e <b>um local</b>. Quem descobrir as três primeiro vence.</p>
    <p>As outras cartas foram distribuídas entre os jogadores. Se uma carta está na mão de alguém, ela <b>não</b> é a resposta.</p>
  </div>
  <div class="card paper">
    <h3>Preparação</h3>
    <ul>
      <li>Sentem em roda, na mesma ordem em que os nomes foram cadastrados.</li>
      <li>Cada um abre <b>Cartas</b> e vê as suas, sem mostrar a ninguém.</li>
      <li>O jogador 1 começa. A vez passa para a esquerda.</li>
    </ul>
  </div>
  <div class="card paper">
    <h3>Na sua vez: o palpite</h3>
    <ol>
      <li>Diga em voz alta: “Acho que foi <i>Fulano</i>, com a <i>Cuia</i>, na <i>Cozinha</i>.”</li>
      <li>O jogador à sua esquerda abre <b>Responder</b> e marca as três cartas. Se tiver alguma, mostra <b>uma</b> só para você, virando a tela.</li>
      <li>Se ele não tiver nenhuma, diz “não tenho” e o próximo da roda responde. Para no primeiro que mostrar.</li>
      <li>Todos podem anotar o palpite na aba <b>Palpite</b>. A caderneta se preenche sozinha.</li>
    </ol>
  </div>
  <div class="card paper">
    <h3>Acusação</h3>
    <p>Na sua vez, se achar que sabe a resposta, use a aba <b>Acusar</b>. Acertou, venceu. Errou, você continua mostrando cartas, mas não palpita nem acusa mais.</p>
  </div>`;

window.addEventListener('hashchange', () => { const c = decodeCfg(location.hash); if (c && (!CFG || c.s !== CFG.s)) startFromCfg(c); });
boot();
