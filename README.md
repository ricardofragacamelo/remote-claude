# remote-claude

Opere o **Claude Code instalado na sua máquina** a partir do navegador ou do celular.

Um backend Node conversa com o Claude local via Claude Agent SDK, recebe o stream de eventos
e o distribui para dois canais — um front web e um app Flutter — que acompanham a sessão,
enviam prompts e, principalmente, **aprovam as permissões de tool à distância**.

> **Status:** arquitetura definida; bootstrap em andamento — estão de pé a
> [F0](docs/plans/00-bootstrap/F0-foundation.md) (workspace, portões de qualidade, hooks e
> scripts de apoio), a [F1](docs/plans/00-bootstrap/F1-infrastructure.md) (`pnpm dev` sobe
> Postgres e Keycloak) e a [F2](docs/plans/00-bootstrap/F2-contracts.md) (o protocolo WebSocket
> em JSON Schema, gerando TypeScript e Dart). Ainda não há backend nem front.

---

## Como funciona

```
  Web (React)  ─┐                                    ┌─ ~/.claude/projects/*.jsonl
                ├─ WebSocket ─► Backend (NestJS) ─────┤   (sessões, compartilhadas com o VSCode)
Mobile (Flutter)┘      + HTTP        │                └─ Claude Agent SDK ─► CLI local ─► Claude
                                     │
                                     └─ PostgreSQL 18 (auth, devices, audit, push tokens)
```

O fluxo que define o produto: o Claude pede autorização para executar uma tool, o backend
**bloqueia** o loop do agente, empurra a pergunta para o navegador e para o celular, e espera
uma resposta humana. Aprovou no celular, o comando roda na sua máquina.

Três fatos que explicam quase todas as decisões de arquitetura:

1. O backend roda como o usuário dono da máquina e **herda o login do Claude** — não há API
   key no sistema.
2. Quem alcança o backend pode **executar comando arbitrário na máquina**. Permissão,
   auditoria e autenticação são o núcleo, não acessórios.
3. A comunicação é **interativa e bidirecional** — por isso WebSocket, não request/response.

---

## Stack

| Camada | Escolha |
|---|---|
| Backend | Node · NestJS · Clean Architecture |
| Web | React · shadcn/ui · Tailwind CSS |
| Mobile | Flutter · Riverpod |
| Banco | PostgreSQL 18 · Drizzle · testcontainers |
| Autenticação | OpenID Connect (agnóstico de provedor; Auth0 como alvo inicial) |
| Monorepo | pnpm workspaces (Flutter fora, com `pub` próprio) |

O porquê de cada uma, e as alternativas descartadas, está em
[Decisões (ADR)](docs/architecture/shared/00-decisions.md).

---

## Documentação

