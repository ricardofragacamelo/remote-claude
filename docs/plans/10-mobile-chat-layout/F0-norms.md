# F0 — Normas

Plano: [10 — Layout do chat no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** o [plano 09](../09-chat-layout/README.md), pelo menos a F0 dele — as normas do painel web,
que este plano espelha ([D-03](decisions.md#f0--normas)).
**Entrega:** as regras da tela de sessão do app escritas em [mobile/04-ui](../../architecture/mobile/04-ui.md)
e [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md) **antes** das telas; as chaves
ARB que entram e saem; os verbos e os textos compartilhados com o web verificados por máquina; e o robô
que concentra os seletores do `integration_test`.

**Decisões que precisam estar fechadas para começar:** D-01, D-02, D-03 e D-04
([decisions.md](decisions.md#f0--normas)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — A tela de sessão nova em `mobile/04-ui` e `mobile/03-state-and-data` ✅

Em [mobile/04-ui](../../architecture/mobile/04-ui.md):

- **três faixas:** a `AppBar` compacta, a conversa (o único scroll) e o composer ancorado, acima do
  teclado pelo `MediaQuery.viewInsets` e dentro da `SafeArea`. Nada além da conversa rola;
- **onde fica cada controle**, com o gesto do celular: a tabela de "Por quê" do [README](README.md#por-quê)
  vira norma. Cada decisão de lugar do 09 (D-04…D-16) que vale aqui diz o seu equivalente: hover vira
  pressionar e segurar, tooltip vira `Semantics` e folha de baixo, atalho de teclado não existe
  (R-09);
- **"Transcript e stream"**: a ordem real (mensagem, thinking, tool, card e linha de sistema, na ordem
  do `seq`), o indicador na cauda, o thinking vivo e encerrado, e o `MediaQuery.disableAnimations`, que é
  o `prefers-reduced-motion` do Flutter;
- **"A tela de permissão"** vale inteira para o card inline. A tela avulsa que a notificação abre
  continua ([D-02](decisions.md#f0--normas));
- **o teclado** (09 · D-13): o pedido que chega com o teclado aberto não fecha o teclado nem tira o
  foco da caixa. A pílula e o `liveRegion` anunciam o pedido;
- **o que o app não tem** e por quê: a lista de "Não entra" do [README](README.md#não-entra).

Em [mobile/03-state-and-data](../../architecture/mobile/03-state-and-data.md): a conversa como **lista
ordenada de entradas**, o mesmo modelo do web, com as três regras do stream valendo para ela; o
rascunho que vira sessão no primeiro prompt ([D-05](decisions.md#f1--moldura-da-sessão), 08 · D-07); e
as rotas que o app passa a ler (`GET /catalog`, `GET /sessions/:id/models`, `GET /sessions/:id/context`).

### B-02 — Chaves ARB e o inventário da ajuda ✅

As chaves que saem (`sessionStatus*` do `_Header`, `sessionInterruptAction` e `sessionCloseAction` da
`AppBar`, e as que a F1…F4 deixarem órfãs) e as que entram (verbos, pílula, menu, faixas, chips,
confirmação de encerrar, ações da mensagem), em `en` e `pt-BR`. A remoção acontece na fase que tira o
uso. Chave órfã reprova o `i18n:check`
([shared/02-i18n](../../architecture/shared/02-i18n.md#garantias-automatizadas)). O inventário do que a
ajuda da tela descreve vai para a [B-17](F3-header.md).

### B-03 — Os verbos e os textos compartilhados iguais nas duas pontas ✅

O `i18n:check` compara as chaves **dentro** de cada família (o web com o web, o app com o app), nunca uma
família com a outra. A lista de verbos do indicador (09 · D-16) e os textos que o usuário lê nas duas
pontas (a pílula, "Pensando…", "Pensou por *n* s", a faixa de encerrada) precisam ser os mesmos. Pela
regra 9 do `AGENTS.md`, isso vira checagem de máquina ([D-04](decisions.md#f0--normas)): um mapa
declarado de chave do web para chave do app (`sessions.working.verbs.*` ↔ `sessionWorkingVerb*`), que o
`i18n:check` lê e compara texto a texto, por idioma. Chave do mapa que falta numa ponta, ou texto que
diverge, reprova o portão. É código em `scripts/lib/i18n.mjs`, com o teste em `test/unit/scripts/`.

### B-04 — O robô da tela de sessão ✅

`integration_test/support/session_robot.dart`, que acha a tela por **semântica** (`Semantics` label,
tooltip, papel), nunca por tipo interno ([mobile/06](../../architecture/mobile/06-testing.md#widget)): a
caixa, enviar, parar, os chips, o menu `⋯`, o card de uma tool, a pílula e o indicador. Os testes de hoje
(`vertical_slice`, `permission_flow`, `rule_cycle`, `limits`, `history`) passam a usá-lo **sem mudar o
que afirmam**. A partir daqui, cada fase muda o robô, não os testes (R-01).

---

## Cenários cobertos

S-01…S-05.

---

## Critério de conclusão

```bash
pnpm test:e2e:mobile   # os testes de hoje pelo robô
pnpm verify
```
