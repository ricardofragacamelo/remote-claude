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

### B-16 — `osv-scanner` no portão 10 🔲

Hoje o `pnpm audit` cobre dependência vulnerável, e o `semgrep` roda pela imagem oficial. O
`osv-scanner` entra ao lado, dentro do `scan-security.mjs` que já existe.

Scanner indisponível **não** passa em silêncio: sem resultado, o portão falha. Portão que
aprova quando não conseguiu verificar é decoração.

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

### B-19 — Nightly do `smoke-live` 🔲

Roda contra o Claude real, e **abre issue** quando falha, em vez de pintar de vermelho um
pipeline que ninguém olha de madrugada. Nightly verde não abre nada e não fecha issue alheia.
E o nightly rodando junto de um job de PR não disputa porta nem projeto compose com ele.

É o mecanismo que avisa que o SDK mudou — ver [F6 do plano 01](../01-live-session/F6-e2e.md).

### B-20 — `doctor` e catálogo atualizados 🔲

Pré-requisito novo (o binário do `osv-scanner`) entra no `doctor.mjs`, dizendo **como
resolver**, e a seção **Comandos** do [README.md](../../../README.md#comandos) acompanha na
mesma entrega.

---

## Cenários cobertos

S-33…S-35, S-37…S-40, S-62…S-68.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm scan:security
```
