# F6 — E2E

Plano: [06 — Workbench](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F5](F5-screens.md).
**Entrega:** o workbench provado pela porta do usuário, em Playwright contra a stack inteira —
abrir pasta, abas, a sessão na pasta certa, paleta e menu Arquivo, telas separadas, celular e
acessibilidade — e `pnpm verify:full` verde.

---

## Por quê

Integração prova cada peça com o backend simulado (MSW) ou com o Nest em memória. O que só o e2e
prova é o caminho inteiro: o caminho real que o backend resolveu é o que chega à URL, a recarga
restaura as abas que o servidor guardou, e o Claude roteirizado **reporta o `cwd`** — a prova, pela
porta do usuário, de que o caso relatado não volta
([06-testing-strategy](../../architecture/shared/06-testing-strategy.md#e2e--o-sistema-inteiro-pela-porta-do-usuário)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-35 — Fixtures de pastas e o cenário roteirizado 🔲

Uma árvore de pastas dentro da raiz de e2e — subpastas aninhadas, uma oculta, um symlink que fica
na raiz e um que escapa, uma pasta que o teste remove no meio — montada pelos fixtures de
`e2e/fixtures/`, e um cenário roteirizado em `e2e/scenarios/` em que o Claude responde com o `cwd`
da sessão. A stack de e2e continua lendo a allowlist **default**, nunca a cópia local da B-10.

### B-36 — Abrir pasta e a sessão na pasta 🔲

Da boas-vindas: Abrir pasta → navegar das raízes até uma subpasta → Abrir → a URL tem o caminho
real → recarga mantém. Iniciar uma sessão na secondary side bar e ver o Claude roteirizado
responder com **aquele** `cwd`, com explorer, editor e chat lado a lado na aba. Pasta fora da
allowlist pela URL → erro traduzido com caminho de volta.

### B-37 — Abas de pasta 🔲

Duas pastas em duas abas: alternar sem perder estado, fechar uma sem afetar a outra (e a
confirmação diz que as sessões continuam), recarregar e reencontrar o conjunto, a ordem e a ativa.
A pasta de uma aba removida do disco: a aba abre em erro, as outras seguem.

### B-38 — Paleta, menu Arquivo e notificações 🔲

Abrir pasta pelo menu **Arquivo** e pela paleta (`Ctrl/Cmd+Shift+P`); uma recusa (pasta fora da
allowlist) aparece como toast e fica no centro de notificações.

### B-39 — Telas separadas, rotas antigas, celular e acessibilidade 🔲

- as rotas antigas abrem a tela certa: a trilha filtrada (`/audit?…`), a regra (`/rules/$ruleId`),
  o histórico (`/history…`) e a sessão (`/sessions/$sessionId` → a aba da pasta, com a sessão na
  secondary side bar);
- viewport de celular: seletor de abas, uma view por vez, menu da navegação, sem scroll horizontal;
- axe sem violação no workbench, na boas-vindas, no diálogo e em cada tela global, nos temas claro e
  escuro.

---

## Cenários cobertos

S-155…S-163, S-166.

---

## Critério de conclusão

```bash
pnpm verify:full
```
