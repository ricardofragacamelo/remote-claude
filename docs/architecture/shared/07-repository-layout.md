# Layout do repositório

Voltar para o [índice transversal](README.md).

---

## Árvore da raiz

```
remote-claude/
├── AGENTS.md                   ← ponto de entrada do agente de IA
├── README.md                  ← para humanos: o que é, como rodar
├── pnpm-workspace.yaml
├── package.json               ← só scripts de orquestração; sem dependência de runtime
├── tsconfig.base.json         ← config de TS herdada pelos workspaces
├── docker-compose.yml         ← Postgres 18 para desenvolvimento
│
├── docs/
│   ├── discovery/             ← levantamentos técnicos (insumo, não norma)
│   └── architecture/          ← normativo. Ver o índice geral
│
├── packages/
│   └── contracts/             ← protocolo WS + tipos de API. FONTE DA VERDADE
│       ├── schema/            ← JSON Schema (o contrato de fato)
│       ├── src/               ← tipos TS gerados + guards
│       └── scripts/           ← geração do Dart para o mobile
│
├── backend/                   ← NestJS + Clean Architecture
│   ├── src/
│   └── test/{unit,integration}/
│
├── web/                       ← React + shadcn/ui + Tailwind
│   ├── src/
│   └── test/{unit,integration}/
│
├── mobile/                    ← Flutter (FORA do workspace pnpm)
│   ├── lib/
│   ├── test/{unit,widget}/
│   └── integration_test/
│
└── e2e/                       ← end-to-end (Playwright)
    ├── scenarios/             ← cenários compartilhados web ↔ mobile
    ├── specs/
    ├── fixtures/
    └── smoke-live/            ← contra o Claude real; não roda em PR
```

---

## Workspaces

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'backend'
  - 'web'
  - 'e2e'
```

O `mobile/` **não** entra — Dart não participa de workspace Node. Ver
[ADR-007](00-decisions.md#adr-007--pnpm-workspaces-com-o-flutter-fora).

### `packages/contracts/` — por que existe

É o único lugar onde o protocolo WebSocket é definido. Backend e web **importam**; o
mobile **gera** Dart a partir do mesmo JSON Schema.

```
                 packages/contracts/schema/*.json
                    │                │
       gera TS ─────┘                └───── gera Dart
          │                                    │
   backend/ + web/                          mobile/
```

Sem isso, o contrato existiria em três versões que divergem em silêncio até quebrar em
produção. O CI valida que o Dart gerado está em dia com o schema.

**Nunca** declare um tipo do protocolo fora de `packages/contracts/`. Se precisou, o lugar
certo é aqui.

---

## Regras de dependência entre pastas

| De | Pode importar | Nunca importa |
|---|---|---|
| `packages/contracts` | nada do repositório | `backend`, `web`, `mobile` |
| `backend` | `packages/contracts` | `web`, `mobile`, `e2e` |
| `web` | `packages/contracts` | `backend`, `mobile`, `e2e` |
| `mobile` | Dart gerado de `contracts` | qualquer coisa em TS |
| `e2e` | `packages/contracts` | `src/` interno de `backend` ou `web` |

`e2e` fala com o sistema **pela porta do usuário** — HTTP, WebSocket, UI. Importar o
interior de um workspace para "facilitar" transforma e2e em teste de integração disfarçado.

---

## Scripts na raiz

Orquestram; não contêm lógica. Cada workspace tem os seus equivalentes.

São **`.mjs`, tipados por JSDoc com `checkJs`** — nunca `.ts`. Script que precisa de um passo de
build quebra exatamente quando mais se precisa dele: quando o build está quebrado. A tipagem
continua sendo verificada pelo `typecheck`, sem transpilação no caminho.

| Script | Faz |
|---|---|
| `pnpm dev` | sobe Postgres, backend e web em watch |
| `pnpm build` | build de todos os workspaces, em ordem de dependência |
| `pnpm lint` / `pnpm typecheck` | em todos |
| `pnpm test:unit` | unit das três pontas |
| `pnpm test:integration` | integração (exige Docker) |
| `pnpm test:e2e` | e2e web + API |
| `pnpm contracts:generate` | regenera tipos TS **e** Dart a partir do schema |
| `pnpm contracts:check` | falha se o gerado está fora de sincronia — roda no CI |
| `pnpm i18n:check` | paridade de chaves entre `en` e `pt-BR` |

---

## Configuração e segredo

- Config por **variável de ambiente**, validada no boot com schema. Variável ausente ou
  inválida **impede o processo de subir** — nunca caia em default silencioso.
- **Exceção: a allowlist de raízes de workspace mora em arquivo de configuração**, não em
  variável. Ela é a primeira linha de defesa do produto e cresce com comentário e com o dono de
  cada raiz — ver [workspace](../backend/03-modules.md#workspace). Vale o mesmo regime: arquivo
  ausente, ilegível ou fora do schema derruba o boot, e a **recarga é explícita**, nunca um watch
  silencioso.
- `.env.example` versionado, com **toda** variável e um comentário do que faz.
- `.env` real **nunca** versionado.
- O backend **não** precisa de credencial do Claude: herda o login do usuário em
  `~/.claude/.credentials.json`. Não crie variável para isso. Ver
  [descoberta §2](../../discovery/01-descoberta-claude-agent-sdk.md).

### Configuração que carrega decisão de segurança falha fechada

Algumas variáveis não são preferência: elas movem a fronteira de segurança do produto. Essas têm
**piso ou teto no código**, e valor fora dele **derruba o boot** — não é aviso, não é ajuste
silencioso para o limite.

| Configuração | Restrição | Por quê |
|---|---|---|
| Validade da regra de permissão — default e **teto** | teto obrigatório; pedido acima é recusado com `PERMISSION_RULE_EXPIRY_TOO_LONG` | regra sem validade sobrevive à razão que a criou; teto é o que força a revisão periódica |
| Janela de retenção da trilha | **≥ 90 dias**, o piso que a trigger da tabela também aplica | ver [a trilha](../backend/05-persistence.md#a-trilha-de-auditoria) — piso que se pode baixar por variável de ambiente não é piso |
| Intervalo do job de purga, e o seu desligamento | desligar é explícito, e o boot loga em `warn` | promessa de retenção não pode morrer em silêncio |

---

## Onde colocar o quê — perguntas frequentes

| Vou criar… | Vai em |
|---|---|
| Um tipo do protocolo WS | `packages/contracts/schema/` |
| Um erro de domínio novo | `backend/src/domain/<domínio>/errors/` **e** no catálogo em [04](04-errors-and-http.md) |
| Um utilitário usado por back e web | `packages/contracts/` só se for contrato; caso contrário **duplique** |
| Um componente de UI reutilizável | `web/src/shared/components/` |
| Uma migration | `backend/src/infrastructure/database/migrations/` |
| Um cenário e2e | `e2e/scenarios/` (o spec em `e2e/specs/`) |
| Um documento de arquitetura | `docs/architecture/<área>/` **e** no índice daquela área |

Sobre duplicar utilitário: um pacote `shared/` genérico entre back e front vira depósito, e
acopla duas coisas que deveriam evoluir separado. `contracts/` existe porque contrato
**precisa** ser único. Helper de string, não.
