# F1 — Backend dos logs

Plano: [18 — Logs e diagnóstico](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md).
**Entrega:** o backend guarda em memória, limitado, o que o próprio `pino` escreve, e responde ao
operador consultas redigidas, com rastreio por `traceId`, seguir ao vivo por long-poll, exportação
e nível mudado em execução com prazo.

---

## Por quê

A ordem desta fase segue o caminho da linha: primeiro a forma dela (domínio puro), depois onde ela
fica (buffer), como chega (tee), quem pode ver (operador), e só então a consulta e a rota. Cada
passo é testável sem o seguinte — e a regra que protege o segredo (a redação na leitura) mora num
lugar só, no use case, antes de qualquer adapter de saída.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

A B-11 (as linhas do cliente no buffer, com o nível delas) saiu em 2026-09-27, junto com o envio de
log do cliente — o número fica vago ([progresso](progress.md#escopo-reduzido-ou-adiado)).

### B-08 — O registro e o filtro, no domínio 🔲

`domain/diagnostics/`, sem framework:

- `LogRecord` — a linha normalizada: `level`, `time`, `service`, `module`, `op`, `traceId`, `sessionId`, `userId`,
  `durationMs`, `fields`, `truncated`, `unparsed`. Linha que não é JSON vira registro `unparsed` com
  o texto — nunca exceção no caminho do logger;
- `LogFilter` — regra pura de casamento: ordem dos níveis, nível mínimo e lista, módulo, `op`,
  usuário, período, termos literais sem caixa com `!` para excluir;
- `LogCursor` — época do processo + sequência monotônica. Cursor de outra época é `reset`, não erro;
  cursor que não decodifica é `INVALID_INPUT`.

Unit em tabela para o filtro (S-14); o resto por propriedade da função.

### B-09 — O buffer em memória 🔲

Adapter `adapter/outbound/logging/in-memory-log-store` atrás da porta `LogStore` (`append`,
`query`, `facets`, `trace`, `stats`), conforme a [D-10](decisions.md#d-10--volume-e-retenção-do-buffer):

- anel geral com teto em **bytes**, e uma reserva separada para `warn`/`error`/`fatal`; o que sai
  soma `evicted`, e `stats` informa a linha mais antiga e o início do buffer;
- teto por linha, cortando com `truncated: true`;
- append **síncrono, sem I/O, de custo constante** — está no caminho de toda linha do backend
  (R-03, S-46);
- consulta por cursor nos dois sentidos, estável sob append concorrente;
- teto `0` desliga o buffer: consultas vazias com `disabled: true`.

### B-10 — O tee do `pino`, sem laço 🔲

Em `infrastructure/logging/`, o destino do logger raiz vira um tee: **stdout, como hoje**, e o
store, que recebe a mesma linha serializada — portanto já com a redação por nome do `pino` e o corte
de 8 KB do `forLog`. O store nunca altera, atrasa ou derruba o stdout: exceção dele é engolida **e
contada** (a saúde mostra, S-24) — a exceção à regra do `catch` que loga, porque logar ali seria
logar a falha do log.

E a regra que impede a amplificação (R-02): as rotas e use cases de `diagnostics` logam **só
metadados** — contagem, cursor, filtro sem o texto de busca, `durationMs` — e nunca o payload da
resposta. O `io-logging.interceptor` ganha a forma de declarar isso por rota, testada (S-25).

### B-12 — O operador, implementado 🔲

No módulo `auth`, conforme a B-02: a lista de `sub` vem da configuração validada pelo schema do
ambiente (malformada derruba o boot, S-10), vazia por padrão; porta `OperatorPolicy`
(`isOperator(userId)`) que `diagnostics` consome. Nenhuma claim do token entra na decisão (S-09).
Mudança de lista vale no reinício — sem recarga em execução, porque papel concedido por uma
requisição é exatamente o que a D-02 descarta.

### B-13 — A consulta: autorização, redação na leitura, rastreio e long-poll 🔲

`application/diagnostics/query-logs.use-case` e irmãos:

- **autorização**: só o operador lê, e vê as linhas de todos os usuários; para os demais, toda rota
  de leitura — consulta, facetas, rastreio, exportação, tail — é `403`, sem linha no corpo (S-08,
  S-35);
- **redação por forma na leitura** de toda linha servida — `msg`, `op` e cada string de `fields` —,
  escrita por este plano (o `pino` só redige por nome), com `redacted` contando as marcas; nenhum
  parâmetro, cabeçalho ou rota devolve a linha antes disso (S-34);
- **facetas** sobre os mesmos filtros da consulta;
- **rastreio**: as linhas do `traceId` em ordem, pares entrada/saída casados pelos `op` de borda de
  [03-logging](../../architecture/shared/03-logging.md#a-regra-do-io-em-debug), a entrada sem saída
  marcada como pendurada;
- **long-poll**: `after` + `wait` espera a próxima linha que case com o filtro; teto de long-polls simultâneos por usuário (`429` `logTail`); linhas que saíram antes
  de lidas viram `gap` com contagem.

Integração com testcontainers para o caminho HTTP completo; unit para a redação, a autorização e o
casamento dos pares.

### B-14 — As rotas HTTP e a exportação 🔲

Controller `adapter/inbound/http/diagnostics/` com os DTOs Zod da B-04, `BearerAuthGuard` em todas
(`401` sem credencial, S-49), e o log de I/O só com metadados (B-10).

Exportação conforme a [D-07](decisions.md#d-07--exportação): stream `application/x-ndjson` com os
filtros da consulta, a mesma redação e a mesma autorização, teto com a linha final
`export.truncated`, nome de arquivo com o período; toda exportação grava
`diagnostics.logsExported` na trilha **antes** de começar a enviar — trilha indisponível não exporta.

### B-15 — O nível do backend em execução 🔲

Conforme a [D-06](decisions.md#d-06--mudar-o-nível-do-backend-em-execução): porta
`LogLevelControl`, adapter sobre o `pino` que alcança **também os loggers filhos criados no boot**
(o gap da D-06 decide como — registro dos filhos ou nível lido por função); prazo obrigatório com
teto, um timer só (o `PUT` repetido renova, S-55), volta ao `LOG_LEVEL` no fim do prazo, no `DELETE`
e no reinício; cada mudança efetiva e cada volta gravam `diagnostics.logLevelChanged` com quem, de
quê, para quê e até quando.

---

## Cenários cobertos

S-06…S-25, S-31…S-35, S-38…S-57.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
