# Decisões Técnicas — API Gateway Log Processor

Este documento registra as principais decisões de design e arquitetura tomadas durante o desenvolvimento, explicando o raciocínio por trás de cada escolha.

---

## 1. Abordagem Spec-Driven

Antes de escrever qualquer linha de código, escrevi uma spec técnica completa (`docs/specs/log-processor.md`) e um plano de implementação com 23 tasks ordenadas por dependência (`docs/plans/log-processor-plan.md`).

A motivação foi garantir que as decisões de design fossem tomadas de forma consciente antes da implementação, evitando retrabalho e mantendo rastreabilidade entre requisito, design e código. Cada commit do histórico corresponde a uma task do plano.

---

## 2. Leitura Incremental com Async Generator

O `LogReaderService` usa `readline` com `async *readLines()` (async generator) em vez de carregar o arquivo inteiro em memória com `fs.readFile`.

Para arquivos de log grandes (centenas de MB), carregar tudo em memória seria inviável. O generator emite uma linha por vez, permitindo que o `LogProcessorService` processe e persista cada entrada antes de ler a próxima — backpressure natural via `for await`.

---

## 3. Idempotência via INSERT IGNORE + SHA-256

Cada linha do arquivo é identificada pelo hash SHA-256 do seu conteúdo bruto, armazenado na coluna `line_hash`. O INSERT usa `INSERT IGNORE`, que descarta silenciosamente duplicatas sem gerar erro.

A contagem de `skipped` é calculada ao final (`totalLines - inserted - failed`) em vez de incrementada por linha, evitando qualquer `SELECT COUNT(*)` extra por inserção. Isso mantém o processamento O(n) com uma operação de banco por linha.

---

## 4. Zod Apenas para Input Externo

O Zod é usado exclusivamente para validar e mapear o payload NDJSON dos logs, que é um dado externo não controlado. Para DTOs de entrada da API (`ProcessLogsDto`, `ExportLogsDto`) usei `class-validator`, que é o padrão do ecossistema NestJS e integra nativamente com o `ValidationPipe`.

Misturar Zod com `class-validator` para o mesmo propósito seria redundante. A divisão é clara: Zod para dados externos não tipados, `class-validator` para contratos da API.

---

## 5. Todos os Campos do Schema Zod como `.optional()`

Todos os campos do `LogEntrySchema` são opcionais. O arquivo de log real pode ter entradas com campos ausentes ou nulos — qualquer falha de validação jogaria a linha para `gateway_log_failures`, o que seria ruído desnecessário para campos não críticos.

O campo `request.querystring` usa `z.unknown().optional()` especificamente porque o formato varia entre `[]` (array vazio) e `{}` (objeto vazio) dependendo da origem do log. Restringir o tipo causaria falsos negativos.

---

## 6. Guard de Tipo no `started_at`

O campo `started_at` é convertido com:

```typescript
typeof startedAt === 'number' ? new Date(startedAt * 1000) : null
```

O campo é Unix timestamp em segundos. A checagem de tipo é necessária porque o schema Zod o declara como `.optional()` — sem o guard, `new Date(undefined * 1000)` produziria `Invalid Date` sem lançar erro, corrompendo silenciosamente o dado.

---

## 7. Repository Pattern com Interfaces e Tokens Symbol

`ILogRepository` e `IFailureRepository` são interfaces injetadas via tokens `Symbol` no NestJS DI. O `LogProcessorService` depende das interfaces, não das implementações concretas.

Isso permite substituir a implementação (ex: trocar MySQL por outro banco) sem tocar no serviço de negócio. Tokens `Symbol` são necessários porque interfaces TypeScript são apagadas em runtime e não podem ser usadas diretamente como tokens de injeção.

---

## 8. Strategy Pattern para Exporters

Cada tipo de relatório CSV (`consumer`, `service`, `latency`) é uma classe separada implementando `ICsvExporter`. A `ExporterFactory` recebe o `type` e retorna a implementação correta.

Adicionar um novo tipo de relatório requer apenas uma nova classe e um novo `case` na factory — nenhum código existente é modificado (Open/Closed Principle). O controller e o serviço de processamento permanecem intocados.

---

## 9. Testcontainers para Testes de Integração

Os testes E2E sobem um container MySQL real via Testcontainers, executam as migrations e destroem tudo ao final. Não há mocks de banco de dados.

Mocks de banco validam apenas o contrato da camada de serviço, não o SQL real. O `INSERT IGNORE` com `$executeRaw`, por exemplo, só pode ser validado contra um MySQL real — um mock nunca revelaria um erro de sintaxe SQL ou uma restrição violada.

---

## 10. Diretório `logs/` como Volume Docker

O endpoint recebe um `filePath` que é um caminho **dentro do container**. Em vez de exigir que o usuário configure um volume manualmente, o `docker-compose.yml` monta `./logs:/data/logs` automaticamente.

O usuário coloca o arquivo em `./logs/` e usa `/data/logs/arquivo.ndjson` no request — zero configuração extra, funciona igual em qualquer sistema operacional.

---

## 11. `prisma` como Dependência de Produção

O CLI do Prisma (`prisma`) foi movido de `devDependencies` para `dependencies`. O estágio de produção do Dockerfile roda `npm ci --omit=dev`, que excluiria o CLI. Sem ele, o `npx prisma migrate deploy` no CMD do container baixaria uma versão avulsa do npm em cada inicialização — instável e com risco de incompatibilidade de binários.

Com o CLI em `dependencies`, o binário correto é instalado e gerado para a plataforma do container durante o build.
