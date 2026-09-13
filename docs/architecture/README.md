# Índice geral da arquitetura

Raiz da documentação de arquitetura do **remote-claude**. Chegou aqui vindo do
[AGENTS.md](../../AGENTS.md) na raiz do repositório.

Este arquivo não descreve a arquitetura — ele **roteia** para quem descreve.
Leia a visão de 30 segundos abaixo, depois pule direto para o índice da área em que vai trabalhar.

---

## Visão de 30 segundos

```
  Web (React)  ─┐                                    ┌─ ~/.claude/projects/*.jsonl
                ├─ WebSocket ─► Backend (NestJS) ─────┤   (sessões, compartilhadas com o VSCode)
Mobile (Flutter)┘      + HTTP        │                └─ Claude Agent SDK ─► CLI local ─► Claude
                                     │
                                     └─ PostgreSQL 18 (auth, devices, audit, push tokens)
```

Três fatos que explicam quase todas as decisões:

1. **O backend roda como o usuário dono da máquina** e herda o login do Claude
   (`~/.claude/.credentials.json`). Não há API key no sistema.
2. **Quem alcança o backend pode executar comando arbitrário na máquina** (tool `Bash`).
   Por isso permissão, auditoria e autenticação não são acessórios — são o núcleo. A
   autenticação é delegada a um provedor **OIDC** (Auth0 como alvo inicial), nunca caseira.
3. **A comunicação é interativa e bidirecional.** O Claude pergunta "posso rodar isso?" e
   espera resposta humana. Isso é WebSocket, não request/response.

---

## Mapa dos documentos

### Transversal — vale para as três pontas

| # | Documento | Carregue quando |
|---|---|---|
| — | [shared/README.md](shared/README.md) | Índice da área. Ponto de entrada de qualquer tema transversal. |
| 00 | [Decisões (ADR)](shared/00-decisions.md) | Para questionar, trocar ou entender o porquê de uma tecnologia. |
| 01 | [Idioma e nomenclatura](shared/01-language-and-naming.md) | Para nomear qualquer coisa: arquivo, classe, tabela, chave, evento. |
| 02 | [Internacionalização](shared/02-i18n.md) | Para escrever qualquer texto que um humano vai ler. |
| 03 | [Logging estruturado](shared/03-logging.md) | Para adicionar log, ou atravessar uma borda de I/O. |
| 04 | [Erros e HTTP](shared/04-errors-and-http.md) | Para lançar, tratar ou mapear erro; para definir status code. |
| 05 | [Protocolo WebSocket](shared/05-websocket-protocol.md) | Para tocar em qualquer mensagem em tempo real. **Contrato entre as três pontas.** |
| 06 | [Estratégia de testes](shared/06-testing-strategy.md) | Para escrever qualquer teste, em qualquer ponta. |
| 07 | [Layout do repositório](shared/07-repository-layout.md) | Para criar pasta/arquivo novo, ou configurar tooling. |
| 08 | [Autenticação (OIDC)](shared/08-authentication.md) | Para mexer em login, token, device ou validação de credencial. |
| 09 | [Qualidade de código](shared/09-code-quality.md) | Para configurar ou entender lint, tipagem, duplicação e quality gate. |
| 10 | [Definition of Done](shared/10-definition-of-done.md) | **Antes de dar qualquer tarefa por concluída.** |
| 11 | [Protocolo de validação](shared/11-validation-protocol.md) | **Ao planejar uma fase/task** e ao executar a validação. |

### Backend — Node + NestJS + Clean Architecture

→ [backend/README.md](backend/README.md)

Camadas, módulos por domínio, integração com o Agent SDK, persistência, gateway WebSocket, testes.

### Web — React + shadcn/ui + Tailwind

→ [web/README.md](web/README.md)

A cadeia `Component → Hook → Service → api.ts`, estrutura por feature, design system, estado, testes.

### Mobile — Flutter

→ [mobile/README.md](mobile/README.md)

Clean Architecture em Flutter, Riverpod, navegação, rede, logging, testes.

### Planos — o trabalho em execução

→ [../plans/README.md](../plans/README.md)

O que está sendo construído, em fases, com rastreio e progresso. O formato de plano é
**normativo**: três arquivos fixos (`README.md`, `scenarios.md`, `progress.md`) mais **um
arquivo por fase**, cada fase contendo suas tasks.

Arquitetura diz *como* construir; plano diz *o que* está sendo construído *agora*.

### Descoberta (não é arquitetura, é insumo)

→ [../discovery/01-descoberta-claude-agent-sdk.md](../discovery/01-descoberta-claude-agent-sdk.md)

O levantamento do Claude Agent SDK: o que a API oferece, autenticação, tipos relevantes.
Leia antes de mexer no módulo `session` do backend.

---

## Ordem de leitura recomendada (primeira vez no projeto)

1. Este arquivo.
2. [shared/11-validation-protocol.md](shared/11-validation-protocol.md) — como planejar, executar e validar.
3. [shared/10-definition-of-done.md](shared/10-definition-of-done.md) — define quando uma tarefa acaba.
4. [shared/00-decisions.md](shared/00-decisions.md) — entende o porquê da stack.
5. [shared/05-websocket-protocol.md](shared/05-websocket-protocol.md) — é o contrato que amarra tudo.
6. O `README.md` da ponta em que você vai trabalhar.

Não leia tudo. A documentação foi quebrada em arquivos pequenos justamente para você
carregar só o necessário.

---

## Como manter esta documentação

- Documento novo em uma área → **adicione ao índice daquela área**, com a coluna "carregue quando".
  Documento não indexado é documento que o agente não encontra.
- Mudança de contrato (protocolo WS, erro, i18n) → atualize o documento transversal **antes**
  do código, e propague para as três pontas na mesma mudança.
- Decisão técnica relevante → registre em [shared/00-decisions.md](shared/00-decisions.md).
  Decisão não registrada volta a ser discutida daqui a três meses.
