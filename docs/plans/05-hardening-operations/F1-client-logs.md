# F1 — Logs do cliente

Plano: [05 — Endurecimento e operação](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-limits.md).
**Entrega:** o que o web e o app registram chega ao backend — e dá para ligar `debug` em
release sem recompilar nada.

---

## Uma dívida com metade pronta

O bootstrap entregou `LogBuffer` e `beaconShipper` no web, e o `LogBuffer` no app, **cobertos
por teste e sem endpoint que os receba**. Foi registrado como escopo adiado, não escondido
([plano 00](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado)).

Esta fase entrega a outra metade. E trata a porta nova pelo que ela é: um endpoint que aceita
texto vindo do cliente.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-08 — Endpoint de ingestão 🔲

Recebe lotes, preserva o `traceId` que o cliente gerou, tem limite de tamanho
(`PAYLOAD_TOO_LARGE`) e rate limit próprio (`RATE_LIMITED`).

**Redação antes de gravar**: o que o cliente manda não é confiável, e token em log é token
vazado — [03-logging](../../architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log).

### B-09 — Shipper do web ligado 🔲

O que já existe passa a apontar para o endpoint. Endpoint fora do ar **não** pode travar a UI
nem estourar memória: o buffer tem teto e descarta o mais antigo, dizendo que descartou.

### B-10 — Shipper do app ligado 🔲

Mesmo comportamento, respeitando o ciclo de vida: em `paused` o envio é adiado, não perdido —
e não é motivo para segurar o processo em background.

### B-11 — Tela de diagnóstico 🔲

Liga `debug` em release e mostra o estado da conexão e da credencial. A função
`levelFor(isRelease, debugRequested)` já existe e está coberta desde o bootstrap; o que falta é
a tela que a aciona.

Sair da tela volta o nível ao normal — nível de log elevado esquecido é vazamento lento.

---

## Cenários cobertos

S-15…S-22.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
