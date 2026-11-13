'use strict';
/* Reino dos Dados — jogo de tabuleiro mágico (local, contra bots ou passando o celular). */

const $ = (s) => document.querySelector(s);
const rnd = (n) => Math.floor(Math.random() * n);
let SPEED = 1;
const TURBO = new URLSearchParams(location.search).has('turbo');
const sleep = (ms) => new Promise((r) => setTimeout(r, TURBO ? 1 : ms * SPEED));
const fmt = (n) => '🪙' + Math.round(n).toLocaleString('pt-BR');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- regras ---------------- */
const START_MONEY = 1500;
const SALARY = 200;
const ISLAND_FEE = 100;
const ATTR_PRICE = 200;
const ATTR_TOLL = 50;
const TOLL_MULT = [0.3, 1, 2, 3.5, 5.5]; // por nível, multiplicado pelo preço do terreno
const LVL_NAME = ['Terreno', 'Casa', 'Vila', 'Castelo', 'Marco Encantado'];
const LVL_ICON = ['🚩', '🏠', '🏘️', '🏰', '✨'];
const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];

const GROUPS = [
  { n: 'Vila dos Doces', c: '#f472b6', p: 60 },
  { n: 'Bosque dos Cogumelos', c: '#84cc16', p: 80 },
  { n: 'Lagoa dos Sapos', c: '#06b6d4', p: 100 },
  { n: 'Vale das Fadas', c: '#a855f7', p: 120 },
  { n: 'Porto Pirata', c: '#f97316', p: 150 },
  { n: 'Deserto Dourado', c: '#eab308', p: 170 },
  { n: 'Montanha do Dragão', c: '#dc2626', p: 200 },
  { n: 'Castelo de Cristal', c: '#3b82f6', p: 240 },
];

const B = [
  { t: 'start', n: 'Largada', s: 'Largada', e: '🏁' },
  { t: 'prop', g: 0, n: 'Rua do Pirulito', e: '🍭' },
  { t: 'prop', g: 0, n: 'Praça do Bombom', e: '🍬' },
  { t: 'card', n: 'Carta Mágica', s: 'Carta', e: '🔮' },
  { t: 'prop', g: 1, n: 'Trilha do Musgo', e: '🍄' },
  { t: 'prop', g: 1, n: 'Toca do Coelho', e: '🐇' },
  { t: 'attr', n: 'Roda-Gigante Estelar', e: '🎡' },
  { t: 'island', n: 'Ilha Perdida', s: 'Ilha', e: '🏝️' },
  { t: 'prop', g: 2, n: 'Ponte das Vitórias-Régias', e: '🪷' },
  { t: 'prop', g: 2, n: 'Cais dos Sapos', e: '🐸' },
  { t: 'card', n: 'Carta Mágica', s: 'Carta', e: '🔮' },
  { t: 'prop', g: 3, n: 'Jardim das Fadas', e: '🌸' },
  { t: 'prop', g: 3, n: 'Cascata Brilhante', e: '💧' },
  { t: 'attr', n: 'Fonte dos Desejos', e: '⛲' },
  { t: 'festival', n: 'Festival', s: 'Festival', e: '🎪' },
  { t: 'prop', g: 4, n: 'Taverna do Papagaio', e: '🦜' },
  { t: 'prop', g: 4, n: 'Estaleiro da Âncora', e: '⚓' },
  { t: 'tax', n: 'Coletor do Rei', s: 'Imposto', e: '💰' },
  { t: 'prop', g: 5, n: 'Oásis das Tâmaras', e: '🌴' },
  { t: 'prop', g: 5, n: 'Dunas Cantantes', e: '🐪' },
  { t: 'attr', n: 'Pirâmide dos Ventos', e: '🔺' },
  { t: 'portal', n: 'Portal Mágico', s: 'Portal', e: '🌀' },
  { t: 'prop', g: 6, n: 'Ninho de Fogo', e: '🔥' },
  { t: 'prop', g: 6, n: 'Caverna do Tesouro', e: '💎' },
  { t: 'card', n: 'Carta Mágica', s: 'Carta', e: '🔮' },
  { t: 'prop', g: 7, n: 'Salão dos Espelhos', e: '🪞' },
  { t: 'prop', g: 7, n: 'Trono de Cristal', e: '👑' },
  { t: 'attr', n: 'Torre do Relógio', e: '🕰️' },
];
const N = B.length;
const ISLAND = 7;
const PORTAL = 21;
const isBuyable = (i) => B[i].t === 'prop' || B[i].t === 'attr';
const ATTRS = B.map((b, i) => i).filter((i) => B[i].t === 'attr');
const SIDES = [[1, 6], [8, 13], [15, 20], [22, 27]].map(([a, z]) => {
  const r = [];
  for (let i = a; i <= z; i++) if (isBuyable(i)) r.push(i);
  return r;
});

const CHARS = [
  { id: 'lua', e: '🧙‍♀️', n: 'Lua, a Feiticeira', d: 'Seus pedágios rendem 20% a mais.' },
  { id: 'bento', e: '🏴‍☠️', n: 'Bento, o Pirata', d: 'Tomar terras dos rivais custa 30% menos.' },
  { id: 'faisca', e: '🐉', n: 'Faísca, o Dragãozinho', d: 'Ganha 50% a mais ao passar pela Largada.' },
  { id: 'mel', e: '🧚', n: 'Mel, a Fada', d: 'Paga 20% menos de pedágio.' },
  { id: 'tonho', e: '🛡️', n: 'Tonho, o Cavaleiro', d: 'Construir custa 20% menos.' },
  { id: 'coruja', e: '🦉', n: 'Dona Coruja', d: 'Só tira Cartas Mágicas boas e fica menos tempo na Ilha.' },
];
const charOf = (p) => CHARS.find((c) => c.id === p.char);

