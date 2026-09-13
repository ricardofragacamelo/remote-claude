# Definition of Done

**Uma tarefa não está pronta enquanto toda a fase de validação não estiver verde — incluindo
as validações estáticas.**

"Funciona na minha máquina", "o código está escrito" e "só falta o teste" são estados de
tarefa **em andamento**, não concluída.

Voltar para o [índice transversal](README.md).

---

## Por que isto é um documento

Porque "pronto" é a palavra mais ambígua de um projeto de software, e porque a pressa sempre
encontra a mesma saída: entregar o código e deixar a validação para depois. Depois não chega
— chega a próxima tarefa.

Com um critério explícito e verificável por máquina, "pronto" para de ser opinião.

---

## O checklist

Uma tarefa está pronta quando **todos** os itens abaixo passam. Não há item opcional, e não há
ordem de importância — é conjunção, não ponderação.

### 1. Implementação

- [ ] O que foi pedido está completo. Escopo reduzido pelo caminho foi **declarado**, não
      silenciado.
- [ ] Estrutura de pastas respeitada ([backend](../backend/02-folder-structure.md) ·
      [web](../web/02-folder-structure.md) · [mobile](../mobile/02-folder-structure.md)).
- [ ] Dependency Rule respeitada. Nenhum import de framework em camada de domínio.
- [ ] Código, logs e identificadores em **inglês** ([01](01-language-and-naming.md)).
- [ ] Nenhum texto apresentável hardcoded; tudo por chave, em `en` **e** `pt-BR`
      ([02](02-i18n.md)).
- [ ] Todo I/O logado em `debug`, com o schema de campos ([03](03-logging.md)).
- [ ] Erros com `code`, `messageKey` e status HTTP correto ([04](04-errors-and-http.md)).

### 2. Testes — os três níveis

- [ ] **Unit** escrito, em `test/unit/`, fora do fonte.
- [ ] **Integração** escrito, com dependências reais (Postgres via testcontainers).
- [ ] **E2E** escrito, em `e2e/` (ou `mobile/integration_test/`).
- [ ] Cenários enumerados pelas **seis dimensões**, não só o caminho feliz
      ([06](06-testing-strategy.md#como-enumerar-cenários)).
- [ ] Nível que genuinamente não se aplica está **declarado no PR**, com a razão.
- [ ] Nenhum teste `skip`, nenhum `sleep`, nenhum flaky conhecido.

### 3. Validação estática — **a que mais se pula, e não pode**

- [ ] Formatação aplicada (Prettier / `dart format`).
- [ ] Lint sem erro **e sem aviso novo**, nos módulos tocados.
- [ ] Typecheck strict passando. Nenhum `any`, nenhum `dynamic`, nenhum `@ts-ignore`.
- [ ] **Regras de arquitetura** passando (`dependency-cruiser`, `boundaries`, `import_lint`).
- [ ] **Duplicação** dentro do limite ([linhas repetidas](09-code-quality.md#linhas-repetidas)).
- [ ] Complexidade dentro do limite.
- [ ] `gitleaks`, `semgrep` e scanner de dependência sem achado novo.
- [ ] Supressão de regra, se houver, tem justificativa e link de issue.

### 4. Cobertura

- [ ] **≥ 90 % em statements, branches, functions e lines — por arquivo**
      ([cobertura](06-testing-strategy.md#cobertura)).
- [ ] `branches` conferido especificamente. É a dimensão que denuncia caminho de erro não
      testado.

### 5. Contrato e documentação

- [ ] Mudança de protocolo WS refletida em `packages/contracts/` **e** propagada às três
      pontas ([05](05-websocket-protocol.md)).
- [ ] Dart regenerado, se o contrato mudou.
- [ ] Erro novo no [catálogo](04-errors-and-http.md).
- [ ] Decisão técnica relevante registrada como [ADR](00-decisions.md).
- [ ] Documento de arquitetura afetado atualizado **e** indexado.

### 6. CI

- [ ] Pipeline **inteiro** verde. Não "verde menos um job conhecido".
- [ ] Quality gate do SonarQube aprovado.

---

## Como o agente de IA deve tratar isto

Esta seção é dirigida a quem estiver executando a tarefa automaticamente.

1. **Não anuncie conclusão sem ter rodado a validação.** Escrever o código é metade do
   trabalho. Rode lint, typecheck, testes e cobertura, e **leia a saída**.
2. **Falhou? A tarefa continua em andamento.** Corrija e rode de novo. Não entregue com
   ressalva do tipo "falta só ajustar o lint".
3. **Não desative regra para fazer passar.** Desligar lint, baixar limiar de cobertura ou
   marcar teste como `skip` para o CI ficar verde é o oposto de pronto. Se a regra parece
   errada, isso é uma conversa — e uma [ADR](00-decisions.md) —, não uma edição de config.
4. **Reporte com honestidade.** Se algo ficou de fora, diga o quê e por quê, explicitamente.
   Relatório de conclusão que omite falha é pior que a falha.
5. **Bloqueado de verdade?** Entregue tudo o que não depende do bloqueio, e diga o que
   faltou e por quê.

---

## Comando único

Tudo acima roda com:

```bash
pnpm verify          # lint + typecheck + arquitetura + duplicação + unit + cobertura
pnpm verify:full     # o anterior + integração + e2e + segurança
```

Existe um comando só de propósito: um checklist que exige lembrar de sete comandos é um
checklist que será executado pela metade.

**A tarefa está pronta quando `pnpm verify:full` sai com código 0.** Antes disso, ela está
em andamento — independentemente de quanto código foi escrito.
