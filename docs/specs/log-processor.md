# Spec: Log Processor — API Gateway Monitor

## 1. Visão Geral

Serviço HTTP construído com NestJS que processa arquivos de log NDJSON do API Gateway de forma incremental, persiste os registros em MySQL via Prisma e expõe endpoints REST para processamento e exportação de relatórios CSV. Interface principal via Swagger, voltada para Analistas de Dados.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Framework | NestJS (TypeScript estrito) |
| ORM / Migrations | Prisma |
| Banco de dados | MySQL 8 |
| Validação de payload | Zod |
| Documentação | Swagger (OpenAPI 3) |
| Infraestrutura | Docker Compose |
| Testes | Jest (unit) + Jest + Testcontainers (integração) |

---

## 3. Estrutura de Módulos

```
src/
├── app.module.ts
├── main.ts                          # bootstrap, Swagger setup
│
├── logs/
│   ├── logs.module.ts
│   ├── logs.controller.ts           # POST /logs/process, POST /logs/export
│   ├── services/
│   │   ├── log-reader.service.ts    # leitura incremental (generator)
│   │   ├── log-parser.service.ts    # parse + validação Zod
│   │   └── log-processor.service.ts # orquestra pipeline completo
│   ├── repositories/
│   │   ├── log.repository.ts
│   │   └── failure.repository.ts
│   ├── exporters/
│   │   ├── csv-exporter.interface.ts
│   │   ├── consumer-csv-exporter.ts
│   │   ├── service-csv-exporter.ts
│   │   └── latency-csv-exporter.ts
│   ├── factories/
│   │   └── exporter.factory.ts
│   ├── dto/
│   │   ├── process-logs.dto.ts
│   │   └── export-logs.dto.ts
│   └── schemas/
│       └── log-entry.schema.ts      # schema Zod do payload completo
│
├── prisma/
│   └── prisma.module.ts
│
└── common/
    └── hash.util.ts                 # SHA-256 da linha bruta
```

> **Tokens de DI:** As interfaces `ILogRepository` e `IFailureRepository` são
> acompanhadas de tokens `Symbol` exportados do mesmo arquivo para que o NestJS
> possa resolver as implementações concretas em runtime (interfaces TypeScript são
> apagadas na compilação).
>
> ```typescript
> export const LOG_REPOSITORY = Symbol('ILogRepository');
> export const FAILURE_REPOSITORY = Symbol('IFailureRepository');
> ```

---

## 4. Schema do Banco de Dados

### 4.1 `gateway_logs`

Armazena cada linha de log processada com sucesso.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | INT UNSIGNED AUTO_INCREMENT | PK |
| `line_hash` | CHAR(64) | SHA-256 da linha bruta — UNIQUE (idempotência) |
| `consumer_id` | VARCHAR(255) NULL | Extraído de `authenticated_entity.consumer_id.uuid` |
| `service_id` | VARCHAR(255) NULL | `service.id` |
| `service_name` | VARCHAR(255) NULL | `service.name` |
| `route_id` | VARCHAR(255) NULL | `route.id` |
| `request_method` | VARCHAR(10) NULL | `request.method` |
| `request_uri` | TEXT NULL | `request.uri` |
| `request_url` | TEXT NULL | `request.url` |
| `request_size` | INT NULL | `request.size` |
| `request_querystring` | TEXT NULL | JSON serializado de `request.querystring` |
| `response_status` | SMALLINT NULL | `response.status` |
| `response_size` | INT NULL | `response.size` |
| `upstream_uri` | TEXT NULL | `upstream_uri` |
| `client_ip` | VARCHAR(45) NULL | Suporta IPv6 |
| `latency_proxy` | INT NULL | `latencies.proxy` (ms) |
| `latency_gateway` | INT NULL | `latencies.gateway` (ms) |
| `latency_request` | INT NULL | `latencies.request` (ms) |
| `created_at` | DATETIME(3) NULL | Convertido de `started_at * 1000` |
| `processed_at` | DATETIME(3) | `DEFAULT CURRENT_TIMESTAMP(3)` — gerado no INSERT |

**Índices:** `line_hash` (UNIQUE), `consumer_id`, `service_name` (para performance nas queries de relatório).

### 4.2 `gateway_log_failures`

Armazena linhas que falharam no parse ou na inserção.

| Coluna | Tipo | Observações |
|---|---|---|
| `id` | INT UNSIGNED AUTO_INCREMENT | PK |
| `line_hash` | CHAR(64) | SHA-256 da linha bruta |
| `raw_line` | MEDIUMTEXT | Conteúdo bruto da linha |
| `error_message` | TEXT | Mensagem de erro capturada |
| `failed_at` | DATETIME(3) | `DEFAULT CURRENT_TIMESTAMP(3)` |

