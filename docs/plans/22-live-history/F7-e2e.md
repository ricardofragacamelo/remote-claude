# F7 — E2E

Plano: [22 — Histórico ao vivo](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-web-follow.md), [F4](F4-mobile-follow.md), [F5](F5-web-fidelity.md) e
[F6](F6-mobile-fidelity.md). É sempre a última fase.
**Entrega:** uma conversa externa crescendo com o leitor aberto, o reset e os rótulos novos, provados pela
porta do usuário no web (portão 9 do `verify:full`) e no app (`test:e2e:mobile`, que o `verify:full` não roda).

**Decisões que precisam estar fechadas para começar:** D-17 ([decisions.md](decisions.md#f7--e2e)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-34 — A porta que faz a conversa crescer 🔲

Em [scripted-main.ts](../../../backend/test/e2e/scripted-main.ts), a porta `/e2e/conversations-elsewhere` ganha
duas operações ([D-17](decisions.md#f7--e2e)): **acrescentar** a uma conversa plantada as entradas seguintes de
uma gravação (com `lastModified` agora, que é o que o seguidor sonda), e **reescrever** a cadeia (a gravação
`compact-turn`, para o reset). Sempre com o `add` do store roteirizado e entradas de gravações reais. O helper
em `e2e/fixtures/history.ts`, e o cenário compartilhado `e2e/scenarios/live-history.json`, que o app também lê.

### B-35 — O web 🔲

`e2e/specs/live-history.spec.ts`: planta a conversa, abre o leitor, acrescenta entradas e vê a conversa crescer
sem recarregar; "trabalhando" aparece e some; rolado para cima, "N novas"; a cadeia reescrita faz reler; o
pensamento, o título do Bash, o IN/OUT com a saída completa e a imagem aberta; e o passe de acessibilidade das
outras specs.

### B-36 — O app 🔲

`mobile/integration_test/live_history_test.dart`, pelo mesmo `live-history.json`: a conversa cresce no leitor,
com o aviso e o "trabalhando"; "Continuar esta conversa" pede confirmação numa conversa ativa. O
`run-e2e-local` sobe e derruba o emulador sozinho.

### B-37 — Os portões finais 🔲

`pnpm verify:full` e `pnpm test:e2e:mobile` saindo com código 0, um e2e de cada vez. Conferir `ps` e
`git status` antes (R-10). O plano fecha com a linha no histórico de marcos do
[progresso geral](../progress.md).

---

## Cenários cobertos

S-123…S-130.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
```
