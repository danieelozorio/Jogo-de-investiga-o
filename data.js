'use strict';
// ============================================================
// Conteúdo do jogo: personagens, locais, pistas, eventos.
// Edite à vontade pra deixar com a cara do seu CTG!
// ============================================================

// Cargos (o app sorteia um pra cada jogador). m = peão, f = prenda
const ROLES = [
  { id: 'patrao', m: 'Patrão do CTG', f: 'Patroa do CTG', icon: '🎩',
    motivo: 'Corre o boato de que a cuia ia ser vendida pra pagar a reforma do galpão — e a patronagem andava muito quieta sobre o assunto.' },
  { id: 'gaiteiro', m: 'Gaiteiro', f: 'Gaiteira', icon: '🪗',
    motivo: 'Perdeu a cuia numa aposta de truco com o fundador, anos atrás, e diz pra quem quiser ouvir que "foi roubado no carteado".' },
  { id: 'lacador', m: 'Peão Laçador', f: 'Prenda Laçadora', icon: '🪢',
    motivo: 'Queria que a cuia fosse o troféu do rodeio de laço, mas a diretoria negou na última reunião. Saiu batendo a porteira.' },
  { id: 'instrutor', m: 'Instrutor da Invernada', f: 'Instrutora da Invernada', icon: '💃',
    motivo: 'Brigou feio com a patronagem porque a invernada ficou sem verba pra viagem do ENART.' },
  { id: 'posteiro', m: 'Posteiro da Cozinha', f: 'Posteira da Cozinha', icon: '🍖',
    motivo: 'É quem tem a chave da cozinha — e a cozinha tem uma porta dos fundos que dá direto na Sala dos Troféus.' },
  { id: 'declamador', m: 'Declamador', f: 'Declamadora', icon: '📜',
    motivo: 'Escreveu uma poesia sobre a cuia e jurou, em voz alta, que ela "merecia estar nas mãos de quem a valoriza".' },
  { id: 'capataz', m: 'Capataz', f: 'Capataz', icon: '🔑',
    motivo: 'Responsável por trancar a Sala dos Troféus... e justo hoje "esqueceu" a vitrine só no trinco.' },
  { id: 'tesoureiro', m: 'Tesoureiro', f: 'Tesoureira', icon: '💰',
    motivo: 'Foi visto perguntando num antiquário de Porto Alegre quanto vale prata antiga. "Era só curiosidade", jura.' },
];

// Traços públicos (todo mundo vê na ficha dos suspeitos)
const TRAITS = {
  lenco:   { nome: 'Lenço/fita', vals: { vermelho: 'Vermelho', branco: 'Branco', azul: 'Azul' } },
  calcado: { nome: 'Calçado',    vals: { bota: 'Bota de couro', alpargata: 'Alpargata' } },
  mao:     { nome: 'Mão do mate', vals: { destro: 'Destro(a)', canhoto: 'Canhoto(a)' } },
};

// Locais (traço SECRETO: cada um só sabe o seu; o culpado pode mentir)
const LOCS = {
  galpao:    { nome: 'Galpão Crioulo', icon: '🔥', estava: 'no Galpão Crioulo, cuidando do fogo de chão',
               vestigio: 'um rastro de cinza de fogo de chão',
               viu: 'atiçando o fogo de chão no Galpão Crioulo' },
  cozinha:   { nome: 'Cozinha', icon: '🍖', estava: 'na Cozinha, virando a costela no espeto',
               vestigio: 'pingos de graxa de costela e grãos de sal grosso',
               viu: 'na Cozinha, com a mão na graxa da costela' },
  salao:     { nome: 'Salão de Baile', icon: '🎶', estava: 'no Salão de Baile, dançando uma vaneira',
               vestigio: 'serragem do assoalho do salão de baile',
               viu: 'dançando uma vaneira no Salão de Baile' },
  mangueira: { nome: 'Mangueira', icon: '🐴', estava: 'na Mangueira, cuidando dos cavalos',
               vestigio: 'palha e barro da mangueira dos cavalos',
               viu: 'lá na Mangueira, encilhando um cavalo' },
};

