# F4 — Comandos, menu Arquivo, notificações e estado por aba (web)

Plano: [06 — Workbench](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-layout.md).
**Entrega:** o registro de comandos e atalhos, a command palette, o menu **Arquivo**, o centro de
notificações e a restauração do estado de cada aba de pasta ao recarregar — os serviços da casca
sobre os quais os planos 07 a 12 registram o que é deles.

---

## Por quê

A F3 desenha **onde** as coisas moram; esta fase diz **como se chega a elas** sem mouse e sem
procurar. É separada porque é outro ciclo de validação — outra superfície de teste (teclado, foco,
leitor de tela) — e porque é aqui que nasce o contrato que os planos seguintes mais usam: o registro.
Um comando registrado uma vez aparece na paleta, no menu e na ajuda da tela, com o mesmo rótulo e o
mesmo atalho. Três listas mantidas à mão divergiriam na primeira semana.

A paridade com o VS Code aqui é a de **arquivos** (decisão do usuário de 2026-09-26): o menu é só o
**Arquivo**, e a paleta nasce com os comandos de arquivo e da casca. Editor de atalhos, vários
temas, zen mode, layout configurável e o resto do menu ficam fora ([Não entra](README.md#não-entra)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-23 — Registro de comandos e atalhos ✅

Cada **comando** tem id, rótulo traduzido, categoria, ícone opcional, condição de disponibilidade
(`when`) e ação; cada **atalho** liga uma tecla a um comando num contexto. Os planos seguintes
registram os seus; este registra os da casca e de arquivo que já existem: abrir pasta, abrir recente,
fechar aba de pasta, trocar de aba (seguinte, anterior, por número), alternar side bar e painel, ir
para cada tela global, tema, idioma, ajuda da tela.

- id duplicado, ou atalho em conflito no mesmo contexto, é recusado no registro, com teste;
- dentro de campo de texto, atalho da casca não dispara — exceto a paleta;
- comando indisponível no contexto não executa pelo atalho;
- os atalhos padrão respeitam a [D-16](decisions.md#d-16--atalhos-que-o-navegador-reserva): o
  navegador reserva `Ctrl+Tab`, `Ctrl+W`, `Ctrl+T`, `Ctrl+N`, e a escolha tem de funcionar num
  navegador comum.

### B-24 — Command palette ✅

`Ctrl/Cmd+Shift+P` abre a paleta (`command` do shadcn) sobre o registro:

- filtra por rótulo traduzido e por categoria ("Arquivo: Abrir pasta…"), mostra o atalho de cada
  comando, executa e fecha; comando indisponível no contexto não aparece;
- **modos por prefixo**, registráveis: `>` comandos (este plano); o Quick Open do
  [plano 11](../11-search/README.md) registra o seu sem mudar a paleta;
- comando que lança erro vira notificação traduzida (B-26) e a paleta fecha sem travar;
- abrir com ela aberta não abre outra; `Esc` fecha e devolve o foco a quem o tinha;
- padrão ARIA de combobox + listbox, anunciado ao leitor de tela.

### B-25 — Menu Arquivo ✅

Um menu só, **Arquivo**, no topo da moldura em `md+` (`menubar` do shadcn) e dentro do menu da
navegação abaixo de `md`. Ele **sai do registro** — rótulo, atalho e disponibilidade iguais aos da
paleta — e declara os grupos na ordem do VS Code:

| Grupo | Itens | Quem registra o comando |
|---|---|---|
| Novo | novo arquivo, nova pasta | [plano 07](../07-explorer-and-editor/README.md) |
| Abrir | abrir pasta…, abrir recente › | este plano |
| Salvar | salvar, salvar tudo | plano 07 |
| Fechar | fechar editor, fechar aba de pasta | plano 07, este plano |

Item cujo comando ainda não foi registrado **não aparece** — nada de item desabilitado para sempre
esperando outro plano. "Abrir recente" lista os recentes (fixados primeiro) e termina em "mais…",
que abre a boas-vindas. Navegável por teclado no padrão ARIA de menubar.

### B-26 — Centro de notificações ✅

Um serviço de notificação no `shared/` (`notify({ severity, messageKey, params, actions })`) e a sua
UI:

- **toasts** (`sonner`) com severidade e ação; informativo some sozinho, o que pede ação fica;
  anunciados ao leitor de tela por severidade (`role="status"`/`alert`) sem roubar o foco;
- **centro de notificações** no sino da status bar: o histórico vem do **servidor**
  ([B-40](F1-directory-browse.md#b-40--histórico-de-notificações-no-servidor-)) e sobrevive à recarga
  e à troca de dispositivo; marcar como lida (sincronizado), limpar uma, limpar todas, **não
  perturbe** (por visitante: silencia toasts, guarda o histórico);
- rajada de notificações iguais é agrupada com contador **antes** de ir ao servidor — uma gravação,
  não uma por repetição; o teto (200) e a retenção (30 dias) são do servidor;
- falha ao gravar não perde o toast nem o item no centro: o reenvio usa o mesmo `clientId`;
- o que vira notificação é a [D-17](decisions.md#d-17--o-que-vira-notificação-e-onde-vive-o-histórico):
  erro sem lugar na tela e aviso que o usuário não pediu; erro de formulário e pedido de permissão
  **não** viram.

Texto sempre por chave de i18n; o erro do backend chega como `code` + `messageKey` e é traduzido
aqui ([04-errors-and-http](../../architecture/shared/04-errors-and-http.md#o-envelope-de-erro)).

### B-27 — Estado de cada aba restaurado ao recarregar ✅

Recarregar a página (ou reabrir o navegador) devolve cada aba de pasta como estava: a view ativa da
activity bar, o tamanho dos painéis, se o painel inferior estava aberto — e, pelo **gancho de
restauração** que esta task define, o que os planos seguintes registram (os editores abertos do
[plano 07](../07-explorer-and-editor/README.md), a conversa aberta do
[plano 08](../08-claude-panel/README.md)).

- conveniência por visitante, em `localStorage` chaveado pela pasta real, com `try/catch`: o layout
  no celular não é o do desktop, e não há por que levá-lo para o servidor
  ([D-10](decisions.md#d-10--onde-persiste-o-conjunto-de-abas-abertas) decide só o conjunto de abas);
- estado de pasta que não está mais aberta é descartado; estado corrompido ou de versão antiga cai
  no default, sem erro;
- a URL continua mandando: o que ela diz (a aba ativa) vence o que estava salvo.

---

## Cenários cobertos

S-119…S-135, S-182, S-193…S-199.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
