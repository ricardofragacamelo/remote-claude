# Mobile — índice

App **Flutter** que observa sessões do Claude e, principalmente, **aprova permissões de tool
à distância**. É o canal que torna o produto útil fora da mesa.

Voltar para o [índice geral](../README.md).

---

## Antes de qualquer coisa

Leia os transversais que valem aqui: [idioma](../shared/01-language-and-naming.md),
[i18n](../shared/02-i18n.md), [logging](../shared/03-logging.md),
[erros](../shared/04-errors-and-http.md), [OIDC](../shared/08-authentication.md).
Eles vencem qualquer coisa escrita nesta pasta.

---

## Quando carregar cada documento

| # | Documento | Carregue quando |
|---|---|---|
| 01 | [Arquitetura](01-architecture.md) | **Sempre**, antes do primeiro arquivo. Camadas, Riverpod e a Dependency Rule em Flutter. |
| 02 | [Estrutura de pastas](02-folder-structure.md) | Vai criar arquivo. Vai procurar onde algo deveria estar. |
| 03 | [Estado e dados](03-state-and-data.md) | Vai buscar dado, consumir o WebSocket, tratar background ou decidir onde um estado mora. |
| 04 | [UI](04-ui.md) | Vai escrever widget, navegar entre telas ou mexer em tema. |
| 05 | [Logging](05-logging.md) | Vai adicionar log ou criar um data source. |
| 06 | [Testes](06-testing.md) | Vai escrever teste. Leia junto com [a estratégia geral](../shared/06-testing-strategy.md). |
| 07 | [Autenticação](07-auth.md) | Vai mexer em login, token, deep link ou registro de device. |

### Gatilhos

- Tela nova → `01`, `02`, `04` e [i18n](../shared/02-i18n.md).
- Consumir evento WS novo → [contrato](../shared/05-websocket-protocol.md) **antes**, `03` depois.
- Push notification → `03` e [OIDC](../shared/08-authentication.md) (o device precisa estar aprovado).
- **Antes de dar a tarefa por concluída** → [Definition of Done](../shared/10-definition-of-done.md).

---

## Se você não conhece Flutter

Três coisas que evitam a maior parte dos erros de quem vem de outro ecossistema:

1. **Widget é descrição, não objeto de tela.** Você não muda um widget; você descreve o
   estado novo e o framework reconstrói. Guardar referência de widget para "atualizar depois"
   é o erro nº 1 de quem vem de Android/iOS nativo.
2. **`setState` é estado local de tela, e só isso.** Qualquer coisa compartilhada ou vinda da
   rede vive em Riverpod. Ver [03](03-state-and-data.md).
3. **A árvore de widget é profunda por natureza.** Isso é normal em Flutter — mas extraia
   widget quando passar de ~80 linhas de `build`, senão nada é reutilizável nem testável.

A escolha de Riverpod, e as alternativas descartadas, estão em
[ADR-008](../shared/00-decisions.md#adr-008--riverpod-como-gerenciamento-de-estado-no-flutter).

---

## As cinco regras do mobile

1. **`domain/` é Dart puro.** Sem `flutter/*`, sem `dio`, sem `riverpod`.
2. **Widget não chama repositório.** A cadeia é `Widget → Provider → UseCase → Repository`.
3. **Nenhum texto literal.** Tudo por ARB, gerado e type-safe.
4. **`print()` é proibido.** Use o logger estruturado.
5. **Credencial em armazenamento seguro do SO.** Nunca em `SharedPreferences`.
