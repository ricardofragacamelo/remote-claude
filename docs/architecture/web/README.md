# Web — índice

React + TypeScript + **shadcn/ui** + **Tailwind CSS**, organizado pela cadeia
`Component → Hook → Service → api.ts → Backend`.

Voltar para o [índice geral](../README.md).

---

## Antes de qualquer coisa

Leia os transversais que valem aqui: [idioma](../shared/01-language-and-naming.md),
[i18n](../shared/02-i18n.md), [logging](../shared/03-logging.md),
[erros](../shared/04-errors-and-http.md). Eles vencem qualquer coisa escrita nesta pasta.

---

## Quando carregar cada documento

| # | Documento | Carregue quando |
|---|---|---|
| 01 | [Arquitetura em camadas](01-architecture.md) | **Sempre**, antes do primeiro arquivo. Define a cadeia Component → Hook → Service → api e o que cada elo pode fazer. |
| 02 | [Estrutura de pastas](02-folder-structure.md) | Vai criar arquivo. Vai procurar onde algo deveria estar. |
| 03 | [Design system](03-ui-system.md) | Vai escrever JSX, estilizar, adicionar componente do shadcn ou mexer em tema. |
| 04 | [Estado e dados](04-state-and-data.md) | Vai buscar dado do servidor, consumir o WebSocket ou decidir onde um estado mora. |
| 05 | [Logging no browser](05-logging.md) | Vai adicionar log, ou criar um service. |
| 06 | [Testes](06-testing.md) | Vai escrever teste do web. Leia junto com [a estratégia geral](../shared/06-testing-strategy.md). |
| 07 | [Autenticação](07-auth.md) | Vai mexer em login, token, rota protegida ou registro de device. Leia junto com [OIDC](../shared/08-authentication.md). |

### Gatilhos

- Tela nova → `01`, `02` e [i18n](../shared/02-i18n.md).
- Consumir evento WS novo → [contrato](../shared/05-websocket-protocol.md) **antes**, `04` depois.
- Componente que "precisa" chamar a API direto → releia `01`. A resposta é não.
- Token, login ou rota protegida → `07` e [OIDC](../shared/08-authentication.md).
- **Antes de dar a tarefa por concluída** → [Definition of Done](../shared/10-definition-of-done.md).

---

## As cinco regras do web

1. **A cadeia é unidirecional.** `Component → Hook → Service → api.ts`. Pular elo é proibido.
2. **Componente não sabe que existe HTTP.** Nem `fetch`, nem `axios`, nem URL, nem status code.
3. **Service não conhece React.** Sem hook, sem contexto, sem estado. É função assíncrona pura.
4. **Nenhum texto literal na UI.** Tudo por chave de i18n.
5. **`console.log` é proibido.** Use o logger. Todo I/O de service vira `debug`.
6. **Token nunca em `localStorage`.** Access em memória, refresh em cookie `httpOnly`.
