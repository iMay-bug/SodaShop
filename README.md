Sobre o Projeto

SodaPop é uma aplicação React conceitual para uma marca de refrigerantes artesanais. O objetivo do projeto foi explorar os limites do desenvolvimento Front-end moderno, combinando WebGL nativo para backgrounds performáticos, CSS 3D para manipulação de objetos sem bibliotecas 3D pesadas, e uma UI responsiva e elegante.

O projeto apresenta um catálogo completo com 26 sabores, sistema de carrinho funcional e efeitos visuais avançados para destacar produtos exclusivos.

Funcionalidades

Fundo Fluido em WebGL: Um shader fragment personalizado que cria um efeito de "fios" líquidos que reagem ao mouse e ao tempo, rodando em um canvas nativo (sem Three.js para o fundo).

Lata 3D CSS Pura: Renderização de uma lata de refrigerante giratória usando apenas transformações CSS (rotate3d, perspective), altamente performática.

Carrinho Funcional:

Adicionar produtos do catálogo.

Animação de "pop" no ícone do carrinho.

Listagem, remoção de itens e cálculo de total.

Efeito Electric Border: Um efeito de borda animada processual usando Canvas 2D e Noise algorithms para destacar produtos "Best Seller" (Dourado) e "Edição Limitada" (Neon).

Design Responsivo: Layout adaptativo que transita de uma experiência "Split Screen" no desktop para uma navegação vertical fluida no mobile.

Catálogo Filtrável: Busca em tempo real e visualização em grid com badges dinâmicas.

Tecnologias Utilizadas

React: Hooks avançados (useRef, useMemo, useCallback, useEffect) para gerenciamento de estado e animações.

WebGL (GLSL): Shaders personalizados para o background.

CSS3: Variáveis CSS, Flexbox, Grid, Animações Keyframe e 3D Transforms.

JavaScript (ES6+): Lógica de negócios e manipulação de canvas.
