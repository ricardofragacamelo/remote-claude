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

### B-17 — Quality gate do SonarQube 🔲

Portão 12, no CI, como o
[protocolo](../../architecture/shared/11-validation-protocol.md#estágio-2--os-portões) já
previa. Ele olha o que os outros não olham: complexidade, smell e hotspot na linha nova.

### B-18 — Job de e2e mobile no CI 🔲

Roda, e **não bloqueia merge** — a decisão é [R-07 do bootstrap](../00-bootstrap/README.md#riscos-e-decisões-em-aberto)
e não muda aqui. O que muda é existir um runner que aguente emulador, em vez de a suíte só
rodar na máquina de quem lembrar.

### B-19 — Nightly do `smoke-live` 🔲

Roda contra o Claude real, e **abre issue** quando falha, em vez de pintar de vermelho um
pipeline que ninguém olha de madrugada. Nightly verde não abre nada e não fecha issue alheia.

É o mecanismo que avisa que o SDK mudou — ver [F6 do plano 01](../01-live-session/F6-e2e.md).

### B-20 — `doctor` e catálogo atualizados 🔲

Pré-requisito novo (o binário do `osv-scanner`, o runner) entra no `doctor.mjs`, dizendo **como
resolver**, e a seção **Comandos** do [README.md](../../../README.md#comandos) acompanha na
mesma entrega.

---

## Cenários cobertos

S-33…S-40.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm scan:security
```
