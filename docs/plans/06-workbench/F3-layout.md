# F3 — Moldura, abas de pasta e a casca do workbench (web)

Plano: [06 — Workbench](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-open-folder.md).
**Entrega:** o web com cara e comportamento de ferramenta profissional — sistema visual
consistente, navegação global de uma tela por assunto, a moldura de tela reutilizável com ajuda,
abas de pasta com estado isolado, e a casca do workbench (activity bar, side bar, editor, secondary
side bar, painel, status bar) redimensionável e responsiva.

---

## Por quê

"Muito pobre" e "não misture os assuntos" são duas queixas diferentes, e esta fase responde às
duas pela estrutura, não por enfeite:

- **a pobreza** vem de uma coluna `max-w-3xl` empilhando cards de assuntos que não têm relação
  (seletor de workspace, ping de diagnóstico, dispositivos). A casca de painéis dá a cada coisa o
  seu lugar fixo, como no VS Code — o usuário sabe onde procurar antes de procurar;
- **a mistura** se resolve com uma regra: cada assunto tem uma tela, cada tela tem uma rota e a
  mesma moldura. A [F5](F5-screens.md) põe as telas; esta fase põe a navegação e a moldura que elas
  usam.

As views do workbench (Explorer, Busca, Sessões do Claude) e os painéis do Claude e do terminal
chegam vazios — **placeholders com estado vazio traduzido** — e são preenchidos pelos planos
[07](../07-explorer-and-editor/README.md), [08](../08-claude-panel/README.md),
[09](../09-search/README.md) e [10](../10-integrated-terminal/README.md). A casca
é o contrato de onde cada um encaixa.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-17 — Sistema visual: densidade, tokens, tema e ícones ✅

