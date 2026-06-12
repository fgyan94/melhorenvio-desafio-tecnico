# CLAUDE.md — Log Processor (API Gateway Monitor)

## Visão Geral

Serviço HTTP em NestJS que processa arquivos de log NDJSON do API Gateway de forma incremental, persiste registros em MySQL via Prisma e expõa endpoints REST para processamento e exportação de relatórios CSV. Interface principal via Swagger, voltada para Analistas de Dados.

Spec completa: `docs/specs/log-processor.md`

---

## Stack

| Camada               | Tecnologia        | Versão                       |
| -------------------- | ----------------- | ---------------------------- |
| Runtime              | Node.js           | 20 LTS                       |
| Linguagem            | TypeScript        | 5.x (strict)                 |
| Framework            | NestJS            | 10.x                         |
| ORM / Migrations     | Prisma            | 5.x                          |
| Banco de dados       | MySQL             | 8.0                          |
| Validação            | Zod               | 3.x                          |
| Documentação         | Swagger / OpenAPI | `@nestjs/swagger` 7.x        |
| Testes               | Jest              | 29.x                         |
| Testes de integração | Testcontainers    | `@testcontainers/mysql` 10.x |
| Infraestrutura       | Docker Compose    | v2                           |

---

## Comandos Essenciais

```bash
# Desenvolvimento
npm run start:dev

# Build de produção
npm run build

# Iniciar build de produção
npm run start:prod

# Subir toda a stack (MySQL + app)
docker compose up --build

# Migrations (produção — roda automaticamente no start do container)
npx prisma migrate deploy

# Migrations (desenvolvimento local)
npx prisma migrate dev --name <nome>

# Gerar cliente Prisma após alterar schema
npx prisma generate

# Testes unitários
npm run test

# Testes de integração
npm run test:e2e

# Cobertura
npm run test:cov
```

---

## Estrutura de Pastas

```
solution/
├── docs/specs/log-processor.md   # spec aprovada
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app.module.ts
│   ├── main.ts                   # bootstrap + Swagger
│   ├── logs/
│   │   ├── logs.module.ts
│   │   ├── logs.controller.ts
│   │   ├── services/
│   │   │   ├── log-reader.service.ts     # generator readline
│   │   │   ├── log-parser.service.ts     # Zod + mapeamento
│   │   │   └── log-processor.service.ts  # orquestra pipeline
│   │   ├── repositories/
│   │   │   ├── log.repository.ts
│   │   │   └── failure.repository.ts
│   │   ├── exporters/
│   │   │   ├── csv-exporter.interface.ts
│   │   │   ├── consumer-csv-exporter.ts
│   │   │   ├── service-csv-exporter.ts
│   │   │   └── latency-csv-exporter.ts
│   │   ├── factories/
│   │   │   └── exporter.factory.ts
│   │   ├── dto/
│   │   │   ├── process-logs.dto.ts
│   │   │   └── export-logs.dto.ts
│   │   └── schemas/
│   │       └── log-entry.schema.ts       # schema Zod completo
│   ├── prisma/
│   │   └── prisma.module.ts
│   └── common/
│       └── hash.util.ts                  # SHA-256 da linha bruta
├── test/                                 # testes de integração (Testcontainers)
├── .env
├── docker-compose.yml
└── Dockerfile
```

---

## Convenções de Código

### TypeScript

- `strict: true` em `tsconfig.json` — sem exceções.
- Sem `any`. Usar `unknown` quando o tipo não for conhecido e fazer narrowing.
- Interfaces para contratos entre camadas; tipos para shapes de dados.

### NestJS

- Cada responsabilidade em seu próprio `@Injectable()`.
- Controllers apenas recebem request, delegam ao service e devolvem response — sem lógica de negócio.
- Módulos encapsulam seus próprios providers e exports.

### Zod

- O schema `LogEntrySchema` em `log-entry.schema.ts` é a única fonte de verdade para a estrutura do payload.
- Todos os campos são `.optional()` — campos ausentes resultam em `undefined`, tratado como `null` no mapeamento.
- `request.querystring` usa `z.unknown().optional()` — o campo pode ser `[]` ou `{}` dependendo da origem do log; como é sempre serializado via `JSON.stringify()`, a estrutura interna não é validada.
- Falha de parse de JSON (`SyntaxError`) e falha de validação Zod são ambas capturadas e redirecionadas para `gateway_log_failures`.

### Prisma

- Nunca usar `prisma.$executeRaw` para queries simples — reservado apenas para o INSERT IGNORE com `affectedRows`.
- Migrations versionadas em `prisma/migrations/` — nunca editar arquivos de migration já aplicados.
- `processed_at` é `@default(now())` no schema — nunca passar esse campo no código.

---

## Regras de Negócio Críticas

### Extração do consumer_id

```
authenticated_entity.consumer_id.uuid   ← campo correto (objeto aninhado)
authenticated_entity.consumer_id        ← ERRADO (é um objeto, não string)
```

### Conversão de timestamp

```typescript
// started_at vem em segundos Unix (10 dígitos)
// Checar typeof antes de converter — campo é optional() no schema Zod
typeof started_at === 'number' ? new Date(started_at * 1000) : null; // correto
new Date(started_at * 1000); // ERRADO — explode com undefined (NaN)
new Date(started_at);        // ERRADO — produziria data em 1970
```

