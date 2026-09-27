# F3 — E2E

Plano: [10 — Terminal integrado](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F2](F2-terminal-ui.md).
**Entrega:** o terminal provado pela porta do usuário — abrir, digitar, redimensionar, reconectar,
dividir, buscar, seguir um link — e as recusas que o tornam seguro provadas do mesmo jeito:
desligado por padrão, sem step-up, sem segredo no ambiente, sem tecla na trilha. E o app verde com o
contrato novo.

---

## Por quê

As garantias de segurança deste plano são, quase todas, garantias **entre** camadas: o arquivo que
liga, o provedor que carimba `auth_time`, o backend que filtra o ambiente, o navegador que não abre
sozinho depois do step-up. Cada uma tem teste na sua camada; o e2e é o que prova que elas continuam
de pé montadas juntas ([testing strategy](../../architecture/shared/06-testing-strategy.md)).

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-23 — A pilha e2e com o terminal 🔲

- O arquivo de allowlist do e2e liga o terminal para o usuário A **e não** para o B — as duas
  metades da recusa na mesma pilha, sem reiniciar.
- Janela de step-up, carência e TTL curtos no ambiente do e2e, dentro dos pisos (o piso existe
  também para o e2e: se o teste precisar de menos, o piso está errado ou o teste está).
- O realm do provedor fake com `auth_time` no access token (B-03).
- Fixtures: uma pasta de trabalho com um `~/.profile` de teste e um arquivo para o link de caminho.
- Ajudante de spec que lê a trilha pela leitura que existir — a tela de Auditoria, se a leitura de
  `audit_events` já tiver chegado a ela, senão a fixture de banco do e2e.

Sem Claude roteirizado: nada aqui precisa de sessão.

### B-24 — O ciclo pela porta do usuário 🔲

`e2e/specs/terminal.spec.ts`, Playwright:

- abrir; `pwd` mostra a pasta; `echo` de um marcador volta;
- redimensionar a janela muda o `stty size`;
- recarregar a página dentro da carência → o mesmo terminal, com o scrollback;
- duas abas de pasta, dois terminais, cada um no seu `cwd`;
- dividir o painel, buscar no scrollback e seguir um link de caminho até o editor;
- fechar a aba de pasta → depois da carência, `GET /terminals` vazio.

### B-25 — As recusas e a segurança pela porta do usuário 🔲

- usuário B → recusa traduzida, sem processo;
- janela de step-up vencida → recusa, reautenticação no provedor fake, volta, **clique** e abre;
- `env` no terminal não mostra `DATABASE_URL`, `OIDC_*` nem `RC_*`;
- a trilha tem `terminal.opened` e `terminal.closed` do ciclo, e o marcador digitado não está nela;
- axe sem violação no painel com terminal aberto, nos dois temas.

### B-26 — O contrato no app: `test:e2e:mobile` verde 🔲

O app ganhou só os tipos (B-04) e não oferece terminal. A suíte mobile continua verde com o contrato
novo, e o `contracts:check` garante que o Dart gerado é o do schema.

---

## Cenários cobertos

S-164…S-175.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
pnpm test:e2e:live
```
