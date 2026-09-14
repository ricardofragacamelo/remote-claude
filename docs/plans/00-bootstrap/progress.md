# Plano 00 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Atualizado a cada ciclo de trabalho. Os **contadores** — barras, linha de cada fase, total e
contagem de cenários — saem de `pnpm plan progress`, lidos dos arquivos de fase e do
`scenarios.md`. O resto é escrito à mão.

---

## Estado atual

**Fase corrente:** [F1](F1-infrastructure.md) e [F2](F2-contracts.md) concluídas; próxima é a [F3](F3-backend.md)
**Última atualização:** 2026-09-14
**Bloqueios:** nenhum. O bloqueio registrado para a F1 **não existia**: o Compose v2 está
instalado nesta máquina como binário `docker-compose`, e não como plugin `docker compose`. Era o
`doctor` que exigia a forma de plugin. Passou a aceitar as duas, e sai 0 aqui.

**Para a F3:** R-02 (`409` vs enfileirar prompt) continua em aberto e precisa ser decidido
antes de começar.

```
F0 ████████████████████ 100%   ✅ concluída
F1 ████████████████████ 100%   ✅ concluída
F2 ████████████████████ 100%   ✅ concluída
F3 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F4 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F5 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F6 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
F7 ░░░░░░░░░░░░░░░░░░░░   0%   🔲 não iniciada
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-foundation.md) | B-01…B-06, B-48, B-49, B-52 | 9/9 | ✅ |
| [F1](F1-infrastructure.md) | B-07…B-10, B-50 | 5/5 | ✅ |
| [F2](F2-contracts.md) | B-11…B-14 | 4/4 | ✅ |
| [F3](F3-backend.md) | B-15…B-23, B-51 | 0/10 | 🔲 |
| [F4](F4-web.md) | B-24…B-30 | 0/7 | 🔲 |
| [F5](F5-mobile.md) | B-31…B-36 | 0/6 | 🔲 |
| [F6](F6-scripts-e2e.md) | B-37…B-40 | 0/4 | 🔲 |
| [F7](F7-gates-ci.md) | B-41…B-47 | 0/7 | 🔲 |
| **Total** | **B-01…B-52** | **18/52** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 87 | 62 | 0 | 25 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).
Registrar o vermelho é o que permite ver padrão — três ciclos seguidos caindo no mesmo portão
é sinal de problema de desenho, não de descuido.

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-09-13 | F0 | 1 — formatação | 6 arquivos fora do estilo do Prettier | `pnpm format` | verde no reinício |
| 2 | 2026-09-13 | F0 | 5 — duplicação | `run` e `runAttached` de `scripts/lib/exec.mjs` compartilhavam 9 linhas | extraído `invoke()`, a única diferença virou parâmetro | 0 clones |
| 3 | 2026-09-13 | F0 | 6 — unit | `.env.example` tinha comentário por bloco, não por variável — o teste de B-05 reprovou | comentário próprio para cada variável | 105 unit verdes |
| 4 | 2026-09-13 | F0 | 6 — unit | teste do CLI do `doctor` dependia da máquina (falta `docker compose` aqui) | passou a exigir **coerência** entre saída e código de saída, não um ambiente específico | 8 integração verdes |
| 5 | 2026-09-13 | F1 | 1 — formatação | 3 arquivos novos fora do estilo | `pnpm format` | verde no reinício |
| 6 | 2026-09-13 | F1 | 5 — duplicação | os dois clients OIDC do realm do Keycloak compartilham 16 linhas | `infra/**` excluído no `.jscpd.json` — ver decisões | 0 clones |
| 7 | 2026-09-13 | F1 | 6 — unit | `kill()` não derrubava processo que não lidera grupo próprio: `process.kill(-pid)` dava `ESRCH` e o erro era engolido | fallback para o pid puro quando o grupo não existe | 11 verdes em `proc.spec` |
| 8 | 2026-09-13 | F1 | 8 — integração | `pnpm dev` **saía sozinho** depois de imprimir o quadro: sem processo em watch (F3/F4 não existem), nada segurava o event loop | handle explícito de foreground, liberado no cleanup | 7 verdes contra Docker real |
| 9 | 2026-09-13 | F2 | 2 — lint | `no-unused-vars` no rest-destructuring usado para omitir campo no teste | helper `without()`, sem tocar no config do ESLint | verde |
| 10 | 2026-09-13 | F2 | 3 — tipagem | frame não podia estreitar `payload` herdado do envelope, e o guard recastava um valor já estreitado | `Omit<Envelope, …>` no frame; guard usa o valor estreitado | verde |
| 11 | 2026-09-13 | F2 | 5 — duplicação | `BANNER` e `docComment` duplicados entre os dois emissores; e o Dart gerado clonava a si mesmo | extraído `contracts-emit.mjs`; Dart passou a ser `protocol.g.dart`, que a exclusão de gerado já cobria | 0 clones |
| 12 | 2026-09-13 | F2 | 6 — unit | `messageSchemas` relativizava caminho duas vezes e lia os schemas **do repositório**, não os do diretório recebido | relativização só no fim do walk | 12 verdes em `contracts-io.spec` |

Os ciclos 2 e 3 são o portão fazendo o que devia: o `jscpd` achou duplicação que eu não tinha
visto, e o teste do `.env.example` reprovou o próprio `.env.example` que eu tinha acabado de
escrever. O ciclo 4 é o oposto — o portão estava certo e o **teste** estava errado.

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente. Decisão
registrada só aqui é decisão que se perde.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-09-13 | Estado da task fica no **fim do título** da task, no arquivo da fase | `plan --progress` precisa de uma fonte da verdade por task; marcar onde o trabalho acontece e derivar o resto impede o diário de divergir do plano | [formato de plano](../README.md#o-que-cada-arquivo-contém), `scripts/lib/plan-progress.mjs` |
| 2026-09-13 | Saída de script passa por `scripts/lib/ui.mjs` (`process.stdout.write`), nunca `console` | mantém `no-console` ligado em **todo** o repositório, sem exceção no config — exceção no config exigiria ADR | `eslint.config.mjs`, todos os scripts |
| 2026-09-13 | `jscpd` com `threshold: 0` | [09](../../architecture/shared/09-code-quality.md#linhas-repetidas) pede "**zero** blocos duplicados acima do limiar"; 3 % é a métrica do Sonar, que ainda não existe. Exclusão declarada no config, nunca por comentário | `.jscpd.json` |
| 2026-09-13 | `secrets-scan.mjs` cai na imagem Docker quando não há `gitleaks` | Docker já é pré-requisito duro (R-05). A alternativa era o hook passar em silêncio em quem não tem o binário — portão que se pula sozinho não é portão | `.husky/pre-commit`, `README.md` |
| 2026-09-13 | Prettier **não** formata `*.md` | reflui tabela e edita amostra de código dentro do documento (chega a inserir vírgula em JSON de exemplo). O que guarda a documentação é o `docs:check` | `.prettierignore` |
| 2026-09-13 | Aliases ficam no `tsconfig.base.json` e cada workspace declara `"baseUrl": "."` | `paths` resolve contra o `baseUrl` de quem estende; sem isso os aliases apontariam para a raiz do repositório | `tsconfig.base.json`, `scripts/tsconfig.json` |
| 2026-09-13 | `doctor` aceita **as duas formas** de Compose v2: plugin `docker compose` e binário `docker-compose` | são a mesma ferramenta com os mesmos argumentos. Exigir o plugin reprovava máquina com Compose perfeitamente utilizável — foi o "bloqueio" registrado para a F1, que não existia | `scripts/lib/compose.mjs`, `scripts/lib/prerequisites.mjs` |
| 2026-09-13 | Volume do Postgres monta em `/var/lib/postgresql`, não em `/var/lib/postgresql/data` | `postgres:18` mudou a convenção: os dados vão para um subdiretório com o nome da versão, o que permite `pg_upgrade --link` sem cruzar mount. Montar no caminho antigo põe o cluster onde o entrypoint não procura, e o container entra em restart-loop | `docker-compose.yml` |
| 2026-09-13 | O audience mapper fica **em cada client**, não num client scope compartilhado | declarar `clientScopes` no realm **substitui** os built-in do Keycloak: `profile`, `email` e `roles` deixam de existir, e o token perde as claims que o backend usa para provisionar o usuário | `infra/keycloak/realm-remote-claude.json` |
| 2026-09-13 | `infra/**` excluído do `jscpd` | formato de export de produto de terceiro: dois clients OIDC públicos necessariamente repetem as mesmas flags de fluxo, e reordenar chave para enganar o detector seria pior que declarar a exclusão. Mesma categoria de `**/migrations/**`, que já estava lá | `.jscpd.json` |
| 2026-09-13 | Projeto compose vem de `COMPOSE_PROJECT_NAME`, com default `remote-claude` | é a variável do próprio Compose, não uma invenção nossa; é o que permite à suíte subir uma stack descartável sem derrubar o `pnpm dev` de quem está desenvolvendo | `scripts/lib/stack.mjs` |
| 2026-09-13 | Guard gerado **não** valida pertinência a `enum`; valida `const` | `const` é checagem real de compatibilidade (`v: 1`). `enum` fechado em runtime tornaria toda adição de locale ou de `kind` um breaking change para app já publicado na loja | `scripts/lib/contracts-typescript.mjs` |
| 2026-09-13 | Enum vira `String` no Dart, e union de literais no TypeScript | o app publicado precisa sobreviver a um valor acrescentado depois que ele saiu; um `enum` fechado em Dart lançaria | `scripts/lib/contracts-dart.mjs` |
| 2026-09-13 | `connection.ready` é `kind: "ack"`, e o schema mora em `acks/` | conflito entre o [05](../../architecture/shared/05-websocket-protocol.md#handshake) (ack) e a tabela da F2 (`events/`). Perguntado, conforme o AGENTS.md; o 05 é o documento normativo, e a tabela da F2 foi corrigida | [F2](F2-contracts.md), `packages/contracts/schema/acks/` |
| 2026-09-13 | `pnpm doctor`: Node, pnpm e Docker reprovam; Flutter, `gitleaks` e porta ocupada avisam | nenhum dos três impede o repositório de funcionar, e porta fixa ocupada se resolve por variável. `--strict` transforma aviso em reprovação para o CI | `scripts/lib/prerequisites.mjs` |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-09-13 | Metade **Dart** de S-68 (`print()`) e S-69 (`dynamic`) | não há módulo Flutter para o `dart analyze` reprovar; o cenário está marcado ✅ pela metade TS/JS, que é a que existe | [F5](F5-mobile.md) |
| 2026-09-13 | S-52 verificado contra código que **ainda não existe** | o teste varre `backend/src`, `web/src`, `packages` e `e2e` em busca de `process.env.X` — hoje não há leitura nenhuma. O extrator é testado contra fixtures, e o portão acusa na primeira variável não declarada | vigiar na [F3](F3-backend.md), com B-16 |
| 2026-09-13 | `pnpm verify` / `verify:full`, `lint:arch`, cobertura | são a entrega da [F7](F7-gates-ci.md); a F0 roda os portões pelos comandos individuais | [F7](F7-gates-ci.md) |
| 2026-09-14 | `run-e2e-local.mjs` e o `--project-name` aleatório por execução | é B-37, da [F6](F6-scripts-e2e.md). A F1 entregou o que ele vai usar: `findFreePort`, `purgeStaleProjects` e o projeto compose por variável | [F6](F6-scripts-e2e.md) |
| 2026-09-14 | `pnpm dev` **não sobe backend nem web** | não existem ainda (F3 e F4). O script diz `not created yet` e sobe a metade que existe, em vez de falhar num diretório ausente | [F3](F3-backend.md), [F4](F4-web.md) |
| 2026-09-14 | Nenhum client do realm tem `directAccessGrants` | a B-08 pede web e mobile com PKCE, e só. O login por senha dos usuários de teste é exercido pelo navegador na [F6](F6-scripts-e2e.md); se a [F3](F3-backend.md) precisar de token sem navegador para S-29, é decisão dela | [F3](F3-backend.md) |
| 2026-09-14 | Schemas só do handshake e do erro | é o que a B-11 pede. O comando e o evento da fatia vertical entram na [F3](F3-backend.md), e o contrato completo do [05](../../architecture/shared/05-websocket-protocol.md) entra com as features | [F3](F3-backend.md) |
| 2026-09-14 | `dart analyze` / `dart format` sobre o Dart gerado | não há projeto Flutter para rodá-los; o arquivo é gerado sem `dynamic` e testado pelo lado do emissor | [F5](F5-mobile.md) |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | `allow` de projeto em diretório confiado | 🔲 aberto | verificar antes de produção |
| R-02 | `409` vs enfileirar prompt | 🔲 aberto | **decidir antes da F3** — a F3 é a próxima |
| R-03 | 90 % desde o primeiro commit | 🔲 monitorar | vigiar teste de fachada em review. Depois da F1/F2 são 262 unit e 27 integração, mas o **portão** de cobertura só existe na F7 (B-42) — até lá o número não é medido |
| R-04 | Dart gerado fora de sincronia | ✅ mitigado | B-14 entregue: `pnpm contracts:check` reprova **os dois** alvos, e S-02 prova o caso do Dart |
| R-05 | Docker obrigatório | ✅ aceito | sem alternativa |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque-a com ✅ no arquivo da fase, atualize os cenários cobertos
   em [scenarios.md](scenarios.md) e rode `pnpm plan progress` — os contadores daqui saem de lá.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso.