/* ---------------- estado ---------------- */
let S = null; // estado salvo
const KEY = 'reinoDosDados.save.v1';
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sem storage */ } }
function loadSave() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ok */ } }

const price = (i) => (B[i].t === 'attr' ? ATTR_PRICE : GROUPS[B[i].g].p);
function stepCost(i, lvl, p) {
  const pr = price(i);
  if (lvl === 0) return pr;
  let c = lvl === 4 ? pr : pr * 0.5;
  if (p && p.char === 'tonho') c *= 0.8;
  return Math.round(c);
}
function costTo(i, from, to, p) { let s = 0; for (let l = from; l <= to; l++) s += stepCost(i, l, p); return s; }
const maxLvl = (p) => Math.min(3, p.laps + 1);
const groupTiles = (g) => B.map((b, i) => i).filter((i) => B[i].g === g && B[i].t === 'prop');
const groupComplete = (g, owner) => groupTiles(g).every((i) => S.tiles[i].owner === owner);
const ownedBy = (idx) => S.tiles.map((t, i) => i).filter((i) => S.tiles[i].owner === idx);
const assets = (p) => p.money + ownedBy(p.idx).reduce((s, i) => s + S.tiles[i].inv, 0);
const alive = () => S.players.filter((p) => !p.out);
const reserve = () => 150 + S.round * 15;

function toll(i, payer) {
  const T = S.tiles[i];
  if (T.owner < 0) return 0;
  const o = S.players[T.owner];
  let v;
  if (B[i].t === 'attr') {
    const n = ATTRS.filter((j) => S.tiles[j].owner === T.owner).length;
    v = ATTR_TOLL * 2 ** (n - 1);
  } else {
    v = price(i) * TOLL_MULT[T.lvl];
    if (groupComplete(B[i].g, T.owner)) v *= 1.5;
  }
  if (S.festival === i) v *= 2;
  if (o.char === 'lua') v *= 1.2;
  if (payer && payer.char === 'mel') v *= 0.8;
  return Math.round(v / 5) * 5;
}
const takeoverCost = (i, p) => Math.round(S.tiles[i].inv * 2 * (p.char === 'bento' ? 0.7 : 1));

/* ---------------- som ---------------- */
let AC = null;
let muted = false;
function beep(f, d = 0.08, type = 'sine', v = 0.05) {
  if (muted || TURBO) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = v;
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d);
    o.connect(g).connect(AC.destination);
    o.start(); o.stop(AC.currentTime + d);
  } catch (e) { /* sem áudio */ }
}
const sfx = {
  step: () => beep(520, 0.05, 'triangle', 0.03),
  dice: () => beep(200 + rnd(200), 0.04, 'square', 0.02),
  coin: () => { beep(880, 0.08); setTimeout(() => beep(1320, 0.12), 80); },
  bad: () => { beep(300, 0.15, 'sawtooth', 0.04); setTimeout(() => beep(200, 0.2, 'sawtooth', 0.04), 120); },
  magic: () => [660, 880, 990, 1320].forEach((f, k) => setTimeout(() => beep(f, 0.1), k * 70)),
};

/* ---------------- interface ---------------- */
function log(msg) {
  S.log.unshift(msg);
  S.log.length = Math.min(S.log.length, 30);
  renderLog();
}
function renderLog() {
  $('#log').innerHTML = S.log.slice(0, 4).map((m) => `<li>${m}</li>`).join('');
}
let toastTimer = null;
async function toast(msg, ms = 1100) {
  const t = $('#toast');
  t.innerHTML = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  await sleep(ms);
  t.classList.add('hidden');
}

function coord(i) { // [linha, coluna] no grid 8x8, sentido anti-horário a partir do canto inferior direito
  if (i === 0) return [8, 8];
  if (i < 7) return [8, 8 - i];
  if (i === 7) return [8, 1];
  if (i < 14) return [8 - (i - 7), 1];
  if (i === 14) return [1, 1];
  if (i < 21) return [1, 1 + (i - 14)];
  if (i === 21) return [1, 8];
  return [1 + (i - 21), 8];
}

function buildBoard() {
  const board = $('#board');
  board.querySelectorAll('.tile,.token').forEach((el) => el.remove());
  B.forEach((b, i) => {
    const el = document.createElement('div');
    const [r, c] = coord(i);
    el.className = 'tile';
    el.dataset.i = i;
    el.style.gridArea = `${r} / ${c}`;
    board.appendChild(el);
  });
  S.players.forEach((p) => {
    const tk = document.createElement('div');
    tk.className = 'token';
    tk.id = 'tk' + p.idx;
    tk.style.borderColor = p.color;
    tk.textContent = charOf(p).e;
    board.appendChild(tk);
  });
}

