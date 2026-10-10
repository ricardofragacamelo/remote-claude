# F0 — Spike

Plano: [27 — Perdas da conversa](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** os planos [26](../26-mobile-conversation-parity/README.md) e [13](../13-claude-settings/README.md)
concluídos ([D-01](decisions.md#normas)), e o [28](../28-agent-neutral-core/README.md) antes deles
([D-14](decisions.md#normas)). É a primeira fase deste plano.
**Entrega:**

- as respostas, medidas contra o Claude real, às perguntas da [D-05](decisions.md#f0--spike);
- a forma dos `retracted_message_uuids` comparada com o que os clientes guardam ([D-06](decisions.md#f2--contrato));
- as fixtures do SDK roteirizado gravadas pela via real do plano 13.

---

## Por quê

Três premissas da antiga F6 do plano 26 caíram na primeira leitura do `sdk.d.ts`
([discovery §2](../../discovery/09-perdas-do-backend-na-conversa.md#2-a-resposta-curta)): o
`systemMessage` do hook não vem no `hook_response`, a troca de modelo por sobrecarga não tem mensagem
própria, e o histórico perde a compactação também por não ler as mensagens de sistema. O que sobra
para decidir as F2…F5 depende do que o CLI **emite**, e isso só se sabe medindo.

O plano 13 tem de estar pronto: as fixtures saem da composição real (MCP, skill de usuário, hook e
comando de projeto), e não de um ambiente que a imita. É a mesma disciplina da
[B-01 do plano 13](../13-claude-settings/F0-contract.md#b-01--spike-as-medições-que-mandam-no-desenho-):
resultado ruim não é falha do spike, é o que ele existe para achar.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-01 — Spike: as medições da D-05 🔲

Um script em `scripts/`: `pnpm spike:conversation-losses`, com uma sonda por nome e `--json`, sobre o
`scripts/lib/spike-session.mjs` que os spikes dos planos 13 e 26 já usam (as opções do produto:
`settingSources: ['project']`, o `PreToolUse` e o `canUseTool`). Cada sonda mede ao vivo **e** pelo
`getSessionMessages` da mesma conversa:

1. `includeSystemMessages: true`: quais subtipos de `system` o JSONL traz (compactação, saída de
   comando, informativo, erro de API) e o custo da leitura numa conversa longa, com e sem a opção (R-03);
2. onde chega o `systemMessage` de um hook de settings: no `hook_response` ou no `informational`;
3. a troca por sobrecarga do `fallbackModel`: se chega como `informational`, como `notification` ou sem
   aviso;
4. os campos do `rate_limit_info` e os estados que ele assume;
5. o volume do `api_retry` num caso real de nova tentativa;
6. o `conversation_reset` depois de um `/clear`: se o `session_id` muda e o que a sessão viva deve fazer;
7. o `worker_shutting_down` frente ao `session.closed` que já emitimos;
8. se o uuid de uma mensagem `assistant` bate com o `blockId` e com o `messageId` que os clientes
   guardam, para a retirada da [D-06](decisions.md#f2--contrato);
9. se o CLI produz um bloco que não é `tool_result` numa mensagem com `tool_result`
   ([discovery §5](../../discovery/09-perdas-do-backend-na-conversa.md#5-perdas-dentro-da-mensagem-de-usuário));
10. onde o `compact_boundary` e o resumo ficam na cadeia que o SDK reconstrói depois do `/compact`.

O resultado vai para a [descoberta do SDK](../../discovery/01-descoberta-claude-agent-sdk.md) como uma
seção de spikes, com o "como reproduzir", e cada resposta fecha a linha correspondente do
[decisions.md](decisions.md). Cenários S-01, S-02.

### B-02 — Fixtures gravadas 🔲

Pelo `scripts/record-agent-sdk-fixtures.mjs`, gravadas do Claude real e não escritas à mão. Vão para
`backend/test/fakes/agent-sdk/fixtures/`, com o par de histórico no `scripted-transcripts`:

| Fixture | O que tem |
|---|---|
| `compact-turn` | já existe; passa a provar a mensagem sintética e o eco do §5 |
| `compact-failed-turn` | um `/compact` que falha, com o `compact_error` |
| `local-command-turn` | `/cost` ou `/context` |
| `project-command-turn` | um `/comando` do projeto, ao vivo e no histórico |
| `skill-turn` | uma skill de usuário carregada pelo plugin sintético do plano 13 |
| `hook-message-turn` | um hook de settings com `systemMessage`, e um que falha com `stderr` |
| `mcp-media-result-turn` | tool MCP com imagem, `resource` e `resource_link` no resultado |
| `denied-by-rule-turn` | uma tool negada por regra, sem pergunta |

A recusa com troca de modelo não se provoca de propósito: a `refusal-fallback-turn` é escrita à mão e
**marcada** como tal, como a [D-09](decisions.md#f0--spike) recomenda. O teste de forma das gravadas a
reconhece e não a confunde com uma gravação. Cada fixture entra no catálogo do SDK roteirizado
(`backend/test/fakes/agent-sdk/fixture.ts`). Cenários S-03, S-04.

---

## Cenários cobertos

S-01…S-04.

---

## Critério de conclusão

```bash
pnpm verify
pnpm spike:conversation-losses --json /tmp/conversation-losses.json   # sai com 0 e as dez sondas respondidas
```
