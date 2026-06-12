# Plano de Implementação — Log Processor

Tarefas ordenadas por dependência. Cada grupo só começa após o anterior estar concluído.

---

## Grupo 1 — Scaffold e Infraestrutura Base

### T01 — Scaffold NestJS
- **O que:** Criar o projeto NestJS com `nest new solution --strict`. Configurar `tsconfig.json` com `strict: true`. Remover arquivos de exemplo gerados (`AppController`, `AppService`).
- **Critério:** `npm run build` passa sem erros. `src/app.module.ts` existe e não referencia controller/service de exemplo.
- **Commit:** `chore: scaffold nestjs project with strict typescript`

---

### T02 — Configuração do Docker Compose e Dockerfile
- **O que:** Criar `Dockerfile` multi-stage (build + produção com Node 20 Alpine). Criar `docker-compose.yml` com dois serviços: `mysql` (MySQL 8, healthcheck, volume persistente) e `app` (depende de `mysql` com `condition: service_healthy`, executa `prisma migrate deploy && node dist/main` como entrypoint). Criar `.env` e `.env.example` com `DATABASE_URL` e `PORT`.
- **Critério:** `docker compose up --build` sobe os dois containers sem erro. MySQL responde no healthcheck. App aguarda MySQL antes de iniciar.
- **Commit:** `chore: add dockerfile and docker-compose with mysql and app services`

---

### T03 — Configuração do Prisma e Schema
- **O que:** Instalar Prisma (`prisma`, `@prisma/client`). Criar `prisma/schema.prisma` com provider MySQL e as duas models: `GatewayLog` (todos os campos da seção 4.1 da spec, incluindo `line_hash @unique` e `processed_at @default(now())`) e `GatewayLogFailure` (campos da seção 4.2). Criar `PrismaModule` como global em `src/prisma/`.
- **Critério:** `npx prisma migrate dev --name init` gera migration sem erros. `npx prisma generate` não retorna erros. `PrismaService` pode ser injetado nos testes.
- **Commit:** `chore: add prisma schema with gateway_logs and gateway_log_failures`

---

### T04 — Configuração do Swagger
- **O que:** Instalar `@nestjs/swagger`. Em `main.ts`, configurar `SwaggerModule.createDocument` com título "API Gateway Log Processor", descrição e versão. Montar em `/api`.
- **Critério:** `GET http://localhost:3000/api` retorna a UI do Swagger. `GET http://localhost:3000/api-json` retorna o OpenAPI JSON.
- **Commit:** `chore: setup swagger at /api`

---

## Grupo 2 — Utilitários e Schema de Validação

### T05 — Hash Util
- **O que:** Criar `src/common/hash.util.ts` com função `sha256(input: string): string` usando `crypto.createHash('sha256')` do Node nativo.
- **Critério:** Teste unitário confirma que a mesma string sempre produz o mesmo hash de 64 caracteres hexadecimais, e strings diferentes produzem hashes diferentes.
- **Commit:** `feat: add sha256 hash utility`

---

### T06 — Schema Zod do Payload
- **O que:** Criar `src/logs/schemas/log-entry.schema.ts` com o `LogEntrySchema` cobrindo toda a estrutura do payload (spec seção 7). Todos os campos folha são `.optional()`. `authenticated_entity.consumer_id` é `z.object({ uuid: z.string().optional() }).optional()`. Exportar o tipo inferido `LogEntry = z.infer<typeof LogEntrySchema>`.
- **Critério:** Teste unitário confirma: (a) payload completo e válido é aceito; (b) payload com campos ausentes resulta em `undefined` sem erro; (c) JSON inválido lança `SyntaxError` antes do Zod (tratado pelo caller).
- **Commit:** `feat: add zod schema for log entry payload`

---

## Grupo 3 — Pipeline de Processamento

### T07 — LogReaderService
- **O que:** Criar `src/logs/services/log-reader.service.ts` como `@Injectable()`. Implementar método `async *readLines(filePath: string): AsyncGenerator<string>` usando `readline.createInterface` sobre `fs.createReadStream`. Yieldar cada linha não-vazia. Lançar erro descritivo se o arquivo não existir.
- **Critério:** Teste unitário confirma: (a) yield correto de todas as linhas de um arquivo de fixture; (b) arquivo vazio não emite linhas; (c) arquivo inexistente lança erro com mensagem útil.
- **Commit:** `feat: add log reader service with async generator`

---

