# F1 — Telas de histórico

Plano: [04 — Histórico e retomada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-transcript.md).
**Entrega:** o histórico visível nas duas pontas — e, enfim, um lugar de onde recarregar quando
o replay diz `gap: true`.

---

## O ciclo que esta fase fecha

O [plano 01](../01-live-session/F5-web-session.md) mandou o cliente **descartar o estado e
recarregar o transcript por HTTP** quando o buraco é grande demais para costurar. Até agora,
não havia o que carregar. A regra existia sem destino; aqui ela passa a funcionar.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-06 — Lista de sessões no web 🔲

Com filtro por workspace e a **origem** visível. Sessão criada no VSCode aparecendo é feature,
e a UI precisa dizer isso — senão parece dado vazando de outro lugar.

### B-07 — Leitura do transcript, e a recarga do `gap` 🔲

A tela carrega o histórico paginado, e o store usa esse mesmo caminho quando o `attach` devolve
`gap: true`: limpa e recarrega, sem tentar costurar
([web/04](../../architecture/web/04-state-and-data.md#o-store-de-stream)).

Recarregar enquanto o stream vivo continua chegando **não** pode duplicar mensagem.

### B-08 — Histórico no app 🔲

Mesma capacidade, com os quatro estados de tela. Parsing de transcript longo em `compute()`,
fora da thread de UI ([mobile/03](../../architecture/mobile/03-state-and-data.md)).

### B-09 — i18n e l10n das telas novas 🔲

`en` e `pt-BR` no web, ARB `en` e `pt` no app, com paridade verificada.

---

## Cenários cobertos

S-11…S-18.

---

## Critério de conclusão

```bash
pnpm verify
pnpm i18n:check
```
