# Plano 20 — Progresso

Onde estamos, e o histórico de validação. O [plano](README.md) é o contrato; **este arquivo é
o diário**. Não misture: plano que vira diário perde a função de contrato.

Os contadores abaixo são recalculados por `pnpm plan progress`, que na mesma execução atualiza
o [progresso geral](../progress.md). Não os mantenha à mão.

---

## Estado atual

**Fase corrente:** F0 — B-01…B-05 concluídas; B-06 aguarda a verificação à mão (S-34…S-36)
**Última atualização:** 2026-10-02
**Bloqueios:** nenhum por decisão. `pnpm verify:full` **não foi rodado**, por instrução do usuário
(2026-10-02) — a fase não fecha sem ele

```
F0 █████████████████░░░  86%   🔄 em andamento
```

---

## Tarefas

🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada

| Fase | Tarefas | Concluídas | Estado |
|---|---|---|---|
| [F0](F0-public-stack.md) | B-01…B-07 | 6/7 | 🔄 |
| **Total** | **B-01…B-07** | **6/7** | 🔄 |

---

## Cenários

| | Total | ⬜ | 🟡 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Matriz](scenarios.md) | 41 | 3 | 0 | 38 | 0 |

---

## Decisões

Decisão em aberto impede **começar** a fase que depende dela — ver
[decisions.md](decisions.md).

| | Total | 🔲 | 🔄 | ✅ | ⛔ |
|---|---|---|---|---|---|
| [Decisões](decisions.md) | 8 | 0 | 0 | 8 | 0 |

---

## Histórico de validação

Um registro por **ciclo**, conforme o
[Estágio 3 do protocolo](../../architecture/shared/11-validation-protocol.md#estágio-3--loop-de-correção).

| # | Data | Fase | Portão que falhou | Causa | Correção | Resultado |
|---|---|---|---|---|---|---|
| 1 | 2026-10-02 | F0 | unit (web) | `VITE_API_URL` saía `https://host//api`: `URL.href` termina em barra | `origin.origin` no lugar de `href` | verde |
| 2 | 2026-10-02 | F0 | integração (web) | o Vite não sobe dentro do jsdom (esbuild recusa o `TextEncoder` dele), e o setup do web exige DOM | o servidor do teste roda num processo próprio (`test/support/public-dev-server.mjs`) | verde |
| 3 | 2026-10-02 | F0 | lint | complexidade 12 no Keycloak falso da integração | handler separado por rota | verde |
| 4 | 2026-10-02 | F0 | cobertura | branches de `tunnel.mjs` em 89,36 % | removido o teste de pipe nulo (nunca acontece), cobertos EACCES, morte por sinal e erro sem `onError` | verde |

Portões rodados nos arquivos do plano: formatação, lint, typecheck (scripts e web), arquitetura do
web, unit e integração dos scripts e do web tocados, cobertura por arquivo das libs novas
(`public-url` 97/93/100/97, `tunnel` 100/95/100/100, `keycloak-admin` e `local-stack` 100).
Fora do alcance desta fase, na mesma árvore: o `.env.example` com quatro variáveis sem comentário
e duas duplicações no backend vêm do trabalho do plano 08 F5, em andamento noutra sessão.

---

## Decisões tomadas durante a execução

Decisão que altera o plano entra aqui **e** no documento normativo correspondente.

| Data | Decisão | Motivo | Afetou |
|---|---|---|---|
| 2026-10-02 | `RC_PUBLIC_URL` vazio usa o domínio da conta do túnel | medido: o ngrok sem `--url` abre no domínio fixo da conta e o diz no log | B-02, `.env.example` |
| 2026-10-02 | timeout do túnel é `TunnelError`, não `WaitError` | a falha do túnel vem antes do compose, e a dica certa é a do túnel, não a do compose | B-02, S-15 |
| 2026-10-02 | falha antes do compose não faz `compose stop` | pararia uma stack que outra execução tem de pé no mesmo projeto | B-06 |
| 2026-10-02 | o authtoken passa a morar em `.secrets/ngrok-authtoken`, entregue só ao túnel (D-05 revista) | pedido do usuário: guardar o token fora do git e o script usá-lo. Medido com uma config vazia do ngrok: com o arquivo o túnel abre; sem ele, `ERR_NGROK_4018` | B-07, S-37…S-41 |

---

## Escopo reduzido ou adiado

Tirar coisa do escopo é decisão legítima; **omitir que tirou, não**.

| Data | O que saiu | Por quê | Para onde foi |
|---|---|---|---|
| 2026-10-02 | `pnpm verify:full` | instrução do usuário | fica pendente para fechar a F0 |
| 2026-10-02 | S-34…S-36 (e2e) | exigem a conta do túnel, internet e o `pnpm dev` do usuário parado — que estava de pé | verificação à mão, a registrar aqui |

---

## Riscos — acompanhamento

Riscos do [plano](README.md#riscos-e-decisões-em-aberto).

| # | Risco | Estado | Observação |
|---|---|---|---|
| R-01 | A URL pública leva ao login de um backend que executa `Bash` | 🔲 aberto | mitigado: `/admin` fora do proxy, aviso no quadro |
| R-02 | Backend busca discovery e JWKS pelo túnel | ✅ aceito | o quadro sonda o issuer público |
| R-03 | Página de aviso do túnel gratuito | ✅ aceito | um clique por navegador |

---

## Como atualizar

1. Ao **começar** uma fase: estado → 🔄 aqui e no [índice do plano](README.md#fases).
2. Ao **concluir** uma tarefa: marque a task com ✅ no arquivo da fase e rode `pnpm plan progress`
   — ele reescreve os contadores **deste** arquivo e os do [progresso geral](../progress.md).
   Progresso de fase é registrado nos dois lugares, sempre.
3. A cada **ciclo de correção**: uma linha no histórico de validação.
4. Ao **concluir** uma fase: 🔄 → ✅, somente com `pnpm verify` verde.
5. Ao **concluir o plano**, ou ao mover escopo para outro: uma linha no histórico do
   [progresso geral](../progress.md) — é ele que responde em que pé o projeto está.
6. Ao **bloquear**: ⛔ com o motivo, e escale — não fique em três ciclos sem progresso. Bloqueio
   que impede uma fase de começar entra também na tabela de decisões em aberto do
   [progresso geral](../progress.md).
