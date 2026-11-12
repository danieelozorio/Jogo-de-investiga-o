# 🌙 Noite na Vila

Jogo de dedução social pra jogar **sentados em roda, cada um no seu celular** (ideal: 6 a 8 pessoas, funciona de 5 a 12).
De noite, cada um escolhe pelo celular **qual casa vai visitar**. De dia, a vila **debate cara a cara** e vota em quem expulsar.

Toda a lógica secreta roda no banco (Supabase). Nenhum celular, nem o de quem criou a sala, sabe o papel dos outros.

## Papéis
| | Papel | O que faz de noite |
|---|---|---|
| 🔪 | Assassino (2 com 8+ jogadores) | Ataca uma casa. Se o dono estiver lá, morre. Quem estiver na casa vê o assassino. |
| 👁️ | Vigia | Fica em casa e vê quem entrou numa casa. |
| 🌿 | Benzedeira | Vai até uma casa e protege o dono de um ataque. |
| 🗣️ | Fofoqueira (6+) | Fica em casa e descobre pra onde uma pessoa foi. |
| 🍺 | Bêbado (7+) | Acha que é Vigia, mas vê coisa errada. |
| 🏠 | Morador | Visita uma casa (ou fica na sua) e vê quem estava lá. |

Pra testar sozinho ou completar a roda, quem criou a sala pode **adicionar bots** 🤖 no saguão. Eles jogam sozinhos, no aleatório.

Cada um pode colocar **uma foto do rosto** no saguão (tirar na hora ou escolher da galeria). Ela aparece na bolinha do mapa, com o nome embaixo.
O fundo do mapa pode ser trocado por uma imagem: veja `img/LEIAME.md`.

Mortos viram **almas penadas**: não falam mais, mas de noite podem deixar uma palavra na porta de uma casa.
A vila vence se expulsar todos os assassinos. Os assassinos vencem quando forem tantos quanto o resto.

## Como colocar no ar
1. **Supabase:** crie um projeto em supabase.com. No **SQL Editor**, cole todo o conteúdo de `supabase.sql` e clique em **Run**.
2. **Chaves:** em **Project Settings → API**, copie a *Project URL* e a chave *anon public* para o arquivo `config.js`.
   Nunca use a chave `service_role`.
3. **GitHub Pages:** em **Settings → Pages**, escolha a branch e a pasta `/ (root)`.
4. Abra `https://<seu-usuario>.github.io/Jogo-de-investiga-o/`, crie a sala e mande o link no grupo.

> No plano grátis, o Supabase pausa o projeto depois de 1 semana sem uso. Antes de jogar, entre no painel e clique em **Restore**.
> Salas paradas há mais de 2 dias são apagadas sozinhas.

## Arquivos
- `supabase.sql`: tabelas e regras do jogo (noite, votação, vitória)
- `config.js`: URL e chave do seu Supabase
- `index.html`, `app.js`, `style.css`: o app do celular
