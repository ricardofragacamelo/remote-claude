# F6 — E2E

Plano: [07 — Explorer and editor](README.md) · Cenários: [scenarios.md](scenarios.md) · Progresso: [progress.md](progress.md)

**Depende de:** [F5](F5-editor.md).
**Entrega:** o núcleo do plano — abrir, criar, funções de arquivo e editar — provado pela porta do
usuário, inclusive a convivência com o Claude escrevendo no mesmo arquivo, e o app ainda verde com o
contrato novo. É o ponto em que os planos 08 e 09 podem começar.

## Por quê

A F7 e a F8 completam a paridade de arquivos, mas nada do que os planos seguintes consomem depende
delas. Fechar o núcleo aqui, com `verify:full` verde, é o que deixa o painel do Claude (09) e a busca
(10) começarem sem esperar prévias e histórico.

---

## Tarefas

Estado da task no fim do título: 🔲 não iniciada · 🔄 em andamento · ✅ concluída · ⛔ bloqueada.
Sem marca, a task conta como 🔲. É daqui que `pnpm plan progress` tira os contadores.

### B-43 — O ciclo de arquivo pela porta do usuário ✅

Playwright, em `e2e/specs/`, sobre uma pasta de fixture gerada por execução (como o `smoke-live` do
plano 04 faz com o `/init`): abrir a pasta → árvore → abrir arquivo → editar → Ctrl+S → **o disco** tem
o conteúdo (a fixture lê o arquivo, não a tela); criar de modelo, renomear e apagar → os três fatos
na Auditoria; apagar pasta pelo diálogo com a contagem.

### B-44 — O Claude roteirizado no mesmo arquivo ✅

Com o Claude roteirizado do e2e (`backend/test/e2e/scripted-main.ts`): ele escreve no arquivo aberto
e **limpo** → o editor recarrega; no arquivo aberto e **sujo** → salvar dá conflito → comparar →
sobrescrever; e depois, desfazer o turno do Claude **preserva** a edição humana — a promessa do
[ADR-013](../../architecture/shared/00-decisions.md#adr-013--o-desfazer-não-usa-rewindfiles-o-store-de-checkpoint-é-nosso)
atravessando os dois planos.

### B-45 — Abas de pasta, grupos, celular e acessibilidade ✅

Duas abas de pasta (pasta e subpasta): alternar sem perder estado, fechar uma sem afetar a outra,
recarga restaura; dois grupos lado a lado com o mesmo arquivo; viewport de celular com o modo
simplificado e sem scroll horizontal; axe no explorer e no editor; link com `file=../x` → erro
traduzido.

### B-46 — O app, o contrato e o fechamento do núcleo ✅

`pnpm test:e2e:mobile` verde com o contrato novo (o app ignora `workspace.*`), `contracts:check` e
`i18n:check` verdes, e `pnpm verify:full` saindo com 0 — com os daemons do Gradle parados antes, que é
o que faz o portão 7 não estourar o tempo.

---

## Cenários cobertos

S-280…S-291.

---

## Critério de conclusão

```bash
pnpm verify:full
pnpm test:e2e:mobile
```
