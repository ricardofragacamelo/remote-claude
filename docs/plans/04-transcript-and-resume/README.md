# Plano 04 — Histórico e retomada

**Objetivo:** abrir o que já foi conversado — inclusive o que começou no VSCode —, continuar de
onde parou, usar os slash commands da instalação e desfazer o que uma sessão escreveu.

**Critério de conclusão — é um comando, não uma opinião:**

```bash
pnpm verify:full     # portões 1-11, sai com código 0
pnpm test:e2e:live   # a suíte smoke-live, sai com código 0
```

Arquivos irmãos: [matriz de cenários](scenarios.md) · [decisões em aberto](decisions.md) ·
[progresso](progress.md).

---

## Por quê

Até aqui a sessão nasce, vive e morre. Quem fecha o navegador perde o fio, e quem começou no
VSCode não vê nada — mesmo que o Claude tenha guardado tudo, no mesmo arquivo, o tempo todo.

Duas decisões já tomadas tornam este plano pequeno em código e grande em valor:

| Decisão | Consequência aqui |
|---|---|
| `persistSession: true` desde o [plano 01](../01-live-session/F2-session-runtime.md) | o histórico **já existe** em `~/.claude/projects/`; falta ler |
| O transcript **não** é copiado para o Postgres | não há sincronização a escrever, nem duas fontes para divergir ([backend/05](../../architecture/backend/05-persistence.md)) |

