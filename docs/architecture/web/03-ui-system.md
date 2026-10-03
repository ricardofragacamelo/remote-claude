# Design system — shadcn/ui + Tailwind

Voltar para o [índice do web](README.md).

---

## Como o shadcn/ui funciona (e por que isso importa)

shadcn/ui **não é uma dependência**. É um gerador: o comando copia o código-fonte do
componente para dentro do projeto, em `src/shared/components/ui/`. A partir daí, o código é
nosso.

Consequências práticas:

- Não existe "atualizar a biblioteca". Atualizar é regerar e revisar o diff.
- Customizar é editar o arquivo — não é preciso brigar com a API do componente.
- **Mas:** `src/shared/components/ui/` é território gerado. Edição ali precisa de comentário
  `// CUSTOM:` explicando o que foi mudado, senão a próxima regeneração apaga em silêncio.

### Adicionando um componente

```bash
pnpm dlx shadcn@latest add dialog
```

Antes de adicionar, verifique se já existe. Duas variantes do mesmo botão é como um design
system morre.

---

## Camadas de componente

```
shared/components/ui/       primitivos gerados (Button, Dialog, Input)   — território shadcn
shared/components/          compostos genéricos (ErrorState, EmptyState) — nossos
features/*/components/      componentes de domínio (PermissionPrompt)    — nossos
```

Regra: componente de feature **compõe** primitivos; não reimplementa. Se você está escrevendo
um `<div>` com `role="dialog"`, pare — use o `Dialog`.

---

## Tailwind — regras de uso

### Utilitários no JSX, sem CSS solto

```tsx
<div className="flex items-center gap-3 rounded-lg border p-4">
```

Nada de arquivo `.css` por componente, nada de `styled-components`. O CSS global existe só
para tokens de tema e reset.

### Sempre `cn()` para classe condicional

```tsx
import { cn } from '@/shared/lib/utils'

<button className={cn('rounded px-3 py-2', isActive && 'bg-primary', className)} />
```

`cn()` resolve conflito de classe Tailwind (`p-2` + `p-4` → vence a última). Concatenar
string à mão produz bug de estilo que só aparece em certa combinação de props.

### Variantes com CVA, nunca com `if` de className

```tsx
const badge = cva('inline-flex items-center rounded-full px-2 py-1 text-xs', {
  variants: {
    tone: { neutral: 'bg-muted', danger: 'bg-destructive text-destructive-foreground' },
  },
  defaultVariants: { tone: 'neutral' },
})
```

### Token semântico, nunca cor literal

```tsx
<div className="bg-destructive text-destructive-foreground" />   ✅
<div className="bg-red-500 text-white" />                        ❌
```

Cor literal quebra o tema escuro e impede rebranding. O token diz **o papel**
(`destructive`), não a cor — e é isso que sobrevive a uma mudança de paleta.

---

## Tema

Tokens em `src/styles/globals.css`, como CSS custom properties. Claro e escuro definidos
pelos mesmos nomes:

```css
:root            { --background: …; --foreground: …; --destructive: …; }
.dark            { --background: …; --foreground: …; --destructive: …; }
```

Regras:

- **Nunca** defina uma cor apenas dentro de `.dark`. Toda variável existe nos dois temas —
  verificado por teste.
