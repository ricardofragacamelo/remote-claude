================================================================================
 remote-claude — COMANDOS DISPONÍVEIS
================================================================================

 Consulta rápida de terminal. O que o projeto E' esta' no README.md;
 o que RODAR esta' aqui.

 Status: os scripts abaixo sao a ENTREGA do plano de bootstrap
 (docs/plans/00-bootstrap/). Ate' ele concluir, nem todos existem.

--------------------------------------------------------------------------------
 PRE'-REQUISITOS
--------------------------------------------------------------------------------

   Node          >= 22
   pnpm          >= 9
   Docker        rodando (testcontainers e docker compose nao tem alternativa)
   Flutter       estavel (so' para o app mobile)

   pnpm doctor        Verifica tudo acima e as portas fixas. RODE ISTO PRIMEIRO.
                      Diz o que falta e como resolver.

--------------------------------------------------------------------------------
 PRIMEIRA VEZ
--------------------------------------------------------------------------------

   pnpm install       Instala as dependencias dos workspaces (backend, web, e2e,
                      packages/contracts). NAO cobre o mobile: use `flutter pub get`.

   cp .env.example .env
                      Toda variavel esta' documentada no .env.example.
                      Variavel faltando IMPEDE o processo de subir - de proposito.

   pnpm contracts:generate
                      Gera os tipos TS e o Dart a partir do JSON Schema do
                      protocolo WebSocket.

   pnpm db migrate    Aplica as migrations (exige a stack de pe').

--------------------------------------------------------------------------------
 DIA A DIA
--------------------------------------------------------------------------------

   pnpm dev           Sobe a stack de desenvolvimento em PORTAS FIXAS:
                        PostgreSQL  localhost:5432
                        Keycloak    http://localhost:8180
                        Backend     http://localhost:3000
                        Web         http://localhost:5173
                      Ctrl+C encerra web -> backend -> docker compose stop.
                      PRESERVA os volumes: o banco local sobrevive ao Ctrl+C.

   pnpm db reset      Derruba, recria, migra e popula o banco. E' a sequencia que
                      ninguem lembra na ordem certa.
   pnpm db seed       So' popula.

   pnpm clean         Purga o que se acumula: projetos e volumes docker orfaos,
                      dist/, coverage/, relatorios do Playwright, .dart_tool/.
                      Volume orfao e' invisivel ao `docker compose ls` - por isso
                      existe este comando.

--------------------------------------------------------------------------------
 VALIDACAO  (o que define "pronto")
--------------------------------------------------------------------------------

   pnpm verify        Portoes 1-7, na ordem barato -> caro. Ciclo rapido, use
                      durante a implementacao:
                        1 formatacao   2 lint        3 tipagem
                        4 arquitetura  5 duplicacao  6 unit    7 cobertura

   pnpm verify:full   Portoes 1-11. E' ISTO que define pronto:
                        os 7 acima + 8 integracao + 9 e2e
                        + 10 seguranca + 11 contrato e i18n

   REGRA: portao vermelho -> corrija e RODE TUDO DE NOVO DESDE O PRIMEIRO.
   Nao retome do meio: correcao de lint quebra duplicacao, correcao de teste
   quebra arquitetura. Detalhes em
   docs/architecture/shared/11-validation-protocol.md

   NUNCA desative regra, baixe limiar de cobertura ou marque teste como skip
   para o CI passar. Isso nao e' entregar; e' esconder.

--------------------------------------------------------------------------------
 TESTES (individualmente)
--------------------------------------------------------------------------------

   pnpm test:unit         Unit das tres pontas. Rapido, sem I/O.
   pnpm test:integration  Integracao. EXIGE DOCKER (Postgres real via
                          testcontainers - nunca SQLite, nunca mock).
   pnpm test:e2e          Sobe uma stack EFEMERA em portas ALEATORIAS, roda o
                          Playwright e derruba tudo (down --volumes).
                          Sai com o CODIGO DOS TESTES, nao com 0 fixo.
                          Pode rodar com o `pnpm dev` de pe'.
   pnpm test:coverage     Cobertura. Minimo 90% em statements, branches,
                          functions e lines - POR ARQUIVO. Nao ha media que
                          compense.

   cd mobile && flutter test              Unit e widget do app.
   cd mobile && flutter test integration_test    E2E do app (exige emulador).

--------------------------------------------------------------------------------
 QUALIDADE (individualmente)
--------------------------------------------------------------------------------

   pnpm lint              ESLint + dart analyze.
   pnpm lint:arch         Dependency Rule: dependency-cruiser (backend),
                          boundaries (web), import_lint (mobile).
                          Import de @nestjs/* em domain/ QUEBRA O BUILD.
   pnpm lint:dup          Linhas repetidas (jscpd). Teto: 3%.
   pnpm typecheck         tsc --noEmit em modo strict. Sem `any`, sem `dynamic`.
   pnpm format            Aplica Prettier e dart format.
   pnpm format:check      So' verifica.
   pnpm scan:security     gitleaks, semgrep e scanner de dependencia.

--------------------------------------------------------------------------------
 CONTRATOS E TRADUCAO
--------------------------------------------------------------------------------

   pnpm contracts:generate   JSON Schema -> tipos TS + codigo Dart.
   pnpm contracts:check      Falha se o gerado estiver fora de sincronia.
                             Cobre OS DOIS alvos: o Dart nao e' importado por
                             ninguem em TS, entao so' este portao o protege.

   pnpm i18n:check           Paridade de chaves en <-> pt-BR, chave orfa, e
                             params que nao casam entre os idiomas.

--------------------------------------------------------------------------------
 DOCUMENTACAO E PLANOS
--------------------------------------------------------------------------------

   pnpm docs:check        Link interno quebrado, ancora inexistente e documento
                          fora do indice da sua area. A documentacao e' a
                          interface do agente de IA com o projeto: indice
                          desatualizado a torna inutil em silencio.

   pnpm plan new <nome>   Cria uma pasta de plano no formato normativo:
                          README.md, scenarios.md, progress.md e um arquivo
                          POR FASE.
   pnpm plan progress     Recalcula os contadores do progress.md a partir dos
                          arquivos de fase.

--------------------------------------------------------------------------------
 ONDE LER MAIS
--------------------------------------------------------------------------------

   AGENTS.md                          Entrada para agentes de IA e para quem
                                      vai escrever codigo. Regras sempre validas.
   README.md                          O que e' o projeto.
   docs/architecture/README.md        Indice da arquitetura.
   docs/plans/README.md               Planos e o formato normativo deles.
   docs/discovery/                    Levantamentos tecnicos (Claude Agent SDK).

--------------------------------------------------------------------------------
 REGRA SOBRE ESTE ARQUIVO
--------------------------------------------------------------------------------

   Script novo entra NESTE catalogo e no catalogo do plano na MESMA entrega.
   Script que ninguem encontra sera' reescrito por outra pessoa daqui a um mes.

   Tarefa repetitiva vira script em scripts/ - nao sequencia de comandos
   digitada a mao nem orquestrada passo a passo por um agente. Se voce esta'
   rodando a mesma sequencia pela SEGUNDA vez, crie o .mjs.
================================================================================
