# F5 — E2E

Plano: [04 — Histórico e retomada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F4](F4-checkpoint.md).
**Entrega:** o ciclo completo pela porta do usuário, e a confirmação de que os comandos reais
da instalação continuam sendo o que achamos.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-22 — Cenários compartilhados ✅

Em `e2e/scenarios/`, lidos pelas duas pontas — inclusive o de abrir no celular a sessão que
começou no navegador.

Oito arquivos, um por cenário. O de S-48 é `mobile-history.json`, porque o app compila os
`mobile-*`: o Playwright o prova pelo contrato (`history-and-resume.spec.ts`) e o app pelas telas
(`integration_test/history_test.dart`).

Escrever o S-48 achou um defeito que nenhum portão pegava: **as duas pontas abriam uma sessão já em
andamento sem pedir replay.** O primeiro `session.attach` omitia `resumeFromSeq`, e o backend lê o
campo ausente como "observar daqui em diante" — a tela do celular mostrava só o que viesse depois.
Os clientes passaram a mandar `resumeFromSeq: 0` (S-88), que traz o que o buffer guarda, ou o `gap`
que manda ao transcript quando o buffer perdeu o começo. É também o que fecha o item que a F2
adiou para cá: o histórico de uma sessão retomada juntada depois que o buffer perdeu o
`session.started`.

### B-23 — Retomada e recarga ✅

Retomar uma sessão encerrada e continuar a conversa; e o caminho do `gap: true`, agora
recarregando o transcript de verdade.

"De verdade" pediu que o backend roteirizado fosse **um** Claude: o replay grava no store de
conversas o que reproduz, como o `persistSession: true`, sob a conversa que as opções nomeiam —
nova, continuada no mesmo arquivo ou bifurcada —, com ids próprios a cada turno. Sem isso o store
do e2e era vazio, e não havia o que listar, recarregar ou continuar.

O `gap` é provado pela porta do usuário: o socket da página passa pelo teste
(`page.routeWebSocket`), que o derruba, recusa as reconexões enquanto o buffer recicla e o deixa
voltar. O teste lê o `session.attached { gap: true }` que a página recebeu, a requisição do
transcript e a tela.

### B-24 — Desfazer e recusa durante turno ✅

Desfazer pela UI devolve o arquivo; desfazer com um turno em execução é recusado, e a tela
explica por quê.

O replay passou a escrever, no diretório da sessão, os `Write` que a gravação fez — sem isso o
desfazer não teria o que restaurar. Cada teste trabalha numa pasta própria dentro da allowlist,
apagada ao fim. A recusa é provada nas duas camadas: a tela desabilita e diz por quê, e o servidor
recusa com `SESSION_LOCKED` o pedido que chega mesmo assim.

### B-25 — `smoke-live` dos comandos e do `/init` ✅

Contra o Claude real: `supportedCommands()` devolve a lista da instalação, e `/init` termina em
sucesso passando pelo pedido de `Write`.

O `/init` roda contra uma **fixture gerada na execução** — `git init` em tmpdir, um arquivo, um
commit, teardown no fim ([D-07](decisions.md#d-07--onde-o-init-pode-escrever)). Nunca um repo
fixo, que acumularia o `CLAUDE.md` da execução anterior, e nunca o nosso.

É o único teste que pega uma mudança de comportamento do CLI antes do usuário.

`e2e/smoke-live/commands-and-init.spec.ts`. Das perguntas do `/init` real, só a escrita dentro da
fixture é permitida; o resto é recusado. O `/init` **pelo menu** (S-49) é provado na suíte
roteirizada, com a gravação real do `/init` — o menu é tela, e tela não precisa do modelo.

---

## Cenários cobertos

S-46…S-53, e S-88 (descoberto aqui).

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:live
```