function renderTiles() {
  document.querySelectorAll('.tile').forEach((el) => {
    const i = +el.dataset.i;
    const b = B[i];
    const T = S.tiles[i];
    const corner = i % 7 === 0;
    let cls = 'tile' + (corner ? ' corner' : '') + (!isBuyable(i) && !corner ? ' special' : '');
    let band = '';
    let lb = b.s || '';
    let lv = '';
    el.style.removeProperty('--oc');
    if (b.t === 'prop') band = `<div class="band" style="background:${GROUPS[b.g].c}"></div>`;
    if (b.t === 'attr') band = '<div class="band" style="background:linear-gradient(90deg,#f472b6,#a78bfa,#60a5fa)"></div>';
    if (isBuyable(i)) {
      if (T.owner >= 0) {
        cls += ' owned' + (T.lvl === 4 ? ' landmark' : '');
        el.style.setProperty('--oc', S.players[T.owner].color);
        lb = fmt(toll(i, null));
        if (b.t === 'prop') lv = LVL_ICON[T.lvl];
      } else lb = fmt(price(i));
    }
    if (picker && picker.filter(i)) cls += ' pick';
    el.className = cls;
    el.innerHTML = `${band}${S.festival === i ? '<span class="fx">🎉</span>' : ''}${lv ? `<span class="lv">${lv}</span>` : ''}<span class="em">${b.e}</span><span class="lb">${lb}</span>`;
  });
}

function placeTokens(slowIdx = -1) {
  S.players.forEach((p) => {
    const tk = document.getElementById('tk' + p.idx);
    if (!tk) return;
    if (p.out) { tk.classList.add('hidden'); return; }
    const [r, c] = coord(p.pos);
    const off = [[0.4, 0.4], [6.6, 0.4], [0.4, 6.6], [6.6, 6.6]][p.idx];
    tk.style.left = (c - 1) * 12.5 + off[0] + '%';
    tk.style.top = (r - 1) * 12.5 + off[1] + '%';
    tk.classList.toggle('cur', p.idx === S.turn);
    tk.classList.toggle('slow', p.idx === slowIdx);
  });
}

const lastMoney = {};
function renderPlayers() {
  $('#players').innerHTML = S.players.map((p) => {
    let st = [];
    if (p.out) st = ['falido'];
    else {
      if (p.island > 0) st.push(`🏝️${p.island}`);
      if (p.shield > 0) st.push(`🛡️${p.shield}`);
      if (p.portal) st.push('🌀');
      st.push(`🏰${ownedBy(p.idx).length}`);
      st.push(`↻${p.laps}`);
    }
    const prev = lastMoney[p.idx];
    const ch = prev === undefined || prev === p.money ? '' : prev < p.money ? 'up' : 'down';
    return `<div class="pcard ${p.idx === S.turn ? 'cur' : ''} ${p.out ? 'out' : ''}">
      <div class="av" style="border-color:${p.color}">${charOf(p).e}</div>
      <div class="nm">${esc(p.name)}${p.bot ? ' 🤖' : ''}</div>
      <div class="mn ${ch}">${fmt(p.money)}</div>
      <div class="st">${st.join(' ')}</div></div>`;
  }).join('');
  S.players.forEach((p) => { lastMoney[p.idx] = p.money; });
}

function render() {
  renderPlayers();
  renderTiles();
  placeTokens();
  renderLog();
  const p = S.players[S.turn];
  $('#roundLbl').textContent = `Rodada ${Math.min(S.round, S.maxRounds)} de ${S.maxRounds}`;
  $('#turnLbl').innerHTML = `<span style="color:${p.color}">●</span> Vez de ${esc(p.name)}`;
}

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function showDice(a, b) {
  const dice = document.querySelectorAll('.die');
  [a, b].forEach((n, k) => {
    dice[k].innerHTML = Array.from({ length: 9 }, (_, j) => `<i class="${PIPS[n].includes(j) ? 'on' : ''}"></i>`).join('');
    dice[k].classList.toggle('dbl', a === b);
  });
}

/* ---------- modal e escolha de casa ---------- */
function ask(title, body, buttons) {
  return new Promise((res) => {
    const card = $('#modalCard');
    card.innerHTML = `<h2>${title}</h2><div class="body">${body}</div><div class="btns"></div>`;
    const box = card.querySelector('.btns');
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.innerHTML = b.label;
      if (b.cls) el.className = b.cls;
      el.disabled = !!b.disabled;
      el.onclick = () => { $('#modal').classList.add('hidden'); res(b.value); };
      box.appendChild(el);
    });
    $('#modal').classList.remove('hidden');
  });
}

let picker = null;
function pickTile(msg, filter, skipLabel) {
  return new Promise((res) => {
    picker = { filter, res };
    $('#board').classList.add('picking');
    const pm = $('#pickMsg');
    pm.innerHTML = esc(msg) + (skipLabel ? '<br><button id="btnSkipPick" class="ghost">' + esc(skipLabel) + '</button>' : '');
    pm.classList.remove('hidden');
    if (skipLabel) $('#btnSkipPick').onclick = () => finishPick(-1);
    renderTiles();
  });
}
function finishPick(i) {
  const r = picker.res;
  picker = null;
  $('#board').classList.remove('picking');
  $('#pickMsg').classList.add('hidden');
  renderTiles();
  r(i);
}

