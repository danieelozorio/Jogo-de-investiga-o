'use strict';
// ============================================================
// Mistério no CTG — lógica e telas
// Sem servidor: a partida inteira é gerada a partir de uma
// "semente" que vai no link. Todo celular gera o mesmo caso.
// ============================================================

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- aleatório com semente (igual em todos os celulares) ----------
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
    pick: arr => arr[Math.floor(next() * arr.length)],
    shuffle: arr => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; }
      return a2;
    },
  };
}

// ---------- código da partida (vai no link) ----------
function encodeCfg(cfg) {
  const b = btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeCfg(code) {
  try {
    let s = code.trim();
    const m = s.match(/[#&?]j=([A-Za-z0-9_-]+)/);
    if (m) s = m[1];
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const cfg = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!cfg || !cfg.s || !Array.isArray(cfg.p) || cfg.p.length < 4 || cfg.p.length > 8) return null;
    return cfg;
  } catch (e) { return null; }
}
const shareLink = cfg => location.origin + location.pathname + '#j=' + encodeCfg(cfg);

// ---------- geração do caso ----------
const TRAIT_KEYS = ['lenco', 'calcado', 'mao'];
const LOC_KEYS = Object.keys(LOCS);
const ALPH = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const normCode = s => String(s).toUpperCase().normalize('NFD').replace(/[^A-Z0-9]/g, '');

function generate(cfg) {
  const r = makeRng(cfg.s + '|caso');
  const n = cfg.p.length;
  const roles = r.shuffle(ROLES).slice(0, n);
  const missoes = makeRng(cfg.s + '|missao').shuffle(MISSOES);
  const P = cfg.p.map(([name, g], i) => ({
    i, name, g: g === 'f' ? 'f' : 'm',
    role: roles[i], cargo: roles[i][g === 'f' ? 'f' : 'm'],
    missao: missoes[i % missoes.length],
  }));

  const culprit = r.int(n);
  let twin = r.int(n - 1); if (twin >= culprit) twin++;
  const randTraits = () => ({
    lenco: r.pick(Object.keys(TRAITS.lenco.vals)),
    calcado: r.pick(Object.keys(TRAITS.calcado.vals)),
    mao: r.pick(Object.keys(TRAITS.mao.vals)),
    loc: r.pick(LOC_KEYS),
  });
  const C = randTraits();
  Object.assign(P[culprit], C);
  // o "gêmeo": mesma aparência do culpado, outro local. Força a investigação do local.
  Object.assign(P[twin], { lenco: C.lenco, calcado: C.calcado, mao: C.mao, loc: r.pick(LOC_KEYS.filter(l => l !== C.loc)) });
  for (const p of P) {
    if (p.i === culprit || p.i === twin) continue;
    let t;
    do { t = randTraits(); } while (TRAIT_KEYS.every(k => t[k] === C[k]) && t.loc === C.loc);
    Object.assign(p, t);
  }

  // ---- pistas ----
  const clues = [];
  const add = o => { o.id = 'c' + clues.length; clues.push(o); return o; };
  const traitClues = [];
  for (const t of [...TRAIT_KEYS, 'loc']) traitClues.push(add({ kind: 'trait', trait: t, value: C[t], variant: 0 }));
  if (n >= 6) { traitClues.push(add({ kind: 'trait', trait: 'lenco', value: C.lenco, variant: 1 })); traitClues.push(add({ kind: 'trait', trait: 'loc', value: C.loc, variant: 1 })); }
  if (n >= 8) traitClues.push(add({ kind: 'trait', trait: 'mao', value: C.mao, variant: 1 }));
  const innocents = P.map(p => p.i).filter(i => i !== culprit);
  const witness = r.shuffle(innocents).map(i => add({ kind: 'witness', about: i, value: P[i].loc }));

  // pistas FALSAS do culpado (têm selo autêntico!)
  const ft = r.pick(TRAIT_KEYS);
  const wrongOpts = Object.keys(TRAITS[ft].vals).filter(v => v !== C[ft]);
  const framing = wrongOpts.filter(v => innocents.some(i => P[i][ft] === v));
  add({ kind: 'trait', trait: ft, value: r.pick(framing.length ? framing : wrongOpts), variant: r.int(2), forged: true, holder: culprit });
  add({ kind: 'witness', about: twin, value: C.loc, forged: true, holder: culprit });

  // distribui as verdadeiras entre os inocentes
  const order = r.shuffle(innocents);
  const load = Object.fromEntries(innocents.map(i => [i, 0]));
  traitClues.forEach((c, k) => { c.holder = order[k % order.length]; load[c.holder]++; });
  for (const c of witness) {
    const cands = order.filter(i => i !== c.about);
    const min = Math.min(...cands.map(i => load[i]));
    c.holder = cands.find(i => load[i] === min);
    load[c.holder]++;
  }

  // códigos
  const used = new Set();
  for (const c of clues) {
    let salt = 0, code;
    do {
      const h = hash(cfg.s + '|' + c.id + '|' + salt++);
      const pre = CODE_PREFIX[h % CODE_PREFIX.length];
      let suf = '', x = Math.floor(h / CODE_PREFIX.length);
      for (let k = 0; k < 3; k++) { suf += ALPH[x % ALPH.length]; x = Math.floor(x / ALPH.length); }
      code = pre + '-' + suf;
    } while (used.has(normCode(code)));
    used.add(normCode(code));
    c.code = code;
  }

  const events = makeRng(cfg.s + '|eventos').shuffle(EVENTS);
  return { P, culprit, twin, C, clues, events, rounds: cfg.r || 5, ctg: cfg.c || 'CTG' };
}

function clueView(c) {
  if (c.kind === 'trait') {
    const v = c.trait === 'loc' ? LOCS[c.value] : TRAITS[c.trait].vals[c.value];
    return TRAIT_CLUES[c.trait][c.variant](v);
  }
  const p = G.P[c.about], l = LOCS[c.value];
  return { icon: '👁️', title: 'Testemunho',
    text: `Pouco antes da luz cair, <b>${esc(p.name)}</b> foi visto(a) ${l.viu}.`,
    concl: `${p.name} estava em: ${l.nome}.` };
}

// ---------- estado salvo no celular ----------
let CFG = null, G = null, ST = null;
const KEY = () => 'ctg:' + CFG.s;
function load() {
  try { ST = JSON.parse(localStorage.getItem(KEY())) || null; } catch (e) { ST = null; }
  ST = Object.assign({ me: null, got: [], sus: {}, cul: {}, notes: '', round: 1, vote: null, revealed: false, miss: false }, ST || {});
}
function save() { try { localStorage.setItem(KEY(), JSON.stringify(ST)); localStorage.setItem('ctg:last', encodeCfg(CFG)); } catch (e) {} }

// ---------- navegação ----------
const app = () => $('#app');
let tab = 'ficha';
function go(view) { window.scrollTo(0, 0); VIEWS[view](); }

function startFromCfg(cfg) {
  CFG = cfg; G = generate(cfg); load();
  if (ST.me === null) go('pick'); else { tab = 'ficha'; go('game'); }
}

function boot() {
  const h = location.hash;
  if (h.includes('j=')) {
    const cfg = decodeCfg(h);
    if (cfg) return startFromCfg(cfg);
  }
  go('home');
}

const VIEWS = {
  home() {
    let last = null;
    try { last = decodeCfg(localStorage.getItem('ctg:last') || ''); } catch (e) {}
    app().innerHTML = `
      <div class="hero">
        <div class="hero-icon">🧉</div>
        <h1>Mistério no CTG</h1>
        <p class="sub">O Sumiço da Cuia de Prata</p>
      </div>
      <div class="card paper">
        <p>Noite de baile. A relíquia mais antiga do CTG some durante um apagão de 5 minutos.
        A porteira está trancada: <b>ninguém sai até descobrir quem foi.</b></p>
        <p class="muted">De 4 a 8 jogadores, cada um no seu celular, todos na mesma roda.</p>
      </div>
      <button class="btn big" data-go="create">🐎 Criar partida (sou o anfitrião)</button>
      <button class="btn big alt" data-go="join">🎟️ Entrar com link ou código</button>
      ${last ? `<button class="btn big ghost" id="resume">↩️ Voltar pra última partida (${esc(last.c || 'CTG')})</button>` : ''}
      <button class="btn ghost" data-go="rules">📖 Como jogar</button>`;
    $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    if (last) $('#resume').onclick = () => { history.replaceState(null, '', '#j=' + encodeCfg(last)); startFromCfg(last); };
  },

  rules() {
    app().innerHTML = `<button class="btn ghost small" id="back">← Voltar</button>${RULES_HTML}`;
    $('#back').onclick = () => G ? go('game') : go('home');
  },

  create() {
    const rows = [['', 'm'], ['', 'f'], ['', 'm'], ['', 'f']];
    const render = () => {
      app().innerHTML = `
        <button class="btn ghost small" id="back">← Voltar</button>
        <h2>Nova partida</h2>
        <label class="lbl">Nome do CTG</label>
        <input id="ctg" class="inp" placeholder="Ex.: CTG Sentinela da Querência" value="${esc(VIEWS._ctg || '')}">
        <label class="lbl">Jogadores (4 a 8) — use os nomes da turma!</label>
        <div id="rows">${rows.map(([n, g], i) => `
          <div class="row">
            <input class="inp nm" data-i="${i}" placeholder="Nome ${i + 1}" value="${esc(n)}">
            <button class="tog ${g}" data-i="${i}">${g === 'f' ? '🌸 Prenda' : '🤠 Peão'}</button>
            ${rows.length > 4 ? `<button class="x" data-i="${i}">✕</button>` : ''}
          </div>`).join('')}
        </div>
        ${rows.length < 8 ? '<button class="btn ghost small" id="add">+ Adicionar jogador</button>' : ''}
        <label class="lbl">Rodadas da Roda de Chimarrão</label>
        <select id="rounds" class="inp">${[3, 4, 5, 6, 7].map(k => `<option ${k === (VIEWS._r || 5) ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <p class="err" id="err"></p>
        <button class="btn big" id="gen">🎲 Sortear o caso</button>`;
      $('#back').onclick = () => go('home');
      $('#ctg').oninput = e => VIEWS._ctg = e.target.value;
      $('#rounds').onchange = e => VIEWS._r = +e.target.value;
      $$('.nm').forEach(el => el.oninput = () => rows[el.dataset.i][0] = el.value);
      $$('.tog').forEach(el => el.onclick = () => { const r = rows[el.dataset.i]; r[1] = r[1] === 'f' ? 'm' : 'f'; render(); });
      $$('.x').forEach(el => el.onclick = () => { rows.splice(+el.dataset.i, 1); render(); });
      const addB = $('#add'); if (addB) addB.onclick = () => { rows.push(['', 'm']); render(); };
      $('#gen').onclick = () => {
        const p = rows.map(([n, g]) => [n.trim(), g]);
        if (p.some(([n]) => !n)) return $('#err').textContent = 'Preencha o nome de todos os jogadores.';
        if (new Set(p.map(([n]) => n.toLowerCase())).size !== p.length) return $('#err').textContent = 'Tem nome repetido! Use apelidos diferentes.';
        const s = Math.random().toString(36).slice(2, 10);
        CFG = { v: 1, s, c: $('#ctg').value.trim() || 'CTG Querência', r: +$('#rounds').value, p };
        go('share');
      };
    };
    render();
  },

  share() {
    const link = shareLink(CFG), code = encodeCfg(CFG);
    app().innerHTML = `
      <h2>Partida pronta! 🎉</h2>
      <div class="card paper">
        <p><b>1.</b> Mande o link pro grupo da turma.</p>
        <p><b>2.</b> Cada um abre no seu celular e escolhe o próprio nome.</p>
        <p><b>3.</b> Você também escolhe o seu (aqui embaixo).</p>
      </div>
      ${navigator.share ? '<button class="btn big" id="sh">📤 Compartilhar link</button>' : ''}
      <button class="btn big alt" id="cp">📋 Copiar link</button>
      <details class="card"><summary>Não deu com o link? Use o código</summary>
        <p class="muted">Quem abrir o app pode colar este código em "Entrar com link ou código":</p>
        <textarea class="inp code" readonly>${esc(code)}</textarea>
      </details>
      <button class="btn big" id="enter">➡️ Entrar na partida</button>`;
    if ($('#sh')) $('#sh').onclick = () => navigator.share({ title: 'Mistério no CTG', text: `Bah! Partida de Mistério no CTG (${CFG.c}). Abre e escolhe teu nome:`, url: link }).catch(() => {});
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
      <p class="muted">${esc(G.ctg)} · Escolha <b>só o seu nome</b>. Sua ficha é secreta!</p>
      ${G.P.map(p => `<button class="btn big ghost pickme" data-i="${p.i}">${p.g === 'f' ? '🌸' : '🤠'} ${esc(p.name)}</button>`).join('')}`;
    $$('.pickme').forEach(b => b.onclick = () => {
      if (!confirm(`Confirma: você é ${G.P[b.dataset.i].name}?`)) return;
      ST.me = +b.dataset.i; save(); tab = 'ficha'; go('game');
    });
  },

  game() {
    const me = G.P[ST.me];
    const tabs = [['ficha', '🪪', 'Ficha'], ['suspeitos', '👥', 'Suspeitos'], ['caderneta', '📒', 'Caderneta'], ['roda', '🧉', 'Roda'], ['julgamento', '⚖️', 'Julgamento']];
    app().innerHTML = `
      <header class="top">
        <div><div class="ctg">${esc(G.ctg)}</div><div class="who">${me.role.icon} ${esc(me.name)}</div></div>
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
  const ch = prompt('Menu:\n1 = Como jogar\n2 = Copiar link da partida\n3 = Trocar de jogador neste celular\n4 = Sair (voltar ao início)', '1');
  if (ch === '1') go('rules');
  else if (ch === '2') copy(shareLink(CFG));
  else if (ch === '3') { if (confirm('Trocar de jogador? Suas anotações ficam salvas.')) { ST.me = null; save(); go('pick'); } }
  else if (ch === '4') { history.replaceState(null, '', location.pathname); G = null; go('home'); }
}

// ---------- abas ----------
const TABS = {
  ficha(el, me) {
    const mine = G.clues.filter(c => c.holder === me.i);
    const guilty = me.i === G.culprit;
    el.innerHTML = `
      <div id="cover" class="cover">
        <div class="hero-icon">🤫</div>
        <p><b>Ficha secreta</b><br>Esconda a tela dos outros antes de abrir.</p>
        <button class="btn big" id="open">Abrir minha ficha</button>
      </div>
      <div id="secret" hidden>
        <div class="card role">
          <div class="role-ic">${me.role.icon}</div>
          <div><div class="muted">Você é</div><h2>${esc(me.name)}</h2><div class="cargo">${esc(me.cargo)}</div></div>
        </div>
        ${guilty ? `
        <div class="card guilty">
          <h3>🗡️ Foi VOCÊ.</h3>
          <p>Você estava <b>${LOCS[me.loc].estava}</b> e, quando a luz caiu, correu até a Sala dos Troféus e pegou a Cuia de Prata.</p>
          <p><b>Você pode mentir à vontade.</b> Invente onde estava. Suas pistas abaixo são <b>FALSAS</b>, mas têm selo autêntico — use pra desviar a desconfiança.</p>
          <p class="muted">Dica: seu "Testemunho" falso incrimina ${esc(G.P[G.twin].name)}, que se parece muito com você.</p>
        </div>` : `
        <div class="card innocent">
          <h3>😇 Você é inocente</h3>
          <p>Antes do apagão você estava <b>${LOCS[me.loc].estava}</b>.</p>
          <p><b>Inocente não mente.</b> Pode se negar a responder ("não digo, tchê"), mas nunca falar mentira.</p>
        </div>`}
        <h3 class="sec">🔎 Suas pistas</h3>
        <p class="muted small">Pra mostrar uma pista, diga o <b>código</b>: quem recebe digita na Caderneta e o app confirma com o Selo do CTG.</p>
        ${mine.map(c => clueCard(c, guilty)).join('') || '<p class="muted">Nenhuma pista.</p>'}
        <h3 class="sec">🎯 Missão de Galpão</h3>
        <div class="card paper"><p>${esc(me.missao)}</p><p class="muted small">Vale +1 ponto no final. Ninguém pode saber!</p></div>
        <button class="btn ghost" id="close">🙈 Esconder ficha</button>
      </div>
      <h3 class="sec">📜 O caso</h3>
      <div class="card paper story">${storyHtml()}</div>`;
    $('#open').onclick = () => { $('#cover').hidden = true; $('#secret').hidden = false; };
    $('#close').onclick = () => { $('#cover').hidden = false; $('#secret').hidden = true; window.scrollTo(0, 0); };
  },

  suspeitos(el) {
    el.innerHTML = `
      <p class="muted">A aparência de todo mundo é pública. <b>Onde cada um estava</b> antes do apagão, não: tem que perguntar.</p>
      ${G.P.map(p => `
        <div class="card sus">
          <div class="sus-h"><span class="role-ic sm">${p.role.icon}</span>
            <div><b>${esc(p.name)}</b>${p.i === ST.me ? ' <span class="tag">você</span>' : ''}<div class="cargo">${esc(p.cargo)}</div></div></div>
          <div class="chips">${traitChips(p)}</div>
          <p class="small"><i>Motivo:</i> ${esc(p.role.motivo)}</p>
        </div>`).join('')}`;
  },

  caderneta(el) {
    const got = ST.got.map(id => G.clues.find(c => c.id === id)).filter(Boolean);
    const cul = ST.cul;
    const portrait = [...TRAIT_KEYS.map(k => [k, TRAITS[k].nome, TRAITS[k].vals]), ['loc', 'Local', Object.fromEntries(LOC_KEYS.map(k => [k, LOCS[k].nome]))]];
    el.innerHTML = `
      <div class="card">
        <h3>🔏 Receber pista</h3>
        <div class="row"><input id="cd" class="inp" placeholder="Ex.: CUIA-7K2" autocapitalize="characters" autocomplete="off"><button class="btn" id="ok">Conferir</button></div>
        <p id="fb" class="small"></p>
      </div>
      <h3 class="sec">📥 Pistas recebidas (${got.length})</h3>
      ${got.map(c => clueCard(c, false, true)).join('') || '<p class="muted small">Nenhuma ainda. Pede pros outros!</p>'}
      <h3 class="sec">🕵️ Retrato do culpado</h3>
      <p class="muted small">Toque: ✔️ é → ❌ não é → em branco.</p>
      <div class="card">${portrait.map(([k, nm, vals]) => `
        <div class="ptr"><div class="lbl">${nm}</div><div class="chips">${Object.entries(vals).map(([v, t]) => {
          const s = (cul[k] || {})[v] || 0; return `<button class="chip pc s${s}" data-k="${k}" data-v="${v}">${s === 1 ? '✔️ ' : s === 2 ? '❌ ' : ''}${t}</button>`;
        }).join('')}</div></div>`).join('')}
      </div>
      <h3 class="sec">👥 Suspeitos</h3>
      ${G.P.filter(p => p.i !== ST.me).map(p => {
        const s = ST.sus[p.i] || {}; const m = matches(p);
        return `<div class="card sus">
          <div class="sus-h"><button class="st st${s.st || 0}" data-i="${p.i}">${['❔', '🔴', '✅'][s.st || 0]}</button>
            <div><b>${esc(p.name)}</b> ${m ? '<span class="tag hot">🎯 bate com o retrato</span>' : ''}<div class="small muted">${traitText(p)}</div></div></div>
          <div class="row"><select class="inp sl" data-i="${p.i}"><option value="">Disse que estava em…</option>${LOC_KEYS.map(k => `<option value="${k}" ${s.loc === k ? 'selected' : ''}>${LOCS[k].nome}</option>`).join('')}</select></div>
          <input class="inp sn" data-i="${p.i}" placeholder="Anotação…" value="${esc(s.note || '')}">
        </div>`;
      }).join('')}
      <h3 class="sec">✍️ Anotações livres</h3>
      <textarea id="notes" class="inp" rows="6" placeholder="Desconfianças, contradições, causos…">${esc(ST.notes)}</textarea>`;

    const check = () => {
      const v = normCode($('#cd').value); if (!v) return;
      const c = G.clues.find(x => normCode(x.code) === v);
      const fb = $('#fb');
      if (!c) { fb.className = 'small err'; fb.textContent = '❌ Esse código não tem o Selo do CTG. Pista inventada?'; return; }
      if (c.holder === ST.me) { fb.className = 'small'; fb.textContent = 'Essa pista já é sua, vivente!'; return; }
      if (!ST.got.includes(c.id)) { ST.got.push(c.id); save(); }
      tab = 'caderneta'; go('game');
      const f2 = $('#fb'); f2.className = 'small ok'; f2.textContent = '✅ Selo do CTG confirmado! Pista adicionada.';
    };
    $('#ok').onclick = check;
    $('#cd').onkeydown = e => { if (e.key === 'Enter') check(); };
    $$('.pc').forEach(b => b.onclick = () => {
      const { k, v } = b.dataset; cul[k] = cul[k] || {}; cul[k][v] = ((cul[k][v] || 0) + 1) % 3; save(); go('game');
    });
    $$('.st').forEach(b => b.onclick = () => { const s = ST.sus[b.dataset.i] = ST.sus[b.dataset.i] || {}; s.st = ((s.st || 0) + 1) % 3; save(); go('game'); });
    $$('.sl').forEach(b => b.onchange = () => { (ST.sus[b.dataset.i] = ST.sus[b.dataset.i] || {}).loc = b.value; save(); });
    $$('.sn').forEach(b => b.oninput = () => { (ST.sus[b.dataset.i] = ST.sus[b.dataset.i] || {}).note = b.value; save(); });
    $('#notes').oninput = e => { ST.notes = e.target.value; save(); };
  },

  roda(el) {
    const k = ST.round, R = G.rounds;
    const ev = G.events[(k - 1) % G.events.length];
    el.innerHTML = `
      <div class="roundbar">
        <button class="btn ghost small" id="prev" ${k <= 1 ? 'disabled' : ''}>◀</button>
        <div><b>Rodada ${Math.min(k, R)} de ${R}</b></div>
        <button class="btn ghost small" id="next">${k >= R ? '⚖️' : '▶'}</button>
      </div>
      ${k > R ? `<div class="card paper"><h3>⚖️ Acabaram as rodadas!</h3><p>Hora do Julgamento no Fogo de Chão.</p><button class="btn big" id="tojul">Ir pro Julgamento</button></div>` : `
      <div class="card event">
        <div class="ev-ic">${ev.icon}</div>
        <h3>${ev.title}</h3>
        <p>${ev.text}</p>
      </div>
      <div class="card timer">
        <div id="clock">4:00</div>
        <div class="row center">
          <button class="btn small" id="t-go">▶ Iniciar</button>
          <button class="btn ghost small" id="t-30">30s</button>
          <button class="btn ghost small" id="t-60">1 min</button>
          <button class="btn ghost small" id="t-rs">4 min</button>
        </div>
      </div>
      <div class="card paper small">
        <b>Como funciona a rodada:</b>
        <ol>
          <li>Quem está com a <b>cuia</b> (de verdade, se tiver!) lê o evento em voz alta.</li>
          <li>Façam o que o evento manda.</li>
          <li>No resto do tempo: conversa livre, perguntas, trocas de código.</li>
          <li>Quando o tempo acabar, a cuia passa pra direita e todos avançam a rodada.</li>
        </ol>
      </div>`}`;
    $('#prev').onclick = () => { ST.round = Math.max(1, k - 1); save(); go('game'); };
    $('#next').onclick = () => { if (k >= R) { ST.round = R + 1; save(); tab = 'julgamento'; } else { ST.round = k + 1; save(); } go('game'); };
    if (k > R) { $('#tojul').onclick = () => { tab = 'julgamento'; go('game'); }; return; }
    timerBind();
  },

  julgamento(el) {
    const v = ST.vote;
    if (ST.revealed) return revealView(el);
    el.innerHTML = `
      <div class="card paper">
        <h3>⚖️ Julgamento no Fogo de Chão</h3>
        <p>Todo mundo escolhe em segredo. Depois, no "1, 2, 3, tchê!", <b>todos viram o celular ao mesmo tempo</b>.</p>
      </div>
      ${v === null ? `
        ${G.P.map(p => `<label class="vote"><input type="radio" name="v" value="${p.i}"> ${p.role.icon} ${esc(p.name)} <span class="muted small">${esc(p.cargo)}</span></label>`).join('')}
        <button class="btn big" id="lock">🔒 Cravar meu voto</button>` : `
        <div class="card bigvote"><div class="muted">Meu voto</div><div class="vname">${G.P[v].role.icon} ${esc(G.P[v].name)}</div></div>
        <button class="btn ghost small" id="unlock">Mudei de ideia (só antes de virar o celular!)</button>`}
      <hr>
      <button class="btn big danger" id="rev">🔥 Revelar a verdade</button>
      <p class="muted small center">Só aperte quando todo mundo já tiver mostrado o voto.</p>`;
    if ($('#lock')) $('#lock').onclick = () => { const c = $('input[name=v]:checked'); if (!c) return alert('Escolhe alguém, tchê!'); ST.vote = +c.value; save(); go('game'); };
    if ($('#unlock')) $('#unlock').onclick = () => { ST.vote = null; save(); go('game'); };
    $('#rev').onclick = () => { if (confirm('Todo mundo já votou e mostrou o voto?')) { ST.revealed = true; save(); go('game'); } };
  },
};

function revealView(el) {
  const c = G.P[G.culprit], tw = G.P[G.twin];
  const forged = G.clues.filter(x => x.forged);
  el.innerHTML = `
    <div class="card guilty reveal">
      <div class="hero-icon">${c.role.icon}</div>
      <div class="muted">Quem levou a Cuia de Prata foi…</div>
      <h2>${esc(c.name)}</h2><div class="cargo">${esc(c.cargo)}</div>
    </div>
    <div class="card paper story">
      <p>${esc(c.name)} estava <b>${LOCS[c.loc].estava}</b>. Quando a luz caiu, aproveitou o escuro, foi até a Sala dos Troféus e abriu a vitrine.
      Deixou pra trás ${LOCS[c.loc].vestigio}, um fio de lenço/fita ${TRAITS.lenco.vals[c.lenco].toLowerCase()}, marca de ${TRAITS.calcado.vals[c.calcado].toLowerCase()} e o mate de quem é ${TRAITS.mao.vals[c.mao].toLowerCase()}.</p>
      <p>${esc(tw.name)} tinha a mesma aparência, mas estava ${LOCS[tw.loc].estava}. Por isso ${esc(c.name)} tentou jogar a culpa nele(a).</p>
    </div>
    <h3 class="sec">🃏 As pistas falsas do culpado</h3>
    ${forged.map(x => clueCard(x, true)).join('')}
    <h3 class="sec">📍 Onde cada um estava</h3>
    <div class="card">${G.P.map(p => `<div class="loc-row">${LOCS[p.loc].icon} <b>${esc(p.name)}</b> — ${LOCS[p.loc].nome}${p.i === G.culprit ? ' 🗡️' : ''}</div>`).join('')}</div>
    <h3 class="sec">🏆 Pontuação</h3>
    <div class="card paper small">
      <ul>
        <li><b>Inocente que votou certo:</b> +3</li>
        <li><b>Culpado:</b> +5 se a maioria errou o voto</li>
        <li><b>Missão de Galpão cumprida:</b> +1 (palavra de gaúcho!)</li>
        <li><b>Quem foi apontado pelo culpado e mesmo assim se livrou:</b> +1</li>
      </ul>
      <label class="vote"><input type="checkbox" id="miss" ${ST.miss ? 'checked' : ''}> Cumpri minha missão: <i>${esc(G.P[ST.me].missao)}</i></label>
      <p>Meus pontos: <b id="pts"></b></p>
    </div>
    <button class="btn big" id="again">🎲 Nova partida com a mesma turma</button>`;
  const pts = () => {
    const me = ST.me, guilty = me === G.culprit;
    let p = 0;
    if (!guilty && ST.vote === G.culprit) p += 3;
    if (ST.miss) p += 1;
    $('#pts').textContent = guilty ? `${p} + 5 se a maioria errou` : p;
  };
  pts();
  $('#miss').onchange = e => { ST.miss = e.target.checked; save(); pts(); };
  $('#again').onclick = () => {
    const cfg = { ...CFG, s: Math.random().toString(36).slice(2, 10) };
    CFG = cfg; G = generate(cfg); load(); go('share');
  };
}

// ---------- pedaços de tela ----------
function storyHtml() {
  return `<p>Noite de baile no <b>${esc(G.ctg)}</b>. Na Sala dos Troféus, dentro da vitrine, a <b>Cuia de Prata do Fundador</b> — relíquia de 1948 que amanhã ia abrir o desfile.</p>
  <p>Às 23h, no meio de uma vaneira, <b>a luz caiu por 5 minutos</b>. Quando voltou: vitrine aberta, cuia sumida.</p>
  <p>A patronagem trancou a porteira. Só estavam lá ${G.P.length} pessoas: ${G.P.map(p => esc(p.name)).join(', ')}.
  <b>Um de vocês é o culpado.</b></p>`;
}
function clueCard(c, showForged, received) {
  const v = clueView(c);
  return `<div class="card clue ${showForged && c.forged ? 'forged' : ''}">
    <div class="clue-h"><span class="clue-ic">${v.icon}</span><b>${v.title}</b>
      ${received ? '<span class="seal">🔏 Selo</span>' : `<span class="code">${c.code}</span>`}</div>
    <p>${v.text}</p>
    <p class="concl">➜ ${esc(v.concl)}</p>
    ${showForged && c.forged ? '<p class="fk">⚠️ FALSA — só você sabe</p>' : ''}
  </div>`;
}
const COLORS = { vermelho: '#c62828', branco: '#f5f0e6', azul: '#1e5aa8' };
function traitChips(p) {
  return `<span class="chip"><i class="dot" style="background:${COLORS[p.lenco]}"></i>${TRAITS.lenco.vals[p.lenco]}</span>
    <span class="chip">${p.calcado === 'bota' ? '👢' : '🥿'} ${TRAITS.calcado.vals[p.calcado]}</span>
    <span class="chip">${p.mao === 'canhoto' ? '🫲' : '🫱'} ${TRAITS.mao.vals[p.mao]}</span>
    <span class="chip unk">📍 Local: ❓</span>`;
}
const traitText = p => TRAIT_KEYS.map(k => TRAITS[k].vals[p[k]]).join(' · ');
function matches(p) {
  let any = false;
  for (const k of TRAIT_KEYS) {
    const m = ST.cul[k] || {};
    for (const [v, s] of Object.entries(m)) {
      if (s === 1) { any = true; if (p[k] !== v) return false; }
      if (s === 2 && p[k] === v) return false;
    }
  }
  return any;
}

// ---------- cronômetro ----------
let T = { left: 240, run: false, id: null };
function timerBind() {
  const draw = () => { const c = $('#clock'); if (c) { c.textContent = `${Math.floor(T.left / 60)}:${String(T.left % 60).padStart(2, '0')}`; c.classList.toggle('low', T.left <= 30); } const b = $('#t-go'); if (b) b.textContent = T.run ? '⏸ Pausar' : '▶ Iniciar'; };
  const set = s => { stop(); T.left = s; draw(); };
  const stop = () => { clearInterval(T.id); T.run = false; };
  $('#t-go').onclick = () => {
    if (T.run) { stop(); draw(); return; }
    if (T.left <= 0) T.left = 240;
    T.run = true;
    T.id = setInterval(() => {
      T.left--; draw();
      if (T.left <= 0) { stop(); draw(); if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]); beep(); }
    }, 1000);
    draw();
  };
  $('#t-30').onclick = () => set(30);
  $('#t-60').onclick = () => set(60);
  $('#t-rs').onclick = () => set(240);
  draw();
}
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(t => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 660; o.connect(g); g.connect(a.destination); g.gain.value = 0.2; o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.25); });
  } catch (e) {}
}

// ---------- utilidades ----------
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
    <h3>O objetivo</h3>
    <p>Alguém da roda roubou a Cuia de Prata durante o apagão. Os <b>inocentes</b> precisam descobrir quem foi. O <b>culpado</b> precisa sair ileso.</p>
  </div>
  <div class="card paper">
    <h3>📜 Regras de ouro</h3>
    <ul>
      <li><b>Inocente não mente.</b> Pode se recusar a responder ("não digo, tchê"), mas não pode falar mentira.</li>
      <li><b>O culpado pode mentir</b> sobre tudo.</li>
      <li><b>Pista só vale com código.</b> Pra mostrar uma pista, você diz o código (ex.: <i>CUIA-7K2</i>). Quem recebe digita na Caderneta e o app confirma com o <b>Selo do CTG</b>.</li>
      <li>⚠️ <b>O culpado tem pistas FALSAS com selo autêntico.</b> Se duas pistas se contradizem, uma delas veio do culpado…</li>
    </ul>
  </div>
  <div class="card paper">
    <h3>🕵️ Como descobrir</h3>
    <ul>
      <li>A <b>aparência</b> de todos (lenço/fita, calçado, se é canhoto) é pública na aba Suspeitos.</li>
      <li>As pistas dizem a aparência do culpado e <b>de onde ele veio</b> antes do apagão.</li>
      <li>Tem sempre <b>alguém muito parecido com o culpado</b>. Pra separar os dois, descubram onde cada um estava — e quem tem testemunha.</li>
    </ul>
  </div>
  <div class="card paper">
    <h3>🧉 A Roda de Chimarrão</h3>
    <ul>
      <li>O jogo tem algumas rodadas (o anfitrião escolhe). Cada rodada tem um <b>evento</b>, igual em todos os celulares.</li>
      <li>Quem está com a cuia lê o evento e o grupo cumpre. Depois, conversa livre até o tempo acabar.</li>
      <li>A cuia passa pra direita. Se tiverem uma cuia de verdade, melhor ainda!</li>
    </ul>
  </div>
  <div class="card paper">
    <h3>🏚️ Ida ao Galpão</h3>
    <p>Uma vez por partida, cada jogador pode chamar alguém pra conversar <b>a sós</b> (um canto longe da roda) por 1 minuto. No Galpão, cada um <b>tem que mostrar 1 pista</b> pro outro. Não dá pra recusar o convite!</p>
  </div>
  <div class="card paper">
    <h3>⚖️ Julgamento no Fogo de Chão</h3>
    <p>No fim, cada um vota em segredo na aba Julgamento. No "1, 2, 3, tchê!" todos viram o celular. Depois, alguém aperta <b>Revelar a verdade</b>.</p>
  </div>
  <div class="card paper">
    <h3>🎯 Missão de Galpão</h3>
    <p>Cada um tem uma missãozinha secreta que vale +1 ponto. É na base da palavra de gaúcho!</p>
  </div>`;

window.addEventListener('hashchange', () => { const c = decodeCfg(location.hash); if (c && (!CFG || c.s !== CFG.s)) startFromCfg(c); });
boot();
