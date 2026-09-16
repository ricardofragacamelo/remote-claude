# F4 — E2E

Plano: [02 — Aprovação pelo celular](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-mobile-permission.md).
**Entrega:** os cenários obrigatórios que **só existem com duas pontas** — e que, por isso,
ficaram de fora do plano 01.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-26 — Cenários compartilhados 🔲

Os fluxos novos entram em `e2e/scenarios/`, lidos pelo Playwright e pelo `integration_test` via
`--dart-define`. Num device não existe repositório para ler
([06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário)).

### B-27 — Os cenários obrigatórios 3, 4 e 10 🔲

Permissão pelo mobile com o web só observando; corrida entre as duas pontas; e multi-cliente
vendo o mesmo stream na mesma ordem
([lista obrigatória](../../architecture/shared/06-testing-strategy.md#cenários-e2e-obrigatórios)).

O lado web desses cenários roda em **todo PR**, contra o mesmo backend. É ele que compensa o
e2e do app não ser portão.

### B-28 — `integration_test` do app 🔲

Registro pendente com controles desabilitados, aprovação de permissão, abertura por deep link e
revogação com o app aberto.

### B-29 — Teto de memória do Gradle 🔲

`mobile/android/gradle.properties` traz `-Xmx8G -XX:MaxMetaspaceSize=4G` do template do
Flutter — sozinho, promete 12 GB de JVM. O bootstrap registrou isso e não mexeu porque a
execução passou com a cerca de cgroup por fora
([progresso do plano 00](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado)).

Este plano roda o emulador muitas vezes. Ajustar o teto para algo que caiba numa máquina de
desenvolvimento, e provar que a suíte continua verde, é trabalho desta fase.

### B-34 — A imagem do emulador, fixada 🔲

**API 35**, fixada em [scripts/mobile.mjs](../../../scripts/mobile.mjs) e dita na seção
**Comandos** do [README.md](../../../README.md#comandos), na mesma entrega
([D-09](decisions.md#d-09--o-emulador-reprodutível)).

Hoje o script exige "um device" e nada mais, o que basta para rodar e não basta para um resultado
comparável entre duas máquinas: API level diferente muda permissão de notificação, biometria e
deep link — exatamente o que esta fase exercita. API 33 é o piso para o diálogo de permissão de
notificação existir; em imagem mais antiga o cenário de B-32 não aparece, e a suíte passa sem
provar nada.

Uma imagem só, não duas: a suíte já é a mais cara do repositório.

---

## Cenários cobertos

S-51…S-58, S-67.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
```
