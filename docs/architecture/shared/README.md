# Transversal — índice

Documentos que valem para **backend, web e mobile ao mesmo tempo**. Quando um destes
conflita com um documento de ponta específica, **este vence**.

Voltar para o [índice geral](../README.md).

---

## Quando carregar cada documento

| # | Documento | Carregue quando |
|---|---|---|
| 00 | [Decisões (ADR)](00-decisions.md) | Vai questionar, substituir ou justificar uma escolha de stack. Leia antes de propor qualquer troca de biblioteca. |
| 01 | [Idioma e nomenclatura](01-language-and-naming.md) | Vai nomear qualquer coisa — arquivo, classe, função, tabela, coluna, chave de i18n, evento WS, branch, commit. |
| 02 | [Internacionalização](02-i18n.md) | Vai escrever, mover ou traduzir qualquer texto que um humano lê. Também quando for criar um erro novo (erro tem chave de tradução). |
| 03 | [Logging estruturado](03-logging.md) | Vai adicionar log, criar um adapter, ou atravessar qualquer borda de I/O. |
| 04 | [Erros e HTTP](04-errors-and-http.md) | Vai lançar, capturar ou mapear erro. Vai definir status code. Vai criar um erro de domínio novo. |
| 05 | [Protocolo WebSocket](05-websocket-protocol.md) | Vai tocar em qualquer mensagem em tempo real, em qualquer ponta. **Este é o contrato.** |
| 06 | [Estratégia de testes](06-testing-strategy.md) | Vai escrever qualquer teste. Vai decidir se algo é unit, integração ou e2e. |
| 07 | [Layout do repositório](07-repository-layout.md) | Vai criar pasta ou arquivo novo na raiz. Vai configurar tooling, workspace ou CI. |
| 08 | [Autenticação (OIDC)](08-authentication.md) | Vai mexer em login, token, sessão de usuário, registro de device ou validação de credencial, em qualquer ponta. |
| 09 | [Qualidade de código](09-code-quality.md) | Vai configurar lint, tipagem, duplicação, segurança estática ou quality gate. Leia antes de suprimir qualquer regra. |
| 10 | [Definition of Done](10-definition-of-done.md) | **Antes de considerar qualquer tarefa concluída.** Leia no início da tarefa, não no fim. |
| 11 | [Protocolo de validação](11-validation-protocol.md) | **Ao planejar uma fase/task** (a matriz de cenários é parte do plano) e **ao executar a validação**. O `10` diz o que; o `11` diz como. |

---

## Os oito invariantes

Se você só puder guardar oito coisas desta área:

1. **Código em inglês, texto de humano traduzido.** → `01`, `02`
2. **Toda entrada e saída vira log estruturado em `debug`.** → `03`
3. **Erro tem código, chave de tradução e status HTTP — os três.** → `04`
4. **Contrato WS é único e versionado; muda nas três pontas junto.** → `05`
5. **Autenticação é OIDC padrão; nenhum código conhece o nome do provedor.** → `08`
6. **Regra não verificada por máquina não existe; duplicação é portão.** → `09`
7. **Tarefa só está pronta com a validação inteira verde.** → `10`
8. **Plano sem matriz de cenários não é plano; portão vermelho reinicia o ciclo do zero.** → `11`