| Você quer… | Vá para |
|---|---|
| Trabalhar no código (ou é um agente de IA) | **[AGENTS.md](AGENTS.md)** |
| Saber que comandos existem | [Comandos](#comandos), aqui embaixo |
| Ver o que está sendo construído agora | [docs/plans/](docs/plans/README.md) |
| Entender a arquitetura | [docs/architecture/](docs/architecture/README.md) |
| Saber como o backend fala com o Claude | [Descoberta do Agent SDK](docs/discovery/01-descoberta-claude-agent-sdk.md) |

A documentação é fragmentada de propósito, com índices que roteiam por situação
(*"vai fazer X → leia Y"*), para que se carregue só o necessário.

### Dois pontos de partida

- **[AGENTS.md](AGENTS.md)** — regras que valem sempre, e o roteador de primeiro nível.
- **[Protocolo de validação](docs/architecture/shared/11-validation-protocol.md)** — como uma
  fase é planejada, implementada e validada até todos os portões ficarem verdes.

---

## Comandos

> Os scripts abaixo são a **entrega do plano de bootstrap**
> ([docs/plans/00-bootstrap/](docs/plans/00-bootstrap/README.md)). Até ele concluir, nem todos
> existem ainda.

### Pré-requisitos

| | |
|---|---|
| Node | ≥ 22 |
| pnpm | ≥ 9 |
| Docker | rodando, com Compose v2 — serve tanto o plugin `docker compose` quanto o binário `docker-compose` |
| Flutter | 3.44+ — o módulo `mobile/` faz parte dos portões, não é opcional |

```bash
pnpm doctor            # verifica tudo acima e as portas fixas — RODE ISTO PRIMEIRO
pnpm doctor --strict   # aviso também reprova; é o que o CI usa
```

Diz o que falta **e** como resolver. É o que evita depurar erro de ambiente como se fosse erro
de código.

Node, pnpm e Docker **reprovam**. Flutter, `gitleaks` e porta ocupada só **avisam**: nenhum
deles impede o repositório de funcionar, e cada aviso diz o que afeta — porta ocupada, por
exemplo, diz qual variável a move.

### Primeira vez

```bash
pnpm install              # workspaces: backend, web, e2e, packages/contracts
                          # NÃO cobre o mobile — use `flutter pub get`
cp .env.example .env      # toda variável documentada lá
pnpm contracts:generate   # JSON Schema → tipos TS + Dart
pnpm db migrate           # exige a stack de pé
```

Variável de ambiente faltando **impede o processo de subir** — de propósito. Nunca há default
silencioso.

### Dia a dia

| Comando | Faz |
|---|---|
| `pnpm dev` | sobe a stack de desenvolvimento em **portas fixas** |
| `pnpm db reset` | derruba, recria, migra e popula — a sequência que ninguém lembra na ordem certa |
| `pnpm db seed` | só popula; rodar duas vezes não muda nada |
| `pnpm db purge` | apaga da trilha de auditoria o que passou da janela de retenção (`RC_AUDIT_RETENTION_DAYS`, mínimo 90 dias) e registra o que apagou. É o mesmo job que o backend roda sozinho, sob o mesmo lock; sai ≠ 0 e diz o que ficou quando algo foi recusado, e rodar de novo retoma de onde parou |
| `pnpm --filter backend verify` | os portões 1-7 só do backend — o ciclo curto enquanto se mexe nele |
| `pnpm --filter web verify` | os mesmos, só do web |
| `pnpm clean` | purga projetos e **volumes docker órfãos**, `dist/`, `coverage/`, relatórios |

`pnpm dev` deixa de pé:

```
PostgreSQL  localhost:5432        Backend  http://localhost:3000
Keycloak    http://localhost:8180 Web      http://localhost:5173
```

Um workspace que ainda não existe — o Flutter, hoje — faz o script dizer `not created yet` e
subir o resto, em vez de falhar num diretório ausente.

Porta ocupada não é caso raro: cada uma sai de uma variável (`RC_POSTGRES_PORT` e companhia),
e `pnpm doctor` avisa **antes** de você descobrir pelo erro do compose.

Ctrl+C encerra web → backend → `docker compose stop`. **Preserva os volumes**: o banco local
sobrevive ao Ctrl+C, porque perdê-lo a cada encerramento é atrito diário.

Sobre `pnpm clean`: volume órfão é **invisível ao `docker compose ls`** — quando uma execução
morre de forma abrupta, os containers somem e o volume nomeado sobrevive. Por isso o comando
existe.

### Validação — o que define "pronto"

```bash
pnpm verify        # portões 1-7   — ciclo rápido, durante a implementação
pnpm verify:full   # portões 1-11  — É ISTO que define pronto
```

| `verify` | `verify:full` acrescenta |
|---|---|
| 1 formatação · 2 lint · 3 tipagem | 8 integração |
| 4 arquitetura · 5 duplicação | 9 e2e |
| 6 unit · 7 cobertura | 10 segurança · 11 contrato e i18n |

Na ordem barato → caro, parando no primeiro vermelho.

**Portão vermelho → corrija e rode tudo de novo desde o primeiro.** Não retome do meio:
correção de lint quebra duplicação, correção de teste quebra arquitetura. É assim que
regressão passa. Protocolo completo em
[11-validation-protocol.md](docs/architecture/shared/11-validation-protocol.md).

Nunca desative regra, baixe limiar de cobertura ou marque teste como `skip` para o CI passar.
Isso não é entregar; é esconder.

### Testes

| Comando | Roda |
|---|---|
| `pnpm test:unit` | unit das três pontas **e dos scripts de `scripts/`** — rápido, sem I/O |
| `pnpm test:integration` | **exige Docker**: Postgres real via testcontainers, nunca SQLite, nunca mock; e o contrato de saída dos scripts de `scripts/` |
| `pnpm test:e2e` | sobe stack **efêmera em portas aleatórias**, roda Playwright, derruba tudo |
| `pnpm test:e2e:mobile` | a mesma stack, com o `integration_test` do Flutter — **exige emulador na imagem API 35** (`emulator -avd remote_claude_api35`), e não é portão |
| `pnpm test:e2e:mobile:push` | a mesma suíte do app com **push de verdade**: lê do `.env` só as três `RC_PUSH_*`, roda pelo `patrol` (`dart pub global activate patrol_cli 4.8.0`), responde o diálogo de notificação do SO, manda o app para o fundo e toca a notificação — sai da máquina, e não é portão |
| `pnpm test:e2e:live` | a mesma stack contra o **Claude de verdade** — exige o Claude logado, custa dinheiro, e não é portão |
| `pnpm test:coverage` | mínimo **90 % em statements, branches, functions e lines — por arquivo** |
| `cd mobile && flutter test` | unit e widget do app |
| `pnpm fixtures:record` | grava o stream do Agent SDK **real** como fixture — sob demanda, exige o Claude logado |

`pnpm test:e2e` sai com o **código dos testes**, não com 0 fixo — senão o CI fica verde com
teste vermelho. E pode rodar com o `pnpm dev` de pé, porque usa portas aleatórias e um projeto
compose próprio.

O e2e do **mobile** é o mesmo cenário no app real, e roda por `pnpm test:e2e:mobile`. Ele está
fora do `pnpm verify:full` e fora do CI de pull request de propósito: emulador mais build Gradle
custa minutos e gigabytes, e verificação cara demais para caber no ciclo é verificação que
alguém desliga. Está declarado em vez de escondido —
[por quê](docs/architecture/shared/06-testing-strategy.md#por-que-o-e2e-de-mobile-não-bloqueia).
Nenhum dos dois se auto-pula: sem navegador ou sem device, cada um **falha**.

A imagem é **fixada**: `scripts/mobile.mjs test:e2e` pergunta ao aparelho o API level antes de
compilar qualquer coisa, e recusa outro que não o 35 — API diferente muda permissão de notificação,
biometria e deep link, que é o que a suíte exercita, e o resultado deixaria de ser comparável entre
duas máquinas ([D-09](docs/plans/02-mobile-approval/decisions.md#d-09--o-emulador-reprodutível)).
O Gradle roda com teto de 3 GB de heap (`mobile/android/gradle.properties`), para caber ao lado do
emulador e da stack.

A AVD da suíte é **dedicada**, `remote_claude_api35`: imagem `android-35;google_apis_playstore;x86_64`
(o push de verdade precisa do Play Services) e partição de dados de 16 GB — com os 6 GB do perfil
padrão, os apps do Google da imagem enchem o disco e a instalação do APK de teste falha com
`INSTALL_FAILED_INSUFFICIENT_STORAGE`. Uma AVD de uso pessoal fica fora disso.

Dois comandos desta lista falam com o Claude de verdade, e nenhum dos dois é portão.

`pnpm test:e2e:live` roda `e2e/smoke-live/` contra o Claude desta máquina. Tudo em `e2e/specs/`
roda contra um **replay** de execução gravada, porque e2e tem que ser determinístico e o Claude
não é; esta é a exceção, e existe para pegar o que nada mais pega — **o SDK mudando o contrato
debaixo de nós**. Ela falha se qualquer `SDKMessage` cair no ramo "variante desconhecida" do
mapper, que é onde uma quebra de contrato vira aviso em vez de bug silencioso. Roda sob demanda
([D-12](docs/plans/01-live-session/decisions.md#d-12--onde-o-smoke-live-roda)).

`pnpm fixtures:record` é o outro. Ele roda o SDK contra um diretório descartável e salva o que voltou em
`backend/test/fakes/agent-sdk/fixtures/`, que é o que o fake replica nos testes. Existe porque um
fake escrito de memória prova que o fake funciona — ver
[D-04](docs/plans/01-live-session/decisions.md#d-04--o-fake-e-o-que-ele-pode-mentir). Regravar é
`pnpm fixtures:record` ou `pnpm fixtures:record <cenário>`, e o resultado entra no commit.

Na cobertura não há média que compense: um arquivo em 70 % não é salvo por outro em 99 %.

No Flutter a barra é sobre **linhas**, e só sobre linhas: o `lcov.info` que o
`package:coverage` escreve carrega `DA` e nada mais — não há `BRDA` nem `FN`, então `branches`
e `functions` não existem para medir nesta ponta. Está registrado no
[progresso do bootstrap](docs/plans/00-bootstrap/progress.md), não escondido.

### Qualidade, individualmente

| Comando | Verifica |
|---|---|
| `pnpm lint` | ESLint + `dart analyze` |
| `pnpm lint:arch` | Dependency Rule — import de `@nestjs/*` em `domain/` **quebra o build** |
| `pnpm lint:dup` | linhas repetidas (`jscpd`), teto de 3 % |
| `pnpm typecheck` | `tsc --noEmit` strict — sem `any`, sem `dynamic` |
| `pnpm format` / `format:check` | Prettier e `dart format` |
| `pnpm scan:secrets` | `gitleaks` sobre o repositório; `--staged` só sobre o que está no índice |
| `pnpm scan:security` | segredo, dependência vulnerável, padrão inseguro **e as regras do produto** |
| `pnpm i18n:check` | paridade de chaves `en` ↔ `pt-BR`, chave órfã, params que não sobrevivem à tradução |
| `node scripts/mobile.mjs <tarefa>` | os mesmos portões só do Flutter: `generate`, `format`, `format:check`, `analyze`, `arch`, `test:unit`, `test:widget`, `test:native`, `coverage`, `test:e2e` |

`pnpm scan:secrets` é o que o hook de pre-commit roda. Se o `gitleaks` não estiver instalado,
ele cai na imagem oficial via Docker — que já é pré-requisito do projeto. Não existindo nenhum
dos dois, **falha**: portão que se pula sozinho não é portão. O `scan:security` usa o mesmo
padrão para o `semgrep`.

As **regras do produto** do `scan:security` não existem em nenhum scanner genérico: `query()`
sem `settingSources: ['project']`, `query()` sem o hook `PreToolUse`,
`allowDangerouslySkipPermissions` diferente de `false` e `permissionMode: 'bypassPermissions'`.
Cada uma delas abre um furo **em silêncio** — sem erro, sem aviso — e por isso a regra existe
antes do código que ela protege.

O `scripts/mobile.mjs` existe porque o ferramental Dart não devolve código de saída honesto:
`import_lint` lista as violações e **sai 0 de qualquer jeito**, e `flutter test --coverage`
escreve um relatório que nada lê. Cada portão do Flutter passa por um invólucro que lê a saída
e sai com a verdade.

`mobile.mjs generate` é o outro motivo: o `build_runner` sem `--build-filter` percorre todos os
inputs do módulo e, numa máquina com qualquer outra coisa rodando, **não termina** — foi medido
travando por cinquenta minutos a poucos por cento de um núcleo. Filtrado nas pastas que de fato
têm anotação, termina em segundos. Quem adiciona um `@riverpod` numa pasta nova acrescenta uma
linha em `GENERATED_OUTPUTS`; os `.g.dart` são **commitados**, como o protocolo, então a geração
não faz parte do build e quem esquecer de rodá-la é pego pelo `pnpm verify` não compilando.

### Contratos e tradução

| Comando | Faz |
|---|---|
| `pnpm contracts:generate` | JSON Schema → tipos TS + código Dart |
| `pnpm contracts:check` | falha se o gerado estiver fora de sincronia |
| `pnpm i18n:check` | paridade `en` ↔ `pt-BR`, chave órfã, params que não casam |

`contracts:check` cobre **os dois alvos**. O Dart não é importado por ninguém em TypeScript,
então este portão é o único que o protege.

### Documentação e planos

| Comando | Faz |
|---|---|
| `pnpm docs:check` | link quebrado, âncora inexistente, documento fora do índice |
| `pnpm plan new <nome>` | cria pasta de plano no formato normativo, já indexada e no progresso geral |
| `pnpm plan progress` | recalcula os contadores do `progress.md` do plano **e** do progresso geral |

`docs:check` existe porque nenhum outro portão pega isso, e a documentação **é** a interface
do agente de IA com o projeto: um índice desatualizado a torna inútil em silêncio.

### Integração contínua

`.github/workflows/ci.yml` roda **os mesmos comandos** desta seção: `pnpm verify` em todo push,
`pnpm verify:full` em pull request e à noite. Portão que só existe no arquivo de workflow é
portão que ninguém consegue reproduzir quando fica vermelho.

`smoke-live` — contra o Claude real — **não roda em PR**: é lento, não é hermético, e um flake
ali ensina o time a ignorar build vermelho.

### Sobre adicionar comandos

Tarefa repetitiva vira script `.mjs` em `scripts/` — não sequência digitada à mão nem
orquestrada passo a passo por um agente. **Se você está rodando a mesma sequência pela segunda
vez, crie o script.**

Script novo entra nesta seção e no catálogo do plano **na mesma entrega**. Script que ninguém
encontra será reescrito por outra pessoa daqui a um mês.

---

## Princípios que o repositório impõe

Não como recomendação — como portão de CI:

- **Código em inglês, texto de usuário traduzido** (`en` / `pt-BR`).
- **Todo I/O logado em `debug`**, estruturado, com o mesmo schema nas três pontas.
- **Três níveis de teste sempre** — unit, integração e e2e —, com cobertura mínima de
  **90 % em todas as dimensões**.
- **Teste fora do código-fonte.**
- **Análise estática nos três módulos**, incluindo detecção de linhas repetidas.
- **Uma tarefa só está pronta com toda a validação verde.** Desativar regra para o CI passar
  é o oposto de pronto.

---

## Licença

Ainda não definida.
