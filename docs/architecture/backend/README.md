# Backend — índice

Node + **NestJS** + **Clean Architecture**, modularizado por domínio, falando com o Claude
local via Agent SDK.

Voltar para o [índice geral](../README.md).

---

## Antes de qualquer coisa

Leia primeiro os transversais que valem aqui: [idioma](../shared/01-language-and-naming.md),
[logging](../shared/03-logging.md), [erros](../shared/04-errors-and-http.md).
Eles vencem qualquer coisa escrita nesta pasta.

---

## Quando carregar cada documento

| # | Documento | Carregue quando |
|---|---|---|
| 01 | [Clean Architecture](01-clean-architecture.md) | **Sempre**, antes do primeiro arquivo. Define as camadas, a Dependency Rule e como o NestJS se encaixa nela sem contaminar o domínio. |
| 02 | [Estrutura de pastas](02-folder-structure.md) | Vai criar arquivo ou pasta. Vai procurar onde algo deveria estar. |
| 03 | [Módulos de domínio](03-modules.md) | Vai criar um módulo novo, ou mexer num existente. Define fronteiras e quem pode falar com quem. |
| 04 | [Integração com o Claude](04-claude-integration.md) | Vai tocar em sessão, streaming, permissão ou qualquer coisa do Agent SDK. **O documento mais denso desta pasta.** |
| 05 | [Persistência](05-persistence.md) | Vai mexer em banco, schema, migration ou repositório. |
| 06 | [Tempo real](06-realtime.md) | Vai mexer no gateway WebSocket, no fan-out ou no ring buffer de eventos. |
| 07 | [Testes](07-testing.md) | Vai escrever qualquer teste do backend. Leia junto com [a estratégia geral](../shared/06-testing-strategy.md). |

### Gatilhos

- Erro novo → `04` dos transversais **e** `03` daqui (erro pertence a um módulo).
- Evento ou comando WS novo → [contrato WS](../shared/05-websocket-protocol.md) **antes**, `06` depois.
- Tabela nova → `05`, e só depois o código.
- Precisa entender o que o Agent SDK oferece → [descoberta](../../discovery/01-descoberta-claude-agent-sdk.md).
- Mexer em token, login ou device → [autenticação](../shared/08-authentication.md). O backend
  **valida**, nunca emite; o adapter fica em `adapter/outbound/identity/`.

---

## As cinco regras do backend

1. **`domain/` e `application/` não importam `@nestjs/*`.** São TypeScript puro. Se você
   precisou de um decorator ali, o desenho está errado.
2. **Dependência aponta para dentro.** `infrastructure → adapter → application → domain`.
   Nunca o contrário.
3. **Módulo fala com módulo por porta**, nunca importando o interior do outro.
4. **Toda borda de I/O loga entrada e saída em `debug`** — e isso é feito por interceptor,
   não dentro do use case.
5. **Erro de domínio não conhece HTTP.** O mapeamento acontece em um exception filter único.
