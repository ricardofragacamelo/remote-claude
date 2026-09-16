# F0 — Limites

Plano: [05 — Endurecimento e operação](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [plano 01](../01-live-session/README.md).
**Entrega:** o backend para de aceitar mais do que a máquina aguenta, devolve o que não está
sendo usado, e não deixa processo para trás.

---

## O que torna esta fase diferente

Cada sessão é **um subprocesso real** na máquina do usuário — ~222 MB, medido. Um vazamento
aqui não é uma métrica feia num painel: é a máquina de alguém ficando sem memória enquanto essa
pessoa trabalha.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-01 — Limite derivado da RAM 🔲

Em vez de um número fixo, a capacidade sai da memória disponível, com piso e teto
configuráveis. A fórmula é **regra pura** — sem I/O, testável, e é onde o cenário de fronteira
mora.

Estourou → `SESSION_LIMIT_REACHED` (`429`), com `Retry-After`.

### B-02 — TTL de sessão ociosa 🔲

Ociosa além do prazo é encerrada com `session.closed`, liberando o subprocesso. Sessão
**ativa** não é encerrada — e "ativa" inclui esperar permissão, que é um estado de espera
legítimo, não ociosidade.

### B-03 — Sessão órfã encontrada no boot 🔲

O backend pode morrer sem chamar `close()`; o subprocesso do CLI sobrevive ao pai. Na subida, o
processo varre e encerra os órfãos **marcados como nossos**.

A marca importa: varredura que mata por nome de binário mataria o Claude Code que o usuário
abriu no terminal.

### B-04 — Shutdown ordeiro 🔲

Na ordem de [backend/06](../../architecture/backend/06-realtime.md#shutdown): para de aceitar
conexão, avisa as sessões, fecha os sockets com `1001`, `query.close()` em **todas**, drena o
pool. Pular o quarto passo deixa processo órfão na máquina do usuário.

Chamar duas vezes é inofensivo.

### B-05 — Rate limit por connection 🔲

Frames por segundo, tamanho de frame e sessões anexadas. Estourou → `error` com
`RATE_LIMITED`; reincidiu → fecha com `4429`. `429` e `503` **sempre** trazem `Retry-After` —
sem ele o cliente martela.

### B-06 — Limites anunciados no handshake 🔲

O `connection.ready` já carrega `limits`; aqui eles passam a ser reais e configuráveis. Cliente
que conhece o limite não precisa descobri-lo apanhando.

### B-07 — Heartbeat e idle sob carga 🔲

`ping` a cada 30 s, sem `pong` em 10 s fecha com `4408`. Conferir que isso se mantém com o
servidor ocupado — heartbeat que atrasa sob carga derruba conexão saudável.

---

## Cenários cobertos

S-01…S-14.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
