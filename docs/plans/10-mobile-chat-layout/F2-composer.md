# F2 — Composer

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F1](F1-session-frame.md).
**Entrega:** uma caixa só, `ChatComposer`, para o rascunho, a sessão e a edição, com a barra de baixo do
painel web: `/` (comandos) · modo · modelo · esforço · contexto da janela · enviar ou parar. A fila, a
edição e a recusa ficam acima da caixa. O "Interromper" sai da `AppBar`.

**Decisões que precisam estar fechadas para começar:** D-06 e D-07
([decisions.md](decisions.md#f2--composer)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-10 — A caixa com a barra, e enviar e parar ✅

`ChatComposer`, de cima para baixo: a área de texto e a barra. O comportamento do `PromptComposer` de
antes (que o [`ChatComposer`](../../../mobile/lib/features/session/presentation/widgets/chat_composer.dart)
substituiu) fica: a caixa só se limpa quando o comando saiu (S-76 do plano 01), e a recusa diz por quê. Muda a
forma. A caixa e a barra formam um bloco, e cada controle tem `Semantics` label traduzido e alvo de pelo
menos 48 dp.

Enviar e parar, como a [09 · D-06](../09-chat-layout/decisions.md#f2--composer): com o turno rodando e a
caixa vazia, o botão vira **parar** e interrompe. Com texto, enviar enfileira e diz isso, e o parar fica
ao lado. Dois toques em parar interrompem uma vez. Na sessão encerrada, o parar some e enviar retoma
([B-07](F1-session-frame.md)). O botão "Interromper" da `AppBar` sai.

Na largura em que a barra não cabe ([D-06](decisions.md#f2--composer)), modelo, esforço e contexto vão
para um menu de excesso. Enviar/parar, modo e `/` nunca saem da barra.

### B-11 — Modo, modelo e esforço na barra ✅

Três chips, cada um abrindo uma folha de baixo, com o comportamento do web (08 · B-36, 09 · B-11):

- **modo:** `session.setPermissionMode`. `bypassPermissions` nunca aparece. `acceptEdits` deixa o chip em
  tom de aviso, com ícone e texto (nunca só cor), e o aviso por extenso fica na folha;
- **modelo:** a lista vem de `GET /sessions/:id/models` na sessão, e do `GET /catalog` no rascunho.
  `session.setModel`;
- **esforço:** só aparece para o modelo que o aceita, e **só se escolhe no rascunho**. Vai no
  `session.start.effort`. Na sessão viva, o chip mostra o valor só para leitura, e a folha diz por quê
  (08 · D-16: trocar com a sessão viva desliga o `PreToolUse`).

A recusa do backend volta o chip ao valor anterior, com o erro traduzido. Um segundo toque enquanto a
troca está pendente não manda outra.

### B-12 — `/` e os comandos ✅

O botão `/` da barra abre a folha de comandos que o app já tem (`CommandMenuSheet`), com busca, grupos e
o selo de origem de cada skill. Pela [D-07](decisions.md#f2--composer), digitar `/` no início da caixa
também abre a folha, já filtrando pelo que vem depois. Escolher um comando põe `/nome` e um espaço na caixa,
com o cursor depois. Nada é enviado sem o envio. A folha que não carregou não impede enviar o que foi digitado
(a D-05 do plano 04).

### B-13 — Fila, edição, recusa e o motivo de não enviar ✅

Acima da caixa, nesta ordem:

1. **a fila** (08 · B-34): `prompt.queued` acrescenta uma linha compacta, `prompt.dequeued` a tira, e
   cada uma tem cancelar (`session.cancelQueuedPrompt`). Cancelar o que já virou turno é recusado com
   `CONFLICT` (`session.error.queuedPromptStarted`), e a linha sai;
2. **"editando a mensagem"**, com cancelar, quando a edição da [B-24](F4-inline.md) está aberta;
3. **a recusa do último envio**, numa faixa que se fecha, com o texto preservado na caixa.

O motivo de não enviar segue a [09 · D-07](../09-chat-layout/decisions.md#f2--composer): com a caixa vazia,
fica só no `Semantics` do botão. O bloqueio real (aparelho offline, teto, sessão segurada) aparece na
tela, acima da caixa.

### B-14 — O contexto da janela na barra ✅

Um anel pequeno com a porcentagem, de `GET /sessions/:id/context`. Tocar abre uma folha com as
categorias, o aviso perto do limite e **Compactar**, que manda `/compact` pelo fluxo normal do prompt. O
`session.compacted` vira uma linha na conversa ([B-23](F4-inline.md)). Medida ilegível: o anel some, a
folha diz por quê, e os outros chips não mudam de lugar. No rascunho, o anel não aparece.

---

## Cenários cobertos

S-27…S-45.

---

## Critério de conclusão

```bash
pnpm test:e2e:mobile
pnpm verify
```