O que torna a ferramenta "profissional e organizada" é consistência, e consistência só existe se
for verificada. Critérios de aceite, escritos em [web/03](../../architecture/web/03-ui-system.md#tema)
na B-02:

- **densidade no molde do VS Code**: linhas de lista e itens de árvore compactos, cabeçalhos de
  painel baixos — **sem** abrir mão do alvo de toque de 44×44 px abaixo de `md`
  ([Responsividade](../../architecture/web/03-ui-system.md#responsividade));
- **escala de espaçamento e tipografia por token** em `globals.css` (tamanhos de texto da UI e do
  código, pesos, espaçamentos, raios); componente usa o token, nunca o valor;
- **temas claro e escuro** — e só eles —, escuro como default quando `prefers-color-scheme: dark`,
  a escolha do usuário persistida por visitante; `localStorage` inacessível não quebra — cai no
  default. Toda variável existe nos dois temas, verificado por teste;
- **ícones só do `lucide-react`**, com `aria-label` traduzido quando sem texto, e tooltip em todo
  controle só de ícone;
- primitivos shadcn que a casca precisa, gerados e não reescritos: `resizable`, `command`,
  `menubar`, `context-menu`, `tabs`, `tooltip`, `dropdown-menu`, `sheet`, `dialog`, `scroll-area`,
  `select`, `separator`, `sonner` (toasts);
- contraste AA nos dois temas, verificado pelo axe.

Onde a regra não é verificada por máquina ainda — cor literal em classe (`bg-[#…]`, `text-red-500`)
em componente de feature, ícone de outra biblioteca —, esta task acrescenta a verificação ao lint
([regra 9 do AGENTS.md](../../../AGENTS.md#regras-que-valem-sempre-não-precisam-de-leitura-adicional)).

> **Na execução:** `command`, `menubar` e `sonner` nascem na F4 e `select` na F5, com quem os usa;
> `scroll-area` não foi preciso ([D-27](decisions.md#d-27--o-que-a-f3-deixa-para-a-f4-e-a-f5)). O
> lint ganhou `no-literal-colour` e `icons-only-lucide`
> ([09-code-quality](../../architecture/shared/09-code-quality.md)). O contraste AA nos dois temas é
> medido pelo axe no navegador, na F6 (S-162); aqui o axe roda sobre cada tela em jsdom.

### B-18 — Moldura do app e navegação global: uma tela por assunto ✅

A moldura substitui o `Screen` de coluna única em **todas** as rotas. Navegação global à esquerda
(fora das abas de pasta), na ordem:

**Workbench** · **Auditoria** · **Regras** · **Dispositivos** · **Uso e custo** · **Logs e
diagnóstico** · **Configuração do Claude** · **Configurações**

- a navegação é um **registro**: cada entrada declara rota, ícone, rótulo, posição e badge
  opcional. "Uso e custo" e "Configuração do Claude" são entradas que os planos
  [14](../14-usage-and-cost/README.md) e [11](../11-claude-settings/README.md) registram — este plano
  reserva a posição e a rota, e **não** renderiza link sem destino;
- no rodapé, o menu de **gerenciar** (engrenagem, como no VS Code: paleta de comandos,
  Configurações, Sobre) e o menu de **conta** (quem está logado, sair);
- Configurações do app e configuração do Claude **nunca** dividem tela — a regra da
  [ADR-014](F0-contract.md#b-01--adr-014-o-web-vira-um-workbench-construído-em-react-);
- o item ativo segue a rota, inclusive por deep link (`/audit?…`, `/rules/$ruleId`);
- o portão de login que o `Screen` fazia (`SignedIn`, `returnTo`) vai junto, sem mudar o
  comportamento: o deep link aberto deslogado volta **com** a search;
- abaixo de `md`, a navegação vira um menu (`sheet`) com foco preso e `Esc` fecha
  ([D-08](decisions.md#d-08--o-workbench-em-tela-pequena)).

> **Na execução:** a moldura e o portão de login moram num layout sem caminho (`_frame`), e o
> `returnTo` é o endereço na tela. **Workbench** leva à aba ativa ([D-25](decisions.md#d-25--quando--passa-a-levar-à-aba-ativa),
> S-187), e `/` segue a boas-vindas até a B-33. Dispositivos, Logs e diagnóstico e Configurações se
> registram com as suas telas (F5); o menu de gerenciar não aparece enquanto ninguém registra nele.

### B-19 — Moldura de tela: cabeçalho, propósito e ajuda ✅

Componente compartilhado em `shared/components/` que toda tela fora do workbench usa — as deste
plano (Dispositivos, Logs e diagnóstico, Configurações, Sobre) e as dos planos
[11](../11-claude-settings/README.md), [12](../12-audit-explained/README.md),
[13](../13-rules-management/README.md), [14](../14-usage-and-cost/README.md),
[15](../15-devices/README.md) e [16](../16-logs-and-diagnostics/README.md):

- **cabeçalho**: título, **propósito numa linha** ("o que foi executado na sua máquina sem
  perguntar"), ações da tela à direita;
- **painel de ajuda** (drawer à direita em `md+`, `sheet` abaixo), aberto pelo ícone de ajuda do
  cabeçalho, pelo atalho e pela paleta, com quatro partes fixas: **o que é esta tela**, **o que
  cada estado significa**, **o que ela NÃO mostra ou NÃO registra** (a trilha não guarda conteúdo
  de arquivo, por exemplo) e **os atalhos da tela** (lidos do registro da B-23, nunca repetidos à
  mão). O conteúdo é chave de i18n da tela, escrito para quem nunca viu o produto; seções com
  âncora, para que o "saiba mais" de um controle abra a seção certa;
- corpo com largura e espaçamento da tela; os quatro estados por conta de quem a usa;
- o estado do painel (aberto/fechado) é conveniência por visitante, com `try/catch`.

> **Na execução:** a ajuda abre pelo ícone; o atalho e a paleta chegam com o registro da B-23, e os
> atalhos listados vêm da tela até lá ([D-27](decisions.md#d-27--o-que-a-f3-deixa-para-a-f4-e-a-f5)).
> Auditoria, Regras, a regra, a sessão, o histórico e a boas-vindas já usam a moldura, com a ajuda
> mínima que o conteúdo de hoje sustenta; a completa é da B-34.

É o que faz as telas parecerem uma família em vez de páginas soltas — e o que impede cada plano
seguinte de inventar o seu cabeçalho.

### B-20 — Abas de pasta ✅

Cada aba é um **workbench completo de uma pasta**, várias abertas ao mesmo tempo:

- abrir uma pasta cria uma aba e a ativa; **abrir uma já aberta foca a existente** (por caminho
  real — pasta e subpasta são abas distintas);
- **estado isolado por aba**: store criado por fábrica e chaveado pelo caminho real, nunca um
  global compartilhado ([web/04](../../architecture/web/04-state-and-data.md#onde-cada-estado-mora)).
  O store global `useWorkspaceStore.selected` é o anti-exemplo, e sai na B-33;
- a aba ativa está na URL (`/workbench?folder=`); o conjunto e a ordem ficam **no servidor**
  ([D-10](decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas)), e a janela os relê ao ganhar
  foco e ao reconectar; URL com uma pasta que não está entre as abertas a abre como aba nova;
- **arrastar para reordenar**, com a alternativa por teclado e pelo menu de contexto da aba ("mover
  para a esquerda/direita") — arrastar sozinho não é acessível;
- menu de contexto da aba: fechar, fechar as outras, fechar à direita, copiar caminho;
- **fechar a aba não encerra as sessões do Claude** daquela pasta — elas vivem no backend — e a
  confirmação **diz isso**; fechar a ativa ativa a vizinha, fechar a última volta à boas-vindas;
- aba cuja pasta saiu da allowlist ou sumiu abre **em estado de erro**, sem derrubar as outras;
- aba inativa, pela [D-11](decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas):
  o store fica em memória e a árvore é desmontada; as **sessões vivas e os terminais continuam
  anexados** — a permissão e o stream chegam sem reanexar, e a carência não mata o shell; o watcher
  do plano 07 é liberado e o polling do plano 08 para. Teto de **8** abas; acima dele, a recusa
  traduzida diz qual é e que fechar uma aba não encerra as sessões dela;
- em tela pequena as abas viram um seletor com as mesmas ações.

> **Na execução:** a conversa e a fila de permissão passaram a ser **um store por sessão**, com o
> anexo contado por dono — é o que deixa a sessão da aba inativa anexada sem reanexar ao voltar
> ([D-26](decisions.md#d-26--um-store-por-sessão-e-anexos-com-dono)). A pergunta de fechar só fecha
> pelos botões ou `Esc` (S-188). O watcher e o polling da D-11 são dos planos 07 e 08.

### B-21 — A casca do workbench ✅

Dentro de cada aba, a anatomia do VS Code — e a regra que o usuário confirmou: **o chat do Claude
e o sistema de arquivos e editor ficam na mesma aba**. Em `md+`, explorer (side bar), área de editor
e chat do Claude (secondary side bar) aparecem **lado a lado, ao mesmo tempo**; o chat nunca é uma
tela nem uma rota própria. Abaixo de `md`, viram views alternáveis dentro da mesma aba (B-22).

- **activity bar** com as views da pasta — **Explorer**, **Busca** e **Sessões do Claude** —, cada
  uma registrada por quem a preenche (planos 07, 09 e 08) com posição, ícone e badge; clicar na view
  ativa recolhe a side bar;
- **side bar**, **área de editor** (placeholder até o [plano 07](../07-explorer-and-editor/README.md)),
  **secondary side bar** do Claude (o painel completo é do [plano 08](../08-claude-panel/README.md);
  até lá, ela hospeda os componentes de sessão de hoje — `SessionStarter`, conversa, cards de tool,
  `PromptComposer` — presos à pasta da aba, para que nada regrida e o chat já more ao lado do
  editor), **painel
  inferior** com abas registráveis (preenchido no 08 e no [10](../10-integrated-terminal/README.md));
- **redimensionável** (`resizable`), com mínimos e máximos; tamanhos por visitante em
  `localStorage` — conveniência, com `try/catch`, e o default quando não há; alternar side bar e
  painel pela paleta e por atalho;
- **status bar** com itens registráveis à esquerda (da pasta) e à direita (do app): conexão do
  socket (e a mudança quando cai), pasta, idioma, tema, sino de notificações (B-26);
- placeholders com estado vazio que diz o que vai morar ali, nunca uma área em branco sem motivo.

> **Na execução:** side bar e painel alternam por botões com tooltip no topo do workbench; o atalho e a
> paleta são da B-23, e o sino da status bar, da B-26 ([D-27](decisions.md#d-27--o-que-a-f3-deixa-para-a-f4-e-a-f5)).
> Iniciar uma sessão mantém o usuário na aba, com a sessão na secondary side bar; o e2e `limits` lê
> a sessão de lá.

### B-22 — O workbench abaixo de `md` ✅

Conforme a [D-08](decisions.md#d-08--o-workbench-em-tela-pequena): uma view por vez, com barra de
views embaixo (Explorer, Editor, Claude, Painel), abas de pasta como seletor no topo, navegação
global e menu Arquivo no menu. Sem scroll horizontal em 360 px; alvo de toque de 44×44 px. O mesmo
store da aba serve os dois layouts — mudar a largura da janela não perde estado.

---

## Cenários cobertos

S-86…S-118, S-181, S-187…S-192. O S-05 foi para a B-33 ([D-25](decisions.md#d-25--quando--passa-a-levar-à-aba-ativa)).

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
