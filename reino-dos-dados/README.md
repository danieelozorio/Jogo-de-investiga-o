# 🎲 Reino dos Dados

Jogo de tabuleiro **em 3D** com as lendas do **folclore brasileiro**, pra celular e navegador, no estilo "banco imobiliário digital": role os dados, compre terras, construa até um **Marco Encantado** e faça os rivais pagarem pedágio.

- De 2 a 4 jogadores: contra **bots** ou passando o celular entre pessoas (dá pra misturar).
- 6 personagens do folclore, cada um com um poder: Saci, Iara, Curupira, Boto-cor-de-rosa, Cuca e Boitatá.
- O tabuleiro passa por 4 biomas: Amazônia, Pantanal, Sertão e Litoral.
- **Barra dos dados:** toque em *Rolar* quando o marcador estiver na zona que você quer (baixo, médio ou alto).
- **Tomar terras:** depois de pagar o pedágio, compre a terra do rival pagando o dobro do que ele investiu.
- **Vitória:** levar todos à falência, fazer um Monopólio (3 reinos, um lado inteiro ou as 4 atrações) ou ter o maior patrimônio no fim das rodadas.
- A partida é salva no aparelho e pode ser continuada depois.

Não precisa de servidor nem banco: é só HTML, CSS e JS. O tabuleiro 3D usa o [Three.js](https://threejs.org) (r128, carregado do cdnjs) e fica todo em `view3d.js`; as regras ficam em `game.js`. No GitHub Pages fica em
`https://<seu-usuario>.github.io/Jogo-de-investiga-o/reino-dos-dados/`.

Teste rápido só com bots: abra `index.html?turbo`, coloque todos como Bot e clique em Começar.

As ilustrações ficam em `img/` (personagens recortados com contorno, mapa do centro do tabuleiro e capa).
