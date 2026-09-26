# F4 — E2E

Plano: [02 — Aprovação pelo celular](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-mobile-permission.md).
**Entrega:** os cenários obrigatórios que **só existem com duas pontas** — e que, por isso,
ficaram de fora do plano 01.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-26 — Cenários compartilhados ✅

Os fluxos novos entram em `e2e/scenarios/`, lidos pelo Playwright e pelo `integration_test` via
`--dart-define`. Num device não existe repositório para ler
([06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário)).

**Feito em 2026-09-24.** Sete arquivos `e2e/scenarios/mobile-*.json`, lidos pelo Playwright e pelo
app. O `scripts/mobile.mjs` compila no app **todos** os cenários que ele roda num `RC_SCENARIO` só,
por nome de arquivo; o id leva o plano (`02·S-51`) porque os números colidem entre planos.

### B-27 — Os cenários obrigatórios 3, 4 e 10 ✅

Permissão pelo mobile com o web só observando; corrida entre as duas pontas; e multi-cliente
vendo o mesmo stream na mesma ordem
([lista obrigatória](../../architecture/shared/06-testing-strategy.md#cenários-e2e-obrigatórios)).

O lado web desses cenários roda em **todo PR**, contra o mesmo backend. É ele que compensa o
e2e do app não ser portão.

**Feito em 2026-09-24.** `e2e/specs/mobile-approval.spec.ts`: o celular é o **contrato** — um socket
que se autentica com o `installId`, sobre um device registrado e aprovado pela API HTTP. Cobre
02·S-51, S-52 e S-53, e o lado de protocolo de S-55 (resposta recusada com `DEVICE_NOT_REGISTERED`)
e S-56 (revogar fecha o socket aberto com `4401`). Roda em todo `pnpm test:e2e`. Cada teste encerra
a sessão que abre: o backend segura dez.

### B-28 — `integration_test` do app ✅

Registro pendente com controles desabilitados, aprovação de permissão, abertura por deep link e
revogação com o app aberto.

**Feito em 2026-09-24.** `mobile/integration_test/permission_flow_test.dart`, contra a stack com o SDK
roteirizado: aparelho pendente vê o card com os controles desligados e o prazo nega; aprovar pelo
celular com extensão antes; abrir pelo endereço da notificação, revalidar e aprovar; abrir depois do
prazo e não achar card; revogar com o app aberto e o banner dizer. Três bordas são substituídas —
aba de login, Keychain e **tela de bloqueio**. A entrega real do push está na variante à parte
([D-26](decisions.md#d-26--o-push-de-verdade-sem-sujar-a-suíte-de-todo-dia)):
`mobile/patrol_test/push_delivery_test.dart`, rodada por `pnpm test:e2e:mobile:push`.

Rodar no aparelho achou dois problemas do produto: a coluna da sessão estourava numa tela real
(a área de cima passou a ser limitada pela altura **disponível**, com banners e fila rolando juntos),
e o e2e antigo do walking skeleton contava `Card`s que o banner da F0 também é.

### B-29 — Teto de memória do Gradle ✅

`mobile/android/gradle.properties` traz `-Xmx8G -XX:MaxMetaspaceSize=4G` do template do
Flutter — sozinho, promete 12 GB de JVM. O bootstrap registrou isso e não mexeu porque a
execução passou com a cerca de cgroup por fora
([progresso do plano 00](../00-bootstrap/progress.md#escopo-reduzido-ou-adiado)).

Este plano roda o emulador muitas vezes. Ajustar o teto para algo que caiba numa máquina de
desenvolvimento, e provar que a suíte continua verde, é trabalho desta fase.

**Feito em 2026-09-24.** `-Xmx3G -XX:MaxMetaspaceSize=1G`, e o daemon do Kotlin com teto próprio de
1,5 GB. `pnpm test:e2e:mobile` saiu 0 com ele, ao lado do emulador e da stack (S-58).

### B-34 — A imagem do emulador, fixada ✅

**API 35**, fixada em [scripts/mobile.mjs](../../../scripts/mobile.mjs) e dita na seção
**Comandos** do [README.md](../../../README.md#comandos), na mesma entrega
([D-09](decisions.md#d-09--o-emulador-reprodutível)).

Hoje o script exige "um device" e nada mais, o que basta para rodar e não basta para um resultado
comparável entre duas máquinas: API level diferente muda permissão de notificação, biometria e
deep link — exatamente o que esta fase exercita. API 33 é o piso para o diálogo de permissão de
notificação existir; em imagem mais antiga o cenário de B-32 não aparece, e a suíte passa sem
provar nada.

Uma imagem só, não duas: a suíte já é a mais cara do repositório.

**Feito em 2026-09-24.** `EMULATOR_API_LEVEL = 35` em `scripts/lib/android.mjs`, com teste; o
`mobile.mjs test:e2e` pergunta ao aparelho o API level antes de compilar e recusa outro. O README
diz a imagem, e a AVD dedicada da suíte (`remote_claude_api35`, 16 GB de dados). O diálogo de
notificação do SO é provado pela variante com push de verdade, que o responde pelo `patrol`.

---

## Cenários cobertos

S-51…S-58, S-67.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
```
