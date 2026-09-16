# F1 — Workspace

Plano: [01 — Sessão viva](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F0](F0-contract.md).
**Entrega:** o módulo `workspace` inteiro — allowlist, normalização, persistência de metadado,
HTTP e o seletor no web.

---

## Por que antes da sessão

`cwd` da `query()` **é** o workspace. Abrir sessão antes de existir quem valide o caminho é
abrir um shell em qualquer diretório da máquina. Esta é a primeira linha de defesa do sistema,
e é regra pura, sem I/O — o lugar mais barato do projeto para acertar.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.

### B-07 — Domínio `workspace` 🔲

`Workspace` e o VO `WorkspacePath`, com as regras de
[backend/03-modules](../../architecture/backend/03-modules.md#workspace): caminho normalizado,
absoluto, dentro de uma raiz configurada.

Três recusas que precisam existir explicitamente: `..` que escapa, symlink que aponta para
fora, e caminho que é **prefixo textual** da raiz sem ser filho dela (`/srv/projects-evil`
contra a raiz `/srv/projects`). A terceira é a que passa despercebida em comparação de string.

Erros: `WORKSPACE_NOT_ALLOWED`, `WORKSPACE_NOT_FOUND`, `WORKSPACE_NOT_A_DIRECTORY`.

### B-08 — Allowlist na configuração, validada no boot 🔲

As raízes permitidas vêm de variável de ambiente validada por schema. Lista vazia, caminho
relativo ou raiz inexistente **impedem o processo de subir**, com mensagem dizendo qual valor e
o que se esperava — [configuração](../../architecture/shared/07-repository-layout.md#configuração-e-segredo).

Backend no ar com allowlist aberta é pior que backend fora do ar.

### B-09 — Tabela `workspaces` e repositório 🔲

Metadado apenas: raiz, rótulo, último uso. Migration versionada, repositório devolvendo
entidade e nunca row — [persistência](../../architecture/backend/05-persistence.md).

**Nada de conteúdo de arquivo no banco.**

### B-10 — `GET /workspaces` 🔲

Lista as raízes configuradas e seus metadados. Não varre disco: a allowlist é a fonte, e
varredura de filesystem por requisição é I/O caro e superfície de ataque.

Status conforme [04-errors-and-http](../../architecture/shared/04-errors-and-http.md) — caminho
fora da allowlist é `403`, não `404`.

### B-11 — Seletor de workspace no web 🔲

`Component → Hook → Service → api.ts`, com os quatro estados (carregando, erro, vazio,
conteúdo) e chaves de i18n em `en` e `pt-BR`.

Nenhum componente conhece HTTP — ver [web/01](../../architecture/web/01-architecture.md).

---

## Cenários cobertos

S-09…S-20.

---

## Critério de conclusão

```bash
pnpm verify
```