---

## 5. Pipeline de Processamento

```
POST /logs/process
      │
      ▼
LogProcessorService.process(filePath)
      │
      ├─► LogReaderService          (generator — lê linha a linha via readline)
      │         │  yield rawLine
      │         ▼
      ├─► hash = sha256(rawLine)
      │
      ├─► LogParserService.parse(rawLine)
      │         │  valida com Zod schema
      │         │  extrai campos mapeados
      │         │  converte started_at * 1000 → Date
      │         │  campos inválidos/ausentes → null (nunca aborta)
      │         ▼
      │     LogEntry | ZodError
      │
      ├─► Se ZodError → FailureRepository.save({ hash, rawLine, error })
      │
      └─► LogRepository.insert(entry)
                │  $executeRaw INSERT IGNORE INTO gateway_logs ...
                │  affectedRows = 1 → inserted++
                │  affectedRows = 0 → (duplicata ignorada)
                └─► for await controla o fluxo — sem acumulação de batch

skipped = totalLines - inserted - failed   (calculado ao término do loop)
```

**Comportamento na falha:**
- Erro de parse → salva em `gateway_log_failures`, continua para a próxima linha.
- Erro de INSERT → salva em `gateway_log_failures`, continua.
- O processamento nunca aborta por causa de uma linha inválida.

**Sem rastreamento de progresso entre execuções:** cada chamada ao endpoint processa o arquivo do início. Duplicatas são silenciosamente ignoradas via `INSERT IGNORE` na coluna `line_hash`.

---

## 6. Endpoints HTTP

### `POST /logs/process`

Inicia o processamento incremental de um arquivo de log.

**Request body:**
```json
{
  "filePath": "/data/logs.txt"
}
```

**Response `200 OK`:**
```json
{
  "inserted": 48320,
  "skipped": 1203,
  "failed": 17,
  "durationMs": 12450
}
```

| Campo | Descrição |
|---|---|
| `inserted` | Linhas efetivamente inseridas — `affectedRows = 1` no `$executeRaw` |
| `skipped` | Duplicatas ignoradas — `totalLines - inserted - failed` ao término |
| `failed` | Linhas salvas em `gateway_log_failures` |
| `durationMs` | Tempo total de processamento — resposta enviada apenas ao término |

---

### `POST /logs/export`

Gera um relatório CSV e retorna como download.

**Request body:**
```json
{
  "type": "consumer" | "service" | "latency"
}
```