function tileInfo(i, viewer) {
  const b = B[i];
  const T = S.tiles[i];
  const rows = [];
  if (b.t === 'prop') rows.push(['Reino', `<span class="chip" style="background:${GROUPS[b.g].c}"></span>${GROUPS[b.g].n}`]);
  if (b.t === 'attr') rows.push(['Tipo', 'Atração (pedágio dobra para cada atração do mesmo dono)']);
  if (isBuyable(i)) {
    rows.push(['Preço do terreno', fmt(price(i))]);
    if (T.owner >= 0) {
      const o = S.players[T.owner];
      rows.push(['Dono', `<span style="color:${o.color}">●</span> ${esc(o.name)}`]);
      if (b.t === 'prop') rows.push(['Construção', `${LVL_ICON[T.lvl]} ${LVL_NAME[T.lvl]}`]);
      rows.push(['Pedágio', fmt(toll(i, viewer))]);
      if (b.t === 'prop' && T.lvl < 4 && viewer) rows.push(['Custo para tomar', fmt(takeoverCost(i, viewer))]);
      if (b.t === 'prop' && T.lvl === 4) rows.push(['', 'Marco Encantado: não pode ser tomado']);
    } else if (b.t === 'prop') {
      for (let l = 0; l <= 4; l++) rows.push([`Pedágio com ${LVL_ICON[l]} ${LVL_NAME[l]}`, fmt(price(i) * TOLL_MULT[l])]);
    } else rows.push(['Pedágio', fmt(ATTR_TOLL) + ' a ' + fmt(ATTR_TOLL * 8)]);
  } else {
    const d = {
      start: `Passou por aqui, ganha ${fmt(SALARY)}.`,
      card: 'Tire uma Carta Mágica: pode ser sorte ou azar.',
      island: `Fica presa até tirar dupla ou pagar ${fmt(ISLAND_FEE)}.`,
      festival: 'Escolha uma terra sua para cobrar pedágio em dobro.',
      portal: 'Na próxima vez, viaje para qualquer casa do tabuleiro.',
      tax: 'Paga 10% do seu patrimônio ao rei.',
    }[b.t];
    rows.push(['', d]);
  }
  return `<table class="info">${rows.map(([a, v]) => `<tr><td>${a}</td><td>${v}</td></tr>`).join('')}</table>`;
}

/* ---------------- dados ---------------- */
function rollDice(zone) {
  const rng = [[2, 6], [6, 8], [8, 12]];
  const bias = zone >= 0 && Math.random() < 0.6;
  let a = 1;
  let b = 1;
  for (let t = 0; t < 80; t++) {
    a = 1 + rnd(6); b = 1 + rnd(6);
    if (!bias) break;
    const s = a + b;
    if (s >= rng[zone][0] && s <= rng[zone][1]) break;
  }
  return [a, b];
}

