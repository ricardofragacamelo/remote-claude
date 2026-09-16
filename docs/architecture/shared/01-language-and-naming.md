# Idioma e nomenclatura

Regra de ouro: **o computador lê inglês, o humano lê o idioma dele.**

Voltar para o [índice transversal](README.md).

---

## O que é obrigatoriamente em inglês

Tudo que é artefato técnico, sem exceção:

| Artefato | Exemplo correto | Errado |
|---|---|---|
| Classe, interface, tipo | `SessionRepository`, `PermissionRequest` | `RepositorioSessao` |
| Função, método, variável | `resolvePermission()`, `activeSessions` | `resolverPermissao` |
| Arquivo e pasta | `session-lifecycle.use-case.ts` | `ciclo-vida-sessao.ts` |
| Tabela e coluna | `permission_rules`, `created_at` | `regras_permissao` |
| Chave de i18n | `session.error.workspaceNotFound` | `sessao.erro.workspaceNaoEncontrado` |
| Evento / comando WS | `session.tool.started` | `sessao.ferramenta.iniciada` |
| Mensagem de log | `"claude session started"` | `"sessão do claude iniciada"` |
| Código de erro | `WORKSPACE_NOT_ALLOWED` | `WORKSPACE_NAO_PERMITIDO` |
| Commit e branch | `feat(session): add interrupt command` | `feat(sessao): adiciona comando interromper` |
| Comentário no código | `// the SDK blocks until this resolves` | `// o SDK bloqueia até isso resolver` |

**Mensagem de log nunca é traduzida.** Log é para operador e para máquina, não para usuário
final. Ver [03-logging.md](03-logging.md).

## O que é traduzido

Apenas o que um usuário final lê na tela: labels, títulos, textos de botão, mensagens de erro
apresentadas, textos de notificação push, textos de acessibilidade. Nunca hardcoded — sempre
via chave. Ver [02-i18n.md](02-i18n.md).

## O que fica em português

Apenas esta documentação em `docs/`, e a comunicação humana (PR description, issue). O
`AGENTS.md` também.

---

## Convenções de nome por ponta

### Backend (TypeScript / NestJS)

| Elemento | Convenção | Exemplo |
|---|---|---|
| Arquivo | `kebab-case` + sufixo de papel | `start-session.use-case.ts` |
| Classe | `PascalCase` | `StartSessionUseCase` |
| Interface de porta | `PascalCase`, **sem** prefixo `I` | `SessionRepository` |
| Implementação de porta | prefixo da tecnologia | `DrizzleSessionRepository` |
| Token de DI | `SCREAMING_SNAKE_CASE` | `SESSION_REPOSITORY` |
| Entidade de domínio | substantivo puro | `Session`, `PermissionRequest` |
| Use case | verbo + substantivo + `UseCase` | `ResolvePermissionUseCase` |
| Erro de domínio | substantivo + `Error` | `WorkspaceNotAllowedError` |
| Tabela | `snake_case`, plural | `permission_rules` |

Sufixos de arquivo reconhecidos: `.entity.ts`, `.value-object.ts`, `.error.ts`, `.port.ts`,
`.use-case.ts`, `.dto.ts`, `.controller.ts`, `.gateway.ts`, `.repository.ts`, `.mapper.ts`,
`.module.ts`.

### Web (React / TypeScript)

| Elemento | Convenção | Exemplo |
|---|---|---|
| Arquivo de componente | `PascalCase.tsx` | `SessionTranscript.tsx` |
| Arquivo de hook | `camelCase.ts`, prefixo `use` | `useSessionStream.ts` |
| Arquivo de service | `kebab-case.service.ts` | `session.service.ts` |
| Componente | `PascalCase` | `PermissionPrompt` |
| Hook | `use` + substantivo | `usePermissionQueue` |
| Função de service | verbo + substantivo | `fetchWorkspaces` |

### Mobile (Flutter / Dart)

Siga o [Effective Dart](https://dart.dev/effective-dart/style) — é a convenção da linguagem:

| Elemento | Convenção | Exemplo |
|---|---|---|
| Arquivo | `snake_case.dart` | `session_transcript_page.dart` |
| Classe, enum, typedef | `UpperCamelCase` | `PermissionRequest` |
| Variável, função, parâmetro | `lowerCamelCase` | `activeSessionId` |
| Constante | `lowerCamelCase` (não `SCREAMING`) | `defaultTimeout` |
| Privado | prefixo `_` | `_buildHeader()` |
| Provider (Riverpod) | substantivo + `Provider` | `sessionStreamProvider` |

---

## Nomes de eventos e códigos de erro

**Evento WS:** `<domínio>.<entidade>.<fato no passado>`, tudo minúsculo, separado por ponto.
Fato consumado, nunca imperativo.

```
session.started          ✅
session.tool.started     ✅
permission.requested     ✅
startSession             ❌ (isso é comando, não evento)
session.start            ❌ (imperativo)
```

**Comando WS:** `<domínio>.<verbo no imperativo>`.

```
session.start            ✅
session.interrupt        ✅
permission.resolve       ✅
```

**Código de erro:** `SCREAMING_SNAKE_CASE`, específico o bastante para ser acionável.

```
WORKSPACE_NOT_ALLOWED       ✅
SESSION_LIMIT_REACHED       ✅
PERMISSION_REQUEST_EXPIRED  ✅
INVALID_INPUT               ⚠️  só quando realmente genérico
ERROR                       ❌
```

---

## Glossário do domínio

Use **estes** termos. Sinônimo inventado vira ambiguidade em três linguagens.

| Termo | Significa | Não confundir com |
|---|---|---|
| **Workspace** | Diretório raiz que uma sessão enxerga (`cwd` do Agent SDK) | "projeto", "pasta" |
| **Session** | Uma conversa com o Claude, ancorada em um workspace | "chat", "conexão" |
| **Turn** | Um ciclo prompt → resposta completa dentro de uma sessão | "mensagem" |
| **Connection** | Um socket de um cliente. N connections podem observar 1 session | "session" |
| **Permission request** | Pergunta do Claude ("posso usar esta tool?") aguardando humano | "notificação" |
| **Permission rule** | Regra persistida que auto-resolve requests futuros | "permission request" |
| **Transcript** | Histórico persistido de uma sessão (JSONL do Claude) | "log" |
| **Sessão externa** | Sessão que **não** foi criada por nós — VSCode ou terminal. É o rótulo da UI, e sai do nosso banco: o SDK não informa procedência | "sessão do VSCode" (pode ter vindo do terminal) |
| **Checkpoint** | Snapshot **nosso** dos arquivos de um turno, chaveado por `prompt_id`, que o desfazer restaura | o store do CLI em `~/.claude/file-history/`, que é o `/rewind` do usuário |
| **Tool** | Capacidade do Claude (Bash, Edit, Read…) | "comando", "função" |
| **Device** | Instalação do app mobile registrada para push | "user", "connection" |