### T08 — LogParserService
- **O que:** Criar `src/logs/services/log-parser.service.ts` como `@Injectable()`. Implementar `parse(rawLine: string): LogEntry`. Fazer `JSON.parse(rawLine)` e em seguida `LogEntrySchema.parse(result)`. Converter `started_at * 1000` para `Date`. Extrair `consumer_id` de `authenticated_entity.consumer_id.uuid`. Mapear todos os campos da spec seção 7 para o shape de saída, com campos ausentes como `null`. Lançar o erro original em caso de falha (caller decide o que fazer).
- **Critério:** Teste unitário confirma: (a) payload dos logs reais é parseado corretamente com todos os campos mapeados; (b) `started_at` resulta em `Date` correto; (c) `consumer_id` extraído do objeto aninhado; (d) campos ausentes resultam em `null`; (e) JSON inválido lança erro.
- **Commit:** `feat: add log parser service with zod validation and field mapping`

---

### T09 — Interfaces dos Repositories
- **O que:** Criar `src/logs/repositories/log.repository.interface.ts` com:
  - Interface `ILogRepository` declarando `insert(entry: MappedLogEntry): Promise<number>` (retorna `affectedRows`)
  - Token `export const LOG_REPOSITORY = Symbol('ILogRepository')`
  - Tipo `MappedLogEntry` com todos os campos mapeados da seção 7 da spec (todos nullable)

  Criar `src/logs/repositories/failure.repository.interface.ts` com:
  - Interface `IFailureRepository` declarando `save(data: FailureData): Promise<void>`
  - Token `export const FAILURE_REPOSITORY = Symbol('IFailureRepository')`
  - Tipo `FailureData` com campos `lineHash: string`, `rawLine: string`, `errorMessage: string`
- **Critério:** Interfaces e tokens compilam sem erro. Nenhuma referência ao Prisma nesses arquivos. Os tokens `LOG_REPOSITORY` e `FAILURE_REPOSITORY` são `Symbol` (não strings literais) e estão exportados dos respectivos arquivos de interface.
- **Commit:** `feat: add repository interfaces for log and failure persistence`

---

### T10 — LogRepository
- **O que:** Criar `src/logs/repositories/log.repository.ts` implementando `ILogRepository`. O método `insert` executa `prisma.$executeRaw` com `INSERT IGNORE INTO gateway_logs (...)` passando todos os campos mapeados. Retorna o valor de retorno do `$executeRaw` (`affectedRows`: `1` ou `0`). **Não passar `processed_at`** — gerado pelo banco via `DEFAULT`.
- **Critério:** Teste unitário com Prisma mockado confirma: (a) `$executeRaw` chamado com os valores corretos; (b) `affectedRows = 1` é retornado quando inserido; (c) `affectedRows = 0` é retornado quando ignorado.
- **Commit:** `feat: add log repository with insert ignore via executeraw`

---

### T11 — FailureRepository
- **O que:** Criar `src/logs/repositories/failure.repository.ts` implementando `IFailureRepository`. O método `save` usa `prisma.gatewayLogFailure.create` com `line_hash`, `raw_line` e `error_message`.
- **Critério:** Teste unitário com Prisma mockado confirma que `create` é chamado com os três campos corretos.
- **Commit:** `feat: add failure repository for persisting parse and insert errors`

---

### T12 — LogProcessorService
- **O que:** Criar `src/logs/services/log-processor.service.ts` como `@Injectable()`. Injetar `LogReaderService`, `LogParserService`, `ILogRepository` e `IFailureRepository`. Implementar `process(filePath: string): Promise<ProcessResult>`. Loop `for await` sobre `readLines`: incrementar `totalLines`, chamar `parse`, em caso de erro chamar `failureRepository.save` e incrementar `failed`, em caso de sucesso chamar `logRepository.insert` e incrementar `inserted` se `affectedRows === 1`. Ao final, calcular `skipped = totalLines - inserted - failed` e `durationMs`. Retornar `{ inserted, skipped, failed, durationMs }`.
- **Critério:** Teste unitário com todos os colaboradores mockados confirma: (a) contadores corretos para cenário misto (sucessos, duplicatas, falhas); (b) `skipped` calculado por diferença ao final; (c) falha de parse não interrompe o loop; (d) falha de insert não interrompe o loop.
- **Commit:** `feat: add log processor service orchestrating the full pipeline`

---

## Grupo 4 — Exportadores CSV

