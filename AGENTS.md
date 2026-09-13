# AGENTS.md — instruções para agentes de IA neste repositório

Este arquivo é o ponto de entrada para qualquer agente de IA que trabalhe no **remote-claude**.
Leia-o por inteiro antes da primeira ação. Ele é curto de propósito: o conteúdo real está
em documentos menores, carregados sob demanda.

---

## O que é este projeto

Backend Node + front web React + app Flutter para operar, remotamente, o **Claude Code
instalado na máquina local**. O backend fala com o Claude via Claude Agent SDK, recebe o
stream de eventos e o distribui para os dois canais (web e mobile), que também aprovam
permissões de tool e disparam prompts.

Stack fechada: NestJS · React + shadcn/ui + Tailwind · Flutter · PostgreSQL 18 · OIDC (Auth0) · pnpm workspaces.

---

## Quando uma tarefa está pronta

**Uma tarefa NÃO está pronta enquanto toda a fase de validação não estiver verde — incluindo
as validações estáticas.** Código escrito não é tarefa concluída.

```bash
pnpm verify:full     # lint + typecheck + arquitetura + duplicação + unit + integração + e2e + cobertura + segurança
```

**Pronto = `pnpm verify:full` sai com código 0.** Antes disso, a tarefa está em andamento,
independentemente de quanto código foi escrito.

Três coisas que **não** tornam uma tarefa pronta:

- desativar regra de lint, baixar limiar de cobertura ou marcar teste como `skip` para o CI passar;
- anunciar conclusão sem ter **rodado** a validação e **lido** a saída;
- omitir, no relatório, o que falhou ou ficou de fora.

### O ciclo

```
Plano + matriz de cenários  →  Implementação  →  Portões (barato → caro)
                                                      │
                          ┌── vermelho ───────────────┤
                          │                           │
                          ▼                           └── todos verdes → DoD → PRONTO
                     corrigir e REINICIAR
                     do PRIMEIRO portão
```

**Portão vermelho? Corrige e roda tudo de novo desde o primeiro.** Não retome do meio:
correção de lint quebra duplicação, correção de teste quebra arquitetura. Retomar do meio é
como regressão passa.

**Três ciclos sem progresso no mesmo portão → pare e escale.** Não contorne.

Protocolo completo: [Protocolo de validação](docs/architecture/shared/11-validation-protocol.md).
Checklist: [Definition of Done](docs/architecture/shared/10-definition-of-done.md).
Leia os dois no **início** da tarefa, não no fim.

---

## Regras que valem SEMPRE (não precisam de leitura adicional)

1. **Código em inglês.** Identificadores, nomes de arquivo, comentários, mensagens de log,
   chaves de i18n, nomes de tabela e coluna, mensagens de commit. Sem exceção.
2. **Texto para humano é traduzido.** Nenhuma string apresentada ao usuário nasce hardcoded.
   O backend devolve `code` + `messageKey` + `params`; quem traduz é o cliente. Idiomas: `en`, `pt-BR`.
3. **Todo I/O é logado em `debug`.** Entrada e saída de cada borda (HTTP, WebSocket, banco,
   Agent SDK, push). Log estruturado, sempre — `pino` no back e no web, `logging` + formatter
   JSON no Flutter.
4. **Todo plano, fase ou task começa por uma matriz de cenários de teste.** Enumere pelas seis
   dimensões (equivalência, fronteira, erro, transição de estado, concorrência, idempotência)
   **antes** de escrever código — cenário enumerado depois é enviesado pelo código que já
   existe. Ver [protocolo §Estágio 0](docs/architecture/shared/11-validation-protocol.md).
5. **Tudo que é construído gera os três níveis de teste** — unit, integração e e2e —, com o
   máximo de cenários possível (não só o caminho feliz). Teste fica **fora** do fonte, e a
   cobertura mínima é **90 % em todas as dimensões** (statements, branches, functions, lines),
   por arquivo. Ver [testing strategy](docs/architecture/shared/06-testing-strategy.md).
6. **A Dependency Rule é inviolável.** Camada de dentro nunca importa camada de fora.
   Vale no backend (domain ← application ← adapter) e no web (Component → Hook → Service → api).
7. **Status HTTP tem significado.** Nunca devolva 200 com erro no corpo, nem 500 para erro
   de validação. Ver [errors and HTTP](docs/architecture/shared/04-errors-and-http.md).
8. **Autenticação é OIDC padrão.** Nenhum código conhece o nome do provedor; o backend
   valida token, nunca o emite. Nunca guarde token em `localStorage`.
9. **Regra que não é verificada por máquina não existe.** Análise estática é obrigatória nos
   três módulos, e linha repetida é portão com limite.