- Tema escuro não é opcional: esta é uma ferramenta de desenvolvedor. **Dois temas, claro e escuro,
  e só eles**; escuro é o default quando `prefers-color-scheme: dark`. A **preferência** tem três
  valores — claro, escuro e "do sistema", o padrão —, e "do sistema" acompanha o sistema operacional
  com a página aberta ([06 · D-32](../../plans/06-workbench/decisions.md#d-32--o-que-a-f5-decidiu-na-execução)).
- A preferência do usuário persiste em `localStorage`, por visitante, com `prefers-color-scheme`
  como default — e `localStorage` inacessível cai no default, sem quebrar. Toda conveniência por
  visitante passa por `shared/lib/visitor-storage.ts` (prefixo `rc.visitor.`, `try/catch`), nunca por
  `localStorage` direto — e nunca uma credencial.

### O sistema visual

O que torna a ferramenta "profissional e organizada" é consistência, e consistência só existe se for
verificada:

- **densidade no molde do VS Code**: linhas de lista e itens de árvore compactos, cabeçalhos de
  painel baixos — **sem** abrir mão do alvo de toque de 44×44 px abaixo de `md`
  ([Responsividade](#responsividade)). Duas densidades, por visitante: `compact` (o padrão) e
  `comfortable`, que troca os tokens da escala por `data-density` no `<html>` — o componente continua
  nomeando o token, e o alvo de toque é o mesmo nas duas;
- **escala por token** em `globals.css` — tamanhos de texto da UI e do código, pesos, espaçamentos,
  raios. Componente usa o token, nunca o valor: `text-ui`, `text-ui-sm`, `text-ui-xs` (a letra miúda do painel: chips, badges, faixas de uma linha), `font-code`, `h-row` (22 px),
  `h-header` (36 px), `w-rail` (48 px), `size-touch` (44 px), `font-ui-strong`;
- **ícones só do `lucide-react`**; ícone sem texto tem `aria-label` traduzido **e** tooltip — o
  `IconButton` de `shared/components/` exige os dois pelo tipo;
- contraste AA nos dois temas, verificado pelo axe;
- cor literal em classe (`bg-[#…]`, `text-red-500`) em componente de feature, e ícone de outra
  biblioteca, são recusados pelo lint — a regra que não é verificada por máquina não existe.

---

## Acessibilidade — não é opcional

O app tem um fluxo em que o usuário autoriza a execução de comando destrutivo. Um diálogo mal
construído aqui é risco real.

| Regra | Por quê |
|---|---|
| Todo controle interativo é `<button>` / `<a>` | `<div onClick>` não recebe foco nem teclado |
| Foco visível, sempre | `outline-none` sem substituto é proibido |
| Diálogo prende o foco e fecha no `Esc` | o primitivo do shadcn já faz — use-o |
| Ícone sem texto tem `aria-label` traduzido | leitor de tela |
| Contraste mínimo AA (4.5:1) | |
| **Ação destrutiva nunca é o botão com foco inicial** | evita aprovar `rm -rf` no Enter |
| Erro é anunciado (`role="alert"`) | |

`eslint-plugin-jsx-a11y` roda no CI e reprova.

---

## Padrões de UI deste produto

### Estados de tela — os quatro, sempre

Toda tela que carrega dado trata **loading**, **erro**, **vazio** e **conteúdo**. Faltou um,
o review reprova.

- **Loading:** skeleton com a forma do conteúdo, não spinner centralizado.
- **Erro:** `<ErrorState>` com `t(error.messageKey)` e ação de recuperação. Ver
  [erros](../shared/04-errors-and-http.md).
- **Vazio:** `<EmptyState>` que explica o que fazer, não só "sem dados".

### Permissão — a tela mais importante

Quando chega `permission.requested`:

- Mostre o **comando exato** em bloco monoespaçado, sem truncar. O usuário está autorizando
  execução na própria máquina; esconder o conteúdo é inaceitável.
- Destaque visual por `riskHint` (`destructive` → tom `destructive`).
- Mostre a contagem regressiva até `expiresAt` — silêncio nega.
- Botão de negar recebe o foco inicial quando `defaultToNo` — **se ninguém está escrevendo**. Com o
  foco num campo ou no editor (a caixa do composer inclusive), o foco fica lá, e o pedido é anunciado
  (pílula e `aria-live`): um Enter de prompt nunca vira uma resposta ao pedido
  ([09 · D-13](../../plans/09-chat-layout/decisions.md#f4--inline)). Só na chegada: o card redesenhado
  não toma o foco de novo.
- O escopo (`once` / `session` / `project` / `always`) é escolha explícita, com `once` default.
  Cada opção diz **o que significa**, sem eufemismo e sem sigla — "não perguntar de novo neste
  projeto", "não perguntar de novo em lugar nenhum" —, com a validade da regra à vista.
- Daqui se **chega à lista de regras**. É um dos dois pontos de entrada obrigatórios dela.
- Resolvida em outro dispositivo → o card se atualiza sozinho mostrando quem resolveu.

### Regras — onde a autorização é retirada

Regra de permissão é autorização **antecipada** para executar comando na máquina do usuário.
`always` significa, na prática, "não me pergunte mais".

- A lista mora em **rota própria** (`/rules`), não numa seção de configurações. A promessa é que
  revogar está a um clique; dentro de configurações fica a três.
- Dois pontos de entrada, e não só a rota: a **escolha de escopo** na tela de permissão, e a
  entrada com `auto: true` na **trilha** — os dois lugares onde a dúvida de fato nasce.
- A linha mostra escopo, tool, padrão, autor, data e **validade**, com sinal para a regra perto
  de expirar. Sem o aviso, a sessão volta a perguntar sem explicação: perde-se a comodidade e não
  se explica a perda.
- A linha mostra escopo, tool, padrão, autor, data e **validade**; "perto de expirar" é **menos de
  sete dias**, calculado no cliente sobre o `expiresAt` do servidor
  ([03 · D-13](../../plans/03-rules-and-audit/decisions.md#d-13--perto-de-expirar-é-sete-dias)).
- Regra **expirada continua listada**, marcada como tal. Regra revogada some.
- Revogar é ação direta, idempotente na UI: duplo clique revoga uma vez. Falha ao revogar
  **mantém a linha**, com o erro traduzido ao lado — a regra continua respondendo, e é isso que a
  tela existe para mostrar.
- **Escolher `project` ou `always` pede um segundo passo, qualquer que seja o risco**, e o segundo
  passo diz o alcance por extenso: o padrão exato que será gravado, onde vale e por quanto tempo —
  os dois vindos da sugestão do servidor, nunca calculados aqui. Dele se chega a `/rules`
  ([03 · D-14](../../plans/03-rules-and-audit/decisions.md#d-14--escopo-persistido-sempre-pede-o-segundo-passo)).

### Trilha de auditoria

Responde a uma pergunta só: **"o que foi executado na minha máquina sem me perguntar?"**

- Filtros por sessão, tool, decisão e período; paginação por **cursor**, nunca por offset.
- Da entrada auto-resolvida se **abre a regra** que a resolveu — inclusive quando já foi
  revogada, e aí a tela explica o estado em vez de mostrar um vazio sem motivo.
- O detalhe mostra o `input` exato da tool. Nunca o conteúdo de arquivo lido pela tool `Read`:
  a trilha guarda `path` e tamanho, e é isso que a tela recebe.
- Mora em `/audit`, com os filtros na **search** — a trilha filtrada é um link, e continua sendo
  depois do login: quem abre o link deslogado volta à trilha **com** os filtros, não à trilha
  inteira. O formulário é rascunho até aplicar: uma navegação por filtro, não uma por tecla.
- Cada entrada diz **em palavras** como a decisão foi tomada: por uma regra (e a regra abre), por
  uma regra `session` (que acabou com a sessão, e não oferece link), por ninguém a tempo (recusada),
  ou por uma pessoa (quem, e de onde). Entrada que nenhuma pergunta alcançou é marcada como tal.
- "Carregar mais" acrescenta a página seguinte; falha ali **mantém** o que já está na tela, com o
  erro ao lado. Filtro novo recomeça do topo e descarta o que ainda chegava do anterior.
- A regra aberta da trilha mora em `/rules/$ruleId`, em qualquer estado: ativa, com o botão de
  revogar; revogada, dizendo quando — nunca uma página vazia.

### Stream de mensagens

- Auto-scroll só quando o usuário já está no fim. Rolou para cima, respeite — é leitura.
- Renderize `message.delta` incrementalmente; nunca espere o turno completo.
- Bloco de código com `syntax highlight` e botão de copiar.
- Tool em execução mostra estado vivo, não congela em "aguarde".

O painel do Claude ([plano 08](../../plans/08-claude-panel/README.md)) é este stream dentro da aba de
pasta, e acrescenta as regras abaixo. Elas vêm **antes** das telas (08 · B-05).

**Markdown do modelo é conteúdo não confiável.** O modelo leu arquivos e páginas que ninguém revisou, e
uma injeção de prompt escreve no que ele responde (R-01 do plano 08). Por isso, sempre pelo componente
`Markdown` de `shared/components/markdown`, e nunca por outro caminho:

- **HTML cru nunca vira elemento** — `skipHtml`, sem `rehype-raw`: `<img onerror>`, `<script>` e
  `<iframe>` aparecem como texto;
- **link só `http`, `https`, `mailto` e caminho relativo** — `javascript:`, `data:` e `vbscript:` ficam
  texto; o externo abre em nova aba com `rel="noopener noreferrer"`;
- **imagem remota nunca carrega** — vira link com o endereço à vista, porque uma imagem é o jeito mais
  barato de exfiltrar dado por URL;
- markdown incompleto do delta (bloco aberto) renderiza sem quebrar, e o `message.completed` o substitui;
  só a mensagem em voo re-renderiza;
- carregado **sob demanda** (`lazy()`), nunca no primeiro chunk — o `editor-bundle` reprova o build que
  o puser lá.

**Tools compactas, a permissão nunca.** Cada tool é **uma linha** com rótulo traduzido e o sujeito
relativo à pasta — "Read src/x.ts", "Edit src/x.ts (+3 −1)", "Bash: pnpm test"; tool MCP mostra servidor
e tool; tool desconhecida mostra o nome. O título pode elidir visualmente, mas o comando **inteiro** está
no nome acessível e a um clique: expandir mostra o **input exato**, sem truncar. O estado vivo é ícone
**e** texto (`started`, `succeeded`, `failed`, `denied` com o motivo). O card de permissão
([acima](#permissão--a-tela-mais-importante)) **nunca** é compactado: ali a pessoa autoriza execução na
própria máquina. Ele fica **inline**, no lugar da linha da tool que pede (pelo `toolUseId`), e nunca
fora de vista — ver [o painel em três faixas](#o-painel-do-claude--três-faixas).

**Saída de terminal é texto, com cor por token.** ANSI vira cor pelos tokens de tema, nunca HTML; OSC 8
(hyperlink), título de janela e sequência desconhecida são descartados. Acima do teto de exibição,
mostra o fim e "mostrar tudo".

**Thinking recolhido, subagent aninhado.** Thinking aparece recolhido, com "pensou por *n* s" quando a
duração é conhecida (o stream vivo a mede; o histórico não guarda tempo por bloco, e então diz só que
pensou); thinking redigido diz que existiu, sem inventar conteúdo. O subagent aparece **dentro** do
`Task` que o abriu, recolhido, com o tipo do agente e o status; dois em paralelo não se misturam.

**Diff inline, e "prévia contra o disco agora".** Edit e Write mostram o diff no card, recolhido acima de
*n* linhas, com "abrir diff" para a aba de diff do editor. A prévia **antes** de aprovar é o input
aplicado ao disco **agora**: ela diz contra que momento foi calculada, é relida ao focar, e o resultado
da tool é a verdade — o arquivo pode mudar até a aprovação.

**Permissão nunca se perde por estar noutra aba.** O pedido que nasce numa aba de pasta inativa, ou com
o painel escondido, vira **badge na aba** (e na activity bar do painel), nunca só um card fora de vista.

**A view "Sessões do Claude" tem os quatro estados por grupo** — em execução aqui, ativas em outro
lugar, histórico —, e falha de um grupo não esconde os outros. **"Ativa em outro lugar" é estimativa,
e o rótulo diz isso**: "escrita há *n* min", nunca "aberta no VS Code" — o que se sabe é que o
transcript foi escrito há pouco, não quem o escreve ([08 · D-06](../../plans/08-claude-panel/decisions.md#d-06--ativa-em-outro-lugar-o-critério-e-o-que-se-permite)).

### O painel do Claude — três faixas

O painel se lê e se opera como o plugin do VS Code ([plano 09](../../plans/09-chat-layout/README.md)). As
regras abaixo vêm **antes** das telas (09 · B-01) e valem também para o app, que segue o mesmo molde no
[plano 10](../../plans/10-mobile-chat-layout/README.md).

**Três faixas, e só a do meio rola.** Cabeçalho fixo em cima, a conversa no meio, o composer ancorado
embaixo. A página e a secondary side bar **não rolam**: a side bar dá ao filho altura definida, e o
painel decide o que rola. O scroller da conversa é o **único** `overflow-y-auto` do painel, com
`overscroll-contain`, e é ele que o auto-scroll observa. O composer **nunca** sai da tela, em nenhuma
largura de painel, no celular e com o teclado virtual aberto (a altura acompanha o `visualViewport`).

```
┌──────────────────────────────┐
│ cabeçalho — abas, ações, ⋯   │  fixo
├──────────────────────────────┤
│ faixas de estado (topo)      │
│ conversa                     │  o único que rola
│ … indicador de processamento │
├──────────────────────────────┤
│ pedidos · fila · edição      │
│ ┌──────────────────────────┐ │  ancorado
│ │ caixa                    │ │
│ │ + / modo modelo … enviar │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

- **A caixa cresce até 40 % da altura do painel** e depois rola por dentro; a conversa sempre fica
  com área visível ([09 · D-04](../../plans/09-chat-layout/decisions.md#f1--moldura-do-painel)).
- **"Alterações" troca só o meio.** O composer, o texto escrito, o contexto e a fila ficam; voltar à
  conversa devolve a rolagem de onde a pessoa estava.
- **O rascunho usa a mesma moldura:** as dicas (`@`, `/`, arrastar, o atalho) no meio vazio, a caixa
  embaixo.
- **Estados são faixas de uma linha, nunca cards.** Desconectado ou reconectando: uma faixa fixa no
  topo do meio, que some sem mexer no composer. Replay parcial, histórico carregando e histórico que
  falhou (com "tentar de novo"): no topo da conversa. Sessão encerrada: uma faixa **acima da caixa**,
  com o motivo — e a caixa continua ativa: enviar retoma a conversa e manda o prompt, como no plugin;
  a faixa diz isso, porque retomar abre um subprocesso que conta no teto
  ([09 · D-05](../../plans/09-chat-layout/decisions.md#f1--moldura-do-painel)).
- **Painel estreito:** nada rola na horizontal; as abas rolam na própria faixa do cabeçalho; abaixo da
  largura em que a barra da caixa cabe, modelo e esforço vão para um menu de excesso, e enviar/parar,
  modo e `+` nunca saem da barra.

**Onde fica cada controle.** O que o plano 08 entregou muda de lugar, não de comportamento.

| Controle | Lugar | Por quê |
|---|---|---|
| abas, nova conversa, histórico, alterações, status | cabeçalho, numa faixa só | é o que muda **qual** conversa está na tela |
| encerrar (do dono, confirmado), exportar, desfazer, notificações, regras, ajuda, copiar o id | menu `⋯` da sessão, no cabeçalho | uso raro; encerrar é irreversível e pede confirmação ([09 · D-10](../../plans/09-chat-layout/decisions.md#f3--cabeçalho)) |
| id da sessão e custo | tooltip do status, e o custo na status bar ([09 · D-11](../../plans/09-chat-layout/decisions.md#f3--cabeçalho)) | não é conversa; o resumo de cada turno continua nela |
| `+` (arquivo, anexo, seleção), `/`, modo, modelo, esforço, contexto, enviar/parar | a barra da caixa, nessa ordem | é o que vale para o **próximo** prompt; enviar e parar no mesmo lugar ([09 · D-06](../../plans/09-chat-layout/decisions.md#f2--composer)) |
| esforço | escolhido só no rascunho; na sessão viva, só leitura com o motivo | trocá-lo com a sessão viva reinicia a query e desliga o `PreToolUse` |
| fila, edição, recusa, sessão encerrada, pedidos fora de vista, lista de tarefas | acima da caixa | é o que impede ou espera o próximo envio |
| permissão e plano para aprovar | inline, no lugar da linha da tool | a pessoa decide olhando o que a tool vai fazer, na ordem em que aconteceu |
| processamento, thinking, "pensou por *n* s" | inline, na cauda da conversa | o retorno de que há trabalho fica onde a resposta vai aparecer |
| editar, bifurcar, desfazer até aqui | na mensagem do prompt, ao passar o mouse e com o foco | o desfazer é por turno, e cada turno é um prompt ([09 · D-15](../../plans/09-chat-layout/decisions.md#f4--inline)) |

O motivo de não enviar com a caixa vazia fica no nome acessível e no tooltip do botão, sem linha
visível; bloqueio de verdade (arquivo que sumiu, upload, teto) aparece na tela, acima da caixa
([09 · D-07](../../plans/09-chat-layout/decisions.md#f2--composer)).

**A permissão inline, inteira, e nunca fora de vista.** O card é o de
[Permissão](#permissão--a-tela-mais-importante), sem cortar nada, no lugar da linha da tool. Se o
pedido chegar antes da linha, ele fica na cauda e vai para o lugar quando a linha chegar; o pedido de
uma tool de subagent fica na cauda também, porque a linha dela está recolhida sob o `Task`. Sem pedido,
nada ocupa espaço. Respondido, o card volta a ser a linha da tool, com a decisão em palavras embaixo
("aprovado por você", "recusado — ninguém respondeu a tempo", "aprovado num celular por *X*",
"aprovado por uma regra sua"). Rolado para cima, ou com "Alterações" aberto, uma **pílula ancorada
sobre a caixa** ("Claude espera sua resposta (*n*)") leva ao pedido mais antigo, e o comando
"Ir para a pergunta que espera você" (`Mod+Alt+P`) faz o mesmo da palette; o badge da aba e o
`aria-live` continuam. O card que chega **não tira o foco** de quem está escrevendo
([09 · D-13](../../plans/09-chat-layout/decisions.md#f4--inline)).

**O processamento à vista.** Enquanto o turno roda, a **última linha** da conversa é um indicador vivo:
um asterisco nosso (ícone do `lucide`, em `primary`), um verbo sorteado por turno e estável nele (lista
traduzida, `sessions.workingVerb.*` — o catálogo não aninha mais de três segmentos) e o tempo. Com tool rodando, diz qual; com pedido aberto, diz que
espera a pessoa. Com `prefers-reduced-motion`, o glifo fica parado. O relógio re-renderiza só o
indicador, e o `aria-live` anuncia a **troca** de estado, nunca cada segundo. O thinking aparece na
ordem da conversa: "Pensando…" enquanto chega, "Pensou por *n* s" recolhido quando fecha
([09 · D-16](../../plans/09-chat-layout/decisions.md#f4--inline)). O topo do painel não mostra estado
do turno.

**O contrato pode mudar, e hoje nada pede.** Cada lugar novo lê o que o stream já manda: o `toolUseId`
de `permission.requested`, o status do turno, o `blockType` do thinking, a fila (`prompt.queued`) e o
catálogo. Se uma fase achar um dado que falte, ele entra no
[05-websocket-protocol](../shared/05-websocket-protocol.md) e nas três pontas na mesma mudança
([09 · D-02](../../plans/09-chat-layout/decisions.md#f0--normas)).

---

## Workbench

O web é um **workbench no molde do VS Code**, construído em React
([ADR-014](../shared/00-decisions.md#adr-014--o-web-vira-um-workbench-construído-em-react)): uma
moldura com navegação global e, dentro dela, um workbench de painéis **por pasta**. A coluna única
`max-w-3xl` com cartões deixa de ser o layout do produto a partir de `md`. Esta seção diz onde cada
coisa mora; o [plano 06](../../plans/06-workbench/README.md) constrói a casca, e os planos seguintes a
preenchem pelos **registros** do fim da seção — nenhum deles reinventa o layout.

### A moldura do app

Toda rota vive dentro dela.

- **Navegação global** à esquerda, fora das abas de pasta, na ordem: **Workbench** · **Auditoria** ·
  **Regras** · **Dispositivos** · **Uso e custo** · **Logs e diagnóstico** · **Configuração do
  Claude** · **Configurações**. Cada entrada é uma tela com rota própria — **uma tela por assunto**.
  Configurações do app e configuração do Claude **nunca** dividem uma tela.
- A navegação é um **registro** (rota, ícone, rótulo, posição, badge opcional). Posição reservada a
  um plano que ainda não registrou a entrada — "Uso e custo", "Configuração do Claude" — **não
  renderiza link**: link sem destino é pior que link nenhum.
- No rodapé, o menu de **gerenciar** (paleta de comandos, Configurações, Sobre) e o de **conta**
  (quem está logado, sair).
- O **menu Arquivo** fica no topo, em `md+`; abaixo, dentro do menu da navegação. É o único menu —
  a paridade com o VS Code é a de arquivos.
- O item ativo segue a rota, inclusive por deep link. O portão de login (`returnTo`) é da moldura, e
  o deep link aberto deslogado volta **com** a search.

### Anatomia do workbench

Dentro de cada aba de pasta, em `md+`, tudo ao mesmo tempo:

```
┌──┬────────────┬──────────────────────────┬──────────────┐
│A │ side bar   │ área de editor           │ secondary    │
│c │ (a view    │                          │ side bar —   │
│t │  ativa)    ├──────────────────────────┤ o chat do    │
│. │            │ painel inferior          │ Claude       │
├──┴────────────┴──────────────────────────┴──────────────┤
│ status bar                                               │
└──────────────────────────────────────────────────────────┘
```

| Parte | O que é | Quem preenche |
|---|---|---|
| **activity bar** | as views da pasta: **Explorer**, **Busca**, **Sessões do Claude**; clicar na ativa recolhe a side bar | planos [07](../../plans/07-explorer-and-editor/README.md), [10](../../plans/11-search/README.md), [08](../../plans/08-claude-panel/README.md) |
| **side bar** | a view ativa | quem registrou a view |
| **área de editor** | os arquivos abertos | [plano 07](../../plans/07-explorer-and-editor/README.md) |
| **secondary side bar** | **o painel do Claude, ao lado do editor** — nunca uma tela nem uma rota própria; abre e fecha (`Mod+Alt+B` e o botão do topo) sem perder nada, porque o estado do painel é da aba. Ela **não rola**: dá ao filho altura definida, e o filho rola por conta própria ([três faixas](#o-painel-do-claude--três-faixas)). Os comandos do painel (nova conversa, focar o prompt, interromper, alternar o modo — `Mod+Shift+M`, nunca o Shift+Tab do CLI, que no navegador é o foco para trás ([09 · D-09](../../plans/09-chat-layout/decisions.md#f2--composer)) —, próxima/anterior, alterações) vivem enquanto a aba está na tela, com o painel aberto ou não — focar o prompt é como um painel fechado abre | [plano 08](../../plans/08-claude-panel/README.md) (`ClaudePanel`, `PanelCommands`) |
| **painel inferior** | abas registráveis | planos [08](../../plans/08-claude-panel/README.md) e [11](../../plans/12-integrated-terminal/README.md) |
| **status bar** | itens da pasta à esquerda, do app à direita: conexão, pasta (um toque copia o caminho), idioma (troca por visitante), tema, sino de notificações (B-26) | registro |

- Redimensionável (`resizable`), com mínimos e máximos; os tamanhos são conveniência por visitante
  ([web/04](04-state-and-data.md#estado-de-aba-de-pasta)).
- Área ainda sem dono é **placeholder com estado vazio traduzido** que diz o que vai morar ali —
  nunca um branco sem motivo.

### Abas de pasta

Cada aba é um **workbench completo de uma pasta**; várias abertas ao mesmo tempo. Não é multi-root.

- Abrir uma pasta cria a aba e a ativa; abrir uma **já aberta foca a existente**, pelo caminho real
  (pasta e subpasta são abas distintas).
- O **estado é da aba**, nunca de um store global ([web/04](04-state-and-data.md#estado-de-aba-de-pasta)).
- **Fechar a aba não encerra as sessões do Claude** da pasta — elas vivem no backend —, e a
  confirmação diz isso. Fechar a ativa ativa a vizinha; fechar a última volta à boas-vindas.
- Aba cuja pasta saiu da allowlist ou sumiu abre **em estado de erro**, sem derrubar as outras.
- Aba inativa: store em memória, árvore desmontada, **sessões e terminais continuam anexados**,
  watcher e polling liberados ([06 · D-11](../../plans/06-workbench/decisions.md#d-11--o-que-uma-aba-inativa-mantém-vivo-e-o-teto-de-abas)).
  Teto de **8** abas; acima dele, `OPEN_FOLDERS_LIMIT_REACHED` traduzido, dizendo o teto e que fechar
  uma aba não encerra as sessões dela.
- Reordenar arrastando **e** pelo teclado (`Alt+Shift+←/→` na aba) e pelo menu de contexto —
  arrastar sozinho não é acessível.
- Fechar pergunta sempre, e a pergunta só fecha pelos botões ou por `Esc` — o segundo clique de um
  clique duplo cai fora dela e não pode dispensá-la.

### Moldura de tela

Toda tela **fora** do workbench (Auditoria, Regras, Dispositivos, Logs e diagnóstico, Configurações,
Sobre, e as dos planos 13–18) usa o mesmo componente de `shared/components/`:

- **cabeçalho** com o título, o **propósito numa linha** e as ações da tela;
- **painel de ajuda** (drawer em `md+`, `sheet` abaixo), aberto pelo ícone, pelo atalho e pela
  paleta, com quatro partes fixas: **o que é esta tela**, **o que cada estado significa**, **o que ela
  NÃO mostra ou NÃO registra**, e **os atalhos da tela** — lidos do registro de comandos, nunca
  repetidos à mão. Seções com âncora, para o "saiba mais" de um controle abrir a certa;
- o corpo, com os [quatro estados](#estados-de-tela--os-quatro-sempre) por conta de quem o preenche.

O **workbench** não tem moldura de tela — cada pixel é da aba —, e a ajuda dele é um `HelpSheet`
(`shared/components/`): as mesmas quatro partes, num sheet sobre a aba, aberto pelo botão de ajuda da
barra de abas, por `Shift+F1` ou por um "saiba mais". Abre por **pedido** feito com ele na tela, nunca
porque a ajuda ficou aberta em outra tela.

**"Saiba mais"** (`LearnMore`, em `shared/components/`) fica ao lado do controle em que a dúvida nasce —
a allowlist, o teto de abas, um aparelho esperando — e abre a ajuda da tela na parte que a responde;
onde a tela não tem ajuda, não aparece. Dentro de um diálogo modal, não: a ajuda abriria atrás dele, e o
diálogo explica o ponto no próprio texto.

### Comandos, atalhos e a paleta

Um comando registrado **uma vez** aparece na paleta, no menu Arquivo e na ajuda da tela, com o mesmo
rótulo e o mesmo atalho. Três listas à mão divergiriam na primeira semana.

- **Comando:** id, rótulo por chave de i18n, categoria, ícone opcional, condição de disponibilidade
  (`when`) e ação. **Atalho:** tecla → comando, num contexto.
- Id duplicado, atalho em conflito no mesmo contexto e atalho padrão numa **tecla que o navegador
  reserva** (`Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+W`, `Ctrl+T`, `Ctrl+N`, `Ctrl+PageUp/PageDown`) são
  recusados no registro. Trocar de aba é `Alt+1…9` e `Ctrl+Alt+PageUp/PageDown` (Mac:
  `Cmd+Alt+←/→`); fechar aba, só pela paleta e pelo menu ([06 · D-16](../../plans/06-workbench/decisions.md#d-16--atalhos-que-o-navegador-reserva)).
- Dentro de campo de texto, atalho da casca não dispara — exceto a paleta; dentro de um diálogo,
  nenhum dispara. Comando indisponível agora não roda pelo atalho, e a tecla fica com o navegador.
- Os atalhos padrão da casca: paleta `Ctrl/Cmd+Shift+P` e `F1`, ajuda da tela `Shift+F1`, abrir pasta
  `Ctrl/Cmd+O`, side bar `Ctrl/Cmd+B`, painel `Ctrl/Cmd+J` ([06 · D-29](../../plans/06-workbench/decisions.md#d-29--os-atalhos-que-a-d-16-não-fixou)).
- **Quem registra:** o componente dono do que o comando faz, enquanto está montado (`useCommands`, do
  barril de `features/commands`) — o diálogo "Abrir pasta", que é **um só** e mora na moldura, registra
  os de pasta; o `Workbench`, os das abas; a moldura, os do app (ir para cada tela, tema, idioma,
  ajuda). Comando que falha vira notificação traduzida
  ([06 · D-28](../../plans/06-workbench/decisions.md#d-28--um-diálogo-abrir-pasta-e-comandos-registrados-por-quem-os-executa)).
- **Paleta:** `Ctrl/Cmd+Shift+P`, sobre o registro; comando indisponível não aparece; modos por
  **prefixo** registráveis (`>` comandos; o Quick Open do [plano 11](../../plans/11-search/README.md)
  registra o seu, em `paletteModes`) ou entrados pelo nome (os recentes de "Abrir recente"). `Esc`
  fecha e devolve o foco a quem o tinha; o comando escolhido roda depois de a paleta fechar.
- **Menu Arquivo:** sai do registro, nos grupos do VS Code (Novo, Abrir, Salvar, Fechar) — o comando
  declara `fileMenu: { group, order }`. Item cujo comando ninguém registrou **não aparece** — nada de
  item desabilitado para sempre; o que não pode rodar agora aparece desabilitado.

### Centro de notificações

`notify({ severity, messageKey, params, actions })`, no `shared/`, com a sua UI: toasts (`sonner`) e
o centro no sino da status bar. O histórico vive **no servidor**
([backend/03 · notification](../backend/03-modules.md#notification)) e segue o usuário entre
dispositivos; "não perturbe" é por visitante.

- **Vira notificação:** erro de ação sem lugar na tela (comando da paleta que falhou, gravação de aba
  recusada) e aviso que o usuário não pediu mas precisa saber (conexão perdida e recuperada, pasta
  aberta que saiu da allowlist).
- **Não vira:** erro que já tem lugar na tela (formulário, estado de erro de lista) e **pedido de
  permissão**, que tem o fluxo próprio e mais forte ([Permissão](#permissão--a-tela-mais-importante)).
- Texto sempre por chave; a notificação guarda `severity`, `messageKey` e `params`, **nunca**
  conteúdo de conversa nem comando.
- Rajada da mesma notificação é **uma** entrada com contador — um toast, uma gravação. O que não
  chegou ao servidor fica no centro, marcado, e é reenviado com o mesmo `clientId`; o que o servidor
  recusa fica só nesta janela. Toast de erro é `alert`, o resto `status`, e nenhum toma o foco; o que
  tem ação fica até a ação ([06 · D-30](../../plans/06-workbench/decisions.md#d-30--o-que-emite-notificação-nesta-fase)).
- `notify()` é um barramento em `shared/lib/notify.ts`; a feature `notifications` o escuta enquanto
  alguém está logado. O sino é um item da status bar que a moldura registra.

### Os registros — onde os planos seguintes encaixam

A casca é o contrato de onde cada plano põe o que é dele. Registrar é declarar; a casca decide onde
e como aparece. Entrada não registrada **não aparece** — nem link, nem item, nem aba vazia.

| Registro | O que cada entrada declara | Quem registra |
|---|---|---|
| navegação global | rota, ícone, rótulo, posição, badge | 06; 13 e 16 nas posições reservadas |
| views da activity bar | id, ícone, rótulo, posição, badge, componente — o badge é um componente que recebe a pasta | 07 (Explorer), 08 (Sessões: as perguntas esperando, anunciadas com o painel fechado), 09 (Busca) |
| badges da aba de pasta | `folderTabBadges`: um componente que recebe a pasta e se desenha ao lado do nome da aba — ou não se desenha | 08 (as perguntas esperando nas sessões da pasta) |
| abas do painel inferior | id, rótulo, componente | 08, 10 |
| itens da status bar | lado, prioridade, componente | 06, 08 (a sessão na tela: status, modelo e custo; as alterações), e quem precisar |
| comandos e atalhos | ver [acima](#comandos-atalhos-e-a-paleta) | todos |
| modos da paleta | prefixo, fonte | 06 (`>`), 09 |
| seções de Configurações | id, rótulo, ícone, posição, componente e as **opções** que a busca acha — **nunca** do Claude: o registro recusa seção cujo id, rótulo ou opção fale de Claude, modelo, permission mode ou MCP | 06 (Aparência, Workspaces), 07 (Editor), 10 (Terminal) |
| restauração da aba | chave, versão, ler e gravar o estado | 06 (layout), 07 (editores), 08 (conversa, marcas de revisão das alterações) |
| abas de editor por tipo | o que abre (arquivo, diff, prévia), como restaura | 07 (arquivo, diff); 08 e 09 abrem a aba de diff |
| fontes de lado de diff | `diffSources`: o id da fonte e `read(folder, key)` — um lado `provided` da aba de diff que o editor lê sem saber de quem é; não sobrevive à recarga | 08 (`session`: o antes e o depois de uma tool, o antes da sessão) |
| área de editor | o componente que preenche a área de editor da aba (`editorAreas`); sem entrada, o placeholder | 07 |
| o que fechar a aba perderia | os arquivos com alteração não salva de uma pasta (`folderTabKeepers`), listados na confirmação de fechar a aba de pasta | 07 (editor) |
| alvos de arraste para o Claude | `claudeContextTargets`: aceita `application/x-remote-claude-files+json` e o "Adicionar ao contexto do Claude" — o `add(payload)` põe na conversa na tela do painel da mesma aba de pasta (rascunho ou sessão; um rascunho novo quando a tela é uma conversa só de leitura) | 08 (`session.panel`) — a fonte é o 07 (árvore, abas e seleção do editor) |
| provedores do `@` | `mentionProviders`: a palavra depois do `@`, rótulo e descrição traduzidos, e `items(folder)` — o que acrescentaria agora ao contexto, ou `null` sem nada a dar (aí não aparece) | 08 (`@selection`, a seleção do editor ativo); 10 (`@terminal`) |

### Explorer e editor

Os padrões que o [plano 07](../../plans/07-explorer-and-editor/README.md) traz, para que o 08, o 11 e
o 13 os reusem em vez de reinventar ([07 · B-06](../../plans/07-explorer-and-editor/F0-contract.md#b-06--o-estado-do-explorer-e-do-editor-por-aba-de-pasta-)):

- **A árvore é uma ARIA tree** (`role="tree"`, `treeitem`, `aria-expanded`, `aria-level`), virtualizada,
  navegável só por teclado — setas, Home/End, digitar para achar —, com seleção múltipla. O que a
  [D-10](../../plans/07-explorer-and-editor/decisions.md#d-10--exclusões-padrão-e-teto-da-árvore)
  esconde vem **marcado** do servidor e some só sem "mostrar ocultos". Link para fora da pasta
  aparece com ícone próprio e não abre; nome que não é UTF-8 aparece e não é operável. Nível cortado
  pelo teto diz que foi cortado, com a ação de filtrar.
- **Abas de editor** como as do VS Code: sujo é um ponto no lugar do fechar; aba de prévia (itálico)
  é substituída pela próxima; arrastar reordena e leva para outro grupo. Fechar aba suja pergunta,
  listando o arquivo.
- **O diálogo de conflito** aparece quando o salvar recebe `412`: diz que o arquivo mudou no disco —
  provavelmente pelo Claude —, e oferece **comparar** (abre a aba de diff), **sobrescrever** (salvar
  de novo com o `ETag` atual, decisão explícita) e **descartar as minhas mudanças**. Nunca sobrescreve
  sozinho.
- **Placeholders de arquivo não editável**, um por motivo, cada um com a ação que cabe: binário
  (abrir em hexadecimal, F7), grande demais (leitura paginada, F7), encoding desconhecido ("reabrir
  com encoding"), sem permissão do sistema, link para fora da pasta. Nunca uma área de editor vazia.
- **O segundo passo dos arquivos que mudam a permissão** (`.claude/settings.json`,
  `.claude/settings.local.json`, `.mcp.json`) diz **o que** o arquivo faz antes de salvar —
  "isto muda o que o Claude pode fazer sem perguntar" — e a resposta vai como `confirmSensitive`
  ([07 · D-15](../../plans/07-explorer-and-editor/decisions.md#d-15--arquivos-que-mudam-a-permissão)).

---

## Responsividade

Mobile-first. O web roda no celular também — e o app Flutter não substitui isso.

```tsx
<div className="flex flex-col gap-4 md:flex-row md:gap-6">
```

Breakpoints padrão do Tailwind. Nenhuma tela pode ter scroll horizontal; alvo de toque mínimo
de 44×44 px.

### O workbench abaixo de `md`

A casca inteira não cabe em 360 px, e encolhê-la criaria o scroll horizontal proibido acima. Abaixo
de `md`, **uma view por vez** ([06 · D-08](../../plans/06-workbench/decisions.md#d-08--o-workbench-em-tela-pequena)):

- Explorer, Editor, Claude e Painel alternados **dentro da mesma aba de pasta**, por uma barra de
  views embaixo — o chat e os arquivos continuam na mesma aba, só não cabem lado a lado;
- as abas de pasta viram um **seletor no topo**, com as mesmas ações;
- a navegação global e o menu Arquivo vão para um menu (`sheet`), com foco preso e `Esc` fechando;
- **o mesmo store** serve os dois layouts: mudar a largura da janela não perde estado — nem o texto
  da caixa, nem a rolagem da conversa, nem a aba do painel;
- a view Claude ocupa o espaço entre o seletor de abas e a barra de views, e a altura da moldura
  acompanha o `visualViewport` (`--app-height`, com `100dvh` de reserva): com o teclado virtual aberto,
  o composer fica acima dele.

Uma tela "mobile" separada foi descartada: duas UIs para manter, e o web já é mobile-first.