### T13 — Interface CsvExporter
- **O que:** Criar `src/logs/exporters/csv-exporter.interface.ts` com `ICsvExporter` declarando `export(): Promise<string>`. Definir o union type `ExportType = 'consumer' | 'service' | 'latency'`.
- **Critério:** Interface compila sem erro. Nenhuma dependência de Prisma ou de dados concretos.
- **Commit:** `feat: add csv exporter interface and export type`

---

### T14 — ConsumerCsvExporter
- **O que:** Criar `src/logs/exporters/consumer-csv-exporter.ts` implementando `ICsvExporter`. Query: `SELECT COALESCE(consumer_id, 'anonymous') AS consumer_id, COUNT(*) AS total_requests FROM gateway_logs GROUP BY consumer_id ORDER BY total_requests DESC`. Serializar resultado em CSV com cabeçalho `consumer_id,total_requests`, UTF-8, sem BOM.
- **Critério:** Teste unitário com Prisma mockado confirma: (a) CSV gerado com cabeçalho correto; (b) `null` → `"anonymous"` via `COALESCE`; (c) ordenação DESC no CSV.
- **Commit:** `feat: add consumer csv exporter`

---

### T15 — ServiceCsvExporter
- **O que:** Criar `src/logs/exporters/service-csv-exporter.ts` implementando `ICsvExporter`. Query: `SELECT COALESCE(service_name, 'unknown') AS service_name, COUNT(*) AS total_requests FROM gateway_logs GROUP BY service_name ORDER BY total_requests DESC`. Serializar em CSV com cabeçalho `service_name,total_requests`.
- **Critério:** Teste unitário com Prisma mockado confirma: (a) CSV gerado com cabeçalho correto; (b) `null` → `"unknown"` via `COALESCE`; (c) ordenação DESC no CSV.
- **Commit:** `feat: add service csv exporter`

---

### T16 — LatencyCsvExporter
- **O que:** Criar `src/logs/exporters/latency-csv-exporter.ts` implementando `ICsvExporter`. Query: `SELECT COALESCE(service_name, 'unknown') AS service_name, AVG(latency_proxy) AS avg_proxy_ms, AVG(latency_gateway) AS avg_gateway_ms, AVG(latency_request) AS avg_request_ms FROM gateway_logs GROUP BY service_name ORDER BY avg_request_ms DESC`. Arredondar valores a 2 casas decimais com `Number(x).toFixed(2)`. Sem `WHERE` adicional — `AVG()` ignora `NULL` nativamente. Cabeçalho: `service_name,avg_proxy_ms,avg_gateway_ms,avg_request_ms`.
- **Critério:** Teste unitário com Prisma mockado confirma: (a) arredondamento a 2 casas; (b) `null` no `service_name` → `"unknown"`; (c) ordenação por `avg_request_ms DESC`.
- **Commit:** `feat: add latency csv exporter`

---

### T17 — ExporterFactory
- **O que:** Criar `src/logs/factories/exporter.factory.ts` como `@Injectable()`. Injetar `PrismaService`. Implementar `create(type: ExportType): ICsvExporter` — instanciar e retornar o exportador concreto correspondente. Lançar `BadRequestException` para tipo desconhecido.
- **Critério:** Teste unitário confirma: (a) `'consumer'` → instância de `ConsumerCsvExporter`; (b) `'service'` → instância de `ServiceCsvExporter`; (c) `'latency'` → instância de `LatencyCsvExporter`; (d) tipo inválido → lança `BadRequestException`.
- **Commit:** `feat: add exporter factory with strategy selection`

---

## Grupo 5 — Controller e DTOs

### T18 — DTOs
- **O que:** Criar `src/logs/dto/process-logs.dto.ts` com `ProcessLogsDto { filePath: string }` decorado com `@ApiProperty`. Criar `src/logs/dto/export-logs.dto.ts` com `ExportLogsDto { type: ExportType }` com `@ApiProperty({ enum: ['consumer', 'service', 'latency'] })`. Decorar ambos com `class-validator` (`@IsString`, `@IsEnum`).
- **Critério:** Swagger exibe os campos corretamente. Requisição com `type` inválido retorna `400 Bad Request`.
- **Commit:** `feat: add process and export dtos with swagger decorators`

---

