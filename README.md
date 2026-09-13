# remote-claude

Opere o **Claude Code instalado na sua máquina** a partir do navegador ou do celular.

Um backend Node conversa com o Claude local via Claude Agent SDK, recebe o stream de eventos
e o distribui para dois canais — um front web e um app Flutter — que acompanham a sessão,
enviam prompts e, principalmente, **aprovam as permissões de tool à distância**.

> **Status:** arquitetura definida; bootstrap em andamento — a
> [F0](docs/plans/00-bootstrap/F0-foundation.md) (workspace, portões de qualidade, hooks e
> scripts de apoio) está de pé. Ainda não há código de produto.

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
| Docker | rodando — testcontainers e docker compose não têm alternativa |
| Flutter | estável, só para o app mobile |

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
| `pnpm db seed` | só popula |
| `pnpm clean` | purga projetos e **volumes docker órfãos**, `dist/`, `coverage/`, relatórios |

`pnpm dev` deixa de pé:

```
PostgreSQL  localhost:5432        Backend  http://localhost:3000
Keycloak    http://localhost:8180 Web      http://localhost:5173
```

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
| `pnpm test:coverage` | mínimo **90 % em statements, branches, functions e lines — por arquivo** |
| `cd mobile && flutter test` | unit e widget do app |
| `cd mobile && flutter test integration_test` | e2e do app, exige emulador |

`pnpm test:e2e` sai com o **código dos testes**, não com 0 fixo — senão o CI fica verde com
teste vermelho. E pode rodar com o `pnpm dev` de pé, porque usa portas aleatórias e um projeto
compose próprio.

Na cobertura não há média que compense: um arquivo em 70 % não é salvo por outro em 99 %.

### Qualidade, individualmente

| Comando | Verifica |
|---|---|
| `pnpm lint` | ESLint + `dart analyze` |
| `pnpm lint:arch` | Dependency Rule — import de `@nestjs/*` em `domain/` **quebra o build** |
| `pnpm lint:dup` | linhas repetidas (`jscpd`), teto de 3 % |
| `pnpm typecheck` | `tsc --noEmit` strict — sem `any`, sem `dynamic` |
| `pnpm format` / `format:check` | Prettier e `dart format` |
| `pnpm scan:secrets` | `gitleaks` sobre o repositório; `--staged` só sobre o que está no índice |
| `pnpm scan:security` | `gitleaks`, `semgrep`, scanner de dependência |

`pnpm scan:secrets` é o que o hook de pre-commit roda. Se o `gitleaks` não estiver instalado,
ele cai na imagem oficial via Docker — que já é pré-requisito do projeto. Não existindo nenhum
dos dois, **falha**: portão que se pula sozinho não é portão.

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
| `pnpm plan new <nome>` | cria pasta de plano no formato normativo |
| `pnpm plan progress` | recalcula os contadores do `progress.md` |

`docs:check` existe porque nenhum outro portão pega isso, e a documentação **é** a interface
do agente de IA com o projeto: um índice desatualizado a torna inútil em silêncio.

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