**Response `200 OK`:**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="<type>_<timestamp>.csv"`
- CSV gerado em memória e retornado diretamente no response — sem escrita em disco.

#### Tipo `consumer` — Requisições por consumidor

```csv
consumer_id,total_requests
anonymous,1520
72b34d31-4c14-3bae-9cc6-516a0939c9d6,304
...
```

- `consumer_id` null → exibir como `"anonymous"`
- Ordenado por `total_requests DESC`

#### Tipo `service` — Requisições por serviço

```csv
service_name,total_requests
unknown,42
ritchie,8103
orn,7244
...
```

- `service_name` null → exibir como `"unknown"`
- Ordenado por `total_requests DESC`

#### Tipo `latency` — Latência média por serviço

```csv
service_name,avg_proxy_ms,avg_gateway_ms,avg_request_ms
ritchie,1623.40,10.20,1754.80
orn,1489.12,11.54,1602.33
...
```

- Valores arredondados a 2 casas decimais
- `AVG()` do MySQL ignora `NULL` naturalmente — sem `WHERE` adicional
- Ordenado por `avg_request_ms DESC`

**Formato CSV:** UTF-8, separador vírgula, com linha de cabeçalho, sem BOM.

---

## 7. Mapeamento do Payload

| Campo no log | Coluna no banco | Transformação |
|---|---|---|
| `authenticated_entity.consumer_id.uuid` | `consumer_id` | Extração aninhada |
| `service.id` | `service_id` | Direto |
| `service.name` | `service_name` | Direto |
| `route.id` | `route_id` | Direto |
| `request.method` | `request_method` | Direto |
| `request.uri` | `request_uri` | Direto |
| `request.url` | `request_url` | Direto |
| `request.size` | `request_size` | Direto |
| `request.querystring` | `request_querystring` | `JSON.stringify()` |
| `response.status` | `response_status` | Direto |
| `response.size` | `response_size` | Direto |
| `upstream_uri` | `upstream_uri` | Direto |
| `client_ip` | `client_ip` | Direto |
| `latencies.proxy` | `latency_proxy` | Direto |
| `latencies.gateway` | `latency_gateway` | Direto |
| `latencies.request` | `latency_request` | Direto |
| `started_at` | `created_at` | `typeof started_at === 'number' ? new Date(started_at * 1000) : null` |
| *(gerado no INSERT)* | `processed_at` | `DEFAULT CURRENT_TIMESTAMP(3)` |
| SHA-256 da linha bruta | `line_hash` | `crypto.createHash('sha256')` |

**Campos não persistidos:** `request.headers`, `response.headers`, `route` (exceto `route.id`), `service` (exceto `id` e `name`).

---

## 8. Validação com Zod

O schema Zod valida a estrutura do payload. Todos os campos folha são `.optional()` — campos ausentes resultam em `undefined`, tratado como `null` no mapeamento.

**Exceção — `request.querystring`:** usa `z.unknown().optional()` em vez de `z.object()` ou `z.array()`, pois o campo aparece como `[]` nos logs reais e como `{}` no payload de exemplo. Como o valor é sempre passado por `JSON.stringify()` antes de persistir, a estrutura interna não precisa ser validada pelo schema.

Exceção: se o JSON da linha for inválido (não parseável), a linha vai direto para `gateway_log_failures`.

---

## 9. Princípios SOLID Aplicados

| Princípio | Aplicação |
|---|---|
| **S** — Single Responsibility | `LogReaderService` só lê, `LogParserService` só parseia, `LogRepository` só persiste, cada exportador só gera um tipo de relatório |
| **O** — Open/Closed | Novo tipo de relatório = nova classe implementando `CsvExporter`. Nenhuma classe existente é modificada |
| **L** — Liskov Substitution | Qualquer `CsvExporter` concreto é intercambiável onde a interface é esperada |
| **I** — Interface Segregation | `ILogRepository` e `IFailureRepository` são contratos separados |
| **D** — Dependency Inversion | Serviços dependem de interfaces/abstrações injetadas via tokens Symbol (`LOG_REPOSITORY`, `FAILURE_REPOSITORY`); NestJS resolve as implementações concretas via DI |

---

## 10. Design Patterns Aplicados

| Pattern | Onde |
|---|---|
| **Strategy** | `ExporterFactory` seleciona o `CsvExporter` correto com base no `type` recebido |
| **Repository** | `LogRepository` e `FailureRepository` abstraem o Prisma; serviços não conhecem detalhes de persistência |
| **Pipeline** | Fluxo `reader → parser → validator → repository` com responsabilidades encadeadas |
| **Factory** | `ExporterFactory.create(type)` instancia o exportador concreto |

---

## 11. Configuração via `.env`

```env
DATABASE_URL=mysql://user:password@mysql:3306/gateway_logs
PORT=3000
```

---

## 12. Infraestrutura Docker

`docker-compose.yml` sobe dois serviços:

- **mysql**: MySQL 8, volume persistente, healthcheck.
- **app**: Build da imagem NestJS, aguarda MySQL via `depends_on` com condição `service_healthy`, executa `prisma migrate deploy` antes de iniciar.

Migrations sobem automaticamente no start do container — sem intervenção manual.

---

## 13. Estratégia de Testes

### Unitários (mock)

| Classe | O que testar |
|---|---|
| `LogReaderService` | Yield correto de linhas, comportamento em arquivo vazio, encoding |
| `LogParserService` | Parse correto, campos ausentes → null, `started_at` convertido, `consumer_id` extraído do objeto aninhado |
| `ConsumerCsvExporter` | CSV gerado corretamente, null → "anonymous", ordenação |
| `ServiceCsvExporter` | CSV gerado corretamente, null → "unknown", ordenação |
| `LatencyCsvExporter` | Médias corretas, arredondamento, ordenação |
| `ExporterFactory` | Tipo correto instanciado, tipo inválido lança erro |
| `hash.util` | Hash SHA-256 determinístico e consistente |

### Integração (Testcontainers)

Container MySQL sobe programaticamente via `@testcontainers/mysql` no início do teste e é destruído ao final — zero configuração manual.

Um único teste end-to-end que:
1. Sobe container MySQL via Testcontainers
2. Executa `prisma migrate deploy` contra o container
3. Chama `POST /logs/process` com um arquivo de fixture pequeno (~50 linhas)
4. Verifica contadores de `inserted`, `skipped`, `failed`
5. Chama `POST /logs/export` para cada um dos três tipos
6. Valida estrutura e dados do CSV retornado
7. Verifica que reprocessar o mesmo arquivo não duplica registros

---

## 14. Fluxo de Inicialização

```
docker compose up
    │
    ├─► mysql container → healthcheck OK
    │
    └─► app container
            │
            ├─► prisma migrate deploy   (cria tabelas se não existirem)
            └─► nest start
                    └─► Swagger disponível em http://localhost:3000/api
```