10. **Tarefa repetitiva vira script em `scripts/`**, não orquestração passo a passo pelo
    agente. Invoque o script e leia a saída. Se você está executando a mesma sequência de
    comandos pela **segunda** vez, ou escrevendo um script inline para conferir algo, pare e
    crie o `.mjs`. Catálogo na seção **Comandos** do [README.md](README.md#comandos).
11. **Antes de criar um arquivo, procure onde ele deveria estar.** A estrutura de pastas é
    normativa, não sugestão.

---

## Quando carregar cada documento

Carregue **apenas** o que a tarefa exigir. Este é o roteador de primeiro nível; cada índice
abaixo tem o seu próprio roteador interno.

| Se você vai… | Leia | Antes de qualquer código |
|---|---|---|
| Entender o desenho geral, ou não sabe por onde começar | [docs/architecture/README.md](docs/architecture/README.md) | sim |
| Mexer em qualquer coisa do backend | [docs/architecture/backend/README.md](docs/architecture/backend/README.md) | sim |
| Mexer em qualquer coisa do front web | [docs/architecture/web/README.md](docs/architecture/web/README.md) | sim |
| Mexer em qualquer coisa do app Flutter | [docs/architecture/mobile/README.md](docs/architecture/mobile/README.md) | sim |
| Tocar em algo que atravessa as três pontas (log, i18n, erro, protocolo WS, teste, auth) | [docs/architecture/shared/README.md](docs/architecture/shared/README.md) | sim |
| Mexer em login, token, device ou credencial | [docs/architecture/shared/08-authentication.md](docs/architecture/shared/08-authentication.md) | sim |
| Entender **como** o backend conversa com o Claude local | [docs/discovery/01-descoberta-claude-agent-sdk.md](docs/discovery/01-descoberta-claude-agent-sdk.md) | sim |
| Saber **por que** uma tecnologia foi escolhida, ou propor trocá-la | [docs/architecture/shared/00-decisions.md](docs/architecture/shared/00-decisions.md) | sim |
| Configurar ou suprimir lint, tipagem, duplicação ou quality gate | [docs/architecture/shared/09-code-quality.md](docs/architecture/shared/09-code-quality.md) | sim |
| **Planejar uma fase/task, ou executar a validação** | [docs/architecture/shared/11-validation-protocol.md](docs/architecture/shared/11-validation-protocol.md) | sim |
| Implementar uma fase, ou saber em que pé está o trabalho | [docs/plans/](docs/plans/README.md) — o plano corrente, sua fase e o `progress.md` | sim |
| **Criar um plano novo** | [docs/plans/README.md](docs/plans/README.md) — o formato é normativo: fases em arquivos separados, tasks dentro de cada fase | sim |
| **Dar uma tarefa por concluída** | [docs/architecture/shared/10-definition-of-done.md](docs/architecture/shared/10-definition-of-done.md) | sim |

### Gatilhos específicos

- Vai **adicionar ou alterar um evento/comando WebSocket** → é uma mudança de contrato:
  leia [05-websocket-protocol.md](docs/architecture/shared/05-websocket-protocol.md) e atualize
  backend, web e mobile na mesma mudança. Contrato quebrado em uma ponta só é bug.
- Vai **criar um módulo novo no backend** → leia `backend/01`, `backend/02` e `backend/03` juntos.
- Vai **escrever uma tela** → leia `web/01` (ou `mobile/01`) **e** `shared/02-i18n.md`.
- Vai **mexer em banco** → leia [backend/05-persistence.md](docs/architecture/backend/05-persistence.md).
  Migration é sempre versionada; nunca altere uma migration já aplicada.
- Vai **escrever teste** → leia [shared/06-testing-strategy.md](docs/architecture/shared/06-testing-strategy.md)
  e depois o `06-testing.md`/`07-testing.md` da ponta correspondente.
- Encontrou **conflito entre dois documentos** → pare e pergunte. Não escolha um por conta própria.

---

## Anti-padrões que serão rejeitados em review

- String em português (ou inglês) hardcoded na UI.
- `console.log` / `print()` em qualquer lugar.
- Import de framework (`@nestjs/*`, `react`, `flutter`) dentro de `domain/`.
- Componente React chamando `api.ts` ou um service direto, sem passar por hook.
- Teste ao lado do fonte, ou entrega que derruba a cobertura abaixo de 90 %.
- Plano ou task sem matriz de cenários.
- Plano fora do formato: fase sem arquivo próprio, task sem ID, critério de conclusão que não é um comando.
- Entrega sem os três níveis de teste, ou com cenários só de caminho feliz.
- Retomar a validação do portão que falhou, em vez de reiniciar do primeiro.
- `query()` do Agent SDK sem `settingSources: ['project']` ou sem o hook `PreToolUse`.
- Orquestrar à mão uma sequência que já é (ou deveria ser) um script de `scripts/`.
- Bloco de código duplicado acima do limiar.
- Regra de lint desativada, teste em `skip` ou limiar reduzido para o CI passar.
- `catch` que engole o erro sem logar e sem re-lançar.
- Nome de provedor de identidade (`auth0`, SDK proprietário) fora da configuração.
- Token em `localStorage`, em query string, ou em log.
- Novo endpoint ou evento WS sem atualizar o documento de contrato.