E há uma consequência de produto que precisa ser tratada como feature, não como acidente: **as
sessões criadas no VSCode aparecem**. A UI mostra a origem ([backend/03](../../architecture/backend/03-modules.md#transcript)).

---

## Escopo

### Entra

| | |
|---|---|
| Módulo `transcript`: listar sessões e carregar mensagens pelas funções do SDK | F0 |
| Telas de histórico no web e no app, e a recarga que o `gap: true` exige | F1 |
| Retomada (`resumeSessionId`), inclusive de sessão criada no VSCode | F2 |
| Slash commands vindos de `supportedCommands()`, e o `/init` | F3 |
| Desfazer arquivos (`rewindFiles()`), com auditoria e limite | F4 |
| E2E do ciclo, e `smoke-live` dos comandos reais | F5 |

### Não entra

- **Busca dentro do transcript.** Precisa de índice e de decisão sobre onde ele mora; hoje não
  há volume que justifique.
- **Edição ou apagamento de histórico.** O arquivo é do Claude e é compartilhado com o VSCode;
  escrever nele é criar uma segunda fonte de verdade.
- **Exportar conversa.** Mesma razão do [plano 03](../03-rules-and-audit/README.md): superfície
  de vazamento nova, sem demanda.

---

## Fases

Cada fase é um **arquivo próprio**, com suas tarefas detalhadas, cenários cobertos e critério
de conclusão. A ordem é dependência, não preferência — uma fase só começa com a anterior
verde.

| Fase | Arquivo | Entrega | Tarefas | Estado |
|---|---|---|---|---|
| F0 | [Transcript](F0-transcript.md) | listar e ler histórico pelas funções do SDK | B-01…B-05 | 🔲 |
| F1 | [Telas de histórico](F1-transcript-ui.md) | histórico no web e no app, e a recarga do `gap` | B-06…B-09 | 🔲 |
| F2 | [Retomada](F2-resume.md) | continuar sessão encerrada, inclusive a do VSCode | B-10…B-13 | 🔲 |
| F3 | [Slash commands](F3-commands.md) | menu vindo da instalação, e o `/init` | B-14…B-17 | 🔲 |
| F4 | [Desfazer](F4-checkpoint.md) | `rewindFiles()` com alcance explícito e auditado | B-18…B-21 | 🔲 |
| F5 | [E2E](F5-e2e.md) | o ciclo pela porta do usuário, e o smoke-live dos comandos | B-22…B-25 | 🔲 |

Legenda: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

O andamento real fica em [progress.md](progress.md) — esta tabela é o índice, não o diário.

---

## Rastreio

Requisito → tarefa → documento normativo → cenários. **Nenhuma linha sem cenário.**

| Requisito | Tarefas | Documento normativo | Cenários |
|---|---|---|---|
| Histórico vem das funções do SDK, nunca de parser próprio de JSONL | B-01, B-03 | [backend/03-modules](../../architecture/backend/03-modules.md#transcript) | S-01, S-02, S-09 |
| Sessão do VSCode aparece, com a origem visível | B-02, B-06 | [backend/03-modules](../../architecture/backend/03-modules.md#transcript) | S-01, S-11 |
| Histórico grande é paginado, e a leitura não trava o que está vivo | B-04 | [backend/05-persistence](../../architecture/backend/05-persistence.md) | S-03, S-06…S-08, S-10 |
| Transcript de outro dono não é acessível, e falha do SDK é `502` | B-04, B-05 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-04, S-05 |
| A recarga por `gap: true` finalmente tem de onde recarregar | B-07 | [backend/06-realtime](../../architecture/backend/06-realtime.md#ring-buffer-e-replay) | S-14, S-15 |
| Telas de histórico nas duas pontas, traduzidas | B-06, B-08, B-09 | [web/01](../../architecture/web/01-architecture.md), [mobile/04-ui](../../architecture/mobile/04-ui.md) | S-11…S-13, S-16…S-18 |
| Retomar continua a conversa, sem duplicar sessão viva | B-10, B-11 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md) | S-19, S-21, S-24, S-25 |
| Retomar a sessão que começou no VSCode | B-12 | [backend/03-modules](../../architecture/backend/03-modules.md#transcript) | S-20 |
| Retomada respeita allowlist, limite e erros conhecidos | B-13 | [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) | S-22, S-23, S-26…S-28 |
| Slash commands vêm da instalação, sem lista hardcoded | B-14, B-15, B-17 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#slash-commands-init-gerar-readme-e-agentsmd) | S-29…S-31, S-35, S-36 |
| `/init` passa pelo fluxo normal de permissão | B-16 | [backend/04-claude-integration](../../architecture/backend/04-claude-integration.md#slash-commands-init-gerar-readme-e-agentsmd) | S-32…S-34 |
| Desfazer tem alcance explícito, é auditado e não roda no meio de um turno | B-18…B-21 | [backend/03-modules](../../architecture/backend/03-modules.md#audit) | S-37…S-45 |
| O ciclo provado pela porta do usuário, e o comando real pelo smoke-live | B-22…B-25 | [06-testing-strategy](../../architecture/shared/06-testing-strategy.md) | S-46…S-53 |

Detalhe de cada `S-nn` em [scenarios.md](scenarios.md).

---

## Árvore resultante

```
packages/contracts/schema/
├── commands/    session-rewind-files · session-list-commands
└── events/      session-rewound

backend/src/
├── domain/transcript/
├── application/transcript/ports/
├── adapter/
│   ├── inbound/http/transcript/
│   └── outbound/claude/           transcript.adapter · commands.adapter · rewind.adapter
└── …

web/src/features/{transcript,session}/
mobile/lib/features/transcript/
e2e/{scenarios,specs,smoke-live}/
```

---

## Riscos e decisões em aberto

| # | Assunto | Estado |
|---|---|---|
| R-01 | O formato do JSONL é **interno do Claude** e muda sem aviso | por isso só as funções do SDK são usadas (B-01), e por isso o `smoke-live` cobre esta ponta (B-25) |
| R-02 | Sessão do VSCode aparecendo pode confundir — o usuário não a criou aqui | é feature declarada; a origem fica visível na lista (S-11) |
| R-03 | `rewindFiles()` mexe no **disco do usuário** | alcance explícito na UI, recusa durante turno, e registro em `audit` (B-19…B-21) |
| R-04 | Transcript longo pode estourar memória ao ser lido de uma vez | paginação desde o primeiro dia (B-04), e parsing fora da thread de UI no app |
| R-05 | Retomar sessão que já está viva poderia abrir um segundo subprocesso | retomada de sessão viva é `attach`, não `start` (S-24) — e isso é regra, não otimização |

---

## Como executar este plano

Sob o [protocolo de validação](../../architecture/shared/11-validation-protocol.md):

1. **Estágio 0** — revise a [matriz de cenários](scenarios.md) antes de começar.
2. Uma fase por vez, em ordem. Ao fim de cada uma: `pnpm verify`.
3. Vermelho → corrige e **reinicia do primeiro portão**. Registre o ciclo em [progress.md](progress.md).
4. Três ciclos sem progresso no mesmo portão → **pare e escale**.
