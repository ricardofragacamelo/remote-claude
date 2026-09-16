# F0 — Transcript

Plano: [04 — Histórico e retomada](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [plano 01](../01-live-session/README.md).
**Entrega:** listar sessões e carregar mensagens do histórico, pelas funções do SDK.

---

## A regra que define esta fase

**Não faça parser do JSONL.** O formato é interno do Claude Code, muda sem aviso e é o mesmo
arquivo que o VSCode usa. O acesso é por `listSessions` e `getSessionMessages`
([backend/03](../../architecture/backend/03-modules.md#transcript)).

O custo de desobedecer não aparece no dia da entrega: aparece na atualização seguinte do SDK.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-01 — Módulo `transcript` e a porta 🔲

Porta em `application/transcript/ports/`, adapter em `adapter/outbound/claude/`. Nenhum import
de `@anthropic-ai/*` fora dessa pasta — é o que permite trocar ou fakear o SDK.

### B-02 — Endpoints de histórico 🔲

Listar sessões (com a **origem** de cada uma: aberta aqui ou no VSCode) e carregar as mensagens
de uma sessão.

### B-03 — Histórico no mesmo contrato dos eventos vivos 🔲

Uma mensagem lida do histórico chega ao cliente no mesmo formato de `message.completed` /
`tool.completed`. Dois formatos para a mesma coisa significaria dois redutores no front — e o
segundo é o que fica desatualizado.

### B-04 — Autorização, paginação e cache 🔲

Só o dono lê, e só workspace da allowlist aparece ([D-01](decisions.md#d-01--o-que-aparece-de-fora)).

Transcript grande é paginado por cursor desde o primeiro dia — 25 mensagens, teto 100, pela
cauda —, mas **a paginação protege o cliente, não o servidor**: medido, `limit`/`offset` não
reduzem o trabalho do SDK, que reparsa o JSONL inteiro a cada chamada (~30 MB de heap, com ou
sem limite). Quem protege o servidor é o cache por `sessionId` + `lastModified`, mais limite de
leituras concorrentes ([D-02](decisions.md#d-02--o-tamanho-da-página-e-quem-ela-protege)).

Cursor, e não offset cru: a ordem do `listSessions` muda sob escrita concorrente.

### B-05 — Erros e logging desta borda 🔲

SDK indisponível ao ler → `CLAUDE_UNAVAILABLE` (`502`), nunca `500`: a distinção entre bug
nosso e upstream fora é o que permite alertar certo
([04-errors-and-http](../../architecture/shared/04-errors-and-http.md)).

I/O logado em `debug`, sem despejar o conteúdo das mensagens no log.

---

## Cenários cobertos

S-01…S-10.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
