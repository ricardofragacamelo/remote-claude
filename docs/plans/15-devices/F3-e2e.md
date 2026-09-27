# F3 — E2E

Plano: [15 — Dispositivos](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-devices-screen.md).
**Entrega:** os fluxos da tela provados pela porta do usuário, no web e no app — e as quatro
garantias do plano 02 provadas de novo, agora pela tela nova.

---

## Por quê

A tela nova troca o componente por onde se aprova e se revoga. As garantias do plano 02 foram
provadas pelo componente antigo; trocar a porta sem provar de novo é a forma mais barata de perder
uma delas sem ninguém ver. Por isso metade desta fase é regressão, dita como tal.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-24 — Aprovar reconhecendo o aparelho 🔲

Playwright contra a stack efêmera, com um aparelho registrado pelo cenário: a tela mostra o
pendente no topo, o segundo passo mostra o **mesmo** código que o registro devolveu ao app, aprovar
muda o estado e o aparelho passa a poder decidir. Renomear, filtrar e buscar, com a URL
reproduzindo a tela depois da recarga.

### B-25 — Revogar em lote fecha o socket 🔲

Dois aparelhos com socket aberto (cliente WS roteirizado com `client.installId`, como os cenários
`mobile-*` já fazem), revogados em lote pela tela: os dois sockets fecham com `4401`, nenhum dos
dois responde mais pedido (`DEVICE_REVOKED`), e a trilha tem uma linha por aparelho. Recusar um
pendente pela tela. E a regressão de [02 · D-02](../02-mobile-approval/decisions.md#d-02--quem-aprova):
um aparelho pedindo a aprovação de outro continua `403`.

### B-26 — Push de teste e histórico 🔲

Contra o provedor de teste que a stack e2e já tem (o de [05 · B-25](../05-hardening-operations/F0-limits.md)):
o teste pela tela chega ao provedor, o payload não carrega sessão, pedido, comando nem arquivo, e
aparece no histórico do aparelho e na trilha. Um pedido de permissão respondido pelo aparelho
roteirizado aparece nas respostas **daquele** aparelho, com o link para a trilha.

### B-27 — O app, de verdade 🔲

`pnpm test:e2e:mobile`: o app registra com modelo, versão do SO e permissão de notificação; o
estado pendente mostra o código, e é o mesmo que a tela do web mostra; o push de teste chega e o
toque abre o app. Regressão do plano 02: pendente continua sem conseguir decidir, e revogado pela
tela nova cai na hora.

Lembrete operacional da máquina: parar os daemons do Gradle depois do e2e mobile, antes do
`verify:full`, ou o portão 7 estoura o tempo.

### B-28 — Celular, teclado, axe e o pendente que vence 🔲

Viewport de celular (cartões, gaveta de detalhe, sem scroll horizontal), fluxo de revogar só com
teclado, axe na tela e nos diálogos. Regressão de
[02 · D-11](../02-mobile-approval/decisions.md#d-11--o-pendente-esquecido): um pendente registrado
há 8 dias (relógio do cenário) não aparece e não é aprovável.

---

## Cenários cobertos

S-111…S-118.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
```
