# Motores de agente — núcleo neutro e extensões

O que é de um agente de código só, e onde isso mora. Vale para backend, web e app. A decisão é o
[ADR-025](00-decisions.md#adr-025--núcleo-neutro-de-agente-extensões-isoladas-por-motor-nas-três-pontas);
o porquê e a medição de 2026-10-10 estão na
[discovery 10](../../discovery/10-nucleo-canonico-e-agentes-isolados.md), e o
[plano 28](../../plans/28-agent-neutral-core/README.md) é quem leva o código até aqui.

Voltar para o [índice transversal](README.md).

> **Estado:** as regras deste documento valem desde a F0 do plano 28: o portão e o lint já reprovam.
> A forma-alvo (a porta de motor, o `kind`, as pastas `engines/`) chega fase a fase, e cada seção
> diz em que fase. O que ainda não chegou está no baseline do portão, com a fase que o remove.

---

## Os três anéis

```
             ┌──────────────── composição ────────────────┐
             │ registra as extensões habilitadas           │
             └──────┬──────────────────────────────┬───────┘
                    │ importa                      │ importa
                    ▼                              ▼
  ┌──────── núcleo (neutro) ────────┐   ┌──── engines/<motor>/ ────┐
  │ conversa, permissão, histórico, │◄──│ o que só esse motor tem:  │
  │ auditoria, arquivos, workbench  │   │ adapter, classificador,   │
  │ desenha pelo `kind`; registros  │   │ telas próprias, chaves    │
  │ onde a extensão se pendura      │   │ de i18n próprias          │
  └─────────────────────────────────┘   └───────────────────────────┘
        nunca importa engines/                nunca importa outra extensão
```

| Anel | Backend | Web | App |
|---|---|---|---|
| **Núcleo** | tudo fora de `*/engines/` | `features/`, `shared/`, `app/` | `core/`, `features/`, `app/` |
| **Extensão** | `domain/engines/<motor>/`, `application/engines/<motor>/`, `adapter/inbound/http/engines/<motor>/`, `adapter/outbound/engines/<motor>/` | `engines/<motor>/` | `engines/<motor>/` |
| **Composição** | `infrastructure/modules/engines/` | `app/engines.ts` | `app/engines.dart` |

O backend é organizado por camada, então a extensão é um **recorte por motor dentro de cada camada**, e
a Dependency Rule continua valendo dentro dela. O web e o app são organizados por feature, então a
extensão é uma pasta, que só importa o barril das features do núcleo.

**Hoje:** o `engines/` do app existe vazio, com o lint (F0). O adapter do Claude está em
`adapter/outbound/engines/claude/` desde a F1, com o classificador de ferramentas desde a F2, e o
`claude-config` se divide entre o núcleo e a extensão na F6 ([plano 28](../../plans/28-agent-neutral-core/README.md#fases)).

---

## O que é núcleo e o que é extensão

**É núcleo** o que faz sentido para qualquer motor: a conversa, a permissão, o histórico, a auditoria,
os arquivos, o workbench, os padrões da sessão (modelo, modo, esforço) e o MCP, que é um protocolo
aberto.

**É extensão** o que só um motor tem. No Claude:

- o adapter sobre o Agent SDK, com o classificador de ferramentas e o dialeto de regra;
- a conta, a instalação e o teste de modelo;
- plugins, skills, output styles e o `.claude/` do projeto.

O núcleo não fala o nome de nenhum motor. Onde um texto para a pessoa precisa dele, o nome entra como
o parâmetro `{agent}`, com o `displayName` que o `GET /engines` devolve
([02-i18n](02-i18n.md)). As chaves de i18n de uma extensão moram em `engines.<motor>.*`.

---

## Como criar uma extensão

Uma extensão **se pendura** nos registros do núcleo, e o núcleo nunca a conhece pelo nome:

| Ponta | Registro do núcleo | O que a extensão registra |
|---|---|---|
| Backend | `EngineRegistry` (F1) | o adapter da porta `AgentEnginePort`, o `RuleDialect`, os health checks |
| Web | seções de configuração, navegação global, comandos, views do workbench | as telas e os comandos que só o motor tem |
| App | — (nenhuma tela de motor hoje) | — |

A composição de cada ponta importa a extensão e a registra. Nenhum outro arquivo do núcleo a importa.

---

## O `kind` e as convenções canônicas

As convenções do [plano 27](../../plans/27-conversation-losses/README.md) valem para o contrato inteiro:

1. **`kind` aberto.** Toda ferramenta, interação e aviso tem um `kind` canônico (`file.edit`, `shell`,
   `question`, `plan`, `agent`, `other`…). O que o cliente não conhece é desenhado pela linha genérica.
2. **`origin { engine, native }` opaco.** O nome nativo viaja para diagnóstico e para o dialeto de
   regra, e nenhum cliente decide por ele.
3. **`messageKey` + `params` quando o texto é nosso, `text` quando é do agente.** O backend monta o
   rótulo da ferramenta, e o cliente só traduz.
4. **Todo `kind` serve a outro motor, ou é genérico**
   ([27 · D-10](../../plans/27-conversation-losses/decisions.md#f2--contrato)).
5. **O input cru é `rawInput`, opaco**: só para a entrada exata e a exportação.

O detalhe de cada evento está no [05-websocket-protocol](05-websocket-protocol.md), escrito pela fase que
o implementa.

---

## Capacidades

Capacidade é declarada, nunca suposta. O motor anuncia o que tem em `GET /engines` e em
`session.started.capabilities` (F1). O cliente esconde o que o motor da sessão não tem. Com o Claude
como motor único, nada some da tela.

Pedir uma capacidade que o motor não tem é `ENGINE_CAPABILITY_UNAVAILABLE` (409), nunca 500
([04-errors-and-http](04-errors-and-http.md)).

---

## O portão de neutralidade

`pnpm neutral:check` roda no **portão 11** e reprova o build. Ele lê três coisas:

- o código do núcleo nas três pontas: identificadores, literais e comentários;
- todos os schemas de `packages/contracts/schema/`;
- as chaves e os valores de i18n, fora dos namespaces `engines.*`.

Ele compara o que leu com o vocabulário de `scripts/engine-vocabulary.json`, que guarda o motivo de
cada termo e onde a coisa deveria morar. Há quatro modos de casar:

- `word` (o nome do motor, em qualquer caixa);
- `token` (a chave crua de input, o modo do CLI);
- `literal` (o nome nativo de uma ferramenta, como string inteira);
- `access` (no código, ler um campo do `rawInput` — `.x`, `?.x`, `['x']`: o input cru é opaco,
  [28 · D-33](../../plans/28-agent-neutral-core/decisions.md#f2--ferramentas-canônicas)).

**Fora da leitura:**

- `engines/` nas três pontas;
- o código gerado;
- os testes e as fixtures;
- os nomes do produto (`remote-claude`, `remote_claude`, `RemoteClaudeApp`), uma lista de exceções
  permanentes, cada uma com o motivo.

**A catraca.** `scripts/engine-neutrality-baseline.json` guarda as violações de 2026-10-10 por arquivo
e termo, com a contagem e a fase do plano 28 que remove cada uma. O portão reprova:

- violação fora do baseline, ou mais ocorrências do que ele guarda;
- entrada que ocorre menos do que diz, ou não ocorre mais: o baseline acompanha o código para baixo,
  com `node scripts/engine-neutrality.mjs --write-baseline`;
- entrada cuja fase está ✅ no `progress.md` do plano 28;
- entrada nova sem fase (o `--write-baseline` a grava com `?`, e só uma pessoa escreve a fase).

Ao fim do plano 28, o baseline está vazio, e o `--write-baseline` sai do script.

---

## O contrato de segurança

Todo adapter de motor cumpre o mesmo contrato de seis itens — gate bloqueante, auditoria antes da
ferramenta, sem autoaprovação do motor, escopo de pasta, credencial fora do backend e a configuração do
motor como arquivo sensível ([ADR-011](00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)).
A porta declara `security { configFiles, assert() }`, e o registro de motores confere o `assert()` na
subida: o motor que falha fica `unavailable` com o motivo, e os outros sobem
([28 · D-46](../../plans/28-agent-neutral-core/decisions.md#f5--permissão-pelo-dialeto)). Os `configFiles`
de todo motor registrado entram nos arquivos sensíveis do `files`. A regra de permissão é canônica, e o
`RuleDialect` de cada motor só traduz as regras gravadas na gramática dele.

---

## O lint dos três anéis

| Ponta | Regra | Proíbe |
|---|---|---|
| Backend (`dependency-cruiser`) | `engine-extension-is-isolated` | importar `*/engines/<motor>/` de fora dele, exceto a composição em `infrastructure/modules/engines/` |
| Backend | `engines-do-not-know-each-other` | `engines/<a>/` importar `engines/<b>/` |
| Backend | `adapters-do-not-know-each-other` | um adapter de saída importar arquivo de outro adapter de saída |
| Web (ESLint) | `core-cannot-import-engines` | `features/`, `shared/` e `app/` (menos `app/engines.ts`) importarem `engines/` |
| Web | `engines-are-isolated` | `engines/<a>/` importar `engines/<b>/`, ou um caminho profundo de `features/` |
| App (`import_lint`) | `core_cannot_import_engines`, `features_cannot_import_engines` | `core/` e `features/` importarem `engines/` |
| App | `engines_are_isolated` | `engines/<a>/` importar `engines/<b>/` |

O detalhe e os testes que provam cada regra estão no [09-code-quality](09-code-quality.md#regras-de-arquitetura-como-lint).

---

## O motor de teste

Só um motor que não é o Claude **prova** que o núcleo é neutro: a ausência de palavra prova pouco. O
motor de teste (F7) é um adapter falso, registrado só pela composição de teste, com outros nomes nativos
de ferramenta, menos capacidades e outro `displayName`. O e2e do web e do app abre uma sessão nele e
confere que a conversa é desenhada pelo `kind`, que os controles sem a capacidade somem e que nenhuma tela
diz "Claude" ([06-testing-strategy](06-testing-strategy.md)).
