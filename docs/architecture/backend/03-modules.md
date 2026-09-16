# Módulos de domínio

Um módulo = um domínio. Ele **não** é uma pasta única: é uma fatia vertical que atravessa as
quatro camadas — `domain/<x>/`, `application/<x>/`, `adapter/*/<x>/`,
`infrastructure/modules/<x>.module.ts`. Ver
[02-folder-structure.md](02-folder-structure.md).

Voltar para o [índice do backend](README.md).

---

## O catálogo

| Módulo | Responsabilidade | Não é responsável por |
|---|---|---|
| `auth` | Identidade: validação de token OIDC, usuário local, device | Emitir credencial (quem emite é o provedor) · autorizar tool (é `permission`) |
| `workspace` | Diretórios: allowlist, validação, listagem, metadados de git | Rodar nada dentro deles |
| `session` | Ciclo de vida da sessão do Claude: start, prompt, interrupt, close, streaming | Persistir transcript histórico |
| `permission` | Requests de permissão, regras persistidas, resolução, timeout | Executar a tool · registrar a trilha (é `audit`) |
| `transcript` | Histórico: listar sessões, carregar mensagens, retomar | Sessão viva |
| `notification` | Push para device quando ninguém está online | Decidir se algo merece notificação (quem decide é `permission`) |
| `audit` | Trilha imutável de **toda** invocação de tool, via hook `PreToolUse` | Autorizar |

### Por que `permission` é módulo separado de `session`

Tentador juntar — a permissão nasce dentro de uma sessão. Mas:

- O ciclo de vida é diferente: uma **regra** de permissão sobrevive à sessão, e vale para
  todas as sessões futuras daquele projeto.
- A resolução vem de **outro canal** (push no celular), não do canal da sessão.
- É a fronteira de segurança do sistema. Fronteira de segurança misturada com orquestração
  é onde bug de segurança nasce.

### Por que `audit` é separado

Auditoria precisa ser **append-only e independente**. Se morasse dentro de `session`, um bug
na sessão poderia impedir o registro do que foi autorizado. Dado que o sistema executa
comando arbitrário na máquina do usuário, a trilha precisa sobreviver à falha do resto.

---

## Fronteiras — quem pode falar com quem

```
   auth ◄──────────── (todos consultam identidade)
     │
     ▼
 workspace ◄──── session ────► permission ────► notification
                    │              │
                    ▼              ▼
                transcript       audit ◄──── (todos escrevem)
```

Regras:

1. **Comunicação entre módulos é por porta**, declarada em `application/<consumidor>/ports/`,
   implementada por um adapter que chama o módulo dono.
2. **Nunca importe o interior de outro módulo.** Só o barril: `@domain/x` ou `@application/x`.
3. **Sem ciclo.** Se A precisa de B e B precisa de A, ou falta um módulo, ou são um só.
4. `audit` é **write-only** para os outros: todo mundo escreve, ninguém lê de dentro do fluxo.

### Comunicação assíncrona

Quando A precisa reagir a um fato de B sem acoplar, use evento de domínio interno
(`EventEmitter2` do Nest), não chamada direta:

```
permission.resolved  ──► audit grava
                     ──► notification cancela push pendente
                     ──► session destrava o loop do Agent SDK
```

Evento de domínio é `<módulo>.<fato no passado>`, igual ao evento WS. Ver
[nomenclatura](../shared/01-language-and-naming.md).

---

## Detalhe de cada módulo

### `auth`

O backend é **Resource Server** OIDC: valida token, nunca emite. Não existe senha aqui.

- **Entidades:** `User` (ancorado no `sub` do provedor), `Device`
- **Regras:**
  - identidade local é provisionada just-in-time no primeiro login, a partir das claims
  - **`sub` é a chave**, nunca o e-mail — e-mail muda e pode ser reusado
  - `email_verified: false` não entra
  - device precisa de **aprovação explícita** antes do primeiro uso; token prova *quem*,
    registro de device prova *de onde*
  - revogar device fecha as connections WS dele **na hora** e invalida seus refresh tokens
  - autorização é **nossa**, local — não usamos role vinda do provedor
