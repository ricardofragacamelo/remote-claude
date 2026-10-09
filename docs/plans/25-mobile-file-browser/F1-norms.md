# F1 — Normas e a sessão encoberta

Plano: [25 — Navegador de arquivos no app](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-spike.md). As decisões da fase ([D-11, D-12, D-24](decisions.md#f1--normas-e-a-sessão-encoberta))
estão tomadas.
**Entrega:** as normas dizem o que o app lê, como abre link e como dá zoom; a feature `files` tem
lugar na estrutura e regra de importação; um teste reprova qualquer escrita nela; a `SessionPage`
deixa de se dizer "na tela" quando uma rota é empilhada por cima; e o backend só serve a pasta a um
aparelho aprovado.

Leia também, para a B-32: [backend/README](../../architecture/backend/README.md) e
[shared/08-authentication](../../architecture/shared/08-authentication.md).

Leia antes: [mobile/01](../../architecture/mobile/01-architecture.md),
[mobile/02](../../architecture/mobile/02-folder-structure.md),
[mobile/04](../../architecture/mobile/04-ui.md) e [shared/02-i18n](../../architecture/shared/02-i18n.md).

**Por quê a correção aqui:** a sessão encoberta ([D-11](decisions.md#f1--normas-e-a-sessão-encoberta))
já acontece hoje com o histórico, e o leitor herdaria o problema. Consertar antes do leitor existir
separa a correção da feature.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-05 — As normas ✅

- [mobile/04](../../architecture/mobile/04-ui.md): uma seção do **explorer somente leitura** — o painel
  à direita aberto pelo botão (nunca pelo deslizar), a navegação por nível, o leitor por tipo, a regra
  de link (relativo abre o leitor; `http`, `https` e `mailto` com confirmação que mostra o endereço; o
  resto não abre; imagem remota nunca é carregada; HTML como texto) e o modelo de zoom da
  [D-07](decisions.md#f3--leitor-de-texto-e-de-imagem). Em "O que o app não tem", o explorer sai da
  lista; o `@` arquivo no prompt fica, com o motivo trocado para "escopo decidido" (S-09).
- [mobile/02](../../architecture/mobile/02-folder-structure.md): `features/files/` e as portas
  `PdfEngine`, `DiagramEngine` e `FileSaver`.
- [backend/03](../../architecture/backend/03-modules.md): o app passa a ser cliente de `tree`,
  `content`, `raw` e `limits`.
- [Plano 07](../07-explorer-and-editor/README.md) e [plano 21](../21-rich-previews/README.md), "Não
  entra": uma nota apontando para este plano.
- Nenhuma mudança de contrato: os códigos de erro já estão no
  [catálogo](../../architecture/shared/04-errors-and-http.md).

### B-06 — Os textos ✅

As chaves novas do app em `app_en.arb` e `app_pt.arb`, com par no mapa compartilhado
(`scripts/i18n-shared.json`) onde o web já tem o mesmo texto, e os códigos `FILE_*`,
`WORKSPACE_NOT_ALLOWED` e `RANGE_NOT_SATISFIABLE` no `failure_messages.dart`. Como no
[24 · D-33](../24-structured-questions/decisions.md#f0--normas-e-contrato), chave sem uso é órfã e o
`i18n:check` a recusa: cada chave entra **com o código que a usa**, na fase dele. Esta task fecha com
a lista de chaves desenhada (no `progress.md`) e as de erro, que o `failure_messages.dart` já usa.

### B-07 — Somente leitura, por máquina ✅

- `analysis_options.yaml`: as regras de `import_lint` de `files` — `session` e `workspace` importam
  `features/files/files.dart`, nunca um caminho interno; `files` não importa `session` nem `workspace`.
  Provadas no `import_rules_test.dart` plantando a violação, como as outras (S-11).
- Um teste de arquitetura em `test/unit/architecture/` que lê `lib/features/files/` e reprova qualquer
  chamada de escrita do `ApiClient` (`post`, `put`, `patch`, `delete`) e qualquer menção a
  `/files/upload` (S-12, S-13). É o princípio 2 da discovery: o servidor não distingue leitura de
  escrita por cliente, então a garantia é a ausência do código.

### B-08 — A sessão encoberta ✅

Um `RouteObserver` no `router.dart`, e a `SessionPage` como `RouteAware`: `didPushNext` diz ao nativo
"nenhuma sessão na tela", `didPopNext` diz "esta sessão". O que já existe (o `initState`, o `dispose`
e o fundo) continua, e voltar do fundo com uma rota por cima não reclama a tela (S-15). Vale para o
histórico hoje e para o leitor depois. Testes de widget com o fake do canal de push.

### B-32 — Aparelho aprovado para ler a pasta ✅

A [D-12](decisions.md#f1--normas-e-a-sessão-encoberta) e a [D-24](decisions.md#f1--normas-e-a-sessão-encoberta),
no backend. É a única mudança fora do app, e o web não muda.

- `application/auth/ports/access-token-verifier.port.ts`: o `VerifiedAccessToken` ganha o cliente do
  token (o `azp`), lido pelo adaptador OIDC sem nome de provedor. Os fakes de token dos testes passam a
  emiti-lo, e o realm do e2e é conferido (o Keycloak emite `azp`).
- Um guard em todas as rotas de `files` (`files.controller.ts` e `file-transfer.controller.ts`): o token
  do cliente web (`OIDC_CLIENT_ID_WEB`) passa como hoje; qualquer outro exige o `x-install-id` de um
  aparelho **aprovado** daquele usuário, pela regra que o domínio já tem (`ResolveDeviceUseCase`,
  `Device`). Sem cabeçalho, desconhecido ou pendente → `403 DEVICE_NOT_REGISTERED`; revogado →
  `403 DEVICE_REVOKED`. A recusa é logada em `debug`, sem o token. A aprovação vale no pedido
  seguinte, sem reiniciar nada.
- As normas: [shared/08](../../architecture/shared/08-authentication.md) (o pendente assiste a sessão,
  não decide e **não lê a pasta**, e como o backend reconhece o app), o
  [catálogo de erros](../../architecture/shared/04-errors-and-http.md) (os dois códigos também em
  `/files/*`) e a tabela de rotas de `files` do [backend/03](../../architecture/backend/03-modules.md).
- Os três níveis no backend: unit do guard, integração com tokens do web, do app e sem `azp`, e o e2e do
  web segue verde sem mudança (S-148). O lado do app é a B-11 (S-152) e a B-30 (S-153).

---

## Cenários cobertos

S-08…S-17, S-143…S-151.

---

## Critério de conclusão

```bash
pnpm verify
```
