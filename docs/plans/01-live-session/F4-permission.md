# F4 — Permissão

Plano: [01 — Sessão viva](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-session-runtime.md), [F3](F3-audit.md).
**Entrega:** o módulo `permission` e a ponte `canUseTool` — o coração do produto. Ao fim desta
fase uma tool sensível só executa depois que um humano disse sim.

---

## O que esta fase é

O round-trip em que o **servidor** pergunta e espera. É a única razão de o transporte ser
WebSocket ([ADR-005](../../architecture/shared/00-decisions.md#adr-005--websocket-como-transporte-principal)),
e é a fronteira de segurança do sistema.

Leia [o fluxo no contrato](../../architecture/shared/05-websocket-protocol.md#o-fluxo-de-permissão)
e [a ponte](../../architecture/backend/04-claude-integration.md#a-ponte-de-permissão) antes de
começar.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-25 — Domínio `permission` ✅

`PermissionRequest` com estados (`pending → resolved | expired`), `expiresAt`, e as invariantes:
`deny` exige `reason`, primeira resolução vence, resolução posterior é no-op.

`PermissionRule` nasce aqui **apenas** com o escopo que morre com a sessão (`once`, `session`).
`project` e `always` são persistidos no [plano 03](../03-rules-and-audit/README.md) — regra que
sobrevive à sessão precisa de tela para ser revogada, e essa tela é de lá.

### B-26 — Histórico de requests no banco ✅

Tabela e migration para o histórico de `PermissionRequest` — o que foi pedido, por quem foi
resolvido, quando e como. Regra viva de escopo `session` fica **em memória**, com a sessão.

### B-27 — `permission-bridge`: o `canUseTool` ✅

Os quatro pontos não negociáveis, nesta ordem: idempotência por `requestId`, regra já existente
resolve sem incomodar ninguém, criação do request com publicação do evento, e a espera.

A espera tem **timeout nosso** — 120 s por default —, porque o CLI não impõe nenhum: medido,
ele manteve uma permissão pendurada por 150 s sem desistir nem emitir erro
([descoberta §8.4](../../discovery/01-descoberta-claude-agent-sdk.md#84--o-cli-não-impõe-timeout-próprio-no-canusetool)).

**Timeout nega. Silêncio nunca autoriza.** `options.signal` é respeitado.

O prazo é **extensível** ([D-09](decisions.md#d-09--estender-o-que-já-é-o-único-timeout)): o
comando já existe desde a F0, e aqui ele ganha efeito — incremento e teto vêm da configuração, e
cada cenário **fixa o valor que usa**, ou deixa de ser determinístico. Estender é mexer na única
proteção contra sessão pendurada, então o teto é rígido: atingido, responde erro, e a UI mostra
que não há mais extensão.

### B-28 — Registro de pendentes e republicação no attach ✅

O gap que o produto sofre é entre cliente e backend; o canal SDK↔CLI não cai junto. A `Promise`
do `canUseTool` continua pendente no nosso processo, e `reinitialize()` **não** reentrega nada
— nem precisa ([ADR-012](../../architecture/shared/00-decisions.md#adr-012--reconexão-não-usa-reinitialize-o-registro-de-pendentes-é-nosso)).

Ao reatar, quem republica os pendentes é o **nosso** registro.

### B-29 — O round-trip no gateway ✅

`permission.requested` para todas as connections que observam; `permission.resolve` como
`response` com `correlationId`; `permission.resolved` para todas, **inclusive** quem respondeu.

Segunda resolução do mesmo `requestId` é `ack` silencioso — nunca erro, nunca dupla execução.
Quem não está anexado à sessão leva `PERMISSION_NOT_OWNED`.

`permission.extend` fecha o mesmo round-trip: `permission.extended` sai para todas as connections
que observam, com o novo `expiresAt` e o `remainingExtensions`. Extensão que chega depois de o
pedido ter sido resolvido ou expirado é **erro**, não no-op silencioso — quem estendeu precisa
saber que não estendeu. Web e celular podem estender o mesmo pedido: a operação é idempotente por
`requestId`.

### B-30 — `riskHint` e sugestões de escopo ✅

O `riskHint` é derivado **no backend**, a partir da tool e do input, para a UI decidir o
destaque sem reimplementar a classificação em duas pontas. `suggestions` traz os escopos
disponíveis; `once` é o default.

A regra é **lista fixa por tool _mais_ heurística sobre o input**, e ela **falha fechado**
([D-08](decisions.md#d-08--classificar-risco-sem-mentir)): comando que a heurística **não
reconhece** é marcado como `destructive`, nunca como seguro. O caso que importa é `Bash` — um
falso negativo ali é um `rm -rf` com a mesma aparência de um `ls`. Falso positivo incomoda; falso
negativo é o acidente.

Não é detalhe de UI: é essa garantia que sustenta a confirmação em dois passos do app valer só
para `destructive` ([plano 02 · D-08](../02-mobile-approval/decisions.md)). Se ela deixar de
falhar fechado, aquela decisão reabre.

### B-31 — Eventos de domínio: destravar, auditar, notificar ✅

`permission.resolved` como evento interno (`EventEmitter2`), com três consumidores: `audit`
grava, `session` destrava o loop e — a partir do [plano 02](../02-mobile-approval/README.md) —
`notification` cancela o push pendente.

Comunicação entre módulos é por porta ou evento, nunca importando o interior do outro
([backend/03](../../architecture/backend/03-modules.md#fronteiras--quem-pode-falar-com-quem)).

---

## Cenários cobertos

S-50…S-65, S-91…S-95.

---

## Critério de conclusão

```bash
pnpm verify
pnpm test:integration
```