// Texto das pistas sobre o culpado. variant 0 e 1 (a 1 é usada em grupos grandes)
const TRAIT_CLUES = {
  lenco: [
    v => ({ icon: '🧵', title: 'Fio na vitrine',
      text: `Preso na fechadura da vitrine ficou um fiozinho de lenço/fita <b>${v.toLowerCase()}</b>.`,
      concl: `O culpado usava lenço/fita ${v.toLowerCase()}.` }),
    v => ({ icon: '🔦', title: 'Clarão no escuro',
      text: `Durante o apagão alguém acendeu um isqueiro e viu uma ponta de pano <b>${v.toLowerCase()}</b> sumindo pela porta da Sala dos Troféus.`,
      concl: `O culpado usava lenço/fita ${v.toLowerCase()}.` }),
  ],
  calcado: [
    v => ({ icon: '👣', title: 'Pegada no barro',
      text: v === 'Bota de couro'
        ? 'No barro da entrada da Sala dos Troféus: marca funda de <b>salto de bota de couro</b>.'
        : 'No barro da entrada da Sala dos Troféus: marca de <b>sola de corda trançada — alpargata</b>.',
      concl: `O culpado calçava ${v.toLowerCase()}.` }),
    v => ({ icon: '👂', title: 'Passos no assoalho',
      text: v === 'Bota de couro'
        ? 'No meio do apagão ouviram o <b>toc-toc pesado de bota</b> no assoalho de madeira.'
        : 'No meio do apagão, passos <b>quase sem som</b> no assoalho — coisa de alpargata.',
      concl: `O culpado calçava ${v.toLowerCase()}.` }),
  ],
  mao: [
    v => ({ icon: '🧉', title: 'A bomba virada',
      text: `O culpado largou um mate pela metade na vitrine, com a bomba virada pro lado <b>${v.startsWith('Canhoto') ? 'esquerdo' : 'direito'}</b> — jeito de quem é ${v.toLowerCase()}.`,
      concl: `O culpado é ${v.toLowerCase()}.` }),
    v => ({ icon: '🔒', title: 'O trinco',
      text: `O trinco da vitrine foi aberto girando pra um lado que só quem é <b>${v.toLowerCase()}</b> giraria.`,
      concl: `O culpado é ${v.toLowerCase()}.` }),
  ],
  loc: [
    l => ({ icon: '🔎', title: 'Vestígio no chão',
      text: `Junto à vitrine vazia: <b>${l.vestigio}</b>. O culpado veio direto de lá.`,
      concl: `O culpado estava em: ${l.nome}, logo antes do apagão.` }),
    l => ({ icon: '🐕', title: 'O faro do Chimango',
      text: `O Chimango, cachorro do CTG, farejou a vitrine e saiu correndo direto pra <b>${l.nome}</b>.`,
      concl: `O culpado estava em: ${l.nome}, logo antes do apagão.` }),
  ],
};

// Prefixos dos códigos de pista (coisas do meio gaúcho)
const CODE_PREFIX = ['LACO','CUIA','BOMBA','ESPORA','GAITA','PALA','BOTA','FACA','MATE','LENCO',
  'GUAIACA','CHAPEU','ERVA','PILCHA','SELA','ARREIO','BOMBACHA','RELHO','CHULA','TROPA','POTRO','FOGO'];

// Eventos da Roda de Chimarrão (sorteados, um por rodada — iguais pra todos)
const EVENTS = [
  { icon: '🎶', title: 'Vanerão!',
    text: 'Todo mundo troca de lugar com quem está à sua direita. Cada um mostra o código de UMA pista pro novo vizinho da esquerda.' },
  { icon: '💡', title: 'Caiu a luz de novo!',
    text: '30 segundos de silêncio total (marquem no cronômetro). Ninguém fala, só anota. Depois, quem estiver com a cuia diz em voz alta quem achou mais nervoso.' },
  { icon: '🎩', title: 'A Patronagem pede ordem',
    text: 'Quem está com a cuia faz UMA pergunta de sim ou não pra qualquer um. A resposta é obrigatória (inocente não mente!).' },
  { icon: '🥾', title: 'Chula na Lança',
    text: 'Quem está com a cuia escolhe duas pessoas. As duas ficam frente a frente e dizem, ao mesmo tempo, onde estavam antes do apagão.' },
  { icon: '📜', title: 'Causo do Declamador',
    text: 'Quem está com a cuia conta um "causo" de 3 frases sobre a noite. Pode ser verdade ou bravata. Os outros votam: "verdade" ou "mentira, tchê!"' },
  { icon: '👉', title: 'Dedo na Ferida',
    text: 'Contando até 3, todo mundo aponta pra quem acha mais suspeito. O mais apontado é obrigado a mostrar o código de uma pista pra quem quiser.' },
  { icon: '🧉', title: 'Mate de Retribuição',
    text: 'Quem recebeu alguma pista desde o início da partida e nunca mostrou nenhuma tem que mostrar uma agora pra quem pedir.' },
  { icon: '🪢', title: 'Laçaço!',
    text: 'Quem está com a cuia "laça" alguém: os dois vão pro Galpão (um canto longe da roda) por 1 minuto e cada um mostra UMA pista pro outro.' },
  { icon: '🐴', title: 'Tropeada',
    text: 'Todo mundo diz em voz alta UMA coisa que sabe sobre o culpado (um traço), sem dizer de onde tirou. Quem repetir o que outro já disse paga uma prenda.' },
  { icon: '🔥', title: 'Fogo de Chão',
    text: 'Rodada rápida: cada um, em ordem, diz o nome de um inocente e justifica em uma frase. Não pode repetir nome.' },
];

// Missões secretas (pontinho extra, autodeclarado no final)
const MISSOES = [
  'Faça três pessoas diferentes dizerem "bah" ou "tchê" durante o jogo.',
  'Consiga ver uma pista de alguém sem mostrar nenhuma sua em troca.',
  'Convença alguém a ir com você pro Galpão (conversa a sós).',
  'Faça alguém te oferecer um mate (ou um copo de qualquer coisa) durante o jogo.',
  'Termine o jogo com pelo menos 4 pistas recebidas na caderneta.',
  'Declame ou cante um verso gaúcho sem ninguém pedir.',
  'Faça alguém mudar de opinião sobre quem é o principal suspeito.',
  'Descubra onde TODOS estavam antes do apagão antes do Julgamento.',
  'Chame todo mundo de "vivente" pelo menos uma vez.',
  'Faça alguém te defender quando você for acusado(a).',
];
