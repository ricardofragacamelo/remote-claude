# F3 — Portões

Plano: [05 — Endurecimento e operação](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-identity.md).
**Entrega:** os portões que o bootstrap deixou anotados como ausentes passam a existir — e os
caros passam a existir **onde cabem**, sem fingir que são obrigatórios.

---

## O princípio que rege esta fase

**Verificação cara demais para caber no ciclo de correção é verificação que alguém desliga.** E
portão desligado é pior que portão declarado opcional
([06-testing-strategy](../../architecture/shared/06-testing-strategy.md#por-que-o-e2e-de-mobile-não-bloqueia)).

Por isso cada portão desta fase vem com onde ele roda e o que acontece quando falha.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-16 — `osv-scanner` no portão 10 ✅

Hoje o `pnpm audit` cobre dependência vulnerável, e o `semgrep` roda pela imagem oficial. O
`osv-scanner` entra ao lado, dentro do `scan-security.mjs` que já existe.

Scanner indisponível **não** passa em silêncio: sem resultado, o portão falha. Portão que
aprova quando não conseguiu verificar é decoração. "Resultado" é mais que o código de saída: o
scanner precisa dizer que **leu** os dois lockfiles (`pnpm-lock.yaml` e `mobile/pubspec.lock`), com
pacotes dentro (S-74). Binário local ou a imagem fixada, como o `semgrep`. A leitura da saída
(`scripts/lib/osv.mjs`) é testada contra o que o scanner **de fato** respondeu, gravado por
`scripts/record-osv-fixtures.mjs` num lockfile sintético com o pacote abaixo, exatamente no
`introduced` e no `fixed` de um aviso (S-34).

Consequência na primeira execução: o `osv-scanner` achou o GHSA-82fw-gwwq-j7x9 (moderado) no
`vitest` 3.2.7, que o `pnpm audit --audit-level high` deixava passar. Corrigido subindo o `vitest`
e o `@vitest/coverage-v8` para 4.1.11 nas três suítes.

B-17 (quality gate do SonarQube) e B-18 (job de e2e mobile no CI) **saíram** em 2026-09-27
([D-07 e D-08](decisions.md)): o portão 12 fica declarado ausente, e o e2e mobile segue local,
por `pnpm test:e2e:mobile`. Ver [escopo adiado](progress.md#escopo-reduzido-ou-adiado).

### B-28 — Complexidade no portão 2 (antecipada) ✅

A compensação da D-07 ([D-10](decisions.md#d-10--complexidade-sem-o-sonar)): complexidade
ciclomática **≤ 10 por função**, nas três pontas e nos scripts. No TypeScript e no JavaScript, a
regra `complexity` do ESLint; no Dart, a métrica `cyclomatic-complexity` do `dart_code_linter`,
rodada por `node scripts/mobile.mjs analyze` logo depois do `flutter analyze`. As duas entram no
`pnpm lint`.

Métrica que não conseguiu rodar **não** passa: o `mobile.mjs` só aceita a saída de uma análise
que terminou. E as funções de hoje acima do limite são **refatoradas**, nunca suprimidas.

Antecipada: a F3 depende da F2, mas este portão não depende de identidade nenhuma, e sem ele
toda entrega até lá cresceria sem medida.

### B-19 — Relatório do `smoke-live` (nascida "Nightly") ✅

Roda contra o Claude real, e **abre issue** quando falha — ou comenta na que já abriu —, em vez de
a falha morrer num terminal. Execução verde não abre nada e não fecha issue nenhuma. E uma
execução ao lado de outra não disputa porta nem projeto compose com ela.

**Sob demanda, não agendada** ([D-11](decisions.md#d-11--o-smoke-live-continua-sob-demanda)): a
D-12 do plano 01 fica, porque não há credencial do Claude no CI. O comando é
`pnpm test:e2e:live:report`.

Achado escrevendo S-40: o purge que o `run-e2e-local` faz antes de subir a stack derrubava
**todo** projeto `remote-claude-e2e-*` — inclusive o de uma execução viva ao lado. O projeto passa a
levar o pid do dono, e o purge poupa o de dono vivo.

É o mecanismo que avisa que o SDK mudou — ver [F6 do plano 01](../01-live-session/F6-e2e.md).

### B-20 — `doctor` e catálogo atualizados ✅

Pré-requisito novo (o binário do `osv-scanner`) entra no `doctor.mjs`, dizendo **como
resolver**, e a seção **Comandos** do [README.md](../../../README.md#comandos) acompanha na
mesma entrega.

---

## Cenários cobertos

S-33…S-35, S-37…S-40, S-62…S-68, S-74.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm scan:security
```