### T19 — LogsController
- **O que:** Criar `src/logs/logs.controller.ts` com dois endpoints:
  - `POST /logs/process` → chama `LogProcessorService.process(dto.filePath)`, retorna `200 OK` com `{ inserted, skipped, failed, durationMs }`.
  - `POST /logs/export` → usa `ExporterFactory.create(dto.type)`, chama `exporter.export()`, seta headers `Content-Type: text/csv; charset=utf-8` e `Content-Disposition: attachment; filename="<type>_<timestamp>.csv"`, retorna o CSV via `@Res()`.
  Decorar ambos com `@ApiOperation`, `@ApiBody`, `@ApiResponse`.
- **Critério:** Swagger exibe os dois endpoints com documentação. `POST /logs/process` com path válido retorna JSON com contadores. `POST /logs/export` com `type` válido retorna download CSV com headers corretos.
- **Commit:** `feat: add logs controller with process and export endpoints`

---

### T20 — LogsModule
- **O que:** Criar `src/logs/logs.module.ts` registrando todos os providers, usando tokens para as interfaces:
  ```typescript
  { provide: LOG_REPOSITORY, useClass: LogRepository },
  { provide: FAILURE_REPOSITORY, useClass: FailureRepository },
  LogReaderService,
  LogParserService,
  LogProcessorService,
  ExporterFactory,
  ```
  Registrar o controller e importar `PrismaModule`.
- **Critério:** `npm run build` passa. `docker compose up` sobe sem erro de DI. `LogRepository` e `FailureRepository` são injetados via `@Inject(LOG_REPOSITORY)` e `@Inject(FAILURE_REPOSITORY)` no `LogProcessorService` — sem importar as implementações concretas nos services.
- **Commit:** `feat: add logs module wiring all providers and controller`

---

## Grupo 6 — Testes de Integração

### T21 — Fixture de Teste
- **O que:** Criar `test/fixtures/sample-logs.ndjson` com exatamente 10 linhas: 7 linhas válidas (baseadas nos logs reais), 2 linhas duplicadas (idênticas a uma das válidas) e 1 linha com JSON inválido.
- **Critério:** Arquivo existe com 10 linhas: 7 válidas únicas, 2 cópias idênticas de uma das 7 válidas (mesmo conteúdo → mesmo hash SHA-256 → INSERT IGNORE ignora na mesma execução), 1 linha com JSON inválido. Na primeira execução: `inserted=7`, `skipped=2`, `failed=1`. Na segunda execução: `inserted=0`, `skipped=9`, `failed=1`. Não depende do arquivo `logs.txt` original.
- **Commit:** `test: add ndjson fixture for integration tests`

---

### T22 — Teste de Integração E2E
- **O que:** Criar `test/logs.e2e-spec.ts`. Setup: iniciar container MySQL via `@testcontainers/mysql`, configurar `DATABASE_URL` dinâmica, executar `prisma migrate deploy`, criar a aplicação NestJS com `Test.createTestingModule`. Casos:
  1. `POST /logs/process` com `sample-logs.ndjson` → `inserted: 7`, `skipped: 2`, `failed: 1`, `durationMs > 0`.
  2. `POST /logs/process` novamente com o mesmo arquivo → `inserted: 0`, `skipped: 9`, `failed: 1`.
  3. `POST /logs/export` com `type: 'consumer'` → status 200, `Content-Type` contém `text/csv`, CSV com cabeçalho correto.
  4. `POST /logs/export` com `type: 'service'` → mesma verificação de estrutura.
  5. `POST /logs/export` com `type: 'latency'` → mesma verificação de estrutura.
  Teardown: derrubar container.
- **Critério:** `npm run test:e2e` passa com todos os casos verdes. Banco é destruído ao final — zero estado residual.
- **Commit:** `test: add e2e integration test with testcontainers`

---

## Grupo 7 — Documentação Final

### T23 — README com instruções Docker
- **O que:** Criar `solution/README.md` com: pré-requisitos (Docker, Docker Compose v2), como clonar, como configurar o `.env`, como subir com `docker compose up --build`, como acessar o Swagger, como chamar os dois endpoints com exemplos de curl, e descrição dos campos de retorno.
- **Critério:** Seguindo apenas o README, alguém sem contexto consegue subir e usar o serviço.
- **Commit:** `docs: add readme with docker setup and usage instructions`

---

## Resumo de Dependências

```
T01 → T02 → T03 → T04
               ↓
      T05   T06
       ↓     ↓
      T07   T08
         ↘ ↙
     T09 → T10 → T12
         ↘ T11 ↗
               ↓
     T13 → T14 ┐
          → T15 ├→ T17 → T18 → T19 → T20
          → T16 ┘
                              ↓
                     T21 → T22 → T23
```
