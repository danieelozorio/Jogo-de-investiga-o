# 🔍 Mistério no CTG

Jogo de dedução pra jogar **sentados em roda, de 6 a 8 pessoas, cada um no seu celular**.
Um crime aconteceu no CTG e os suspeitos são vocês. Descubram **quem** foi, **com qual arma** e **em que lugar**.

- **Suspeitos:** os próprios jogadores
- **Armas:** Cuia, Xis, Espora, Bomba de chimarrão, Laço, Boleadeira, Espeto, Garrafa térmica, Gaita
- **Locais:** Salão de Baile, Cozinha, Galpão, Churrasqueira, Bar, Palco, Mangueira, Secretaria, Estacionamento

Não precisa de servidor: o anfitrião sorteia a partida, manda o link no grupo e todos os celulares montam a mesma partida.

## Como colocar no ar (GitHub Pages, grátis)
1. No GitHub: **Settings → Pages → Branch**, escolha a branch do jogo e a pasta `/ (root)`.
2. Em cerca de 1 minuto o jogo fica em `https://<seu-usuario>.github.io/Jogo-de-investiga-o/`.

Pra testar no computador: `python3 -m http.server` na pasta e abra `http://localhost:8000`.

## Como jogar
1. O anfitrião cria a partida com os nomes **na ordem em que estão sentados** e manda o link.
2. Cada um abre o link, escolhe o próprio nome e vê as suas cartas (secretas). Essas cartas não são a resposta.
3. **Na sua vez**, faça um palpite em voz alta: "Acho que foi *Fulano*, com *a Cuia*, *na Cozinha*."
4. O jogador à esquerda abre **Responder** e marca as três cartas. O app mostra quais ele tem; ele escolhe **uma** e mostra a tela só pra quem perguntou. Se não tiver nenhuma, passa pro próximo da roda.
5. Todos podem registrar o palpite na aba **Palpite**. A **Caderneta** se preenche sozinha.
6. Quando achar que sabe a resposta, use **Acusar** (só uma vez!). Acertou, venceu. Errou, continua só mostrando cartas.

## Personalizar
Armas e locais ficam em `data.js`. Dá pra trocar por piadas internas da turma.
