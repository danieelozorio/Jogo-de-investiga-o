'use strict';
// ============================================================
// Noite na Vila — app do celular
// Toda a lógica secreta roda no Supabase (supabase.sql).
// O celular só manda escolhas e mostra o que cada um pode ver.
// ============================================================

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- conexão ----------
const params = new URLSearchParams(location.search);
const API = params.has('mock') ? location.origin : (window.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = window.SUPABASE_KEY || 'mock';

async function api(fn, body) {
  const r = await fetch(`${API}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    // chave nova (sb_publishable_…) vai só no apikey; a antiga (JWT) também no Authorization
    headers: { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const txt = await r.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new Error((data && data.message) || 'Erro de conexão.');
  return data;
}

// ---------- papéis ----------
const PAPEIS = {
  assassino: { nome: 'Assassino', icon: '🔪', mal: true,
    desc: 'De noite, vá até a casa de alguém. Se a pessoa estiver em casa, ela morre (a não ser que a Benzedeira esteja lá). Cuidado: quem estiver na casa vê você!',
    acao: 'Qual casa você vai atacar?', casa: 'Ficar em casa (não atacar)' },
  vigia: { nome: 'Vigia', icon: '👁️',
    desc: 'De noite você fica em casa, de olho numa casa da vila, e vê todo mundo que entrou nela.',
    acao: 'Qual casa você vai vigiar?', casa: 'Vigiar a minha casa' },
  benzedeira: { nome: 'Benzedeira', icon: '🌿',
    desc: 'De noite você vai até uma casa e protege quem mora lá. Se o assassino aparecer, você espanta ele.',
    acao: 'Qual casa você vai benzer?', casa: 'Benzer a minha casa' },
  fofoqueira: { nome: 'Fofoqueira', icon: '🗣️',
    desc: 'De noite você fica em casa e segue uma pessoa com os olhos: descobre pra qual casa ela foi.',
    acao: 'Quem você vai seguir?', casa: null },
  morador: { nome: 'Morador', icon: '🏠',
    desc: 'De noite você visita uma casa (ou fica na sua) e vê quem estava lá. Use isso no debate!',
    acao: 'Pra qual casa você vai?', casa: 'Ficar em casa' },
  bebado: { nome: 'Bêbado', icon: '🍺',
    desc: 'Achava que era Vigia, mas tudo o que viu era coisa da cabeça.' },
};
const VENC = {
  vila: { icon: '🏡', titulo: 'A vila venceu!', txt: 'Todos os assassinos foram descobertos.' },
  assassinos: { icon: '🔪', titulo: 'Os assassinos venceram!', txt: 'Não sobrou gente suficiente pra deter eles.' },
};

// ---------- estado ----------
let SESS = null;      // { code, token }
let S = null;         // último estado vindo do banco
let lastVer = -1;
let UI = {};          // escolhas locais (alvo marcado, papel visível…)
let uiKey = '';
let busy = false;
let poll = null;

function loadSess() { try { return JSON.parse(localStorage.getItem('vila:sess')); } catch (e) { return null; } }
function saveSess(s) { try { s ? localStorage.setItem('vila:sess', JSON.stringify(s)) : localStorage.removeItem('vila:sess'); } catch (e) {} }

const app = () => $('#app');
function setFase(f) { document.body.className = 'f-' + f; }

// ---------- início ----------
function boot() {
  if (!API) return renderSemConfig();
  SESS = loadSess();
  const sala = (params.get('sala') || '').toUpperCase();
  if (SESS && (!sala || sala === SESS.code)) return entrarNoJogo();
  renderHome(sala);
}

function renderSemConfig() {
  setFase('home');
  app().innerHTML = `<div class="hero"><div class="hero-icon">🛠️</div><h1>Noite na Vila</h1></div>
    <div class="card paper"><p>Falta configurar o Supabase.</p>
    <p class="small">Abra o arquivo <b>config.js</b> e coloque a <b>Project URL</b> e a chave <b>anon public</b> do seu projeto.</p></div>`;
}

function renderHome(prefill = '') {
  setFase('home'); stopPoll();
  app().innerHTML = `
    <div class="hero">
      <div class="hero-icon">🌙</div>
      <h1>Noite na Vila</h1>
      <p class="sub">Alguém da vila é assassino.</p>
    </div>
    <div class="card paper small">
      <p>De noite, cada um escolhe <b>pelo celular</b> qual casa vai visitar. De dia, a vila <b>debate cara a cara</b> e vota em quem expulsar.</p>
    </div>
    <label class="lbl">Seu nome</label>
    <input id="nome" class="inp" maxlength="20" placeholder="Como te chamam na roda" value="${esc(localStorage.getItem('vila:nome') || '')}">
    <div class="tabsel">
      <button class="btn ${prefill ? 'ghost' : ''}" id="t-criar">Criar sala</button>
      <button class="btn ${prefill ? '' : 'ghost'}" id="t-entrar">Entrar numa sala</button>
    </div>
    <div id="entrarBox" ${prefill ? '' : 'hidden'}>
      <label class="lbl">Código da sala</label>
      <input id="code" class="inp codeinp" placeholder="Ex.: GAITA-42" autocapitalize="characters" value="${esc(prefill)}">
    </div>
    <p class="err" id="err"></p>
    <button class="btn big" id="go">${prefill ? '🚪 Entrar' : '🏡 Criar sala'}</button>
    <button class="btn ghost" id="rules">📖 Como jogar</button>`;
  let modo = prefill ? 'entrar' : 'criar';
  const setModo = m => {
    modo = m; $('#entrarBox').hidden = m !== 'entrar';
    $('#t-criar').className = 'btn ' + (m === 'criar' ? '' : 'ghost');
    $('#t-entrar').className = 'btn ' + (m === 'entrar' ? '' : 'ghost');
    $('#go').textContent = m === 'criar' ? '🏡 Criar sala' : '🚪 Entrar';
  };
  $('#t-criar').onclick = () => setModo('criar');
  $('#t-entrar').onclick = () => setModo('entrar');
  $('#rules').onclick = () => renderRules(() => renderHome(prefill));
  $('#go').onclick = async () => {
    const nome = $('#nome').value.trim();
    if (!nome) return $('#err').textContent = 'Coloque seu nome.';
    try { localStorage.setItem('vila:nome', nome); } catch (e) {}
    try {
      $('#go').disabled = true;
      const r = modo === 'criar'
        ? await api('jg_criar_sala', { p_nome: nome })
        : await api('jg_entrar', { p_code: $('#code').value.trim(), p_nome: nome });
      SESS = { code: r.code, token: r.token }; saveSess(SESS);
      entrarNoJogo();
    } catch (e) { $('#err').textContent = e.message; $('#go').disabled = false; }
  };
}

function renderRules(back) {
  setFase('home');
  app().innerHTML = `<button class="btn ghost small" id="back">← Voltar</button>${RULES_HTML}`;
  $('#back').onclick = back;
  window.scrollTo(0, 0);
}

// ---------- sincronização ----------
async function entrarNoJogo() {
  history.replaceState(null, '', location.pathname + (params.has('mock') ? '?mock=1&' : '?') + 'sala=' + SESS.code);
  await refresh(true);
  stopPoll();
  poll = setInterval(tick, 2000);
}
function stopPoll() { if (poll) clearInterval(poll); poll = null; }
async function tick() {
  if (busy || document.hidden) return;
  try {
    const v = await api('jg_versao', { p_code: SESS.code });
    if (v === null) return sairDaSala('Essa sala não existe mais.');
    if (v !== lastVer) await refresh();
    setOnline(true);
  } catch (e) { setOnline(false); }
}
async function refresh(first) {
  try {
    const st = await api('jg_estado', { p_code: SESS.code, p_token: SESS.token });
    const prevFase = S && S.sala.fase;
    S = st; lastVer = st.sala.versao;
    const k = st.sala.fase + ':' + st.sala.dia;
    if (k !== uiKey) {
      UI = {}; uiKey = k;
      if (!first && prevFase && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
    render();
  } catch (e) {
    if (/não está nesta sala/.test(e.message)) return sairDaSala('Você não está mais nessa sala.');
    if (first) { app().innerHTML = `<div class="card paper"><p class="err">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`; }
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && SESS) tick(); });
function setOnline(ok) { const d = $('#net'); if (d) d.classList.toggle('off', !ok); }

function sairDaSala(msg) {
  stopPoll(); saveSess(null); SESS = null; S = null; lastVer = -1;
  history.replaceState(null, '', location.pathname + (params.has('mock') ? '?mock=1' : ''));
  renderHome();
  if (msg) $('#err').textContent = msg;
}

async function act(fn, extra, okMsg) {
  if (busy) return;
  busy = true;
  try { await api(fn, { p_code: SESS.code, p_token: SESS.token, ...extra }); await refresh(); if (okMsg) toast(okMsg); }
  catch (e) { alert(e.message); }
  finally { busy = false; }
}

// ---------- telas do jogo ----------
function render() {
  const f = S.sala.fase;
  setFase(f);
  const me = S.me;
  const papel = me.papel && PAPEIS[me.papel];
  const faseTxt = { lobby: '🏡 Saguão', noite: `🌙 Noite ${S.sala.dia}`, dia: `☀️ Dia ${S.sala.dia}`, veredito: `⚖️ Dia ${S.sala.dia}`, fim: '🏁 Fim de jogo' }[f];
  const scrollY = window.scrollY;
  app().innerHTML = `
    <header class="top">
      <div><div class="ctg">${faseTxt}</div><div class="who">${esc(me.nome)}${me.vivo ? '' : ' 👻'} <i id="net" class="net"></i></div></div>
      <div class="row">
        ${papel && f !== 'lobby' ? `<button class="btn ghost small" id="papelBtn">${UI.verPapel || f === 'noite' ? papel.icon + ' ' + papel.nome : '🎭 Papel'}</button>` : ''}
        <button class="btn ghost small" id="menu">☰</button>
      </div>
    </header>
    <main id="tela"></main>`;
  if ($('#papelBtn')) $('#papelBtn').onclick = () => { UI.verPapel = !UI.verPapel; render(); };
  $('#menu').onclick = menu;
  ({ lobby: telaLobby, noite: telaNoite, dia: telaDia, veredito: telaVeredito, fim: telaFim })[f]($('#tela'));
  window.scrollTo(0, scrollY);
}

function menu() {
  const ch = prompt('Menu:\n1 = Como jogar\n2 = Copiar link da sala\n3 = Sair da sala (neste celular)', '1');
  if (ch === '1') { stopPoll(); renderRules(() => { entrarNoJogo(); }); }
  else if (ch === '2') copy(linkSala());
  else if (ch === '3') { if (confirm('Sair da sala? Você não vai conseguir voltar com o mesmo nome depois que a partida começar.')) sairDaSala(); }
}
const linkSala = () => location.origin + location.pathname + '?sala=' + SESS.code;

function telaLobby(el) {
  const me = S.me, js = S.jogadores;
  el.innerHTML = `
    <div class="card paper center">
      <div class="muted small">Código da sala</div>
      <div class="bigcode">${esc(S.sala.code)}</div>
      <div class="row center">
        ${navigator.share ? '<button class="btn small" id="sh">📤 Compartilhar</button>' : ''}
        <button class="btn small alt" id="cp">📋 Copiar link</button>
      </div>
    </div>
    <h3 class="sec">Na roda (${js.length})</h3>
    <div class="card">${js.map((j, i) => `
      <div class="loc-row"><span class="seat">${i + 1}</span> ${j.bot ? '🤖 ' : ''}${esc(j.nome)}${j.id === me.id ? ' <span class="tag">você</span>' : ''}${i === 0 ? ' <span class="tag">anfitrião</span>' : ''}
        ${me.host && j.id !== me.id ? `<button class="x rm" data-id="${j.id}" aria-label="Remover">✕</button>` : ''}</div>`).join('')}
    </div>
    ${me.host && js.length < 12 ? `<button class="btn ghost" id="bot">🤖 Adicionar bot</button>
      <p class="muted center small">Bots jogam sozinhos, no aleatório. Bom pra testar ou completar a roda.</p>` : ''}
    ${me.host ? `
      ${js.length < 5 ? `<p class="muted center">Precisa de pelo menos 5 pessoas (o ideal é de 6 a 8).</p>` : ''}
      <button class="btn big" id="start" ${js.length < 5 ? 'disabled' : ''}>🌙 Começar: cair a noite</button>`
      : '<p class="muted center">Esperando o anfitrião começar…</p>'}
    <button class="btn ghost" id="rules2">📖 Como jogar</button>`;
  if ($('#sh')) $('#sh').onclick = () => navigator.share({ title: 'Noite na Vila', text: `Entra na sala ${S.sala.code}:`, url: linkSala() }).catch(() => {});
  $('#cp').onclick = () => copy(linkSala(), $('#cp'));
  $$('.rm').forEach(b => b.onclick = () => { if (confirm('Remover essa pessoa da sala?')) act('jg_remover', { p_id: +b.dataset.id }); });
  if ($('#start')) $('#start').onclick = () => act('jg_comecar', {});
  if ($('#bot')) $('#bot').onclick = () => act('jg_add_bot', {}, 'Bot adicionado 🤖');
  $('#rules2').onclick = () => { stopPoll(); renderRules(() => entrarNoJogo()); };
}

function casas(list, sel, opts = {}) {
  return `<div class="vila">${list.map(j => {
    const mine = j.id === S.me.id;
    const dis = !j.vivo && !opts.mortasOk;
    return `<button class="casa ${sel === j.id ? 'on' : ''} ${j.vivo ? '' : 'morta'} ${mine ? 'minha' : ''}" data-id="${j.id}" ${dis ? 'disabled' : ''}>
      <span class="casa-ic">${j.vivo ? (mine ? '🏡' : '🏠') : '🏚️'}</span>
      <span class="casa-n">${mine ? 'Sua casa' : esc(j.nome)}</span>
      ${opts.pronto && j.vivo && j.pronto ? '<span class="pronto">✓</span>' : ''}
    </button>`;
  }).join('')}</div>`;
}

function telaNoite(el) {
  const me = S.me, js = S.jogadores;
  const vivos = js.filter(j => j.vivo);
  const prontos = vivos.filter(j => j.pronto).length;
  const espera = `<p class="muted center small">Já escolheram: <b>${prontos} de ${vivos.length}</b>. O dia nasce quando todos escolherem.</p>`;
  const forcar = me.host ? '<button class="btn ghost small" id="force">Alguém travou? Fazer o dia nascer</button>' : '';

  if (!me.vivo) {
    el.innerHTML = `
      <div class="card ghost-card"><h3>👻 Alma penada</h3>
      <p>Você pode deixar <b>uma palavra</b> na porta de uma casa. A vila inteira vai ver de manhã.</p>
      <p class="small muted">Deixe o recado antes de os vivos terminarem de escolher.</p></div>
      ${MAPA.svg(mapaGhost())}
      <input id="pal" class="inp" maxlength="20" placeholder="Uma palavra (ex.: mentira)" value="${esc(UI.pal ?? me.palavra ?? '')}">
      <button class="btn big" id="ok">✍️ Deixar recado</button>
      ${me.agiu ? '<p class="ok center">Recado deixado.</p>' : ''}${espera}${forcar}`;
    MAPA.bind(mapaGhost(), id => { UI.alvo = id; UI.pal = $('#pal').value; render(); });
    $('#pal').oninput = e => UI.pal = e.target.value;
    $('#ok').onclick = () => {
      const alvo = UI.alvo ?? me.alvo;
      if (!alvo || !$('#pal').value.trim()) return alert('Escolha a casa e escreva a palavra.');
      act('jg_agir', { p_alvo: alvo, p_palavra: $('#pal').value.trim() }, 'Recado deixado 👻');
    };
    bindForce();
    return;
  }

  const p = PAPEIS[me.papel];
  const parceiros = me.papel === 'assassino' ? js.filter(j => j.papel === 'assassino' && j.id !== me.id) : [];
  const sel = UI.alvo ?? me.alvo;
  el.innerHTML = `
    <div class="card role ${p.mal ? 'mal' : ''}">
      <div class="role-ic">${p.icon}</div>
      <div><div class="muted small">Você é</div><h2>${p.nome}</h2><p class="small">${p.desc}</p>
      ${parceiros.length ? `<p class="small"><b>Seu parceiro:</b> ${parceiros.map(x => esc(x.nome)).join(', ')}</p>` : ''}</div>
    </div>
    <h3 class="sec center">${p.acao}</h3>
    ${p.casa ? `<p class="muted center small">Tocar em <b>Sua casa</b> = ${p.casa.toLowerCase()}.</p>` : ''}
    ${MAPA.svg(mapaNoite(sel))}
    <p class="center small escolha">${sel ? (sel === me.id ? `🏡 ${p.casa || 'Sua casa'}` : `${ANDA.has(me.papel) ? '🚶 Indo até a casa de' : '👁️ De olho em'} <b>${esc(nomeDe(sel))}</b>`) : 'Toque numa casa do mapa.'}</p>
    <button class="btn big" id="ok" ${sel ? '' : 'disabled'}>${me.agiu && sel === me.alvo ? '✅ Escolha feita (pode trocar)' : '✔️ Confirmar'}</button>
    ${espera}${forcar}`;
  MAPA.bind(mapaNoite(sel), id => { UI.alvo = id; render(); });
  $('#ok').onclick = () => { if (sel) act('jg_agir', { p_alvo: sel, p_palavra: null }, 'Escolha feita 🌙'); };
  bindForce();
}
function bindForce() {
  const b = $('#force'); if (!b) return;
  b.onclick = () => { if (confirm('Avançar mesmo sem todo mundo ter escolhido? Quem não escolheu fica em casa / não vota.')) act('jg_avancar', {}); };
}

function anuncioManha(a) {
  if (a && a.manha) a = a.manha;
  if (!a || a.tipo !== 'manha') return '';
  const linhas = [];
  (a.mortos || []).forEach(m => linhas.push(`💀 <b>${esc(m.nome)}</b> foi encontrado(a) sem vida em casa. Perto do corpo: <b>${esc(m.arma)}</b>.`));
  if (!(a.mortos || []).length) linhas.push('🌅 Ninguém morreu esta noite.');
  if (a.salvos) linhas.push('🌿 Alguém foi atacado, mas sobreviveu!');
  (a.palavras || []).forEach(p => linhas.push(`👻 A porta da casa de <b>${esc(p.casa)}</b> amanheceu com a palavra: <b>“${esc(p.palavra)}”</b>`));
  return `<div class="card paper anuncio"><h3>☀️ Amanheceu</h3>${linhas.map(l => `<p>${l}</p>`).join('')}</div>`;
}
function infoPrivada() {
  const info = S.me.info || [];
  if (!info.length) return '';
  return `<div class="card secret">
    <button class="btn ghost small" id="verInfo">${UI.verInfo ? '🙈 Esconder' : '🤫 O que você viu esta noite'}</button>
    ${UI.verInfo && S.me.visto ? MAPA.svg(mapaReplay()) : ''}
    ${UI.verInfo ? info.map(t => `<p>${esc(t)}</p>`).join('') : ''}
  </div>`;
}
function bindInfo() {
  const b = $('#verInfo'); if (b) b.onclick = () => { UI.verInfo = !UI.verInfo; render(); };
  if (UI.verInfo && S.me.visto) MAPA.bind(mapaReplay(), () => {});
}

// ---------- configurações do mapa ----------
const ANDA = new Set(['morador', 'assassino', 'benzedeira']);
const nomeDe = id => (S.jogadores.find(j => j.id === id) || {}).nome || '?';
function mapaNoite(sel) {
  const me = S.me;
  return { id: 'mapa', jogadores: S.jogadores, meId: me.id, sel, pronto: true, chave: S.sala.dia,
    modo: ANDA.has(me.papel) ? 'anda' : 'olha',
    clicavel: j => j.vivo && !(me.papel === 'fofoqueira' && j.id === me.id) };
}
function mapaGhost() {
  return { id: 'mapa', jogadores: S.jogadores, meId: S.me.id, sel: UI.alvo ?? S.me.alvo, chave: S.sala.dia,
    modo: 'olha', clicavel: () => true };
}
function mapaReplay() {
  const v = S.me.visto;
  return { id: 'replay', jogadores: S.jogadores, meId: S.me.id, sel: v.casa, vistos: v.ids || [], chave: 'r' + S.sala.dia,
    modo: v.casa === S.me.id ? 'parado' : 'anda' };
}
function papeisVisiveis() {
  return `<div class="card">${S.jogadores.map(j => `<div class="loc-row">${j.vivo ? '🙂' : '💀'} <b>${esc(j.nome)}</b>${j.papel ? ` — ${PAPEIS[j.papel].icon} ${PAPEIS[j.papel].nome}` : ''}</div>`).join('')}</div>`;
}

function telaDia(el) {
  const me = S.me, js = S.jogadores;
  const vivos = js.filter(j => j.vivo);
  const prontos = vivos.filter(j => j.pronto).length;
  const sel = UI.voto !== undefined ? UI.voto : (me.votou ? me.voto : undefined);
  el.innerHTML = `
    ${anuncioManha(S.sala.anuncio)}
    ${infoPrivada()}
    <div class="card timer">
      <div class="muted small">Debate na roda</div>
      <div id="clock">3:00</div>
      <div class="row center"><button class="btn small" id="t-go">▶ Iniciar</button><button class="btn ghost small" id="t-rs">Zerar</button></div>
    </div>
    ${me.vivo ? `
      <h3 class="sec center">🗳️ Quem a vila deve expulsar?</h3>
      ${casas(js.filter(j => j.id !== me.id), sel, { pronto: true })}
      <button class="btn ghost ${sel === null ? 'on' : ''}" id="pular">🤷 Pular (não expulsar ninguém)</button>
      <button class="btn big" id="votar" ${sel === undefined ? 'disabled' : ''}>${me.votou ? '✅ Voto feito (pode trocar)' : '🗳️ Confirmar voto'}</button>
      <p class="muted center small">Votaram: <b>${prontos} de ${vivos.length}</b>. Precisa de pelo menos 2 votos na mesma pessoa, sem empate.</p>`
    : `<div class="card ghost-card"><h3>👻 Você é alma penada</h3><p><b>Fique em silêncio</b> durante o debate! Você pode ver o papel de todo mundo:</p></div>${papeisVisiveis()}`}
    ${me.host ? '<button class="btn ghost small" id="force">Alguém travou? Encerrar votação</button>' : ''}`;
  bindInfo();
  $$('.casa').forEach(b => b.onclick = () => { UI.voto = +b.dataset.id; render(); });
  if ($('#pular')) $('#pular').onclick = () => { UI.voto = null; render(); };
  if ($('#votar')) $('#votar').onclick = () => { if (sel !== undefined) act('jg_votar', { p_alvo: sel }, 'Voto registrado 🗳️'); };
  bindForce();
  timerBind();
}

function telaVeredito(el) {
  const a = S.sala.anuncio || {};
  const me = S.me;
  el.innerHTML = `
    <div class="card ${a.expulso ? 'guilty' : 'paper'} center">
      ${a.expulso ? `<div class="hero-icon">${PAPEIS[a.expulso.papel].icon}</div>
        <p>A vila expulsou</p><h2>${esc(a.expulso.nome)}</h2><p>Era <b>${PAPEIS[a.expulso.papel].nome}</b>${a.expulso.papel === 'assassino' ? ' 🎯' : ' 😬'}</p>`
      : '<div class="hero-icon">🤷</div><h2>Ninguém foi expulso</h2><p>Empate, pulos ou poucos votos.</p>'}
    </div>
    ${anuncioManha(a)}
    <h3 class="sec">Como cada um votou</h3>
    <div class="card">${(a.votos || []).map(v => `<div class="loc-row"><b>${esc(v.de)}</b> → ${esc(v.em)}</div>`).join('')}</div>
    ${infoPrivada()}
    ${me.host ? '<button class="btn big" id="next">🌙 Cair a noite</button>' : '<p class="muted center">Quando todos estiverem prontos, o anfitrião faz a noite cair.</p>'}`;
  bindInfo();
  if ($('#next')) $('#next').onclick = () => act('jg_avancar', {});
}

function telaFim(el) {
  const v = VENC[S.sala.vencedor] || VENC.vila;
  const me = S.me;
  el.innerHTML = `
    <div class="card ${S.sala.vencedor === 'vila' ? 'innocent' : 'guilty'} center">
      <div class="hero-icon">${v.icon}</div><h2>${v.titulo}</h2><p>${v.txt}</p>
    </div>
    ${anuncioManha(S.sala.anuncio)}
    <h3 class="sec">Quem era quem</h3>
    ${papeisVisiveis()}
    ${me.host ? `<button class="btn big" id="again">🔁 Jogar de novo (mesma turma)</button>
      <button class="btn ghost" id="lobby">🏡 Voltar pro saguão (entrar/sair gente)</button>`
      : '<p class="muted center">Esperando o anfitrião…</p>'}`;
  if ($('#again')) $('#again').onclick = () => act('jg_comecar', {});
  if ($('#lobby')) $('#lobby').onclick = () => act('jg_reiniciar', {});
}

// ---------- cronômetro do debate ----------
const T = { left: 180, run: false, id: null };
function timerBind() {
  const draw = () => {
    const c = $('#clock'); if (!c) return;
    c.textContent = `${Math.floor(T.left / 60)}:${String(T.left % 60).padStart(2, '0')}`;
    c.classList.toggle('low', T.left <= 20);
    const b = $('#t-go'); if (b) b.textContent = T.run ? '⏸ Pausar' : '▶ Iniciar';
  };
  $('#t-go').onclick = () => {
    if (T.run) { clearInterval(T.id); T.run = false; return draw(); }
    if (T.left <= 0) T.left = 180;
    T.run = true;
    T.id = setInterval(() => {
      T.left--; draw();
      if (T.left <= 0) { clearInterval(T.id); T.run = false; draw(); if (navigator.vibrate) navigator.vibrate([300, 150, 600]); }
    }, 1000);
    draw();
  };
  $('#t-rs').onclick = () => { clearInterval(T.id); T.run = false; T.left = 180; draw(); };
  draw();
}

// ---------- utilidades ----------
function copy(text, btn) {
  const done = () => { if (btn) { const o = btn.textContent; btn.textContent = '✅ Copiado!'; setTimeout(() => btn.textContent = o, 1500); } else toast('Link copiado!'); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt('Copie:', text));
  else prompt('Copie:', text);
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 1800);
}
let wake = null;
async function keepAwake() { try { if (!wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.onrelease = () => wake = null; } } catch (e) {} }
document.addEventListener('click', keepAwake, { once: true });

const RULES_HTML = `
  <h2>📖 Como jogar</h2>
  <div class="card paper">
    <h3>A ideia</h3>
    <p>Sentem em roda, cada um com seu celular. Escondido entre vocês tem <b>um assassino</b> (dois, com 8 ou mais pessoas). A vila precisa descobrir quem é antes que seja tarde.</p>
  </div>
  <div class="card paper">
    <h3>🌙 A noite</h3>
    <ul>
      <li>Todo mundo escolhe no celular <b>uma casa</b>. Ninguém fala nada.</li>
      <li>Quem visita uma casa <b>vê quem mais estava lá</b>.</li>
      <li>O assassino ataca uma casa: se o dono estiver em casa, ele morre. Mas <b>quem estiver lá vê o assassino</b>!</li>
      <li>O dia nasce sozinho quando todos escolherem.</li>
    </ul>
  </div>
  <div class="card paper">
    <h3>☀️ O dia</h3>
    <ul>
      <li>O celular mostra quem morreu e o que <b>você</b> viu (só você vê).</li>
      <li>Larguem o celular e <b>debatam olho no olho</b>. Contem o que viram… ou mintam.</li>
      <li>Votem no celular. Quem levar mais votos (no mínimo 2, sem empate) é expulso e o papel é revelado.</li>
    </ul>
  </div>
  <div class="card paper">
    <h3>🎭 Papéis</h3>
    ${['assassino', 'vigia', 'benzedeira', 'fofoqueira', 'morador'].map(k => `<p><b>${PAPEIS[k].icon} ${PAPEIS[k].nome}:</b> ${PAPEIS[k].desc}</p>`).join('')}
    <p><b>🍺 Bêbado</b> (7+ jogadores): acha que é Vigia, mas o que ele "vê" é inventado. Ele não sabe que é bêbado!</p>
  </div>
  <div class="card paper">
    <h3>👻 Almas penadas</h3>
    <p>Quem morre ou é expulso <b>não pode mais falar</b>. Mas, de noite, pode deixar <b>uma palavra</b> na porta de uma casa, e a vila inteira vê de manhã.</p>
  </div>
  <div class="card paper">
    <h3>🏁 Fim</h3>
    <p><b>A vila vence</b> quando todos os assassinos forem expulsos. <b>Os assassinos vencem</b> quando forem tantos quanto o resto da vila.</p>
  </div>`;

boot();