- **Erros:** `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `DEVICE_NOT_REGISTERED`, `DEVICE_REVOKED`,
  `INSUFFICIENT_SCOPE`
- **Nota:** `Device.locale` é o que decide o idioma do push. Ver [i18n](../shared/02-i18n.md).
- **O adapter do provedor** (discovery, cache de JWKS, validação) mora em
  `adapter/outbound/identity/`. É o único lugar do backend que conhece OIDC — e nem ele
  conhece "Auth0". Ver [autenticação](../shared/08-authentication.md).

### `workspace`

- **Entidades:** `Workspace`, `WorkspacePath` (VO)
- **Regras:** **allowlist de raízes permitidas** — o caminho é normalizado e precisa estar
  dentro de uma raiz configurada. Bloqueia `..`, symlink que escapa, e caminho relativo.
- **Erros:** `WORKSPACE_NOT_ALLOWED`, `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`
- **Nota:** esta é a primeira linha de defesa do sistema. A regra é pura, sem I/O, e tem
  cobertura mínima de 90 %. Ver [01-clean-architecture.md](01-clean-architecture.md).

### `session`

- **Entidades:** `Session`, `Turn`
- **Estados:** `starting → idle → thinking → running → waitingPermission → idle → closed`
- **Regras:** limite de sessões simultâneas derivado da RAM (**~222 MB por sessão**, medido);
  `close()` sempre executa, mesmo em erro — subprocesso vazado é vazamento de recurso real
- **Prompt concorrente — enfileira**
  ([R-02, decidido](../../plans/00-bootstrap/progress.md#decisões-tomadas-durante-a-execução)):
  um prompt que chega durante um turno entra na fila e roda em seguida, como turno próprio. É o
  que o SDK já faz nativamente, medido em spike, e é o comportamento da UI do Claude Code —
  rejeitar com `409` era política nossa, e era a errada. Ver
  [descoberta §8.6](../../discovery/01-descoberta-claude-agent-sdk.md#86--segundo-prompt-durante-um-turno-é-enfileirado-pelo-sdk)
- **Erros:** `SESSION_NOT_FOUND`, `SESSION_LOCKED`,
  `SESSION_LIMIT_REACHED`, `CLAUDE_UNAVAILABLE`, `CLAUDE_TIMEOUT`
- Ver [04-claude-integration.md](04-claude-integration.md).

### `permission`

- **Entidades:** `PermissionRequest`, `PermissionRule`
- **Regras:**
  - `requestId` é a chave de idempotência — o SDK reentrega após gap de transporte
  - primeira resolução vence; as seguintes são no-op com `ack`
  - timeout (default 120 s) **nega**; silêncio nunca autoriza
  - `deny` exige `reason`
  - regra persistida (`scope: session|project|always`) auto-resolve requests futuros **antes**
    de notificar alguém
- **Erros:** `PERMISSION_REQUEST_NOT_FOUND`, `PERMISSION_REQUEST_EXPIRED`, `PERMISSION_NOT_OWNED`
- Ver [contrato WS](../shared/05-websocket-protocol.md#o-fluxo-de-permissão).

### `transcript`

- **Regras:** o transcript vive no JSONL do Claude (`~/.claude/projects/`), **não** no
  Postgres. O backend lê via funções do SDK (`listSessions`, `getSessionMessages`) — não
  faça parser do JSONL na mão; o formato é interno do Claude Code.
- **Consequência importante:** as sessões criadas no VSCode aparecem aqui. É feature, e
  precisa ser tratada como tal na UI (mostrar a origem).

### `notification`

- **Regras:** só notifica quando **nenhuma** connection do usuário está observando a sessão;
  push de permissão traz `expiresAt` e é cancelado quando a permissão resolve; payload já
  vai **traduzido**, no `Device.locale` — é a única exceção da regra de i18n
- **Nunca** coloque conteúdo de arquivo ou output de comando no push.

### `audit`

- **Fonte dos eventos:** o hook **`PreToolUse`**, não o `canUseTool`. O hook dispara para
  **toda** invocação de tool; o `canUseTool` só para o que exige humano. Medido em spike: 6
  tool calls → 6 hooks → 2 `canUseTool`. Ancorar aqui é o que impede a trilha de perder toda
  leitura de arquivo. Ver [ADR-011](../shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse).
- **Regras:** append-only, sem update, sem delete; registra `who`, `what`, `when`, `where`
  (device/IP), `input` exato da tool e a `decision`; falha de escrita de auditoria é `error`
  e **bloqueia** a autorização — sem trilha, não autoriza
- Retenção mínima: 90 dias.

---

## Criando um módulo novo

1. Ele tem **linguagem própria** e invariantes próprias? Se não, é submódulo de um existente.
2. Crie a fatia nas quatro camadas, mesmo que `domain/<x>/` comece pequeno.
3. Declare os barris `domain/<x>/index.ts` e `application/<x>/index.ts` com a superfície mínima.
4. Registre aqui, no catálogo e no diagrama de fronteiras.
5. Cadastre os erros no [catálogo de erros](../shared/04-errors-and-http.md).
6. Confira que não criou ciclo — `pnpm lint` reprova.

Módulo que nasce só com pasta em `adapter/` e nada em `domain/` provavelmente não é módulo:
é um adapter de um módulo existente.
