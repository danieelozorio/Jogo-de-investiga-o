'use strict';
// ============================================================
// Conteúdo do jogo. Edite à vontade!
// Suspeitos = os próprios jogadores (definidos ao criar a partida).
// ============================================================

const ARMAS = [
  { id: 'cuia', art: 'a',      nome: 'Cuia',               icon: '🧉' },
  { id: 'xis', art: 'o',       nome: 'Xis',                icon: '🍔' },
  { id: 'espora', art: 'a',    nome: 'Espora',             icon: '⭐' },
  { id: 'bomba', art: 'a',     nome: 'Bomba de chimarrão', icon: '🥢' },
  { id: 'laco', art: 'o',      nome: 'Laço',               icon: '🪢' },
  { id: 'boleadeira', art: 'a',nome: 'Boleadeira',         icon: '🪨' },
  { id: 'espeto', art: 'o',    nome: 'Espeto',             icon: '🍢' },
  { id: 'termica', art: 'a',   nome: 'Garrafa térmica',    icon: '🫖' },
  { id: 'gaita', art: 'a',     nome: 'Gaita',              icon: '🪗' },
];

const LOCAIS = [
  { id: 'salao', em: 'no',      nome: 'Salão de Baile',  icon: '💃' },
  { id: 'cozinha', em: 'na',    nome: 'Cozinha',         icon: '🍳' },
  { id: 'galpao', em: 'no',     nome: 'Galpão',          icon: '🛖' },
  { id: 'churrasq', em: 'na',   nome: 'Churrasqueira',   icon: '🔥' },
  { id: 'bar', em: 'no',        nome: 'Bar',             icon: '🍺' },
  { id: 'palco', em: 'no',      nome: 'Palco',           icon: '🎤' },
  { id: 'mangueira', em: 'na',  nome: 'Mangueira',       icon: '🐴' },
  { id: 'secretaria', em: 'na', nome: 'Secretaria',      icon: '📁' },
  { id: 'estac', em: 'no',      nome: 'Estacionamento',  icon: '🚗' },
];
