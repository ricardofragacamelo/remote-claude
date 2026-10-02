# F2 — Composer

Plano: [09 — Layout do chat](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-panel-frame.md).
**Entrega:** uma caixa só, `ChatComposer`, para rascunho, sessão e edição, com a barra de baixo do
plugin: `+` (contexto) · `/` (comandos) · modo · modelo · esforço · contexto da janela · enviar ou parar.
Os botões "Interrupt", "Commands" e as duas linhas de seletores saem de cima da conversa.

**Decisões que precisam estar fechadas para começar:** D-06, D-07, D-08 e D-09
([decisions.md](decisions.md#f2--composer)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-09 — A caixa com a barra 🔲

`ChatComposer`, de cima para baixo: os chips de contexto, a área de texto e a `ComposerToolbar`. O
comportamento do `PromptComposer` do 08 · B-46 fica (React Hook Form + Zod, Enter, Shift+Enter, IME,
completion de `@` e `/`). Muda a forma. A caixa e a barra formam um bloco com borda, como no plugin. O
rótulo "PROMPT" visível sai, e o nome acessível fica. A mesma caixa serve o rascunho, a sessão e a edição.
A edição esconde o que não vale para ela (contexto e `/`) em vez de montar outra caixa.

### B-10 — Enviar e parar 🔲

Pela [D-06](decisions.md#f2--composer): com o turno rodando e a caixa vazia, o botão de enviar vira
**parar** e interrompe. Com texto, enviar enfileira e diz isso, e o parar fica ao lado. Clicar parar
duas vezes interrompe uma vez. Com a sessão encerrada, o parar some, e enviar continua ativo e retoma
([D-05](decisions.md#f1--moldura-do-painel), [B-06](F1-panel-frame.md)): o nome acessível diz "retomar e
enviar", e dois envios seguidos retomam uma vez e mandam um prompt. O `Esc`
continua como no 08 · B-40: fecha o menu aberto primeiro, e sem menu interrompe uma vez por turno. O
`SessionControls` deixa de existir. "Encerrar sessão" vai para o menu da sessão ([B-17](F3-header.md)).

### B-11 — Modo, modelo e esforço na barra 🔲

`ModePicker`, `ModelPicker` e `EffortPicker` em variante compacta (chip com ícone e nome curto, menu que
abre **para cima**), com o mesmo comportamento do 08 · B-36: o modelo vem da instalação, o esforço só
aparece para o modelo que o aceita e `bypassPermissions` nunca aparece. `acceptEdits` deixa o chip em tom
de aviso, e o aviso por extenso fica no menu, não numa linha solta. A recusa do backend volta o chip ao
valor anterior, com o erro traduzido. O rascunho e a sessão usam os mesmos chips, com uma diferença:
**o esforço só se escolhe no rascunho**. Trocá-lo com a sessão viva reinicia a query e desliga o
`PreToolUse` (08 · D-16, spike de 2026-10-01). Por isso, na sessão, o chip mostra o valor só para
leitura, e o tooltip diz por quê. O atalho de alternar o
modo é a [D-09](decisions.md#f2--composer).

### B-12 — `/` e `+` no lugar de "Commands" e dos botões soltos 🔲

- **`/`** insere `/` no cursor e abre a completion de comandos e skills do 08 · B-50. O `CommandMenu` em
  `Disclosure` sai ([D-08](decisions.md#f2--composer)).
- **`+`** abre o `AddContextMenu`: adicionar arquivo ou pasta (abre a completion do `@`), anexar do
  computador (o upload do 08 · B-45) e adicionar a seleção do editor (08 · B-51).

Nada novo: cada item leva ao fluxo que já existe.

### B-13 — O contexto da janela na barra 🔲

O `ContextMeter` vira um anel pequeno com a porcentagem. O popover abre para cima, com as categorias, o
aviso perto do limite e **Compactar** dentro dele. O ícone solto de compactar sai. Medida ilegível: o
anel some com o motivo no tooltip, e a barra não muda de posição (o lugar fica reservado).

### B-14 — Fila, edição, recusa e o motivo de não enviar 🔲

Acima da caixa, nesta ordem:

1. a fila (08 · B-34), em linhas compactas, cada uma com cancelar;
2. a faixa "editando a mensagem", com cancelar (`Esc` cancela a edição antes de interromper);
3. a recusa do último envio, numa faixa que se fecha, com o texto preservado na caixa.

Pela [D-07](decisions.md#f2--composer), o motivo de não enviar **com a caixa vazia** fica no nome
acessível e no tooltip do botão. O bloqueio real (arquivo sumiu, upload pendente, teto do contexto)
aparece na tela, acima da caixa.

### B-15 — O composer por teclado 🔲

Ordem de foco = ordem visual: caixa → `+` → `/` → modo → modelo → esforço → contexto → enviar/parar. Os
menus abrem com Enter ou Espaço, fecham com `Esc` e devolvem o foco ao chip. O atalho de focar a caixa
(`claude.focusComposer`) continua, e a ajuda e a palette mostram os atalhos novos.

---

## Cenários cobertos

S-18…S-36, S-88…S-90.

---

## Critério de conclusão

```bash
pnpm verify
```
