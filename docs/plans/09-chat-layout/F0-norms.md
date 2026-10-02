# F0 — Normas

Plano: [09 — Layout do chat](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** plano 08, F0…F6 — a F6 (o e2e do painel) fecha antes desta fase
([D-01](decisions.md#f0--normas)).
**Entrega:** as regras do painel novo escritas em [web/03-ui-system](../../architecture/web/03-ui-system.md)
**antes** das telas, as chaves i18n que entram e saem, e um page object que concentra os seletores do
painel para os e2e. O app segue o mesmo molde no [plano 10](../10-mobile-chat-layout/README.md), que lê
estas normas.

**Decisões que precisam estar fechadas para começar:** D-01, D-02 e D-03
([decisions.md](decisions.md#f0--normas)) — todas ✅ em 2026-10-02.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — O painel novo em `web/03-ui-system` 🔲

Reescrever as seções do painel em [web/03](../../architecture/web/03-ui-system.md#stream-de-mensagens) e a
nota da secondary side bar em [Anatomia do workbench](../../architecture/web/03-ui-system.md#anatomia-do-workbench):

- **três faixas:** cabeçalho fixo, conversa rolável, composer ancorado. A página e a barra lateral não
  rolam; o composer nunca sai da tela;
- **onde fica cada controle:** a tabela de "Por quê" do [README](README.md#por-quê) vira norma, com o
  controle, o lugar e o motivo;
- **"Tools compactas, a permissão nunca"** continua. Muda o lugar: o card fica **inline**, no lugar da
  linha da tool, e a regra "nunca fora de vista" ganha a pílula ancorada;
- **o foco:** a [D-13](decisions.md#f4--inline) refina "o botão de negar recebe o foco inicial quando
  `defaultToNo`". O foco vai ao negar quando ninguém está escrevendo na caixa;
- **o processamento:** o indicador vivo na cauda, com verbo, tempo e `prefers-reduced-motion`, e thinking
  vivo e encerrado na ordem da conversa ([D-16](decisions.md#f4--inline));
- **o contrato pode mudar** ([D-02](decisions.md#f0--normas)), e hoje nada pede: a fase confere de novo
  o que cada lugar novo lê (o `toolUseId` do pedido, o status do turno, o `blockType`, a fila, o
  catálogo) e escreve o resultado no `progress.md`. A mudança que vier entra com o `test:e2e:mobile` no
  critério da fase. Faltando um campo, ele entra no
  [05-websocket-protocol](../../architecture/shared/05-websocket-protocol.md) e nas três pontas na mesma
  mudança, pelo gatilho do `AGENTS.md`.

### B-02 — Chaves i18n e o inventário da ajuda 🔲

Listar as chaves que saem (`permission.queue.emptyTitle`, `permission.queue.emptyDescription`,
`session.screen.title`, `session.screen.sessionLabel`, `commands.menu.toggle`, `undo.panel.toggle`,
`session.composer.label` e as que a F1…F4 deixarem órfãs) e as que entram (verbos do indicador, pílula,
menu da sessão, faixas de estado, confirmação de encerrar), em `en` e `pt-BR`. Pela
[shared/02-i18n](../../architecture/shared/02-i18n.md#garantias-automatizadas), chave órfã reprova o
`i18n:check`. A remoção acontece na fase que tira o uso, não aqui. O inventário dos tópicos da
`PanelHelp` que mudam de texto vai para a [B-20](F3-header.md).

### B-03 — O page object do painel 🔲

`e2e/fixtures/claude-panel.ts`, que expõe o painel por **papel e nome acessível**: a caixa, enviar, parar,
modo, modelo, o menu da sessão, o card de permissão de uma tool, a pílula e o indicador. Os specs que
hoje acham "Interrupt", "End session", "Commands" e "Undo file changes" pelo texto
(`commands-and-undo`, `limits`, `live-session`, `session-stream`, `rule-cycle`, `mobile-approval`) passam
a usá-lo **sem mudar o que afirmam**. Os specs da F6 do 08 (B-53…B-56), que fecham antes deste plano ([D-01](decisions.md#f0--normas)),
entram na lista e são os mais novos a migrar. A partir daqui, cada fase muda o page object, não os
specs (R-01).

---

## Cenários cobertos

S-01…S-04.

---

## Critério de conclusão

```bash
pnpm verify
```
