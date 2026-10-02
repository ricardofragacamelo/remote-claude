# F4 — E2E

Plano: [18 — Logs e diagnóstico](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F3](F3-health-screen.md).
**Entrega:** as duas promessas que justificam o plano — **o segredo não aparece** e **o log do
backend não aparece para quem não é operador** — provadas pela porta do usuário, junto com o tail sob carga, o nível com
prazo e os checks falhando um a um com a explicação traduzida.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-32 — Redação, isolamento e a cadeia, pela porta do usuário 🔲

Specs em `e2e/specs/diagnostics/`, sobre o stack do `run-e2e-local` (build de produção do web):

- um segredo com forma de credencial digitado num campo e num prompt nunca aparece na tela de logs,
  na gaveta do rastreio nem no arquivo exportado (S-117);
- dois usuários do Keycloak de teste: B, não operador, não lê linha nenhuma — a tela de logs explica,
  traduzida, que o log é do operador, e o "ver nos logs" não aparece para ele —; o operador vê as
  linhas de B pelo `userId` (S-118);
- um erro provocado pela UI, pelo operador → "ver nos logs" → a cadeia do `traceId` no backend, da
  requisição do clique à resposta (S-124).

### B-33 — Tail sob carga e nível com prazo 🔲

- o backend roteirizado (`backend/test/e2e/scripted-main.ts`) ganha um gatilho de rajada de log; a
  tela seguindo ao vivo acompanha, mostra o divisor de `gap` e continua respondendo a clique e
  teclado durante a rajada (S-119);
- o operador eleva o nível do backend com prazo curto (configurável só no stack de teste) e vê o
  nível voltar sozinho na tela, com as duas entradas na trilha (S-120).

### B-34 — A saúde com checks falhando um a um 🔲

O backend roteirizado ganha a forma de falhar cada check isoladamente — banco inalcançável, allowlist
inválida, CLI ausente, push sem credencial, identidade inalcançável —, e a spec percorre um por vez:
o item certo em `fail`, os outros intactos, a explicação e o "o que fazer" traduzidos, em `en` e em
`pt-BR` (S-121). O ping de ponta a ponta pela tela (S-122).

Nenhuma falha é provocada derrubando container do stack — o backend roteirizado finge a dependência
fora, para a spec não depender de tempo de subida de Docker.

### B-35 — Celular, axe, deep link e ajuda 🔲

As duas telas em viewport de celular, axe sem violação, a ajuda aberta pelo ícone e pela palette, e
um link com filtros de `/diagnostics/logs` reproduzindo a mesma lista depois de recarregar (S-123).

---

## Cenários cobertos

S-117…S-124.

---

## Critério de conclusão

```bash
pnpm verify:full
```
