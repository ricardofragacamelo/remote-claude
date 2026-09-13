# F2 — Contratos

Plano: [00 — Bootstrap](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-foundation.md).
**Entrega:** o protocolo WebSocket existe em **um** lugar e gera TS e Dart.

---

## Por que antes do backend e do front

Contrato definido depois das pontas vira documentação do que já foi feito — e as duas pontas
já divergiram. Definido antes, ele é a fonte, e as duas consomem.

Ver [ADR-007](../../architecture/shared/00-decisions.md#adr-007--pnpm-workspaces-com-o-flutter-fora).

---

## Tarefas

### B-11 — JSON Schema do protocolo

`packages/contracts/schema/`. Só o subconjunto que o walking skeleton usa — o contrato
completo de [05](../../architecture/shared/05-websocket-protocol.md) entra com as features.

| Schema | Cobre |
|---|---|
| `envelope.schema.json` | `v`, `id`, `kind`, `type`, `ts`, `traceId`, `correlationId`, `seq`, `payload` |
| `commands/connection-authenticate` · `connection-reauthenticate` | handshake |
| `events/connection-ready` · `error` | resposta do handshake e envelope de erro |
| o comando e o evento da fatia vertical | definidos em [F3](F3-backend.md) |

`v: 1`. Campo desconhecido é **ignorado**, nunca rejeitado — é o que permite adicionar evento
sem quebrar app publicado na loja.

### B-12 — Geração TypeScript

Tipos + type guards em `packages/contracts/src`, gerados do schema. Backend e web importam
daqui e **nunca** declaram tipo de protocolo por conta própria.

### B-13 — Geração Dart

Mesmo schema → Dart em `mobile/lib/core/network/contracts/`. O Flutter está fora do workspace
pnpm, então a paridade vem de geração, não de import.

Saída commitada, como todo código gerado em Dart.

### B-14 — `contracts:check`

Falha quando o gerado está fora de sincronia com o schema — **nos dois alvos**.

É o portão que impede o risco R-04 do plano: como o Dart não é importado por ninguém em TS,
um schema alterado sem regenerar passaria despercebido até o app quebrar em runtime.

---

## Cenários cobertos

S-01 (TS dessincronizado reprova), S-02 (Dart dessincronizado reprova), S-03 (frame válido
passa no guard), S-04 (campo desconhecido é aceito).

---

## Critério de conclusão

```bash
pnpm contracts:generate && pnpm contracts:check    # verde
# alterar um schema à mão, sem regenerar:
pnpm contracts:check                                # VERMELHO, apontando TS e Dart
```