### processed_at

- Gerado pelo banco via `DEFAULT CURRENT_TIMESTAMP(3)` no momento do INSERT.
- Nunca ler `new Date()` no código da aplicação para esse campo.
- Nunca incluir `processed_at` nos valores passados ao INSERT.

### Cálculo de skipped via affectedRows

```typescript
// INSERT IGNORE retorna affectedRows: 1 se inseriu, 0 se ignorou (duplicata)
const affectedRows =
  await prisma.$executeRaw`INSERT IGNORE INTO gateway_logs ...`;
if (affectedRows === 1) inserted++;
// skipped NÃO é incrementado por linha — calculado uma única vez ao final:
const skipped = totalLines - inserted - failed;
```

Não usar `SELECT COUNT(*)` antes ou depois de cada INSERT.

### Tratamento de campos nulos nos relatórios CSV

```
consumer_id  = null  →  exibir "anonymous"
service_name = null  →  exibir "unknown"
```

### Latência no CSV

- `AVG()` do MySQL ignora `NULL` automaticamente por coluna.
- Sem filtro `WHERE latency_X IS NOT NULL` nas queries de relatório.

---

## Padrões Arquiteturais

### SOLID

| Princípio | Aplicação                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **S**     | `LogReaderService` só lê, `LogParserService` só parseia, `LogRepository` só persiste, cada exportador só gera um tipo de relatório |
| **O**     | Novo tipo de relatório = nova classe implementando `CsvExporter` — sem tocar nas existentes                                        |
| **L**     | Qualquer `CsvExporter` concreto é substituível onde a interface é esperada                                                         |
| **I**     | `ILogRepository` e `IFailureRepository` são contratos separados                                                                    |
| **D**     | Serviços dependem de interfaces; NestJS DI resolve implementações concretas                                                        |

### Strategy

`ExporterFactory.create(type)` devolve a implementação de `CsvExporter` correspondente ao `type` recebido no request. Adicionar novo tipo = nova classe + novo case na factory.

### Repository

`LogRepository` e `FailureRepository` encapsulam todo acesso ao Prisma. Nenhum service importa ou conhece `PrismaClient` diretamente.

### Pipeline

Fluxo unidirecional: `reader → parser → validator → repository`. Cada etapa recebe o output da anterior. Nenhuma etapa conhece as outras — só `LogProcessorService` orquestra.

### Factory

`ExporterFactory` instancia o exportador concreto com base no `type`. Isola a lógica de seleção do controller e dos exportadores.

---

## Conventional Commits

Todo commit deve seguir o padrão: https://www.conventionalcommits.org/pt-br/v1.0.0/

Formato: <type>(<scope>): <description>

Types permitidos:

- feat → nova funcionalidade
- fix → correção de bug
- test → adição ou correção de testes
- refactor → refatoração sem mudança de comportamento
- chore → configuração, dependências, infraestrutura
- docs → documentação

Exemplos:

- chore(setup): initialize nestjs project with typescript strict
- feat(logs): implement log-reader service with async generator
- feat(logs): implement log-parser service with zod schema
- feat(logs): implement log-repository with insert ignore via executeRaw
- test(logs): add unit tests for log-parser service
- feat(docker): add docker-compose with mysql and app services

Regras:

- Um commit por task concluída
- Descrição em inglês, lowercase, sem ponto final
- Nunca commitar mais de uma task no mesmo commit

---

## O Que NÃO Fazer

- **Não** usar `batch` ou acumular linhas em array antes de inserir — insert é individual, `for await` controla o fluxo.
- **Não** usar `SELECT COUNT(*)` por linha para calcular `skipped` — usar `affectedRows` do `$executeRaw`.
- **Não** abortar o processamento por linha inválida — sempre capturar e persistir em `gateway_log_failures`.
- **Não** salvar CSV em disco — gerado em memória e retornado direto no response.
- **Não** passar `processed_at` no INSERT — é responsabilidade do banco via `DEFAULT`.
- **Não** usar `new Date()` para `processed_at` na aplicação.
- **Não** acessar `authenticated_entity.consumer_id` diretamente como string — extrair `.uuid`.
- **Não** usar `new Date(started_at)` sem multiplicar por 1000.
- **Não** modificar migrations já aplicadas — criar uma nova migration.
- **Não** injetar `PrismaClient` diretamente em services — passar pela interface do repository.
- **Não** adicionar lógica de negócio em controllers.
- **Não** usar `any` no TypeScript.
- **Não** injetar `LogRepository` ou `FailureRepository` diretamente por classe em services — usar `@Inject(LOG_REPOSITORY)` e `@Inject(FAILURE_REPOSITORY)` com os tokens Symbol exportados dos respectivos arquivos de interface.
- **Não** usar `z.object()` ou `z.array()` para `request.querystring` no schema Zod — usar `z.unknown().optional()` para aceitar tanto `[]` quanto `{}`.
- **Não** converter `started_at` sem checar se é `number` primeiro — usar `typeof started_at === 'number' ? new Date(started_at * 1000) : null` para evitar `new Date(NaN)` quando o campo estiver ausente.