function waitHumanRoll() {
  return new Promise((res) => {
    const gauge = $('#gauge');
    const btn = $('#btnRoll');
    const marker = $('#marker');
    gauge.classList.remove('hidden');
    btn.classList.remove('hidden');
    let pos = Math.random();
    let dir = 1;
    let last = performance.now();
    let raf = 0;
    const tick = (now) => {
      pos += dir * (now - last) / 900;
      last = now;
      if (pos > 1) { pos = 2 - pos; dir = -1; }
      if (pos < 0) { pos = -pos; dir = 1; }
      marker.style.left = `calc(${pos * 100}% - ${pos * 1.4}cqw)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = () => {
      cancelAnimationFrame(raf);
      btn.onclick = null;
      document.onkeydown = null;
      btn.classList.add('hidden');
      gauge.classList.add('hidden');
      res(Math.min(2, Math.floor(pos * 3)));
    };
    btn.onclick = done;
    document.onkeydown = (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && $('#modal').classList.contains('hidden')) { e.preventDefault(); done(); }
    };
  });
}

async function getRoll(p) {
  let zone;
  if (p.bot) { await sleep(450); zone = rnd(3); } else zone = await waitHumanRoll();
  const [a, b] = rollDice(zone);
  for (let k = 0; k < 7; k++) { showDice(1 + rnd(6), 1 + rnd(6)); sfx.dice(); await sleep(55); }
  showDice(a, b);
  log(`${esc(p.name)} tirou ${a} + ${b} = ${a + b}${a === b ? ' (dupla!)' : ''}`);
  await sleep(300);
  return [a, b];
}

/* ---------------- movimento ---------------- */
function passStart(p) {
  const v = Math.round(SALARY * (p.char === 'faisca' ? 1.5 : 1));
  p.money += v;
  p.laps++;
  log(`🏁 ${esc(p.name)} passou pela Largada: +${fmt(v)}`);
  sfx.coin();
  renderPlayers();
}

async function moveSteps(p, n) {
  const dir = Math.sign(n);
  for (let k = 0; k < Math.abs(n); k++) {
    p.pos = (p.pos + dir + N) % N;
    if (dir > 0 && p.pos === 0) passStart(p);
    placeTokens();
    sfx.step();
    await sleep(170);
  }
}

async function teleport(p, dest) {
  if (dest < p.pos) passStart(p);
  p.pos = dest;
  placeTokens(p.idx);
  sfx.magic();
  await sleep(700);
  placeTokens();
}

async function goIsland(p) {
  p.pos = ISLAND;
  p.island = p.char === 'coruja' ? 1 : 2;
  p.doubles = 0;
  placeTokens(p.idx);
  sfx.bad();
  log(`🏝️ ${esc(p.name)} foi parar na Ilha Perdida`);
  await sleep(700);
  renderPlayers();
}

/* ---------------- dinheiro ---------------- */
function sellTile(i) {
  const T = S.tiles[i];
  const v = Math.floor(T.inv / 2);
  T.owner = -1; T.lvl = 0; T.inv = 0;
  if (S.festival === i) S.festival = -1;
  return v;
}

async function pay(p, amt, to) {
  if (amt <= 0) return;
  if (p.money < amt) {
    const mine = ownedBy(p.idx).sort((a, b) => S.tiles[a].inv - S.tiles[b].inv);
    for (const i of mine) {
      if (p.money >= amt) break;
      const v = sellTile(i);
      p.money += v;
      log(`💸 ${esc(p.name)} vendeu ${B[i].n} por ${fmt(v)}`);
    }
    renderTiles();
  }
  const paid = Math.min(amt, p.money);
  p.money -= paid;
  if (to) to.money += paid;
  renderPlayers();
  if (paid < amt) {
    p.out = true;
    ownedBy(p.idx).forEach(sellTile);
    log(`💀 ${esc(p.name)} faliu!`);
    sfx.bad();
    render();
    await toast(`💀 ${esc(p.name)} faliu!`, 1500);
    const live = alive();
    if (live.length === 1) await endGame(live[0], 'Todos os outros faliram!');
  }
}

/* ---------------- decisões ---------------- */
function botLevel(p, i, from, max) {
  for (let L = max; L > from; L--) {
    const c = costTo(i, from + 1, L, p);
    const left = p.money - c;
    if (L === 0 ? left >= 60 : left >= reserve()) return L;
  }
  return -1;
}

async function chooseLevel(p, i, from, title) {
  const T = S.tiles[i];
  const cur = from;
  let levels = [];
  if (cur === 3) levels = [4];
  else for (let L = cur + 1; L <= maxLvl(p); L++) levels.push(L);
  if (!levels.length) return -1;
  if (p.bot) {
    if (cur === 3) return p.money - costTo(i, 4, 4, p) >= reserve() ? 4 : -1;
    return botLevel(p, i, cur, Math.max(...levels));
  }
  const btns = levels.map((L) => {
    const c = costTo(i, cur + 1, L, p);
    return { label: `${LVL_ICON[L]} ${cur === -1 && L > 0 ? 'Terreno até ' : ''}${LVL_NAME[L]} · ${fmt(c)}`, value: L, disabled: c > p.money };
  });
  btns.push({ label: 'Agora não', value: -1, cls: 'ghost' });
  let note = '';
  if (cur < 3 && maxLvl(p) < 3) note = `<p class="small">Dê mais voltas no tabuleiro para liberar construções mais altas.</p>`;
  if (T.owner === p.idx && cur === 3) note = '<p class="small">O Marco Encantado não pode ser tomado por ninguém.</p>';
  return ask(title, tileInfo(i, p) + note + `<p>Você tem ${fmt(p.money)}</p>`, btns);
}

async function offerBuy(p, i) {
  const b = B[i];
  const T = S.tiles[i];
  if (b.t === 'attr') {
    const c = price(i);
    if (c > p.money) return;
    const ok = p.bot ? p.money - c >= reserve() * 0.7
      : await ask(`${b.e} ${b.n}`, tileInfo(i, p) + `<p>Você tem ${fmt(p.money)}</p>`,
        [{ label: `Comprar · ${fmt(c)}`, value: true }, { label: 'Agora não', value: false, cls: 'ghost' }]);
    if (!ok) return;
    p.money -= c; T.owner = p.idx; T.inv = c; T.lvl = 0;
  } else {
    const L = await chooseLevel(p, i, -1, `${b.e} ${b.n}`);
    if (L < 0) return;
    const c = costTo(i, 0, L, p);
    p.money -= c; T.owner = p.idx; T.lvl = L; T.inv = c;
  }
  sfx.coin();
  log(`🚩 ${esc(p.name)} comprou ${b.n}${b.t === 'prop' && T.lvl > 0 ? ` com ${LVL_NAME[T.lvl]}` : ''}`);
  render();
  if (p.bot) await sleep(400);
}

async function offerUpgrade(p, i) {
  const T = S.tiles[i];
  if (B[i].t !== 'prop' || T.lvl >= 4) return;
  const L = await chooseLevel(p, i, T.lvl, `${B[i].e} ${B[i].n} (sua)`);
  if (L < 0) return;
  const c = costTo(i, T.lvl + 1, L, p);
  p.money -= c; T.lvl = L; T.inv += c;
  sfx.magic();
  log(`${LVL_ICON[L]} ${esc(p.name)} construiu ${LVL_NAME[L]} em ${B[i].n}`);
  render();
  if (L === 4) await toast(`✨ Marco Encantado em ${B[i].n}!`);
  else if (p.bot) await sleep(400);
}

async function offerTakeover(p, i) {
  const T = S.tiles[i];
  const owner = S.players[T.owner];
  const c = takeoverCost(i, p);
  if (c > p.money) return false;
  let ok;
  if (p.bot) {
    const g = B[i].g;
    const others = groupTiles(g).filter((j) => j !== i);
    const completes = others.every((j) => S.tiles[j].owner === p.idx);
    ok = p.money - c >= reserve() + (completes ? 0 : 150) && Math.random() < 0.75;
  } else {
    ok = await ask(`Tomar ${B[i].e} ${B[i].n}?`,
      tileInfo(i, p) + `<p>Pague ${fmt(c)} a ${esc(owner.name)} e a terra (com construções) vira sua.</p><p>Você tem ${fmt(p.money)}</p>`,
      [{ label: `Tomar · ${fmt(c)}`, value: true }, { label: 'Deixa pra lá', value: false, cls: 'ghost' }]);
  }
  if (!ok) return false;
  p.money -= c; owner.money += c; T.owner = p.idx;
  sfx.magic();
  log(`🏴 ${esc(p.name)} tomou ${B[i].n} de ${esc(owner.name)} por ${fmt(c)}`);
  render();
  await toast(`🏴 ${esc(p.name)} tomou ${B[i].n}!`);
  return true;
}

/* ---------------- cartas ---------------- */
function highestBuilding(idx) {
  const list = ownedBy(idx).filter((i) => B[i].t === 'prop' && S.tiles[i].lvl >= 1 && S.tiles[i].lvl <= 3);
  list.sort((a, b) => S.tiles[b].inv - S.tiles[a].inv);
  return list[0];
}
function quake(i) {
  const T = S.tiles[i];
  T.inv -= stepCost(i, T.lvl, null);
  T.lvl--;
}
const CARDS = [
  { good: true, e: '💰', t: 'Um duende achou um baú de moedas! Ganhe 🪙150.', fx: async (p) => { p.money += 150; } },
  { good: true, e: '🛡️', t: 'Escudo de Luz! O próximo pedágio que você teria que pagar é anulado.', fx: async (p) => { p.shield++; } },
  { good: true, e: '🌬️', t: 'Vento mágico! Voe até a Largada.', fx: async (p) => { await moveSteps(p, (N - p.pos) % N || N); } },
  { good: true, e: '🎟️', t: 'Bilhete do Portal! Na sua próxima vez, viaje para onde quiser.', fx: async (p) => { p.portal = true; } },
  { good: true, e: '🎂', t: 'É seu aniversário no reino! Cada jogador te dá 🪙50.', fx: async (p) => { for (const o of alive()) if (o !== p) await pay(o, 50, p); } },
  {
    good: true, e: '🌋', t: 'Terremoto no rival! A maior construção do jogador mais rico perde um nível.',
    fx: async (p) => {
      const rich = alive().filter((o) => o !== p).sort((a, b) => assets(b) - assets(a));
      for (const o of rich) { const i = highestBuilding(o.idx); if (i !== undefined) { quake(i); log(`🌋 ${B[i].n} de ${esc(o.name)} perdeu um nível`); return; } }
    },
  },
  { good: false, e: '🤧', t: 'Uma bruxa espirrou no seu bolso! Pague 🪙100.', fx: async (p) => { await pay(p, 100, null); } },
  { good: false, e: '🌪️', t: 'Redemoinho! Vá direto para a Ilha Perdida.', fx: async (p) => { await goIsland(p); } },
  {
    good: false, e: '🌋', t: 'Terremoto! Sua maior construção perde um nível.',
    fx: async (p) => { const i = highestBuilding(p.idx); if (i !== undefined) { quake(i); log(`🌋 ${B[i].n} perdeu um nível`); } },
  },
  { good: false, e: '🐌', t: 'Um caracol gigante bloqueou o caminho. Volte 3 casas.', fx: async (p) => { await moveSteps(p, -3); await land(p); } },
];

async function drawCard(p) {
  const pool = p.char === 'coruja' ? CARDS.filter((c) => c.good) : CARDS;
  const c = pool[rnd(pool.length)];
  sfx.magic();
  log(`🔮 ${esc(p.name)}: ${c.t}`);
  const html = `<div class="card-magic"><span class="big-em">${c.e}</span>${c.t}</div>`;
  if (p.bot) await toast(html, 1500);
  else await ask('🔮 Carta Mágica', html, [{ label: 'OK', value: 1 }]);
  await c.fx(p);
  render();
}

/* ---------------- casas ---------------- */
async function land(p) {
  if (S.over || p.out) return;
  const i = p.pos;
  const b = B[i];
  const T = S.tiles[i];
  if (isBuyable(i)) {
    if (T.owner < 0) await offerBuy(p, i);
    else if (T.owner === p.idx) await offerUpgrade(p, i);
    else {
      const owner = S.players[T.owner];
      if (p.shield > 0) {
        p.shield--;
        log(`🛡️ O Escudo de Luz livrou ${esc(p.name)} do pedágio`);
        await toast('🛡️ Escudo de Luz! Pedágio anulado.');
      } else {
        const v = toll(i, p);
        log(`💸 ${esc(p.name)} pagou ${fmt(v)} de pedágio a ${esc(owner.name)}`);
        sfx.bad();
        await toast(`💸 Pedágio: ${fmt(v)} para ${esc(owner.name)}`);
        await pay(p, v, owner);
      }
      if (!p.out && !S.over && b.t === 'prop' && T.lvl < 4 && T.owner !== p.idx && !owner.out) {
        if (await offerTakeover(p, i)) await offerUpgrade(p, i);
      }
    }
  } else if (b.t === 'card') await drawCard(p);
  else if (b.t === 'island') await goIsland(p);
  else if (b.t === 'portal') {
    p.portal = true;
    log(`🌀 ${esc(p.name)} entrou no Portal Mágico`);
    await toast('🌀 Na próxima vez você viaja pra onde quiser!');
  } else if (b.t === 'tax') {
    const v = Math.max(20, Math.round(assets(p) * 0.1 / 5) * 5);
    log(`💰 O Coletor do Rei levou ${fmt(v)} de ${esc(p.name)}`);
    sfx.bad();
    await toast(`💰 Imposto do rei: ${fmt(v)}`);
    await pay(p, v, null);
  } else if (b.t === 'festival') await festival(p);
  render();
  if (!S.over && !p.out) await checkMonopoly(p);
}

async function festival(p) {
  const mine = ownedBy(p.idx);
  if (!mine.length) { log(`🎪 ${esc(p.name)} curtiu o Festival, mas não tem terras`); return; }
  let i;
  if (p.bot) i = mine.sort((a, b) => toll(b, null) - toll(a, null))[0];
  else i = await pickTile('🎪 Escolha uma terra sua para o Festival (pedágio em dobro)', (j) => mine.includes(j));
  S.festival = i;
  sfx.magic();
  log(`🎉 Festival em ${B[i].n}! Pedágio em dobro`);
  render();
}

async function choosePortal(p) {
  if (!p.bot) return pickTile('🌀 Toque na casa para onde quer viajar', (j) => j !== p.pos);
  const free = B.map((b, i) => i).filter((i) => isBuyable(i) && S.tiles[i].owner < 0 && price(i) <= p.money - reserve());
  if (free.length) return free.sort((a, b) => price(b) - price(a))[0];
  const mine = ownedBy(p.idx).filter((i) => B[i].t === 'prop' && S.tiles[i].lvl < 4);
  if (mine.length && p.money > reserve() * 2) return mine[rnd(mine.length)];
  return 0;
}

/* ---------------- vitória ---------------- */
async function checkMonopoly(p) {
  const full = GROUPS.filter((g, gi) => groupComplete(gi, p.idx)).length;
  if (full >= 3) return endGame(p, 'Monopólio Triplo! Dominou 3 reinos inteiros.');
  if (SIDES.some((side) => side.every((j) => S.tiles[j].owner === p.idx))) return endGame(p, 'Monopólio de Linha! Dominou um lado inteiro do tabuleiro.');
  if (ATTRS.every((j) => S.tiles[j].owner === p.idx)) return endGame(p, 'Monopólio das Atrações! Dono das 4 atrações.');
}

async function endGame(winner, why) {
  if (S.over) return;
  S.over = true;
  clearSave();
  render();
  sfx.magic();
  const rank = [...S.players].sort((a, b) => (a.out - b.out) || assets(b) - assets(a));
  const html = `<div class="card-magic"><span class="big-em">${charOf(winner).e}</span><b>${esc(winner.name)}</b> venceu!<br>${why}</div>
    <ul class="rank">${rank.map((p, k) => `<li><span>${k + 1}º <span style="color:${p.color}">●</span> ${esc(p.name)}</span><span>${p.out ? 'falido' : fmt(assets(p))}</span></li>`).join('')}</ul>
    <p class="small">Patrimônio = moedas + valor investido nas terras.</p>`;
  window.__result = { winner: winner.name, why, rounds: S.round };
  const v = await ask('🏆 Fim de jogo', html, [{ label: 'Jogar de novo', value: 1 }]);
  if (v) location.reload();
}

/* ---------------- turnos ---------------- */
async function playTurn(p) {
  if (p.portal) {
    p.portal = false;
    if (p.bot) await sleep(400);
    const dest = await choosePortal(p);
    log(`🌀 ${esc(p.name)} viajou para ${B[dest].n}`);
    await teleport(p, dest);
    await land(p);
    return;
  }
  if (p.island > 0) {
    let choice;
    if (p.bot) choice = p.money > 700 ? 'pay' : 'roll';
    else {
      choice = await ask('🏝️ Ilha Perdida', `<p>Você está na Ilha${p.island > 1 ? ` (até mais ${p.island} turnos)` : ' (último turno)'}. Tire uma dupla para escapar, ou pague para sair agora.</p>`,
        [{ label: `Pagar ${fmt(ISLAND_FEE)} e jogar`, value: 'pay', disabled: p.money < ISLAND_FEE }, { label: '🎲 Tentar tirar dupla', value: 'roll' }]);
    }
    if (choice === 'pay') {
      await pay(p, ISLAND_FEE, null);
      p.island = 0;
      log(`⛵ ${esc(p.name)} pagou o barqueiro e saiu da Ilha`);
      if (p.out) return;
    } else {
      const [a, b] = await getRoll(p);
      if (a === b) {
        p.island = 0;
        log(`⛵ ${esc(p.name)} escapou da Ilha com uma dupla!`);
        await moveSteps(p, a + b);
        await land(p);
      } else {
        p.island--;
        log(`🏝️ ${esc(p.name)} continua na Ilha${p.island === 0 ? ' (sai na próxima)' : ''}`);
      }
      return;
    }
  }
  let again = true;
  while (again && !S.over && !p.out) {
    const [a, b] = await getRoll(p);
    const dbl = a === b;
    if (dbl && ++p.doubles >= 3) {
      log('🌪️ Três duplas seguidas! Um redemoinho te levou');
      await goIsland(p);
      break;
    }
    await moveSteps(p, a + b);
    await land(p);
    again = dbl && p.island === 0 && !p.portal;
    if (again && !S.over && !p.out) { log(`🎲 Dupla! ${esc(p.name)} joga de novo`); await sleep(300); }
  }
  p.doubles = 0;
}

function advanceTurn() {
  let n = S.turn;
  do {
    n = (n + 1) % S.players.length;
    if (n === 0) S.round++;
  } while (S.players[n].out);
  S.turn = n;
}

async function gameLoop() {
  while (!S.over) {
    const p = S.players[S.turn];
    save();
    render();
    if (!p.bot && S.players.filter((q) => !q.bot && !q.out).length > 1) {
      await ask(`${charOf(p).e} Vez de ${esc(p.name)}`, '<p>Passe o celular para este jogador.</p>', [{ label: 'Estou pronto!', value: 1 }]);
    }
    await playTurn(p);
    if (S.over) break;
    await sleep(350);
    advanceTurn();
    if (S.round > S.maxRounds) {
      const best = alive().sort((a, b) => assets(b) - assets(a))[0];
      await endGame(best, `Acabaram as ${S.maxRounds} rodadas: maior patrimônio do reino!`);
    }
  }
}

/* ---------------- menu ---------------- */
const seats = [
  { type: 'human', name: 'Você', char: 'lua' },
  { type: 'bot', name: 'Bot Bento', char: 'bento' },
  { type: 'bot', name: 'Bot Mel', char: 'mel' },
  { type: 'off', name: 'Bot Faísca', char: 'faisca' },
];

function renderSeats() {
  $('#seats').innerHTML = seats.map((s, k) => {
    const ch = CHARS.find((c) => c.id === s.char);
    return `<div class="seat ${s.type === 'off' ? 'off' : ''}" data-k="${k}">
      <div class="av" style="border-color:${COLORS[k]}">${s.type === 'off' ? '·' : ch.e}</div>
      <select data-f="type">
        <option value="human" ${s.type === 'human' ? 'selected' : ''}>👤 Pessoa</option>
        <option value="bot" ${s.type === 'bot' ? 'selected' : ''}>🤖 Bot</option>
        ${k >= 2 ? `<option value="off" ${s.type === 'off' ? 'selected' : ''}>— Vazio</option>` : ''}
      </select>
      <input class="hideoff" data-f="name" maxlength="14" value="${esc(s.name)}" aria-label="Nome">
      <select class="full hideoff" data-f="char">${CHARS.map((c) => `<option value="${c.id}" ${c.id === s.char ? 'selected' : ''}>${c.e} ${c.n}</option>`).join('')}</select>
      <p class="desc hideoff">${ch.d}</p></div>`;
  }).join('');
}

$('#seats').addEventListener('change', (e) => {
  const el = e.target;
  const k = +el.closest('.seat').dataset.k;
  const f = el.dataset.f;
  if (f === 'type' && el.value === 'bot' && seats[k].type === 'human' && seats[k].name === 'Você') seats[k].name = 'Bot ' + CHARS.find((c) => c.id === seats[k].char).n.split(',')[0];
  if (f === 'type' && el.value === 'human' && seats[k].name.startsWith('Bot ')) seats[k].name = 'Jogador ' + (k + 1);
  seats[k][f] = el.value;
  renderSeats();
});
$('#seats').addEventListener('input', (e) => {
  if (e.target.dataset.f === 'name') seats[+e.target.closest('.seat').dataset.k].name = e.target.value;
});

function startGame(state) {
  S = state;
  SPEED = S.speed || 1;
  $('#menu').classList.add('hidden');
  $('#game').classList.remove('hidden');
  buildBoard();
  showDice(1 + rnd(6), 1 + rnd(6));
  render();
  gameLoop();
}

$('#btnStart').onclick = () => {
  const active = seats.filter((s) => s.type !== 'off');
  const players = active.map((s, k) => ({
    idx: k, name: (s.name || '').trim() || `Jogador ${k + 1}`, char: s.char, bot: s.type === 'bot',
    color: COLORS[seats.indexOf(s)], money: START_MONEY, pos: 0, laps: 0, island: 0, shield: 0,
    portal: false, doubles: 0, out: false,
  }));
  startGame({
    players, tiles: B.map(() => ({ owner: -1, lvl: 0, inv: 0 })), festival: -1, turn: 0, round: 1,
    maxRounds: +$('#optRounds').value, speed: +$('#optSpeed').value, over: false, log: ['✨ Que comece a aventura!'],
  });
};

$('#btnContinue').onclick = () => { const s = loadSave(); if (s) startGame(s); };
$('#btnMute').onclick = () => { muted = !muted; $('#btnMute').textContent = muted ? '🔇' : '🔊'; };
$('#btnQuit').onclick = async () => {
  if (!$('#modal').classList.contains('hidden')) return;
  const v = await ask('Sair da partida?', '<p>A partida fica salva no início da vez de cada jogador. Dá pra continuar depois pelo menu.</p>',
    [{ label: 'Sair', value: 1 }, { label: 'Voltar ao jogo', value: 0, cls: 'ghost' }]);
  if (v) location.reload();
};

$('#board').addEventListener('click', (e) => {
  const el = e.target.closest('.tile');
  if (!el) return;
  const i = +el.dataset.i;
  if (picker) { if (picker.filter(i)) finishPick(i); return; }
  if (!$('#modal').classList.contains('hidden')) return;
  const cur = S.players[S.turn];
  // só mostra informação; não interrompe o jogo
  const card = $('#modalCard');
  card.innerHTML = `<h2>${B[i].e} ${B[i].n}</h2>${tileInfo(i, cur.bot ? null : cur)}<div class="btns"><button>Fechar</button></div>`;
  card.querySelector('button').onclick = () => $('#modal').classList.add('hidden');
  $('#modal').classList.remove('hidden');
});

renderSeats();
if (loadSave()) $('#continueBox').classList.remove('hidden');
