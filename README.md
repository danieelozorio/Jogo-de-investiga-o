# 🧉 Mistério no CTG: O Sumiço da Cuia de Prata

Jogo de investigação pra jogar com a turma do CTG, **cada um no seu celular, todos na mesma roda**.
Os personagens são vocês mesmos, com cargos do CTG sorteados (Patrão/Patroa, Gaiteiro(a), Prenda Laçadora, Posteiro(a) da Cozinha…).

Não precisa de servidor nem de instalação: é uma página web. O anfitrião sorteia o caso, manda o link no grupo
e todos os celulares montam **exatamente o mesmo caso** a partir dele.

## Como colocar no ar (GitHub Pages, grátis)
1. No GitHub: **Settings → Pages → Branch** e escolha a branch do jogo, pasta `/ (root)`.
2. Espere 1 minuto. O jogo fica em `https://<seu-usuario>.github.io/Jogo-de-investiga-o/`.
3. No celular, dá pra usar "Adicionar à tela inicial" e abrir como app.

Pra testar no computador: `python3 -m http.server` na pasta e abra `http://localhost:8000`.

## Como jogar (resumo)
- **4 a 8 jogadores.** Um deles é o culpado, e só ele sabe.
- **Inocente não mente** (pode dizer "não digo, tchê"). **O culpado pode mentir.**
- **Pista só vale com código** (ex.: `CUIA-7K2`). Quem recebe digita na Caderneta e o app confirma com o **Selo do CTG**.
  ⚠️ O culpado tem **pistas falsas com selo autêntico**.
- **Roda de Chimarrão:** rodadas com um evento sorteado (Vanerão, Chula, Laçaço…) e cronômetro. A cuia passa pra direita.
- **Ida ao Galpão:** 1x por partida, chame alguém pra conversar a sós. Cada um mostra 1 pista.
- **Julgamento no Fogo de Chão:** todos votam em segredo e viram o celular juntos. Depois: "Revelar a verdade".
- **Missão de Galpão:** objetivo secreto bobo que vale +1 ponto.

## Personalizar
Tudo de conteúdo fica em `data.js`: cargos e motivos, locais, textos das pistas, eventos da roda e missões.
Troque à vontade pra colocar piadas internas da invernada!

## Arquivos
- `index.html`, `style.css`: página e visual
- `data.js`: conteúdo do jogo
- `app.js`: sorteio do caso (com semente), telas, caderneta, cronômetro e julgamento
