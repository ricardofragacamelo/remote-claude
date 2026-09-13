# remote-claude

Opere o **Claude Code instalado na sua máquina** a partir do navegador ou do celular.

Um backend Node conversa com o Claude local via Claude Agent SDK, recebe o stream de eventos
e o distribui para dois canais — um front web e um app Flutter — que acompanham a sessão,
enviam prompts e, principalmente, **aprovam as permissões de tool à distância**.

> **Status:** arquitetura definida, implementação não iniciada.
> Este repositório contém, por enquanto, a documentação que guia a construção.

---

## Como funciona

```
  Web (React)  ─┐                                    ┌─ ~/.claude/projects/*.jsonl
                ├─ WebSocket ─► Backend (NestJS) ─────┤   (sessões, compartilhadas com o VSCode)
Mobile (Flutter)┘      + HTTP        │                └─ Claude Agent SDK ─► CLI local ─► Claude
                                     │
                                     └─ PostgreSQL 18 (auth, devices, audit, push tokens)
```

O fluxo que define o produto: o Claude pede autorização para executar uma tool, o backend
**bloqueia** o loop do agente, empurra a pergunta para o navegador e para o celular, e espera
uma resposta humana. Aprovou no celular, o comando roda na sua máquina.

Três fatos que explicam quase todas as decisões de arquitetura:

1. O backend roda como o usuário dono da máquina e **herda o login do Claude** — não há API
   key no sistema.
2. Quem alcança o backend pode **executar comando arbitrário na máquina**. Permissão,
   auditoria e autenticação são o núcleo, não acessórios.
3. A comunicação é **interativa e bidirecional** — por isso WebSocket, não request/response.

---

## Stack

| Camada | Escolha |
|---|---|
| Backend | Node · NestJS · Clean Architecture |
| Web | React · shadcn/ui · Tailwind CSS |
| Mobile | Flutter · Riverpod |
| Banco | PostgreSQL 18 · Drizzle · testcontainers |
| Autenticação | OpenID Connect (agnóstico de provedor; Auth0 como alvo inicial) |
| Monorepo | pnpm workspaces (Flutter fora, com `pub` próprio) |

O porquê de cada uma, e as alternativas descartadas, está em
[Decisões (ADR)](docs/architecture/shared/00-decisions.md).

---

## Documentação

| Você quer… | Vá para |
|---|---|
| Trabalhar no código (ou é um agente de IA) | **[AGENTS.md](AGENTS.md)** |
| Entender a arquitetura | [docs/architecture/](docs/architecture/README.md) |
| Saber como o backend fala com o Claude | [Descoberta do Agent SDK](docs/discovery/01-descoberta-claude-agent-sdk.md) |

A documentação é fragmentada de propósito, com índices que roteiam por situação
(*"vai fazer X → leia Y"*), para que se carregue só o necessário.

### Dois pontos de partida

- **[AGENTS.md](AGENTS.md)** — regras que valem sempre, e o roteador de primeiro nível.
- **[Protocolo de validação](docs/architecture/shared/11-validation-protocol.md)** — como uma
  fase é planejada, implementada e validada até todos os portões ficarem verdes.

---

## Princípios que o repositório impõe

Não como recomendação — como portão de CI:

- **Código em inglês, texto de usuário traduzido** (`en` / `pt-BR`).
- **Todo I/O logado em `debug`**, estruturado, com o mesmo schema nas três pontas.
- **Três níveis de teste sempre** — unit, integração e e2e —, com cobertura mínima de
  **90 % em todas as dimensões**.
- **Teste fora do código-fonte.**
- **Análise estática nos três módulos**, incluindo detecção de linhas repetidas.
- **Uma tarefa só está pronta com toda a validação verde.** Desativar regra para o CI passar
  é o oposto de pronto.

---

## Licença

Ainda não definida.
