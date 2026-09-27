# F3 — Tela de saúde

Plano: [16 — Logs e diagnóstico](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-logs-screen.md) — o "ver nos logs" de cada item usa a tela de logs.
**Entrega:** `/diagnostics/health` — o estado da instalação agora, item por item, com o que cada um
significa, o que fazer quando falha e o caminho até o log; o ping de ponta a ponta, o estado deste
navegador e um relatório para anexar a um pedido de ajuda.

---

## Por quê

"Não consigo abrir sessão" tem uma dúzia de causas — banco fora, migration pendente, raiz que sumiu,
CLI sem login, limite de sessões — e hoje todas chegam ao usuário como a mesma recusa. A saúde
separa as causas **antes** de alguém ir ao terminal, e diz em palavras o que fazer.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-24 — O registro e o executor de checks 🔲

`application/diagnostics/run-health-checks.use-case`, conforme a
[D-16](decisions.md#d-16--cache-e-frequência):

- porta `HealthCheck` (`id`, `category`, `timeoutMs`, `run()` → resultado com `status`, `reason`,
  `params`, `details`) com **múltiplos provedores** — é por ela que os planos 07, 10 e 11 entram;
- todos em paralelo, cada um com prazo; o que estoura vira `timeout`, o que lança vira `fail` com
  `HEALTH_CHECK_CRASHED` e é logado — o relatório sai sempre (S-84, S-85);
- agregação pura no domínio (S-86); cache pelo prazo, e execução única — pedidos juntos esperam a
  mesma (S-87, S-89);
- os `details` passam pelo filtro de papel da [D-09](decisions.md#d-09--quem-vê-o-quê-na-saúde).

### B-25 — Os checks do núcleo 🔲

Um adapter por check em `adapter/outbound/health/`, cada um com o seu motivo e a sua explicação.
Não é o `doctor` ([D-13](decisions.md#d-13--rodar-o-doctor-no-servidor)): é o que a instalação
**ligada** precisa.

| Check | Mede | Motivos |
|---|---|---|
| Processo | versão do backend e do Node, tempo no ar, memória, atraso do event loop | — (`warn` acima do limiar) |
| Banco | alcançável (o `DatabaseProbe` que já existe) e migrations aplicadas contra o journal | `HEALTH_DATABASE_UNREACHABLE`, `HEALTH_MIGRATIONS_PENDING`, `HEALTH_MIGRATIONS_AHEAD` |
| Allowlist | arquivo legível e válido; cada raiz existe e é diretório | `HEALTH_ALLOWLIST_INVALID`, `HEALTH_ALLOWLIST_ROOT_MISSING` |
| Sessões | vivas contra o limite derivado da RAM ([plano 05](../05-hardening-operations/README.md) · D-01), memória por sessão | `HEALTH_SESSIONS_AT_LIMIT` |
| Push | credencial do provedor configurada; resultado da última entrega | `HEALTH_PUSH_UNCONFIGURED` |
| Identidade | discovery do provedor OIDC alcançável, idade do JWKS em cache — sem nomear o provedor | `HEALTH_IDENTITY_UNREACHABLE` |
| Gateway | conexões WS abertas, sessões anexadas | — |
| Buffer de logs | bytes usados, janela guardada, linhas perdidas, falhas do tee (S-24) | `HEALTH_LOG_BUFFER_EVICTING` |
| Disco | espaço livre no diretório do store de checkpoint ([ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)) | `HEALTH_DISK_LOW` |
| Trilha | última purga de retenção e se ela falhou | — (`warn` quando falhou) |

Cada check é lido pela porta do módulo dono — nenhum importa o interior de outro módulo
([backend/03](../../architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem)).
Integração com testcontainers para banco e migrations; unit com fakes para o resto.

### B-26 — Os checks do Claude e a sonda ativa 🔲

Conforme a [D-14](decisions.md#d-14--a-sonda-do-claude-o-que-ela-faz-e-quem-a-dispara) e a
[D-15](decisions.md#d-15--a-fronteira-com-os-planos-07-10-e-11):

- **passivos**, no relatório: versão do SDK; CLI encontrado e executável, com a versão
  (`HEALTH_CLAUDE_CLI_MISSING`); `CLAUDE_CONFIG_DIR` resolvido — o vazio é tratado como ausente, como
  o plano 04 corrigiu —; logado ou não (`HEALTH_CLAUDE_NOT_LOGGED_IN`), com cache por versão do CLI
  como o `supportedCommands()` do plano 04 · F3;
- **sonda ativa** (`POST /diagnostics/health/claude-probe`): um prompt mínimo de verdade, `query()`
  com `settingSources: ['project']` e o hook `PreToolUse` como toda outra
  ([ADR-011](../../architecture/shared/00-decisions.md#adr-011--settingsources-project-obrigatório-e-auditoria-ancorada-no-hook-pretooluse)),
  sem tool permitida; só operador (S-102), uma por vez (S-103), com ritmo, registrada em
  `diagnostics.claudeProbed` com resultado e duração (S-104);
- quando o [plano 11](../11-claude-settings/README.md) existir, o check de login usa o dele pelo
  registro, e a tela de configuração do Claude aponta para cá.

### B-27 — Recursos abertos dos outros planos 🔲

Porta `ResourceGauge` (`id`, `count`, `limit`, `messageKey`) com múltiplos provedores: o
[plano 07](../07-explorer-and-editor/README.md) registra os watchers de pasta abertos e o
[plano 10](../10-integrated-terminal/README.md) os terminais abertos, cada um com contagem e teto.
Plano ausente, item ausente (S-105) — este plano não depende de nenhum deles.

### B-28 — As rotas da saúde, e o `GET /health` intacto 🔲

Controller com as rotas da B-05: `GET /diagnostics/health` (`200` com o relatório, inclusive com
itens em `fail`; `401` sem credencial — S-107), `POST …/run` (`429` com ritmo — S-88),
`POST …/claude-probe`. `details` filtrado por papel na resposta (S-108).

O `GET /health` público continua exatamente como está — `{ status, database }`, `503` com
`Retry-After` —, e um teste garante que nada do relatório detalhado passe a sair por ele (S-106).

### B-29 — A tela de saúde 🔲

`/diagnostics/health`, na moldura do plano 06:

- **resumo** no topo — "tudo certo" ou "N problemas", com a hora da verificação e "verificar de
  novo" —, e os itens por categoria (Servidor, Banco, Claude, Acesso, Celular, Recursos), os com
  problema primeiro (S-110);
- cada item: chip de estado, uma frase do que ele mede, e em `warn`/`fail` **a explicação e "o que
  fazer"** traduzidas, com o comando ou a tela certa quando houver (S-109); detalhes recolhíveis;
  "verificar só este"; para o operador, "ver nos logs" com o `traceId` da execução;
- **backend inalcançável**: a tela diz, do lado do cliente, "o backend não responde", mostra a última
  verificação boa e tenta de novo com recuo (S-111);
- **ida e volta**: o `diag.ping` que o plano 06 trouxe da home vira um item — tempo medido, histórico
  das últimas, botão desabilitado com explicação quando o socket caiu (S-112);
- **Este navegador**: versão do web e do backend, protocolo, conectado desde, reconexões, último
  `gap`, limites anunciados no `connection.ready`, diferença de relógio com o servidor, idioma (S-113);
- **sonda do Claude** para o operador, com o aviso de custo antes do clique;
- atualização automática a cada 60 s só com a tela visível (S-114).

### B-30 — O relatório de diagnóstico 🔲

"Copiar relatório" (markdown) e "baixar" (JSON): versões, estado de cada item com o motivo, as
capacidades, e — só no relatório do operador — as últimas linhas `warn+` do backend; tudo pela mesma
redação da consulta, sem caminho de raiz alheia, e sem linha de log para quem não é operador (S-115). É o que se anexa a um pedido de
ajuda, no lugar de uma captura de tela.

### B-31 — Usabilidade e ajuda da tela de saúde 🔲

- **ajuda** na gaveta da moldura, em `en` e `pt-BR`: o que é a tela; **cada item** — o que mede, por
  que importa, o que cada estado significa e o que fazer quando falha —; a diferença entre esta tela
  e o `GET /health` público; que a sonda do Claude consome o plano; que o ambiente de
  desenvolvimento se verifica com `pnpm doctor`; o que não é mostrado a quem não é operador;
- tooltip em todo ícone; atalhos para "verificar de novo" e para abrir a ajuda, na palette;
- estado de carregamento que mantém a grade; axe sem violação nos dois temas; zero literal
  apresentável (S-81, S-116).

---

## Cenários cobertos

S-84…S-116.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
