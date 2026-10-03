# F6 — E2E

Plano: [08 — Painel do Claude](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F5](F5-composer-and-context.md).
**Entrega:** o painel provado pela porta do usuário, contra o fake roteirizado que reproduz o que o
Claude real gravou; o app provado compatível com o contrato novo; e as premissas que só o Claude real
confirma — a menção lida pelo `Read`, o `@caminho` não expandido, modelos, MCP, contexto, skills,
imagem, thinking e subagent — vigiadas pelo `smoke-live`.

**Decisões que precisam estar fechadas para começar:** nenhuma nova ([decisions.md](decisions.md#f6--e2e)).

---

## Como o e2e prova este plano

O backend roteirizado é **um** Claude: o que o replay diz ele grava no store de conversas que o próprio
backend lê, e escreve os arquivos que a gravação escreveu
([06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário)).
Então a view de sessões, os diffs, a rejeição por trecho e o fork a partir de uma mensagem são provados
sobre o que o **produto** produziu na execução, nunca sobre arquivo plantado pelo teste. As fixtures são
as da [B-06](F0-contract.md). A conversa "externa ativa" é a única plantada — é o que simula o VS Code —,
e é escrita pelas funções do SDK, não por um JSONL à mão.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-53 — A conversa renderizada ✅

Prompt → resposta em markdown → tool compacta → "abrir diff" abre a aba de diff do editor na mesma aba de
pasta. Thinking, a lista do `TodoWrite` e um subagent aninhado aparecem vivos e continuam iguais depois
de recarregar. Recarregar no meio do turno volta à mesma aba de pasta e à mesma conversa, sem mensagem
duplicada.

### B-54 — O contexto de um prompt ✅

`@` escolhe um arquivo, outro vem arrastado do explorer e uma imagem do desktop: as referências chegam, e
o `Read` do arquivo mencionado aparece em `/audit`. `/` mostra a skill do projeto da fixture, com o selo,
e escolhê-la a dispara. Contexto fora da pasta é recusado com o erro traduzido, e o rascunho fica.

### B-55 — Diff, rejeição e plano ✅

A permissão de Edit mostra o diff contra o disco, é aprovada, o disco muda e a view "Alterações" lista o
arquivo. Rejeitar um trecho e depois o arquivo inteiro pela view, e desfazer a rejeição. Em modo plan,
aprovar o plano troca o modo e o Claude segue.

### B-56 — As sessões da pasta, as abas e a fila ✅

A view de sessões mostra uma sessão viva, uma conversa externa ativa e o histórico; `attach`, retomar e
fork a partir dela. Duas abas de pasta: a permissão pedida na inativa vira badge na aba e é respondida.
O link de sessão ([D-24](decisions.md#d-24--o-link-de-uma-sessão-e-de-uma-conversa)) colado no
navegador abre a aba da pasta com a conversa no painel, ao lado do explorer e do editor; retomar uma
conversa pela view de sessões e abrir uma conversa removida voltam a ser provados pelo web — o plano 06
os tirou do e2e ao remover `/history`. Dois prompts durante um turno entram na fila e um é cancelado; editar e reenviar um
prompt bifurca a conversa. Em viewport de celular, o painel é uma view única, sem scroll horizontal, e o
axe não acusa violação.

### B-57 — O app continua verde ✅

`pnpm test:e2e:mobile` com o contrato novo: os tipos Dart regenerados, o app ignorando o que não conhece
e os cenários compartilhados de `e2e/scenarios/` passando. Rodar antes do `verify:full` e parar os
daemons do Gradle depois — senão o portão 7 estoura o prazo.

### B-58 — `smoke-live` contra o Claude real ✅

Numa fixture gerada por execução (a D-07 do plano 04): uma menção real gera o `Read` auditado; `@caminho`
no texto **não** é expandido em silêncio pelo CLI (a premissa da D-01, vigiada a cada versão);
`supportedModels()`, `mcpServerStatus()` e `getContextUsage()` respondem; a skill de projeto da fixture
aparece no `supportedCommands()` com o nome que o menu insere (e as de usuário e sistema, quando o plano
13 existir); a imagem chega ao modelo, se a D-02 a mantiver; thinking e subagent reais têm o formato das
fixtures. Rodar o `smoke-live` é item do Definition of Done de toda mudança no adapter do Claude.

---

## Cenários cobertos

S-255…S-272, e os que o e2e descobriu: S-273…S-275.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
pnpm test:e2e:live
```
